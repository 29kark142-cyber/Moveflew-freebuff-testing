// Dispatcher calendar rules: calendar grids, board filters, truck capacity checks and the
// activity/notification text used when a job is rescheduled or a crew is assigned.
import type { InventoryEntry, Job, Truck } from "./crm";

export type ScheduleView = "month" | "week" | "day";

/** Jobs that occupy the dispatch calendar unless another status filter is chosen. */
export const ACTIVE_SCHEDULE_STATUSES = ["booked", "deposit_paid"] as const;

export const SCHEDULE_DAY_START = 6;
export const SCHEDULE_DAY_END = 22;

const DAY_MS = 86_400_000;
const pad = (value: number) => String(value).padStart(2, "0");

export const isoDay = (value: string | Date) =>
  (value instanceof Date ? value.toISOString() : String(value ?? "")).slice(0, 10);

function utcDate(iso: string): Date {
  const [year, month, day] = isoDay(iso).split("-").map(Number);
  return new Date(Date.UTC(year || 1970, (month || 1) - 1, day || 1));
}

export function addDays(iso: string, days: number): string {
  return new Date(utcDate(iso).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/** Monday-first week containing the given day. */
export function startOfWeek(iso: string): string {
  const weekday = (utcDate(iso).getUTCDay() + 6) % 7;
  return addDays(iso, -weekday);
}

export function weekDays(iso: string): string[] {
  const start = startOfWeek(iso);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

/** Six Monday-first weeks covering the month, so the grid never changes height. */
export function monthDays(iso: string): string[] {
  const first = `${isoDay(iso).slice(0, 7)}-01`;
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

export function sameMonth(a: string, b: string): boolean {
  return isoDay(a).slice(0, 7) === isoDay(b).slice(0, 7);
}

export function isToday(iso: string): boolean {
  return isoDay(iso) === isoDay(new Date());
}

export function dayLabel(
  iso: string,
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" },
): string {
  return utcDate(iso).toLocaleDateString("en-US", { ...options, timeZone: "UTC" });
}

export function monthLabel(iso: string): string {
  return dayLabel(iso, { month: "long", year: "numeric" });
}

/** Decimal hours are stored on jobs, so every surface formats the same way. */
export function timeLabel(hour: number): string {
  const minutes = Math.round((Number.isFinite(hour) ? hour : 0) * 60);
  const hours = Math.floor(minutes / 60) % 24;
  const rest = ((minutes % 60) + 60) % 60;
  return `${((hours + 11) % 12) + 1}:${pad(rest)} ${hours < 12 ? "AM" : "PM"}`;
}

export function timeInputValue(hour: number): string {
  const minutes = Math.round((Number.isFinite(hour) ? hour : 0) * 60);
  return `${pad(Math.floor(minutes / 60) % 24)}:${pad(((minutes % 60) + 60) % 60)}`;
}

export function hourFromInput(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return (hours || 0) + (minutes || 0) / 60;
}

export function snapQuarter(hour: number): number {
  if (!Number.isFinite(hour)) return 0;
  return Math.round(hour * 4) / 4;
}

export type ScheduleTone = "booked" | "deposit" | "quote" | "progress" | "done" | "other";

export function scheduleTone(status: string): ScheduleTone {
  if (status === "booked") return "booked";
  if (status === "deposit_paid") return "deposit";
  if (status === "quote_sent") return "quote";
  if (status === "in_progress") return "progress";
  if (status === "completed") return "done";
  return "other";
}

export type ScheduleFilters = {
  /** `active` keeps booked and deposit-paid moves; `all` shows every status. */
  status: string;
  crewId: number | "all";
  truckId: number | "all" | "unassigned";
};

export const DEFAULT_SCHEDULE_FILTERS: ScheduleFilters = {
  status: "active",
  crewId: "all",
  truckId: "all",
};

export function filterScheduleJobs(jobs: readonly Job[], filters: ScheduleFilters): Job[] {
  return jobs.filter((job) => {
    if (!isoDay(job.moveDate)) return false;
    if (filters.status === "active") {
      if (!(ACTIVE_SCHEDULE_STATUSES as readonly string[]).includes(job.status)) return false;
    } else if (filters.status !== "all" && job.status !== filters.status) return false;
    if (filters.crewId !== "all" && !(job.crewIds ?? []).includes(Number(filters.crewId)))
      return false;
    if (filters.truckId === "unassigned" && job.truckId) return false;
    if (typeof filters.truckId === "number" && job.truckId !== filters.truckId) return false;
    return true;
  });
}

/** Jobs grouped by calendar day, newest first inside each day. */
export function jobsByDay(jobs: readonly Job[]): Map<string, Job[]> {
  const grouped = new Map<string, Job[]>();
  for (const job of jobs) {
    const day = isoDay(job.moveDate);
    const bucket = grouped.get(day) ?? [];
    bucket.push(job);
    grouped.set(day, bucket);
  }
  for (const bucket of grouped.values())
    bucket.sort((a, b) => a.startHour - b.startHour || a.id - b.id);
  return grouped;
}

/** Volume and weight limits are hard conflicts: the truck cannot carry this inventory. */
export function truckCapacityConflict(
  inventory: readonly InventoryEntry[] | undefined,
  truck: Pick<Truck, "name" | "capacityCuft" | "weightLimit">,
): string | null {
  const items = inventory ?? [];
  const volume = items.reduce(
    (total, item) => total + (Number(item.cuft) || 0) * Math.max(1, Number(item.quantity) || 1),
    0,
  );
  const weight = items.reduce(
    (total, item) => total + (Number(item.weight) || 0) * Math.max(1, Number(item.quantity) || 1),
    0,
  );
  const capacity = Number(truck.capacityCuft) || 0;
  const limit = Number(truck.weightLimit) || 0;
  if (capacity > 0 && volume > capacity)
    return `${truck.name} holds ${Math.round(capacity)} ft³; this move needs ${Math.round(volume)} ft³.`;
  if (limit > 0 && weight > limit)
    return `${truck.name} is limited to ${Math.round(limit)} lb; this move is about ${Math.round(weight)} lb.`;
  return null;
}

export type ScheduleAssignment = {
  moveDate: string;
  startHour: number;
  duration: number;
  truckId: number | null;
  crewIds: number[];
};

export type ScheduleDiff = {
  rescheduled: boolean;
  crewChanged: boolean;
  truckChanged: boolean;
  addedCrewIds: number[];
  removedCrewIds: number[];
};

export function scheduleDiff(before: ScheduleAssignment, after: ScheduleAssignment): ScheduleDiff {
  const addedCrewIds = after.crewIds.filter((id) => !before.crewIds.includes(id));
  const removedCrewIds = before.crewIds.filter((id) => !after.crewIds.includes(id));
  return {
    rescheduled:
      isoDay(before.moveDate) !== isoDay(after.moveDate) ||
      Number(before.startHour) !== Number(after.startHour) ||
      Number(before.duration) !== Number(after.duration),
    crewChanged: addedCrewIds.length > 0 || removedCrewIds.length > 0,
    truckChanged: (before.truckId ?? null) !== (after.truckId ?? null),
    addedCrewIds,
    removedCrewIds,
  };
}

/** "Job Rescheduled" detail, naming the old and new slot. */
export function rescheduleDetail(
  before: ScheduleAssignment,
  after: ScheduleAssignment,
  truckName: string | null,
): string {
  const oldSlot = `${dayLabel(before.moveDate)} ${timeLabel(before.startHour)}`;
  const newSlot = `${dayLabel(after.moveDate)} ${timeLabel(after.startHour)}`;
  const truck = truckName ? ` · ${truckName}` : "";
  return `${oldSlot} → ${newSlot} · ${Number(after.duration) || 0}h${truck}`.slice(0, 400);
}

/** "Crew Assigned" detail naming the truck, crew and any notified crew members. */
export function crewAssignedDetail(
  before: ScheduleAssignment,
  after: ScheduleAssignment,
  crewNames: readonly string[],
  truckName: string | null,
  notified: number,
): string {
  const diff = scheduleDiff(before, after);
  const removed = diff.removedCrewIds.length ? ` · removed ${diff.removedCrewIds.length}` : "";
  const crew = crewNames.length ? crewNames.join(", ") : "No crew yet";
  const truck = truckName ? `${truckName} · ` : "";
  const notifiedText = notified > 0 ? ` · notified ${notified}` : "";
  return `${truck}${crew}${removed}${notifiedText}`.slice(0, 500);
}

export type CrewNoticeContext = {
  name: string;
  reference: string;
  moveDate: string;
  time: string;
  origin: string;
  destination: string;
  crewSize: string;
  companyName: string;
};

export const CREW_ASSIGNMENT_SMS =
  "Hi {name}, you're scheduled for {reference} on {moveDate} at {time}. {origin} to {destination}. {crewSize} movers total.";

export const CREW_ASSIGNMENT_EMAIL_SUBJECT = "Shift update · {reference} on {moveDate}";

export const CREW_ASSIGNMENT_EMAIL_BODY = [
  "Hi {name},",
  "",
  "Dispatch has scheduled you on an upcoming move.",
  "",
  "Reference: {reference}",
  "Date: {moveDate} at {time}",
  "From: {origin}",
  "To: {destination}",
  "Crew size: {crewSize}",
  "",
  "If you cannot make this shift, contact {companyName} as soon as possible.",
  "",
  "— {companyName}",
].join("\n");

/** Renders only documented tokens; unknown placeholders become an empty string. */
export function renderCrewNotice(template: string, context: CrewNoticeContext): string {
  return template.replace(/\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}/g, (_match, key: string) => {
    const value = (context as unknown as Record<string, unknown>)[key];
    return typeof value === "string" ? value : "";
  });
}
