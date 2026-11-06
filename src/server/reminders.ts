// Pre-move reminders: dispatch the 24h and 2h customer messages for booked moves, record the
// provider answers on the job and append the activity event. Nothing is recorded as sent
// unless a provider accepted a message; without credentials the attempt is logged instead.

import type { SupabaseClient } from "@supabase/supabase-js";
import { appendJobActivity } from "../shared/job-activity";
import {
  PRE_MOVE_REMINDERS,
  PRE_MOVE_REMINDER_KINDS,
  isPreMoveReminderKind,
  reminderActivity,
  reminderArrivalWindow,
  reminderDateLabel,
  reminderJobActive,
  reminderPickupAt,
  reminderPlan,
  reminderRecipientLabel,
  reminderScheduleLabel,
  reminderState,
  reminderTargets,
  renderReminder,
  type PreMoveReminderKind,
  type PreMoveReminderRecord,
  type PreMoveReminderState,
  type ReminderAttempt,
  type ReminderContext,
} from "../shared/reminders";
import { jobReference, TRACKING_TOKEN_RE } from "../shared/tracking";
import { emailConfigured, smsConfigured } from "./notifications";
import { deliverEmail, deliverSms } from "./quote-dispatch";

type Job = { id: number; data: Record<string, unknown> };

export type ReminderDeps = {
  db: SupabaseClient;
  wsId: number;
  userId: string;
  origin: string;
  save: (jobId: number, patch: Record<string, unknown>) => Promise<unknown>;
};

export class ReminderError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ReminderError";
  }
}

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const base = (origin: string) => origin.replace(/\/+$/, "");

async function companyOf(deps: ReminderDeps) {
  const { data } = await deps.db
    .from("workspaces")
    .select("name,company_phone")
    .eq("id", deps.wsId)
    .maybeSingle();
  return {
    name: text(data?.name) || "your moving company",
    phone: text(data?.company_phone),
  };
}

async function crewLeadOf(deps: ReminderDeps, job: Job): Promise<string> {
  const ids = Array.isArray(job.data["crewIds"])
    ? (job.data["crewIds"] as unknown[]).filter((id): id is number => typeof id === "number")
    : [];
  if (!ids.length) return "";
  const { data } = await deps.db
    .from("workspace_records")
    .select("id,data")
    .eq("workspace_id", deps.wsId)
    .eq("kind", "crew")
    .in("id", ids);
  const crew = (data ?? []).map((row) => {
    const entry = row as { id: number; data: Record<string, unknown> };
    return {
      id: entry.id,
      name: text(entry.data["name"]),
      phone: text(entry.data["phone"]),
      role: text(entry.data["crewRole"]),
      isDriver: entry.data["isDriver"] === true,
    };
  });
  const lead =
    crew.find((member) => member.role === "crew_lead") ??
    crew.find((member) => member.isDriver) ??
    crew[0];
  if (!lead) return "";
  return [lead.name, lead.phone].filter(Boolean).join(" · ");
}

async function truckOf(deps: ReminderDeps, job: Job): Promise<string> {
  const truckId = typeof job.data["truckId"] === "number" ? job.data["truckId"] : null;
  if (!truckId) return "";
  const { data } = await deps.db
    .from("workspace_records")
    .select("data")
    .eq("workspace_id", deps.wsId)
    .eq("kind", "truck")
    .eq("id", truckId)
    .maybeSingle();
  const truck = ((data as { data?: Record<string, unknown> } | null)?.data ?? {}) as Record<
    string,
    unknown
  >;
  return [text(truck["name"]), text(truck["plate"])].filter(Boolean).join(" · ");
}

/**
 * The 24h message links the customer's own tracking page, which carries the move-day prep
 * checklist; the 2h message links the live tracking demo. Both fall back to the demo page,
 * which is public, so a message never contains a dead link.
 */
async function contextOf(deps: ReminderDeps, job: Job): Promise<ReminderContext> {
  const [company, crewLead, truck] = await Promise.all([
    companyOf(deps),
    crewLeadOf(deps, job),
    truckOf(deps, job),
  ]);
  const demo = `${base(deps.origin)}/move/trk_demo`;
  const token = text(job.data["trackingToken"]);
  const startHour = num(job.data["startHour"]);
  return {
    customerName: text(job.data["customerName"]) || "there",
    companyName: company.name,
    companyPhone: company.phone,
    reference: jobReference(job.id),
    date: reminderDateLabel(text(job.data["moveDate"])) || "your move date",
    window: reminderArrivalWindow(startHour),
    crewLead: crewLead || "dispatch",
    origin: text(job.data["origin"]) || "pickup address",
    destination: text(job.data["destination"]) || "drop-off address",
    truck: truck || "assigned truck",
    prepUrl: TRACKING_TOKEN_RE.test(token) ? `${base(deps.origin)}/move/${token}` : demo,
    trackingUrl: demo,
  };
}

export type ReminderSendResult = {
  kind: PreMoveReminderKind;
  sent: boolean;
  skipped: boolean;
  record: PreMoveReminderRecord | null;
};

/**
 * Sends one reminder to the customer. `force` resends after a previous dispatch, which is
 * what the dispatcher's "Send Now" uses; the automated sweep never forces.
 */
export async function sendPreMoveReminder(
  deps: ReminderDeps,
  job: Job,
  kind: PreMoveReminderKind,
  options: { force?: boolean; now?: number } = {},
): Promise<ReminderSendResult> {
  if (!isPreMoveReminderKind(kind)) throw new ReminderError("Unknown pre-move reminder", 400);
  if (!reminderJobActive(job.data["status"]))
    throw new ReminderError("Pre-move reminders apply to booked or deposit-paid moves", 409);
  const pickup = reminderPickupAt(job.data);
  if (!pickup)
    throw new ReminderError("Add a move date and start time before sending reminders", 409);

  const existing = reminderState(job.data["preMoveReminders"])[kind] ?? null;
  if (existing?.sentAt && !options.force)
    return { kind, sent: false, skipped: true, record: existing };

  const targets = reminderTargets(job.data);
  const email = EMAIL_RE.test(targets.email) ? targets.email : "";
  if (!targets.phone && !email)
    throw new ReminderError("Add a customer phone number or email before sending reminders", 409);

  const context = await contextOf(deps, job);
  const template = PRE_MOVE_REMINDERS[kind];
  const attempts: ReminderAttempt[] = [];

  if (targets.phone) {
    const result = await deliverSms(targets.phone, renderReminder(template.sms, context));
    attempts.push({ channel: "sms", target: targets.phone, ...result });
  }
  if (email) {
    const result = await deliverEmail(
      email,
      renderReminder(template.emailSubject, context),
      renderReminder(template.emailBody, context),
    );
    attempts.push({ channel: "email", target: email, ...result });
  }
  if (!attempts.length)
    throw new ReminderError("The saved customer contact is not a usable phone or email", 409);

  const at = new Date(options.now ?? Date.now()).toISOString();
  const accepted = attempts.some((entry) => entry.status === "accepted");
  const record: PreMoveReminderRecord = {
    kind,
    at,
    by: deps.userId,
    sentAt: accepted ? at : null,
    window: context.window,
    attempts,
  };
  const state: PreMoveReminderState = {
    ...reminderState(job.data["preMoveReminders"]),
    [kind]: record,
  };
  const activity = appendJobActivity(job.data["activity"], [reminderActivity(record)]);

  await deps.save(job.id, { preMoveReminders: state, activity });
  job.data = { ...job.data, preMoveReminders: state, activity };
  return { kind, sent: accepted, skipped: false, record };
}

export type ReminderPanelData = {
  reference: string;
  pickupAt: string | null;
  window: string;
  customer: { name: string; phone: string; email: string };
  recipient: string;
  providers: { sms: boolean; email: boolean };
  active: boolean;
  reminders: Array<
    ReturnType<typeof reminderPlan>[number] & {
      scheduleLabel: string;
      preview: { sms: string; emailSubject: string; email: string };
    }
  >;
};

/** Everything the job-sheet panel and its preview modal render, from the saved job. */
export async function reminderPanel(
  deps: ReminderDeps,
  job: Job,
  now = Date.now(),
): Promise<ReminderPanelData> {
  const context = await contextOf(deps, job);
  return {
    reference: context.reference,
    pickupAt: reminderPickupAt(job.data)?.toISOString() ?? null,
    window: context.window,
    customer: {
      name: text(job.data["customerName"]),
      phone: text(job.data["customerPhone"]),
      email: text(job.data["customerEmail"]),
    },
    recipient: reminderRecipientLabel(job.data),
    providers: { sms: smsConfigured(), email: emailConfigured() },
    active: reminderJobActive(job.data["status"]),
    reminders: reminderPlan(job.data, now).map((entry) => {
      const template = PRE_MOVE_REMINDERS[entry.kind];
      return {
        ...entry,
        scheduleLabel: reminderScheduleLabel(entry.dueAt, now),
        preview: {
          sms: renderReminder(template.sms, context),
          emailSubject: renderReminder(template.emailSubject, context),
          email: renderReminder(template.emailBody, context),
        },
      };
    }),
  };
}

export type ReminderSweepResult = {
  attempted: number;
  sent: number;
  logged: number;
  skipped: number;
  failed: number;
  results: Array<{ jobId: number; kind: PreMoveReminderKind; sent: boolean; error?: string }>;
};

const RETRY_AFTER_MS = 60 * 60_000;

/**
 * Sends every reminder that is due and still unanswered. Safe to repeat: an accepted
 * dispatch is stored on the job, and a failed attempt waits an hour before retrying.
 */
export async function sweepPreMoveReminders(
  deps: ReminderDeps,
  jobs: Job[],
  now = Date.now(),
): Promise<ReminderSweepResult> {
  const result: ReminderSweepResult = {
    attempted: 0,
    sent: 0,
    logged: 0,
    skipped: 0,
    failed: 0,
    results: [],
  };
  for (const job of jobs) {
    if (!reminderJobActive(job.data["status"])) continue;
    for (const entry of reminderPlan(job.data, now)) {
      if (entry.status !== "due") continue;
      const last = entry.last;
      if (last && !last.sentAt && now - Date.parse(last.at) < RETRY_AFTER_MS) {
        result.skipped += 1;
        continue;
      }
      result.attempted += 1;
      try {
        const sent = await sendPreMoveReminder(deps, job, entry.kind, { now });
        if (sent.sent) result.sent += 1;
        else result.logged += 1;
        result.results.push({ jobId: job.id, kind: entry.kind, sent: sent.sent });
      } catch (error) {
        result.failed += 1;
        result.results.push({
          jobId: job.id,
          kind: entry.kind,
          sent: false,
          error: error instanceof Error ? error.message : "Reminder failed",
        });
      }
    }
  }
  return result;
}

export type ReminderSweepSummary = {
  workspaces: number;
  jobs: number;
  attempted: number;
  sent: number;
  logged: number;
  skipped: number;
  failed: number;
  durationMs: number;
};

/** Unattended sweep across workspaces; the cron route calls this with the service role. */
export async function runPreMoveReminderSweep(
  origin: string,
  onlyWorkspace = 0,
): Promise<ReminderSweepSummary> {
  const { supabaseAdmin } = await import("../integrations/supabase/client.server");
  const started = Date.now();
  const summary: ReminderSweepSummary = {
    workspaces: 0,
    jobs: 0,
    attempted: 0,
    sent: 0,
    logged: 0,
    skipped: 0,
    failed: 0,
    durationMs: 0,
  };

  const query = supabaseAdmin.from("workspaces").select("id").limit(1000);
  const { data: workspaces, error } = onlyWorkspace
    ? await query.eq("id", onlyWorkspace)
    : await query;
  if (error) throw new Error(error.message);
  summary.workspaces = workspaces?.length ?? 0;

  for (const workspace of workspaces ?? []) {
    const { data: rows, error: jobsError } = await supabaseAdmin
      .from("workspace_records")
      .select("id,data")
      .eq("workspace_id", workspace.id)
      .eq("kind", "job")
      .limit(1000);
    if (jobsError) {
      summary.failed += 1;
      console.error(`[cron] reminders workspace ${workspace.id}: ${jobsError.message}`);
      continue;
    }
    const jobs = (rows ?? []) as Array<{ id: number; data: Record<string, unknown> }>;
    summary.jobs += jobs.length;
    if (!jobs.length) continue;

    try {
      const result = await sweepPreMoveReminders(
        {
          db: supabaseAdmin,
          wsId: workspace.id,
          userId: "system:cron",
          origin,
          // Server-owned save; the service role bypasses RLS for an unattended sweep.
          save: async (jobId: number, patch: Record<string, unknown>) => {
            const job = jobs.find((item) => item.id === jobId);
            const next = { ...(job?.data ?? {}), ...patch };
            const { error: saveError } = await supabaseAdmin
              .from("workspace_records")
              .update({ data: next as never, updated_at: new Date().toISOString() })
              .eq("id", jobId)
              .eq("workspace_id", workspace.id);
            if (saveError) throw new Error(saveError.message);
            if (job) job.data = next;
          },
        },
        jobs,
      );
      summary.attempted += result.attempted;
      summary.sent += result.sent;
      summary.logged += result.logged;
      summary.skipped += result.skipped;
      summary.failed += result.failed;
    } catch (error) {
      summary.failed += 1;
      console.error(`[cron] reminders workspace ${workspace.id} sweep failed`, error);
    }
  }

  summary.durationMs = Date.now() - started;
  return summary;
}
