// Job lifecycle message triggers. Messages are composed from the shared catalogue and
// stored on the job document; nothing here claims a delivery that a provider did not
// accept, and missing credentials produce an explicit "blocked" entry instead of a
// fake "sent" state.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  appendNotificationEntry,
  JOB_NOTIFICATIONS,
  jobNotificationState,
  notificationStatuses,
  renderNotificationText,
  type JobNotificationContext,
  type JobNotificationKind,
  type NotificationEntry,
} from "../shared/notifications";
import { jobReference, newTrackingToken, TRACKING_TOKEN_RE } from "../shared/tracking";

type Job = { id: number; data: Record<string, unknown> };

export type NotificationDeps = {
  db: SupabaseClient;
  wsId: number;
  userId: string;
  origin: string;
  /** Persists a patch on the job, reusing the caller's server-owned writer. */
  save: (jobId: number, patch: Record<string, unknown>) => Promise<unknown>;
};

type Delivery = {
  channel: "sms" | "email" | "in_app";
  status: "accepted" | "failed" | "blocked_not_configured";
  detail: string;
  providerId?: string;
};

export type SendResult = {
  kind: JobNotificationKind;
  sent: boolean;
  skipped: boolean;
  entry: NotificationEntry | null;
  sentAt: string | null;
};

const TIMEOUT_MS = 10_000;
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const base = (origin: string) => origin.replace(/\/+$/, "");

export function smsConfigured(): boolean {
  return Boolean(
    process.env["TWILIO_ACCOUNT_SID"] &&
    process.env["TWILIO_AUTH_TOKEN"] &&
    process.env["TWILIO_FROM_NUMBER"],
  );
}

export function emailConfigured(): boolean {
  return Boolean(process.env["SENDGRID_API_KEY"] && process.env["MESSAGING_FROM_EMAIL"]);
}

async function sendSms(to: string, body: string): Promise<Delivery> {
  const sid = process.env["TWILIO_ACCOUNT_SID"];
  const token = process.env["TWILIO_AUTH_TOKEN"];
  const from = process.env["TWILIO_FROM_NUMBER"];
  if (!sid || !token || !from) {
    return {
      channel: "in_app",
      status: "blocked_not_configured",
      detail: "Twilio is not configured, so nothing was sent",
    };
  }
  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    const payload = (await response.json().catch(() => ({}))) as {
      sid?: string;
      status?: string;
    };
    if (response.ok && payload.sid) {
      return {
        channel: "sms",
        status: "accepted",
        detail: `Twilio accepted the message (${payload.status ?? "queued"})`,
        providerId: payload.sid,
      };
    }
    console.error("Twilio rejected a job notification", { status: response.status });
    return {
      channel: "sms",
      status: "failed",
      detail: `Twilio rejected the message (${response.status})`,
    };
  } catch (error) {
    console.error("Twilio request failed", error instanceof Error ? error.message : error);
    return { channel: "sms", status: "failed", detail: "Twilio could not be reached" };
  }
}

async function sendEmail(to: string, subject: string, body: string): Promise<Delivery> {
  const key = process.env["SENDGRID_API_KEY"];
  const from = process.env["MESSAGING_FROM_EMAIL"];
  if (!key || !from) {
    return {
      channel: "in_app",
      status: "blocked_not_configured",
      detail: "No email sender is configured, so nothing was sent",
    };
  }
  try {
    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: from },
        subject,
        content: [{ type: "text/plain", value: body }],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.ok) {
      return {
        channel: "email",
        status: "accepted",
        detail: "SendGrid accepted the message",
        providerId: response.headers.get("x-message-id") ?? undefined,
      };
    }
    console.error("SendGrid rejected a job notification", { status: response.status });
    return {
      channel: "email",
      status: "failed",
      detail: `SendGrid rejected the message (${response.status})`,
    };
  } catch (error) {
    console.error("SendGrid request failed", error instanceof Error ? error.message : error);
    return { channel: "email", status: "failed", detail: "SendGrid could not be reached" };
  }
}

async function companyInfo(deps: NotificationDeps) {
  const [{ data: ws }, { data: setting }] = await Promise.all([
    deps.db
      .from("workspaces")
      .select("name,company_phone,office_email")
      .eq("id", deps.wsId)
      .maybeSingle(),
    deps.db
      .from("workspace_records")
      .select("data")
      .eq("workspace_id", deps.wsId)
      .eq("kind", "setting")
      .limit(1)
      .maybeSingle(),
  ]);
  const data = ((setting?.data ?? {}) as Record<string, unknown>) ?? {};
  return {
    name: text(ws?.name),
    phone: text(ws?.company_phone),
    reviewUrl: text(data["googleReviewUrl"]),
  };
}

async function ensureTrackingUrl(deps: NotificationDeps, job: Job): Promise<string> {
  const current = text(job.data["trackingToken"]);
  if (TRACKING_TOKEN_RE.test(current)) return `${base(deps.origin)}/move/${current}`;
  const token = newTrackingToken();
  await deps.save(job.id, {
    trackingToken: token,
    trackingTokenCreatedAt: new Date().toISOString(),
  });
  job.data = { ...job.data, trackingToken: token };
  return `${base(deps.origin)}/move/${token}`;
}

function trackingUrlOf(deps: NotificationDeps, job: Job): string {
  const token = text(job.data["trackingToken"]);
  return TRACKING_TOKEN_RE.test(token) ? `${base(deps.origin)}/move/${token}` : "";
}

async function contextFor(deps: NotificationDeps, job: Job): Promise<JobNotificationContext> {
  const company = await companyInfo(deps);
  return {
    companyName: company.name,
    customerName: text(job.data["customerName"]),
    moveDate: text(job.data["moveDate"]).slice(0, 10),
    reference: jobReference(job.id),
    trackingUrl: trackingUrlOf(deps, job),
    reviewUrl: company.reviewUrl,
  };
}

/**
 * Sends one lifecycle message. `force` resends after a previous attempt, which is why
 * the office drawer can offer "Resend" without duplicating an untouched schedule.
 */
export async function sendJobNotification(
  deps: NotificationDeps,
  job: Job,
  kind: JobNotificationKind,
  options: { force?: boolean } = {},
): Promise<SendResult> {
  const state = jobNotificationState(job.data);
  if (state.sentAt[kind] && !options.force) {
    return { kind, sent: false, skipped: true, entry: null, sentAt: state.sentAt[kind] ?? null };
  }

  const company = await companyInfo(deps);
  const context = await contextFor(deps, job);
  const template = JOB_NOTIFICATIONS[kind];
  const body = renderNotificationText(template.sms, context);

  let delivery: Delivery;
  if (kind === "post_move_2h" && !company.reviewUrl) {
    delivery = {
      channel: "in_app",
      status: "blocked_not_configured",
      detail: "Add a Google review link in company settings before requesting a review",
    };
  } else {
    const phone = text(job.data["customerPhone"]);
    const email = text(job.data["customerEmail"]);
    if (phone && smsConfigured()) delivery = await sendSms(phone, body);
    else if (email && emailConfigured())
      delivery = await sendEmail(email, template.emailSubject, body);
    else
      delivery = {
        channel: "in_app",
        status: "blocked_not_configured",
        detail:
          "No SMS or email provider is configured — the message was logged on the job instead of sent",
      };
  }

  const entry: NotificationEntry = {
    kind,
    channel: delivery.channel,
    status: delivery.status,
    at: new Date().toISOString(),
    by: deps.userId,
    detail: delivery.detail,
    ...(delivery.providerId ? { providerId: delivery.providerId } : {}),
  };
  const next = appendNotificationEntry(job.data, entry);
  await deps.save(job.id, { notifications: next });
  job.data = { ...job.data, notifications: next };

  return {
    kind,
    sent: delivery.status === "accepted",
    skipped: false,
    entry,
    sentAt: next.sentAt[kind] ?? null,
  };
}

const ACTIVE = (status: unknown) =>
  !["cancelled", "declined", "lead", "estimate", "draft"].includes(String(status ?? ""));

/**
 * Dispatches every trigger that is due and still unsent. Safe to call repeatedly: an
 * accepted message is recorded on the job, so a second sweep skips it.
 */
export async function sweepDueNotifications(
  deps: NotificationDeps,
  jobs: Job[],
  now = Date.now(),
): Promise<{ attempted: number; results: SendResult[] }> {
  const results: SendResult[] = [];
  for (const job of jobs) {
    if (!ACTIVE(job.data["status"])) continue;
    for (const status of notificationStatuses(job.data, now)) {
      if (!status.due || status.sentAt || !status.dueAt) continue;
      const timeline = (job.data["timeline"] ?? {}) as Record<string, unknown>;
      if (status.kind === "post_move_2h" && !timeline["complete"]) continue;
      // Never blast a message about a move that happened long ago.
      if (now - Date.parse(status.dueAt) > 7 * 24 * 3_600_000) continue;
      results.push(await sendJobNotification(deps, job, status.kind, {}));
    }
  }
  return { attempted: results.length, results };
}

export type NotificationTriggerView = {
  kind: JobNotificationKind;
  label: string;
  when: string;
  due: boolean;
  dueAt: string | null;
  sentAt: string | null;
  last: NotificationEntry | null;
  preview: { sms: string; emailSubject: string; email: string };
};

export type NotificationPanelData = {
  reference: string;
  reviewUrl: string;
  trackingUrl: string;
  providers: { sms: boolean; email: boolean };
  triggers: NotificationTriggerView[];
  log: NotificationEntry[];
};

/** Everything the office drawer previews, derived from the saved job document. */
export async function notificationPanel(
  deps: NotificationDeps,
  job: Job,
  now = Date.now(),
): Promise<NotificationPanelData> {
  const context = await contextFor(deps, job);
  const state = jobNotificationState(job.data);
  return {
    reference: context.reference,
    reviewUrl: context.reviewUrl,
    trackingUrl: context.trackingUrl,
    providers: { sms: smsConfigured(), email: emailConfigured() },
    triggers: notificationStatuses(job.data, now).map((status) => {
      const template = JOB_NOTIFICATIONS[status.kind];
      const body = renderNotificationText(template.sms, context);
      return {
        kind: status.kind,
        label: template.label,
        when: template.when,
        due: status.due,
        dueAt: status.dueAt,
        sentAt: status.sentAt,
        last: status.last,
        preview: { sms: body, emailSubject: template.emailSubject, email: body },
      };
    }),
    log: [...state.entries].reverse(),
  };
}

/** The company-wide Google review link, shared with the field app. */
export async function companyReviewUrl(db: SupabaseClient, wsId: number): Promise<string> {
  const { data } = await db
    .from("workspace_records")
    .select("data")
    .eq("workspace_id", wsId)
    .eq("kind", "setting")
    .limit(1)
    .maybeSingle();
  const stored = ((data?.data ?? {}) as Record<string, unknown>)["googleReviewUrl"];
  return text(stored);
}

/** Saves the company-wide Google review link on the workspace settings record. */
export async function saveCompanyReviewUrl(
  db: SupabaseClient,
  wsId: number,
  value: string,
  userId: string,
): Promise<string> {
  const { data: existing } = await db
    .from("workspace_records")
    .select("id,data")
    .eq("workspace_id", wsId)
    .eq("kind", "setting")
    .limit(1)
    .maybeSingle();
  const data = {
    ...((existing?.data ?? {}) as Record<string, unknown>),
    googleReviewUrl: value,
    updatedBy: userId,
  };
  if (existing?.id) {
    const { error } = await db
      .from("workspace_records")
      .update({ data, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .eq("workspace_id", wsId);
    if (error) throw new Error("Could not save the Google review link");
    return value;
  }
  const { error } = await db
    .from("workspace_records")
    .insert({ workspace_id: wsId, kind: "setting", data });
  if (error) throw new Error("Could not save the Google review link");
  return value;
}
