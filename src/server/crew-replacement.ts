// Server-side one-click replacement: ranks eligible crew from the shared engine, swaps the
// declined member out, mints a fresh `shf_` token for the replacement and records the swap on
// the job timeline. The ranking rules themselves live in shared/crew-replacement.
import { z } from "zod";
import {
  replacementActivityEvent,
  replacementCandidates,
  type ReplacementCandidate,
  type ReplacementPerson,
} from "../shared/crew-replacement";
import type { ScheduledJob } from "../shared/dispatch";
import { appendJobActivity } from "../shared/job-activity";
import { isoDay, startOfWeek } from "../shared/schedule";
import {
  crewShifts,
  declineReasonLabel,
  shiftRoleLabel,
  withReplacementShift,
} from "../shared/shift";
import { jobReference } from "../shared/tracking";
import { sendCrewShiftInvites, type ShiftDelivery } from "./shift-response";

export type { ReplacementCandidate } from "../shared/crew-replacement";

export class ReplacementError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ReplacementError";
  }
}

const ACTIVE_JOB = new Set(["booked", "deposit_paid", "in_progress"]);
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);

const crewIdsOf = (data: Record<string, unknown>): number[] =>
  Array.isArray(data["crewIds"])
    ? (data["crewIds"] as unknown[]).filter(
        (value): value is number => typeof value === "number" && Number.isFinite(value),
      )
    : [];

const personOf = (row: Record<string, unknown>): ReplacementPerson => ({
  id: num(row["id"]),
  name: text(row["name"]) || `Crew #${num(row["id"])}`,
  status: text(row["status"]),
  isDriver: row["isDriver"] === true,
  ...(typeof row["crewRole"] === "string" ? { crewRole: row["crewRole"] } : {}),
  skillLevel: num(row["skillLevel"]),
});

const scheduledOf = (row: Record<string, unknown>): ScheduledJob => ({
  id: num(row["id"]),
  title: text(row["title"]),
  moveDate: text(row["moveDate"]).slice(0, 10),
  startHour: num(row["startHour"]),
  duration: num(row["duration"]),
  status: text(row["status"]),
  truckId: typeof row["truckId"] === "number" ? row["truckId"] : null,
  crewIds: crewIdsOf(row),
});

const scheduledJob = (job: { id: number; data: Record<string, unknown> }): ScheduledJob => ({
  id: job.id,
  title: text(job.data["title"]),
  moveDate: text(job.data["moveDate"]).slice(0, 10),
  startHour: num(job.data["startHour"]),
  duration: num(job.data["duration"]),
  status: text(job.data["status"]),
  truckId: typeof job.data["truckId"] === "number" ? job.data["truckId"] : null,
  crewIds: crewIdsOf(job.data),
});

export type ReplacementDeps = {
  getJob: (id: number) => Promise<{ id: number; data: Record<string, unknown> }>;
  listCrew: () => Promise<Record<string, unknown>[]>;
  listJobs: () => Promise<Record<string, unknown>[]>;
  save: (id: number, patch: Record<string, unknown>) => Promise<unknown>;
  actor: string;
  /** Absolute site origin used for the replacement's shift confirmation link. */
  origin: string;
  companyName: string;
};

export type DeclinedShift = { crewId: number; name: string; reason: string };

export type ReplacementPanel = {
  jobId: number;
  reference: string;
  moveDate: string;
  startHour: number;
  duration: number;
  truckId: number | null;
  /** Monday of the shift's week, so the drawer can label weekly hours honestly. */
  weekStart: string;
  declined: DeclinedShift[];
  candidates: ReplacementCandidate[];
};

/** Declined answers still attached to crew on the job. */
function declinedOf(data: Record<string, unknown>): DeclinedShift[] {
  const crewIds = crewIdsOf(data);
  return crewShifts(data["crewShifts"])
    .filter((shift) => shift.status === "declined" && crewIds.includes(shift.crewId))
    .map((shift) => ({
      crewId: shift.crewId,
      name: shift.name || `Crew #${shift.crewId}`,
      reason: declineReasonLabel(shift.reason),
    }));
}

/** Ranked replacements for the job sheet / schedule drawer. */
export async function replacementPanel(
  deps: ReplacementDeps,
  jobId: number,
): Promise<ReplacementPanel> {
  const job = await deps.getJob(jobId);
  const [crewRows, jobRows] = await Promise.all([deps.listCrew(), deps.listJobs()]);
  const data = job.data;
  const jobView = scheduledJob(job);
  const declined = declinedOf(data);
  const candidates = replacementCandidates(
    jobView,
    crewRows.map(personOf),
    jobRows.map(scheduledOf),
    declined.map((entry) => entry.crewId),
  );
  return {
    jobId,
    reference: jobReference(jobId),
    moveDate: jobView.moveDate,
    startHour: jobView.startHour,
    duration: jobView.duration,
    truckId: jobView.truckId,
    weekStart: jobView.moveDate ? startOfWeek(isoDay(jobView.moveDate)) : "",
    declined,
    candidates,
  };
}

export const replacementInputSchema = z
  .object({
    crewId: z.number().int().positive(),
    replaceCrewId: z.number().int().positive().nullable().optional(),
  })
  .strip();

export type ReplacementAssignment = {
  jobId: number;
  replaced: { crewId: number; name: string } | null;
  candidate: { crewId: number; name: string };
  crewIds: number[];
  notified: number;
  logged: number;
  results: ShiftDelivery[];
};

/**
 * Swaps one declined (or open) slot to an eligible crew member, sends their shift link and
 * appends "Replacement Crew Assigned". Removing the replaced member from `crewIds` clears the
 * declined badge and warning banner, because both only count answers for assigned crew.
 */
export async function assignReplacement(
  deps: ReplacementDeps,
  jobId: number,
  raw: unknown,
): Promise<ReplacementAssignment> {
  const parsed = replacementInputSchema.safeParse(raw);
  if (!parsed.success) throw new ReplacementError("Choose a crew member to assign", 400);
  const input = parsed.data;

  const job = await deps.getJob(jobId);
  const data = job.data;
  const status = text(data["status"]).toLowerCase();
  if (!ACTIVE_JOB.has(status))
    throw new ReplacementError("Completed or cancelled jobs cannot change crew", 409);

  const [crewRows, jobRows] = await Promise.all([deps.listCrew(), deps.listJobs()]);
  const crew = crewRows.map(personOf);
  const candidateRow = crewRows.find((row) => num(row["id"]) === input.crewId);
  if (!candidateRow) throw new ReplacementError("That crew member is not in this workspace", 400);
  const candidatePerson = personOf(candidateRow);

  const currentCrewIds = crewIdsOf(data);
  const declined = declinedOf(data);
  // Only a declined member is swapped out automatically; otherwise the candidate joins the crew,
  // so the generic "Find Replacement" action can never silently drop a confirmed crew member.
  const replaceCrewId = input.replaceCrewId ?? declined[0]?.crewId ?? null;
  if (replaceCrewId !== null && !currentCrewIds.includes(replaceCrewId))
    throw new ReplacementError("That crew member is not assigned to this job", 409);
  if (replaceCrewId === input.crewId)
    throw new ReplacementError("That crew member is already on this job", 409);

  const jobView = scheduledJob(job);
  const replacing = replaceCrewId !== null ? [replaceCrewId] : [];
  const eligible = replacementCandidates(jobView, crew, jobRows.map(scheduledOf), replacing).find(
    (entry) => entry.crewId === input.crewId,
  );
  if (!eligible)
    throw new ReplacementError(
      candidatePerson.status.toLowerCase() !== "active"
        ? `${candidatePerson.name} is not on the active roster`
        : jobView.truckId && !candidatePerson.isDriver && declined.length === 0
          ? `${candidatePerson.name} cannot drive the assigned truck`
          : `${candidatePerson.name} is already booked on an overlapping move`,
      409,
    );

  const replacedRow =
    replaceCrewId !== null ? crewRows.find((row) => num(row["id"]) === replaceCrewId) : undefined;
  const replacedName =
    text(replacedRow?.["name"]) ||
    declined.find((entry) => entry.crewId === replaceCrewId)?.name ||
    null;

  const crewIds = [
    ...new Set(currentCrewIds.filter((id) => id !== replaceCrewId).concat(input.crewId)),
  ];

  const invite = await sendCrewShiftInvites({
    jobId,
    data: { ...data, crewIds },
    crew: crewRows,
    crewIds: [input.crewId],
    companyName: deps.companyName,
    origin: deps.origin,
  });
  const shift = invite.shifts[0];
  if (!shift) throw new ReplacementError("Could not prepare the shift notification", 502);

  const at = new Date().toISOString();
  const event = replacementActivityEvent({
    jobId,
    replacementName: shift.name || eligible.name,
    replacedName,
    at,
    by: deps.actor,
  });
  const patch: Record<string, unknown> = {
    crewIds,
    crewShifts: withReplacementShift(data["crewShifts"], {
      removeCrewIds: [input.crewId, ...(replaceCrewId !== null ? [replaceCrewId] : [])],
      shift,
    }),
    activity: appendJobActivity(data["activity"], [event]),
    crewDispatch: {
      at,
      by: deps.actor,
      results: invite.results,
      notified: invite.notified,
      logged: invite.logged,
    },
  };
  await deps.save(jobId, patch);

  return {
    jobId,
    replaced:
      replaceCrewId !== null
        ? { crewId: replaceCrewId, name: replacedName ?? `Crew #${replaceCrewId}` }
        : null,
    candidate: { crewId: input.crewId, name: shift.name || eligible.name },
    crewIds,
    notified: invite.notified,
    logged: invite.logged,
    results: invite.results,
  };
}

/** Role label used by the panel for a candidate, mirrored from the shift catalog. */
export function replacementRoleLabel(role: unknown, isDriver = false): string {
  return shiftRoleLabel(role, isDriver);
}
