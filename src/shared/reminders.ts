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
  settings: ReminderSettings = DEFAULT_REMINDER_SETTINGS,
): string | null {
  const pickup = reminderPickupAt(job);
  if (!pickup) return null;
  return new Date(pickup.getTime() - reminderLeadHours(kind, settings) * HOUR_MS).toISOString();
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

export type ReminderTierSettings = {
  /** Off means the automated sweep never sends this reminder. */
  enabled: boolean;
  leadHours: number;
  sms: boolean;
  email: boolean;
  /** Empty string keeps the built-in copy for that field. */
  smsTemplate: string;
  emailSubject: string;
  emailBody: string;
};

export type ReminderSettings = { first: ReminderTierSettings; second: ReminderTierSettings };

export const REMINDER_LEAD_HOURS_LIMITS = { min: 1, max: 168 } as const;

/** Unconfigured workspaces keep the standard 24h and 2h schedule on both channels. */
export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  first: {
    enabled: true,
    leadHours: 24,
    sms: true,
    email: true,
    smsTemplate: "",
    emailSubject: "",
    emailBody: "",
  },
  second: {
    enabled: true,
    leadHours: 2,
    sms: true,
    email: true,
    smsTemplate: "",
    emailSubject: "",
    emailBody: "",
  },
};

/** Tokens the settings surface offers; snake_case aliases render from the camelCase context. */
export const REMINDER_PLACEHOLDERS: Array<{ token: string; label: string }> = [
  { token: "{customer_name}", label: "Customer name" },
  { token: "{company_name}", label: "Company name" },
  { token: "{company_phone}", label: "Company phone" },
  { token: "{reference}", label: "Job reference" },
  { token: "{move_date}", label: "Move date" },
  { token: "{arrival_window}", label: "Arrival window" },
  { token: "{crew_lead}", label: "Crew lead and phone" },
  { token: "{origin}", label: "Pickup address" },
  { token: "{destination}", label: "Drop-off address" },
  { token: "{truck_name}", label: "Assigned truck" },
  { token: "{prep_link}", label: "Move-day prep checklist link" },
  { token: "{tracking_link}", label: "Live tracking link" },
];

const CONTEXT_ALIASES: Record<string, keyof ReminderContext> = {
  customer_name: "customerName",
  company_name: "companyName",
  company_phone: "companyPhone",
  move_date: "date",
  arrival_window: "window",
  crew_lead: "crewLead",
  truck_name: "truck",
  prep_link: "prepUrl",
  tracking_link: "trackingUrl",
};

export function reminderTierKey(kind: PreMoveReminderKind): "first" | "second" {
  return kind === "pre_move_24h" ? "first" : "second";
}

export function reminderTierSettings(
  kind: PreMoveReminderKind,
  settings: ReminderSettings = DEFAULT_REMINDER_SETTINGS,
): ReminderTierSettings {
  return settings[reminderTierKey(kind)];
}

export function reminderLeadHours(
  kind: PreMoveReminderKind,
  settings: ReminderSettings = DEFAULT_REMINDER_SETTINGS,
): number {
  return reminderTierSettings(kind, settings).leadHours;
}

export function reminderLabel(
  kind: PreMoveReminderKind,
  settings: ReminderSettings = DEFAULT_REMINDER_SETTINGS,
): string {
  return `${reminderLeadHours(kind, settings)}h Reminder`;
}

export function reminderWhenLabel(
  kind: PreMoveReminderKind,
  settings: ReminderSettings = DEFAULT_REMINDER_SETTINGS,
): string {
  const hours = reminderLeadHours(kind, settings);
  return `${hours} ${hours === 1 ? "hour" : "hours"} before pickup`;
}

export function reminderChannels(
  kind: PreMoveReminderKind,
  settings: ReminderSettings = DEFAULT_REMINDER_SETTINGS,
): { sms: boolean; email: boolean } {
  const tier = reminderTierSettings(kind, settings);
  return { sms: tier.sms, email: tier.email };
}

/** Workspace overrides per field; an empty override keeps the built-in copy. */
export function reminderTemplate(
  kind: PreMoveReminderKind,
  settings: ReminderSettings = DEFAULT_REMINDER_SETTINGS,
): { sms: string; emailSubject: string; emailBody: string } {
  const builtIn = PRE_MOVE_REMINDERS[kind];
  const tier = reminderTierSettings(kind, settings);
  return {
    sms: text(tier.smsTemplate) || builtIn.sms,
    emailSubject: text(tier.emailSubject) || builtIn.emailSubject,
    emailBody: text(tier.emailBody) || builtIn.emailBody,
  };
}

const clampLeadHours = (value: unknown, fallback: number): number => {
  const hours = Number(value);
  if (!Number.isFinite(hours)) return fallback;
  const rounded = Math.round(hours * 2) / 2;
  return Math.min(
    REMINDER_LEAD_HOURS_LIMITS.max,
    Math.max(REMINDER_LEAD_HOURS_LIMITS.min, rounded),
  );
};

function tierOf(value: unknown, fallback: ReminderTierSettings): ReminderTierSettings {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const str = (key: string, max: number) =>
    typeof raw[key] === "string" ? (raw[key] as string).slice(0, max) : "";
  return {
    enabled: typeof raw["enabled"] === "boolean" ? raw["enabled"] : fallback.enabled,
    leadHours: clampLeadHours(raw["leadHours"], fallback.leadHours),
    sms: typeof raw["sms"] === "boolean" ? raw["sms"] : fallback.sms,
    email: typeof raw["email"] === "boolean" ? raw["email"] : fallback.email,
    smsTemplate: str("smsTemplate", 2000),
    emailSubject: str("emailSubject", 200),
    emailBody: str("emailBody", 8000),
  };
}

/** Tolerant reader: a missing or hand-edited setting falls back to the standard schedule. */
export function parseReminderSettings(value: unknown): ReminderSettings {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    first: tierOf(raw["first"], DEFAULT_REMINDER_SETTINGS.first),
    second: tierOf(raw["second"], DEFAULT_REMINDER_SETTINGS.second),
  };
}

export type ReminderSettingsInput =
  { ok: true; settings: ReminderSettings } | { ok: false; error: string };

/** Strict writer validation for the settings endpoint. */
export function reminderSettingsInput(value: unknown): ReminderSettingsInput {
  if (!value || typeof value !== "object")
    return { ok: false, error: "Reminder settings are required" };
  const raw = value as Record<string, unknown>;
  for (const tier of ["first", "second"] as const) {
    const label = tier === "first" ? "First" : "Second";
    const entry = raw[tier];
    if (!entry || typeof entry !== "object")
      return { ok: false, error: `${label} reminder settings are missing` };
    const row = entry as Record<string, unknown>;
    const hours = Number(row["leadHours"]);
    if (
      !Number.isFinite(hours) ||
      hours < REMINDER_LEAD_HOURS_LIMITS.min ||
      hours > REMINDER_LEAD_HOURS_LIMITS.max
    )
      return {
        ok: false,
        error: `${label} reminder lead time must be between ${REMINDER_LEAD_HOURS_LIMITS.min} and ${REMINDER_LEAD_HOURS_LIMITS.max} hours`,
      };
    if (typeof row["enabled"] !== "boolean")
      return { ok: false, error: `${label} reminder needs an on/off value` };
    if (typeof row["sms"] !== "boolean" || typeof row["email"] !== "boolean")
      return { ok: false, error: `${label} reminder needs SMS and email settings` };
  }
  const settings = parseReminderSettings(raw);
  if (settings.first.leadHours <= settings.second.leadHours)
    return { ok: false, error: "The first reminder must be sent earlier than the second" };
  return { ok: true, settings };
}

/** Renders only documented tokens; unknown placeholders become an empty string. */
export function renderReminder(template: string, context: ReminderContext): string {
  return template.replace(/\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}/g, (_match, raw: string) => {
    const key = (CONTEXT_ALIASES[raw] ?? raw) as keyof ReminderContext;
    const value = context[key];
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
  /** Lead time in force when this dispatch happened, for the timeline title. */
  leadHours?: number;
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
      ...(Number(entry["leadHours"]) > 0 ? { leadHours: Number(entry["leadHours"]) } : {}),
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
  /** False when the workspace turned this tier off; the sweep skips it. */
  enabled: boolean;
  leadHours: number;
  channels: { sms: boolean; email: boolean };
  last: PreMoveReminderRecord | null;
};

/** When each reminder is due and whether it still needs sending. */
export function reminderPlan(
  job: Record<string, unknown>,
  now = Date.now(),
  settings: ReminderSettings = DEFAULT_REMINDER_SETTINGS,
): ReminderPlanEntry[] {
  const pickup = reminderPickupAt(job);
  const saved = reminderState(job["preMoveReminders"]);
  const window = reminderArrivalWindow(Number(job["startHour"]) || 0);
  return PRE_MOVE_REMINDER_KINDS.map((kind) => {
    const tier = reminderTierSettings(kind, settings);
    const dueAt = reminderDueAt(job, kind, settings);
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
      label: reminderLabel(kind, settings),
      when: reminderWhenLabel(kind, settings),
      dueAt,
      sentAt: record?.sentAt ?? null,
      status,
      window,
      enabled: tier.enabled,
      leadHours: tier.leadHours,
      channels: { sms: tier.sms, email: tier.email },
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
  const hours =
    record.leadHours && Number.isFinite(record.leadHours) && record.leadHours > 0
      ? record.leadHours
      : REMINDER_LEAD_HOURS[record.kind];
  return `${hours}h Pre-Move Reminder ${record.sentAt ? "Sent" : "Logged"}`;
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
