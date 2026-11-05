// Dispatcher scheduling write path: validates truck/crew/capacity/overlap, records the
// "Job Rescheduled" and "Crew Assigned" activity events, and optionally notifies the crew.
import { z } from "zod";
import type { InventoryEntry, Job, Truck } from "../shared/crm";
import { appendJobActivity, type JobActivityEvent } from "../shared/job-activity";
import { conflictsFor, type ScheduledJob } from "../shared/dispatch";
import {
  crewAssignedDetail,
  rescheduleDetail,
  scheduleDiff,
  truckCapacityConflict,
  type ScheduleAssignment,
} from "../shared/schedule";
import { sendCrewShiftInvites, type ShiftDelivery } from "./shift-response";

const CLOSED = new Set(["cancelled", "canceled", "completed", "lost", "declined"]);
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);

export const scheduleInputSchema = z
  .object({
    truckId: z.number().int().positive().nullable(),
    crewIds: z.array(z.number().int().positive()).max(30),
    moveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startHour: z.number().min(0).max(23.75),
    duration: z.number().min(0.25).max(24),
    notifyCrew: z.boolean().optional().default(false),
  })
  .strip();

export type ScheduleInput = z.infer<typeof scheduleInputSchema>;

export type CrewNoticeResult = ShiftDelivery;

export type ScheduleDeps = {
  getJob: (id: number) => Promise<{ id: number; data: Record<string, unknown> }>;
  listTrucks: () => Promise<Record<string, unknown>[]>;
  listCrew: () => Promise<Record<string, unknown>[]>;
  listJobs: () => Promise<Record<string, unknown>[]>;
  save: (id: number, patch: Record<string, unknown>) => Promise<unknown>;
  fail: (status: number, message: string) => never;
  actor: string;
  /** Absolute site origin used for the public shift confirmation links. */
  origin: string;
  companyName: string;
};

export type ScheduleResult = {
  rescheduled: boolean;
  crewChanged: boolean;
  notified: number;
  /** Messages the provider did not send because no sender is configured. */
  logged: number;
  results: CrewNoticeResult[];
};

const assignmentOf = (data: Record<string, unknown>): ScheduleAssignment => ({
  moveDate: text(data["moveDate"]).slice(0, 10),
  startHour: num(data["startHour"]),
  duration: num(data["duration"]),
  truckId: typeof data["truckId"] === "number" ? data["truckId"] : null,
  crewIds: Array.isArray(data["crewIds"])
    ? (data["crewIds"] as unknown[]).filter((id): id is number => typeof id === "number")
    : [],
});

/**
 * Commits one scheduling change. Everything the change needs is checked here: the truck must
 * belong to the workspace and be active, the cargo must fit, and neither the truck nor any
 * crew member may already be on an overlapping job.
 */
export async function scheduleJob(
  deps: ScheduleDeps,
  jobId: number,
  raw: unknown,
): Promise<ScheduleResult> {
  const parsed = scheduleInputSchema.safeParse(raw);
  if (!parsed.success) deps.fail(400, "Invalid schedule change");
  const input = parsed.data;
  if (input.startHour + input.duration > 24)
    deps.fail(400, "The move must fit inside one calendar day");

  const current = await deps.getJob(jobId);
  const data = current.data;
  const job = data as unknown as Job;
  const status = text(data["status"]).toLowerCase();
  if (CLOSED.has(status)) deps.fail(409, "Completed or cancelled jobs cannot be rescheduled");

  const crewIds = [...new Set(input.crewIds)].sort((a, b) => a - b);
  const [trucks, crew, jobs] = await Promise.all([
    deps.listTrucks(),
    deps.listCrew(),
    deps.listJobs(),
  ]);

  let truckName: string | null = null;
  if (input.truckId) {
    const truck = trucks.find((entry) => entry["id"] === input.truckId);
    if (!truck) deps.fail(400, "That truck is not in this workspace");
    truckName = text(truck["name"]) || `Truck #${input.truckId}`;
    if (!["active", "available"].includes(text(truck["status"])))
      deps.fail(409, `${truckName} is not active`);
    const capacity = truckCapacityConflict(
      job.inventory as InventoryEntry[] | undefined,
      truck as unknown as Truck,
    );
    if (capacity) deps.fail(409, `Vehicle capacity conflict: ${capacity}`);
  }

  const crewNames: string[] = [];
  for (const id of crewIds) {
    const member = crew.find((entry) => entry["id"] === id);
    if (!member) deps.fail(400, "A selected crew member is not in this workspace");
    const name = text(member["name"]) || `Crew #${id}`;
    if (text(member["status"]) === "inactive") deps.fail(409, `${name} is inactive`);
    crewNames.push(name);
  }

  const candidate: ScheduledJob = {
    id: jobId,
    moveDate: input.moveDate,
    startHour: input.startHour,
    duration: input.duration,
    status,
    truckId: input.truckId,
    crewIds,
  };
  const clash = conflictsFor(candidate, jobs as unknown as ScheduledJob[])[0];
  if (clash) {
    const other = jobs.find((entry) => entry["id"] === clash.otherJobId);
    const label = other?.["title"] ? ` (${text(other["title"])})` : "";
    const who =
      clash.resource === "truck"
        ? (truckName ?? "This truck")
        : text(crew.find((entry) => entry["id"] === clash.resourceId)?.["name"]) || "A crew member";
    deps.fail(
      409,
      `Schedule conflict: ${who} is already on job #${clash.otherJobId}${label} at an overlapping time.`,
    );
  }

  const before = assignmentOf(data);
  const after: ScheduleAssignment = {
    moveDate: input.moveDate,
    startHour: input.startHour,
    duration: input.duration,
    truckId: input.truckId,
    crewIds,
  };
  const diff = scheduleDiff(before, after);

  const invite = input.notifyCrew
    ? await sendCrewShiftInvites({
        jobId,
        data,
        crew,
        crewIds,
        companyName: deps.companyName,
        origin: deps.origin,
      })
    : null;
  const results: CrewNoticeResult[] = invite?.results ?? [];
  const notified = invite?.notified ?? 0;
  const logged = invite?.logged ?? 0;

  const at = new Date().toISOString();
  const events: JobActivityEvent[] = [];
  if (diff.rescheduled)
    events.push({
      id: `reschedule:${at}`,
      kind: "job_rescheduled",
      title: "Job Rescheduled",
      detail: rescheduleDetail(before, after, truckName),
      at,
      by: deps.actor,
    });
  if (diff.crewChanged || diff.truckChanged)
    events.push({
      id: `crew:${at}`,
      kind: "crew_assigned",
      title: "Crew Assigned",
      detail: crewAssignedDetail(before, after, crewNames, truckName, notified),
      at,
      by: deps.actor,
    });

  const patch: Record<string, unknown> = {
    truckId: input.truckId,
    crewIds,
    moveDate: input.moveDate,
    startHour: input.startHour,
    duration: input.duration,
  };
  if (events.length) patch["activity"] = appendJobActivity(data["activity"], events);
  if (invite) {
    patch["crewDispatch"] = { at, by: deps.actor, results, notified, logged };
    patch["crewShifts"] = invite.shifts;
  }

  await deps.save(jobId, patch);
  return {
    rescheduled: diff.rescheduled,
    crewChanged: diff.crewChanged,
    notified,
    logged,
    results,
  };
}
