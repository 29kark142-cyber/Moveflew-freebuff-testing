// Crew shift confirmations: the per-crew `shf_` token minted when dispatch notifies a crew
// member, the saved answers dispatchers read, decline reasons, and the timeline text.

/**
 * `shf_<job id base36>_<32 hex>`: the random half is the credential, the prefix only lets the
 * public endpoint find the job without scanning every record.
 */
export const SHIFT_TOKEN_RE = /^shf_([0-9a-z]{1,8})_([a-f0-9]{32})$/;

export function newShiftToken(jobId: number): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const secret = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `shf_${Math.max(1, Math.trunc(jobId)).toString(36)}_${secret}`;
}

export function shiftJobId(token: string): number | null {
  const match = SHIFT_TOKEN_RE.exec(String(token ?? "").trim());
  if (!match) return null;
  const id = Number.parseInt(match[1] as string, 36);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export function shiftLink(origin: string, token: string): string {
  return `${String(origin ?? "").replace(/\/+$/, "")}/shift/${token}`;
}

export const SHIFT_STATUSES = ["pending", "confirmed", "declined"] as const;
export type ShiftStatus = (typeof SHIFT_STATUSES)[number];

const STATUS_LABELS: Record<ShiftStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  declined: "Declined",
};

export function shiftStatusLabel(status: ShiftStatus | string): string {
  return STATUS_LABELS[status as ShiftStatus] ?? String(status ?? "");
}

/** The reason list the decline form offers; the server only accepts these values. */
export const DECLINE_REASONS = [
  { value: "scheduling_conflict", label: "Scheduling Conflict" },
  { value: "illness", label: "Illness" },
  { value: "transportation_issue", label: "Transportation Issue" },
  { value: "other", label: "Other" },
] as const;

export type DeclineReason = (typeof DECLINE_REASONS)[number]["value"];

export const isDeclineReason = (value: unknown): value is DeclineReason =>
  typeof value === "string" && DECLINE_REASONS.some((reason) => reason.value === value);

export function declineReasonLabel(value: unknown): string {
  return DECLINE_REASONS.find((reason) => reason.value === value)?.label ?? "";
}

export type CrewShift = {
  /** Opaque token that appears in the crew member's shift link. */
  token: string;
  crewId: number;
  name: string;
  role: string;
  status: ShiftStatus;
  sentAt: string;
  respondedAt?: string;
  reason?: DeclineReason;
  note?: string;
};

export const CREW_SHIFT_LIMIT = 40;

export const CREW_ROLE_LABELS: Record<string, string> = {
  crew_lead: "Crew lead",
  driver: "Driver",
  helper: "Helper",
};

export function shiftRoleLabel(role: unknown, isDriver = false): string {
  const key = typeof role === "string" ? role.trim().toLowerCase() : "";
  if (CREW_ROLE_LABELS[key]) return CREW_ROLE_LABELS[key] as string;
  return isDriver ? "Driver" : "Mover";
}

/** Saved shift state is untrusted: keep only well-formed answers, newest dispatch last. */
export function crewShifts(value: unknown): CrewShift[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object",
    )
    .filter(
      (entry) =>
        typeof entry.token === "string" &&
        SHIFT_TOKEN_RE.test(entry.token) &&
        typeof entry.crewId === "number" &&
        Number.isFinite(entry.crewId) &&
        typeof entry.sentAt === "string" &&
        (SHIFT_STATUSES as readonly string[]).includes(String(entry.status)),
    )
    .map((entry) => ({
      token: String(entry.token),
      crewId: Number(entry.crewId),
      name: typeof entry.name === "string" ? entry.name : "",
      role: typeof entry.role === "string" ? entry.role : "",
      status: entry.status as ShiftStatus,
      sentAt: String(entry.sentAt),
      ...(typeof entry.respondedAt === "string" ? { respondedAt: entry.respondedAt } : {}),
      ...(isDeclineReason(entry.reason) ? { reason: entry.reason } : {}),
      ...(typeof entry.note === "string" && entry.note ? { note: entry.note.slice(0, 300) } : {}),
    }))
    .slice(-CREW_SHIFT_LIMIT);
}

export function shiftForToken(value: unknown, token: string): CrewShift | null {
  return crewShifts(value).find((shift) => shift.token === token) ?? null;
}

export type ShiftCounts = { pending: number; confirmed: number; declined: number };

export function shiftCounts(value: unknown): ShiftCounts {
  const counts: ShiftCounts = { pending: 0, confirmed: 0, declined: 0 };
  for (const shift of crewShifts(value)) counts[shift.status] += 1;
  return counts;
}

/** Saved answers for crew still on the job, so a removed member leaves no stale badge. */
export function jobCrewShifts(value: unknown, crewIds: readonly number[]): CrewShift[] {
  return crewShifts(value).filter((shift) => crewIds.includes(shift.crewId));
}

export function declinedCrewNames(value: unknown): string[] {
  return crewShifts(value)
    .filter((shift) => shift.status === "declined")
    .map((shift) => shift.name || `Crew #${shift.crewId}`);
}

export function newCrewShift(input: {
  jobId: number;
  crewId: number;
  name: string;
  role: string;
  at: string;
}): CrewShift {
  return {
    token: newShiftToken(input.jobId),
    crewId: input.crewId,
    name: input.name,
    role: input.role,
    status: "pending",
    sentAt: input.at,
  };
}

/** Replaces one crew answer without touching the other assignments. */
export function withShiftResponse(
  value: unknown,
  token: string,
  response: {
    status: Exclude<ShiftStatus, "pending">;
    at: string;
    reason?: DeclineReason;
    note?: string;
  },
): CrewShift[] {
  return crewShifts(value).map((shift) =>
    shift.token === token
      ? {
          ...shift,
          status: response.status,
          respondedAt: response.at,
          ...(response.status === "declined" && response.reason ? { reason: response.reason } : {}),
          ...(response.status === "declined" && response.note
            ? { note: response.note.slice(0, 300) }
            : {}),
        }
      : shift,
  );
}

export const SHIFT_CONFIRMED_TITLE = "Crew Shift Confirmed";
export const SHIFT_DECLINED_TITLE = "Crew Shift Declined";

/**
 * Timeline event for one answer. The id is the token, so a retried request or a double tap
 * can never append the same confirmation twice.
 */
export function shiftResponseActivity(input: {
  token: string;
  status: Exclude<ShiftStatus, "pending">;
  name: string;
  moveDate: string;
  startHour: number;
  reason?: DeclineReason;
  at: string;
  by: string;
}): {
  id: string;
  kind: "crew_shift_confirmed" | "crew_shift_declined";
  title: string;
  detail: string;
  at: string;
  by: string;
} {
  const confirmed = input.status === "confirmed";
  const slot = `${dayLabel(input.moveDate)} ${timeLabel(input.startHour)}`;
  const reason = confirmed ? "" : declineReasonLabel(input.reason);
  return {
    id: `shift:${input.token}`,
    kind: confirmed ? "crew_shift_confirmed" : "crew_shift_declined",
    title: confirmed ? SHIFT_CONFIRMED_TITLE : SHIFT_DECLINED_TITLE,
    detail: `${input.name || "Crew member"} · ${slot}${reason ? ` · ${reason}` : ""}`.slice(0, 400),
    at: input.at,
    by: input.by,
  };
}

// Local imports stay at the bottom so the token helpers above have no import cycle.
import { dayLabel, timeLabel } from "./schedule";
