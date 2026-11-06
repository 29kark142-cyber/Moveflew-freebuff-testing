// Pre-move customer reminders: the 24h and 2h messages, when each dispatch is due, and the
// delivery state saved on the job. Pure functions only, so the dispatcher preview and the
// server send use one copy and one clock.

export const PRE_MOVE_REMINDER_KINDS = ["pre_move_24h", "pre_move_2h"] as const;
export type PreMoveReminderKind = (typeof PRE_MOVE_REMINDER_KINDS)[number];

/** Only booked and deposit-paid moves receive pre-move reminders, like the dispatch board. */
export const REMINDER_JOB_STATUSES = ["booked", "deposit_paid"] as const;

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const pad = (value: number) => String(value).padStart(2, "0");
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export const REMINDER_LEAD_HOURS: Record<PreMoveReminderKind, number> = {
  pre_move_24h: 24,
  pre_move_2h: 2,
};

export function isPreMoveReminderKind(value: unknown): value is PreMoveReminderKind {
  return (
    typeof value === "string" && (PRE_MOVE_REMINDER_KINDS as readonly string[]).includes(value)
  );
}

export function reminderJobActive(status: unknown): boolean {
  return (
    typeof status === "string" && (REMINDER_JOB_STATUSES as readonly string[]).includes(status)
  );
}

/**
 * Pickup instant from the plain date plus decimal hour the schedule stores. UTC keeps the
 * wall-clock time the dispatcher typed stable in both the message and the schedule label.
 */
export function reminderPickupAt(job: Record<string, unknown>): Date | null {
  const raw = text(job["moveDate"]).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [year, month, day] = raw.split("-").map(Number) as [number, number, number];
  const hour = Number(job["startHour"]);
  const at = new Date(
    Date.UTC(year, month - 1, day) + (Number.isFinite(hour) ? hour : 0) * HOUR_MS,
  );
  return Number.isFinite(at.getTime()) ? at : null;
}

export function reminderDueAt(
  job: Record<string, unknown>,
  kind: PreMoveReminderKind,
): string | null {
  const pickup = reminderPickupAt(job);
  if (!pickup) return null;
  return new Date(pickup.getTime() - REMINDER_LEAD_HOURS[kind] * HOUR_MS).toISOString();
}

/** Decimal hours formatted the way the schedule and job sheet show them. */
export function timeOfDayLabel(hour: number): string {
  const minutes = Math.round((Number.isFinite(hour) ? hour : 0) * 60);
  const total = ((minutes % 1440) + 1440) % 1440;
  const hours = Math.floor(total / 60);
  return `${((hours + 11) % 12) + 1}:${pad(total % 60)} ${hours < 12 ? "AM" : "PM"}`;
}

/** The scheduled arrival window customers are told to expect: pickup hour to one hour after. */
export function reminderArrivalWindow(startHour: number): string {
  return `${timeOfDayLabel(startHour)} – ${timeOfDayLabel(startHour + 1)}`;
}

export function reminderDateLabel(
  value: string,
  options: Intl.DateTimeFormatOptions = { weekday: "long", month: "long", day: "numeric" },
): string {
  const raw = text(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "";
  const [year, month, day] = raw.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    ...options,
    timeZone: "UTC",
  });
}

export type ReminderContext = {
  customerName: string;
  companyName: string;
  companyPhone: string;
  reference: string;
  date: string;
  window: string;
  crewLead: string;
  origin: string;
  destination: string;
  truck: string;
  prepUrl: string;
  trackingUrl: string;
};

export const PRE_MOVE_REMINDERS: Record<
  PreMoveReminderKind,
  { label: string; when: string; sms: string; emailSubject: string; emailBody: string }
> = {
  pre_move_24h: {
    label: "24h Reminder",
    when: "24 hours before pickup",
    sms: "Hi {customerName}, your move with {companyName} is tomorrow ({date}). Arrival window: {window}. Crew lead: {crewLead}. Please clear parking and reserve the elevator where needed. Move-day prep checklist: {prepUrl} — reply STOP to opt out.",
    emailSubject: "Tomorrow's move · {reference} · arrival window {window}",
    emailBody: [
      "Hi {customerName},",
      "",
      "Your move with {companyName} is scheduled for {date}.",
      "",
      "Arrival window: {window}",
      "Crew lead: {crewLead}",
      "From: {origin}",
      "To: {destination}",
      "",
      "Parking and elevator: please clear a parking spot for the truck and reserve the elevator if your building requires it, so the crew can start on time.",
      "",
      "Move-day prep checklist: {prepUrl}",
      "",
      "Questions? Call {companyPhone}.",
      "",
      "— {companyName}",
    ].join("\n"),
  },
  pre_move_2h: {
    label: "2h Reminder",
    when: "2 hours before pickup",
    sms: "Hi {customerName}, your crew is due in about 2 hours ({window}). Truck: {truck}. Follow the arrival live: {trackingUrl} — {companyName}",
    emailSubject: "Your crew arrives in about 2 hours · {reference}",
    emailBody: [
      "Hi {customerName},",
      "",
      "Your crew is due in about 2 hours.",
      "",
      "Arrival window (driver ETA): {window}",
      "Assigned truck: {truck}",
      "From: {origin}",
      "To: {destination}",
      "",
      "Follow the arrival live: {trackingUrl}",
      "",
      "— {companyName}",
    ].join("\n"),
  },
};

/** Renders only documented tokens; unknown placeholders become an empty string. */
export function renderReminder(template: string, context: ReminderContext): string {
  return template.replace(/\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}/g, (_match, key: string) => {
    const value = (context as unknown as Record<string, unknown>)[key];
    return typeof value === "string" ? value : "";
  });
}

export type ReminderAttempt = {
  channel: "sms" | "email";
  target: string;
  status: string;
  detail: string;
  providerId?: string;
};

export type PreMoveReminderRecord = {
  kind: PreMoveReminderKind;
  /** When the dispatch was attempted. */
  at: string;
  by: string;
  /** Set only when a provider accepted a message; log-only attempts keep this null. */
  sentAt: string | null;
  window: string;
  attempts: ReminderAttempt[];
};

export type PreMoveReminderState = Partial<Record<PreMoveReminderKind, PreMoveReminderRecord>>;

function attemptOf(value: unknown): ReminderAttempt | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Record<string, unknown>;
  if (entry["channel"] !== "sms" && entry["channel"] !== "email") return null;
  if (typeof entry["target"] !== "string" || typeof entry["status"] !== "string") return null;
  return {
    channel: entry["channel"],
    target: entry["target"],
    status: entry["status"],
    detail: typeof entry["detail"] === "string" ? entry["detail"] : "",
    ...(typeof entry["providerId"] === "string" ? { providerId: entry["providerId"] } : {}),
  };
}

/** Tolerant reader for the saved record, so a hand-edited job cannot break the panel. */
export function reminderState(value: unknown): PreMoveReminderState {
  const state: PreMoveReminderState = {};
  if (!value || typeof value !== "object") return state;
  for (const kind of PRE_MOVE_REMINDER_KINDS) {
    const raw = (value as Record<string, unknown>)[kind];
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    if (typeof entry["at"] !== "string") continue;
    state[kind] = {
      kind,
      at: entry["at"],
      by: typeof entry["by"] === "string" ? entry["by"] : "",
      sentAt: typeof entry["sentAt"] === "string" ? entry["sentAt"] : null,
      window: typeof entry["window"] === "string" ? entry["window"] : "",
      attempts: Array.isArray(entry["attempts"])
        ? (entry["attempts"] as unknown[])
            .map(attemptOf)
            .filter((item): item is ReminderAttempt => Boolean(item))
        : [],
    };
  }
  return state;
}

export function reminderTargets(job: Record<string, unknown>): { phone: string; email: string } {
  return { phone: text(job["customerPhone"]), email: text(job["customerEmail"]) };
}

export function reminderRecipientLabel(job: Record<string, unknown>): string {
  const { phone, email } = reminderTargets(job);
  return [phone, email].filter(Boolean).join(" · ");
}

export type ReminderPlanStatus = "sent" | "due" | "scheduled" | "past";

export type ReminderPlanEntry = {
  kind: PreMoveReminderKind;
  label: string;
  when: string;
  dueAt: string | null;
  sentAt: string | null;
  status: ReminderPlanStatus;
  window: string;
  last: PreMoveReminderRecord | null;
};

/** When each reminder is due and whether it still needs sending. */
export function reminderPlan(job: Record<string, unknown>, now = Date.now()): ReminderPlanEntry[] {
  const pickup = reminderPickupAt(job);
  const saved = reminderState(job["preMoveReminders"]);
  const window = reminderArrivalWindow(Number(job["startHour"]) || 0);
  return PRE_MOVE_REMINDER_KINDS.map((kind) => {
    const dueAt = reminderDueAt(job, kind);
    const record = saved[kind] ?? null;
    const dueMs = dueAt ? Date.parse(dueAt) : NaN;
    const status: ReminderPlanStatus = record?.sentAt
      ? "sent"
      : !pickup || !Number.isFinite(dueMs)
        ? "scheduled"
        : now >= pickup.getTime()
          ? "past"
          : now >= dueMs
            ? "due"
            : "scheduled";
    return {
      kind,
      label: PRE_MOVE_REMINDERS[kind].label,
      when: PRE_MOVE_REMINDERS[kind].when,
      dueAt,
      sentAt: record?.sentAt ?? null,
      status,
      window,
      last: record,
    };
  });
}

/** "Tomorrow at 8:00 AM" style label for the scheduled dispatch time. */
export function reminderScheduleLabel(dueAt: string | null, now = Date.now()): string {
  if (!dueAt) return "";
  const due = new Date(dueAt);
  if (!Number.isFinite(due.getTime())) return "";
  const dayOf = (value: Date) =>
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
  const diffDays = Math.round((dayOf(due) - dayOf(new Date(now))) / DAY_MS);
  const time = due.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
  if (diffDays === 0) return `Today at ${time}`;
  if (diffDays === 1) return `Tomorrow at ${time}`;
  if (diffDays === -1) return `Yesterday at ${time}`;
  return `${due.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })} at ${time}`;
}

export function reminderActivityTitle(record: PreMoveReminderRecord): string {
  const short = record.kind === "pre_move_24h" ? "24h" : "2h";
  return `${short} Pre-Move Reminder ${record.sentAt ? "Sent" : "Logged"}`;
}

/** Arrival window, recipient and per-channel provider answers, capped for the timeline. */
export function reminderActivityDetail(record: PreMoveReminderRecord): string {
  const targets = [...new Set(record.attempts.map((entry) => entry.target))].join(", ");
  const channels = record.attempts.map((entry) => `${entry.channel} ${entry.status}`).join(", ");
  return [record.window, targets, channels].filter(Boolean).join(" · ").slice(0, 400);
}

/** One activity event per dispatch attempt, so a manual resend adds a second entry. */
export function reminderActivity(record: PreMoveReminderRecord) {
  return {
    id: `reminder:${record.kind}:${record.at}`,
    kind:
      record.kind === "pre_move_24h"
        ? ("pre_move_24h_reminder" as const)
        : ("pre_move_2h_reminder" as const),
    title: reminderActivityTitle(record),
    detail: reminderActivityDetail(record),
    at: record.at,
    by: record.by,
  };
}
