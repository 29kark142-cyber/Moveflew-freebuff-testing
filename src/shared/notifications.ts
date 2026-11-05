// Job lifecycle message triggers shared by the field screen, the office drawer and
// the server, so the preview a dispatcher reads is the text that is actually sent.

export const JOB_NOTIFICATION_KINDS = ["pre_move_3d", "move_day_morning", "post_move_2h"] as const;
export type JobNotificationKind = (typeof JOB_NOTIFICATION_KINDS)[number];

export type JobNotificationContext = {
  companyName: string;
  customerName: string;
  moveDate: string;
  reference: string;
  trackingUrl: string;
  reviewUrl: string;
};

const PRE_MOVE_BODY =
  "Move day is almost here! Need help packing? Reply PACK to add professional packers to your booking. — {companyName}";
const MOVE_DAY_BODY =
  "Good morning {customerName}! Your crew is on the way today. Follow your move live: {trackingUrl} — {companyName}";
const POST_MOVE_BODY =
  "Thanks for moving with {companyName}, {customerName}! How did it go? Leave a quick review: {reviewUrl}";

export const JOB_NOTIFICATIONS: Record<
  JobNotificationKind,
  { label: string; when: string; sms: string; emailSubject: string }
> = {
  pre_move_3d: {
    label: "3 days before move",
    when: "Three days out — packing upsell",
    sms: PRE_MOVE_BODY,
    emailSubject: "Move day is almost here — need packing help?",
  },
  move_day_morning: {
    label: "Move day morning",
    when: "Morning of the move — live tracking link",
    sms: MOVE_DAY_BODY,
    emailSubject: "Your move is today — follow it live",
  },
  post_move_2h: {
    label: "2 hours after move",
    when: "Two hours after completion — review follow-up",
    sms: POST_MOVE_BODY,
    emailSubject: "How did your move go?",
  },
};

export function isJobNotificationKind(value: unknown): value is JobNotificationKind {
  return typeof value === "string" && (JOB_NOTIFICATION_KINDS as readonly string[]).includes(value);
}

/** Renders only documented tokens; anything unknown becomes an empty string. */
export function renderNotificationText(template: string, context: JobNotificationContext): string {
  return template.replace(/\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}/g, (_match, key: string) => {
    const value = (context as unknown as Record<string, unknown>)[key];
    return typeof value === "string" ? value : "";
  });
}

const MS_MIN = 60_000;

function moveDateParts(moveDate: unknown): [number, number, number] | null {
  if (typeof moveDate !== "string") return null;
  const date = moveDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const at = new Date(y, m - 1, d);
  return Number.isFinite(at.getTime()) ? [y, m, d] : null;
}

/**
 * When a trigger becomes due. Times are workspace-local because the schedule itself
 * is stored as a plain date plus an hour, exactly like the dispatch board.
 */
export function notificationDueAt(
  kind: JobNotificationKind,
  job: Record<string, unknown>,
): string | null {
  const parts = moveDateParts(job["moveDate"]);
  if (kind === "post_move_2h") {
    const timeline = (job["timeline"] ?? {}) as Record<string, unknown>;
    const done = typeof timeline["complete"] === "string" ? Date.parse(timeline["complete"]) : NaN;
    return Number.isFinite(done) ? new Date(done + 2 * 60 * MS_MIN).toISOString() : null;
  }
  if (!parts) return null;
  const [y, m, d] = parts;
  const at =
    kind === "pre_move_3d"
      ? new Date(y, m - 1, d - 3, 9, 0, 0, 0)
      : new Date(y, m - 1, d, 7, 0, 0, 0);
  return Number.isFinite(at.getTime()) ? at.toISOString() : null;
}

export const MAX_NOTIFICATION_ENTRIES = 12;

export type NotificationEntry = {
  kind: JobNotificationKind;
  channel: "sms" | "email" | "in_app";
  status: string;
  at: string;
  by: string;
  detail: string;
  providerId?: string;
};

export type JobNotificationState = {
  sentAt: Partial<Record<JobNotificationKind, string>>;
  entries: NotificationEntry[];
};

export function jobNotificationState(job: Record<string, unknown>): JobNotificationState {
  const raw = (job["notifications"] ?? {}) as { sentAt?: unknown; entries?: unknown };
  const sentAt: Partial<Record<JobNotificationKind, string>> = {};
  if (raw.sentAt && typeof raw.sentAt === "object") {
    for (const kind of JOB_NOTIFICATION_KINDS) {
      const value = (raw.sentAt as Record<string, unknown>)[kind];
      if (typeof value === "string") sentAt[kind] = value;
    }
  }
  const entries = Array.isArray(raw.entries)
    ? (raw.entries as NotificationEntry[]).filter(
        (entry) => entry && isJobNotificationKind(entry.kind) && typeof entry.at === "string",
      )
    : [];
  return { sentAt, entries };
}

export type NotificationStatus = {
  kind: JobNotificationKind;
  dueAt: string | null;
  due: boolean;
  sentAt: string | null;
  last: NotificationEntry | null;
};

export function notificationStatuses(
  job: Record<string, unknown>,
  now = Date.now(),
): NotificationStatus[] {
  const state = jobNotificationState(job);
  return JOB_NOTIFICATION_KINDS.map((kind) => {
    const dueAt = notificationDueAt(kind, job);
    const last = [...state.entries].reverse().find((entry) => entry.kind === kind) ?? null;
    return {
      kind,
      dueAt,
      due: Boolean(dueAt && now >= Date.parse(dueAt)),
      sentAt: state.sentAt[kind] ?? null,
      last,
    };
  });
}

/** Appends an entry, keeping the job document small. */
export function appendNotificationEntry(
  job: Record<string, unknown>,
  entry: NotificationEntry,
): JobNotificationState {
  const state = jobNotificationState(job);
  const sentAt = { ...state.sentAt };
  if (entry.status === "accepted") sentAt[entry.kind] = entry.at;
  const entries = [...state.entries, entry].slice(-MAX_NOTIFICATION_ENTRIES);
  return { sentAt, entries };
}
