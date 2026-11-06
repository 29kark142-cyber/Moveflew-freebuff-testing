// Growth features for Tasks 13–15: review requests, branch roll-ups and tracked
// re-engagement. All reads and writes are scoped to the caller's workspace; the
// public token handlers live in separate server modules.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  reviewMetrics,
  reviewOutcome,
  type ReviewMetrics,
} from "../shared/reviews";
import {
  branchPerformance,
  type Branch,
  type BranchPerformance,
} from "../shared/branches";
import {
  marketingRates,
  marketingTriggers,
  type MarketingRates,
  type MarketingTrigger,
} from "../shared/marketing";
import { emailConfigured, sendEmail, sendSms, smsConfigured } from "./notifications";

type Db = Pick<SupabaseClient, "from">;
type DbRow = { id: number; data: Record<string, unknown>; created_at?: string };
export type ReviewRequest = {
  id: number;
  customerId: number;
  jobId: number | null;
  customerName: string;
  status: string;
  rating: number | null;
  feedback: string;
  channel: string;
  deliveryStatus: string;
  deliveryDetail: string;
  escalated: boolean;
  publicReviewUrl: string | null;
  sentAt: string | null;
  createdAt: string;
};

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const number = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const base = (origin: string) => origin.replace(/\/+$/, "");
const nowIso = () => new Date().toISOString();

async function rowsFor(db: Db, wsId: number, kind: string): Promise<DbRow[]> {
  const { data, error } = await db
    .from("workspace_records")
    .select("id,data,created_at")
    .eq("workspace_id", wsId)
    .eq("kind", kind)
    .order("id", { ascending: false })
    .limit(3000);
  if (error) throw new Error(error.message);
  return (data ?? []) as DbRow[];
}

async function insertRow(
  db: Db,
  wsId: number,
  kind: string,
  data: Record<string, unknown>,
): Promise<DbRow> {
  const { data: row, error } = await db
    .from("workspace_records")
    .insert({ workspace_id: wsId, kind, data: data as never })
    .select("id,data,created_at")
    .single();
  if (error || !row) throw new Error(error?.message ?? "Could not save the record");
  return row as DbRow;
}

async function patchRow(
  db: Db,
  wsId: number,
  id: number,
  data: Record<string, unknown>,
): Promise<DbRow> {
  const { data: row, error } = await db
    .from("workspace_records")
    .update({ data: data as never, updated_at: nowIso() })
    .eq("id", id)
    .eq("workspace_id", wsId)
    .select("id,data,created_at")
    .single();
  if (error || !row) throw new Error(error?.message ?? "Could not update the record");
  return row as DbRow;
}

async function company(db: Db, wsId: number) {
  const { data } = await db
    .from("workspaces")
    .select("name,office_email")
    .eq("id", wsId)
    .maybeSingle();
  return {
    name: text((data as { name?: unknown } | null)?.name) || "Your moving company",
    officeEmail: text((data as { office_email?: unknown } | null)?.office_email),
  };
}

async function googleReviewUrl(db: Db, wsId: number) {
  const { data } = await db
    .from("workspace_records")
    .select("data")
    .eq("workspace_id", wsId)
    .eq("kind", "setting")
    .limit(1)
    .maybeSingle();
  return text(((data?.data ?? {}) as Record<string, unknown>)["googleReviewUrl"]);
}

export function reviewRequestFrom(row: DbRow): ReviewRequest {
  const data = row.data ?? {};
  const token = text(data["token"]);
  return {
    id: row.id,
    customerId: number(data["customerId"]),
    jobId: data["jobId"] == null ? null : number(data["jobId"]),
    customerName: text(data["customerName"]),
    status: text(data["status"]) || "sent",
    rating: data["rating"] == null ? null : number(data["rating"]),
    feedback: text(data["feedback"]),
    channel: text(data["channel"]),
    deliveryStatus: text(data["deliveryStatus"]) || "unknown",
    deliveryDetail: text(data["deliveryDetail"]),
    escalated: data["escalated"] === true,
    publicReviewUrl: token ? `/review/${token}` : null,
    sentAt: text(data["sentAt"]) || null,
    createdAt: text(data["createdAt"]) || row.created_at || "",
  };
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export type ReviewDispatchResult = {
  created: ReviewRequest[];
  skipped: number;
  sent: number;
  blocked: number;
  failed: number;
};

/**
 * Creates one review request per completed job and records the provider's real
 * accepted/blocked/failed result. A job is keyed by jobId so repeated calls or
 * status saves cannot send duplicate review invitations.
 */
export async function ensureReviewForJob(
  db: Db,
  wsId: number,
  ownerId: string,
  origin: string,
  job: { id: number; data: Record<string, unknown> },
  existing?: DbRow[],
): Promise<ReviewRequest | null> {
  const all = existing ?? (await rowsFor(db, wsId, "review_request"));
  if (all.some(row => number(row.data["jobId"]) === job.id)) return null;
  const data = job.data;
  const customerName = text(data["customerName"]) || "Customer";
  const email = text(data["customerEmail"]);
  const phone = text(data["customerPhone"]);
  const companyInfo = await company(db, wsId);
  const google = await googleReviewUrl(db, wsId);
  const token = randomToken();
  const reviewUrl = `${base(origin) || "https://invalid.local"}/review/${token}`;
  const message = `${companyInfo.name}: thank you for moving with us. Please rate your move from 1–5 and tell us how it went: ${reviewUrl}`;

  let channel = "in_app";
  let deliveryStatus = "blocked_not_configured";
  let deliveryDetail = "No SMS or email provider is configured";
  if (phone && smsConfigured()) {
    channel = "sms";
    const result = await sendSms(
      phone,
      `${companyInfo.name}: how did we do? Rate your move 1–5: ${reviewUrl}`,
    );
    deliveryStatus = result.status;
    deliveryDetail = result.detail;
  } else if (email && emailConfigured()) {
    channel = "email";
    const result = await sendEmail(
      email,
      `How did we do, ${customerName}?`,
      message,
    );
    deliveryStatus = result.status;
    deliveryDetail = result.detail;
  } else if (!phone && !email) {
    deliveryDetail = "The job has no customer phone number or email address";
  }

  const saved = await insertRow(db, wsId, "review_request", {
    customerId: number(data["customerId"]),
    jobId: job.id,
    customerName,
    status: deliveryStatus === "accepted" ? "sent" : "blocked",
    rating: null,
    feedback: "",
    channel,
    deliveryStatus,
    deliveryDetail,
    token,
    googleReviewUrl: google,
    sentAt: deliveryStatus === "accepted" ? nowIso() : null,
    createdAt: nowIso(),
    requestedBy: ownerId,
  });
  return reviewRequestFrom(saved);
}

export async function dispatchCompletedReviews(
  db: Db,
  wsId: number,
  ownerId: string,
  origin: string,
): Promise<ReviewDispatchResult> {
  const [jobs, existing] = await Promise.all([
    rowsFor(db, wsId, "job"),
    rowsFor(db, wsId, "review_request"),
  ]);
  const created: ReviewRequest[] = [];
  let skipped = 0;
  for (const job of jobs) {
    if (text(job.data["status"]) !== "completed") continue;
    const request = await ensureReviewForJob(
      db,
      wsId,
      ownerId,
      origin,
      { id: job.id, data: job.data },
      existing,
    );
    if (!request) skipped += 1;
    else {
      created.push(request);
      existing.push({ id: request.id, data: { jobId: request.jobId } });
    }
  }
  return {
    created,
    skipped,
    sent: created.filter(request => request.deliveryStatus === "accepted").length,
    blocked: created.filter(request => request.deliveryStatus === "blocked_not_configured").length,
    failed: created.filter(request => request.deliveryStatus === "failed").length,
  };
}

export async function createReviewRequest(
  db: Db,
  wsId: number,
  ownerId: string,
  origin: string,
  body: { customerId?: unknown; jobId?: unknown },
) {
  const customerId = number(body.customerId);
  if (!customerId) throw new Error("Choose a saved customer");
  const { data: customer } = await db
    .from("workspace_records")
    .select("id,data")
    .eq("workspace_id", wsId)
    .eq("kind", "customer")
    .eq("id", customerId)
    .maybeSingle();
  if (!customer) throw new Error("That customer is not in this workspace");
  const jobId = body.jobId == null || body.jobId === "" ? null : number(body.jobId);
  let job: { id: number; data: Record<string, unknown> } | null = null;
  if (jobId) {
    const { data: row } = await db
      .from("workspace_records")
      .select("id,data")
      .eq("workspace_id", wsId)
      .eq("kind", "job")
      .eq("id", jobId)
      .maybeSingle();
    if (!row) throw new Error("That job is not in this workspace");
    job = row as { id: number; data: Record<string, unknown> };
  }
  const customerData = (customer.data ?? {}) as Record<string, unknown>;
  const token = randomToken();
  const google = await googleReviewUrl(db, wsId);
  const saved = await insertRow(db, wsId, "review_request", {
    customerId,
    jobId,
    customerName: text(customerData["name"]),
    status: "ready",
    rating: null,
    feedback: "",
    channel: "manual",
    deliveryStatus: "not_sent",
    deliveryDetail: "A one-time link was created; it has not been sent",
    token,
    googleReviewUrl: google,
    sentAt: null,
    createdAt: nowIso(),
    requestedBy: ownerId,
    ...(job ? { customerEmail: text(job.data["customerEmail"]), customerPhone: text(job.data["customerPhone"]) } : {}),
  });
  return { ...reviewRequestFrom(saved), token, url: `/review/${token}` };
}

export async function resolveReviewEscalation(
  db: Db,
  wsId: number,
  id: number,
): Promise<ReviewRequest> {
  const request = (await rowsFor(db, wsId, "review_request")).find(row => row.id === id);
  if (!request) throw new Error("Review request not found");
  const saved = await patchRow(db, wsId, id, {
    ...request.data,
    status: "resolved",
    escalationStatus: "resolved",
    resolvedAt: nowIso(),
  });
  return reviewRequestFrom(saved);
}

export async function reviewsOverview(db: Db, wsId: number) {
  const [requests, google] = await Promise.all([
    rowsFor(db, wsId, "review_request"),
    googleReviewUrl(db, wsId),
  ]);
  const reviews = requests.map(reviewRequestFrom);
  return {
    reviews,
    metrics: reviewMetrics(reviews),
    googleReviewUrl: google,
  };
}

export async function dashboardReviewMetrics(db: Db, wsId: number): Promise<ReviewMetrics> {
  return reviewMetrics((await rowsFor(db, wsId, "review_request")).map(reviewRequestFrom));
}

export async function branchesFor(db: Db, wsId: number): Promise<Branch[]> {
  return (await rowsFor(db, wsId, "branch")).map(row => ({
    id: row.id,
    name: text(row.data["name"]) || `Branch #${row.id}`,
    code: text(row.data["code"]),
    address: text(row.data["address"]),
    phone: text(row.data["phone"]),
    manager: text(row.data["manager"]),
    status: row.data["status"] === "inactive" ? "inactive" : "active",
    createdAt: text(row.data["createdAt"]) || row.created_at,
  }));
}

export async function branchPerformanceFor(db: Db, wsId: number): Promise<BranchPerformance> {
  const [branches, jobs, expenses] = await Promise.all([
    branchesFor(db, wsId),
    rowsFor(db, wsId, "job"),
    rowsFor(db, wsId, "expense"),
  ]);
  return branchPerformance(
    branches,
    jobs.map(row => ({ ...row.data, id: row.id }) as never),
    expenses.map(row => ({ ...row.data, id: row.id }) as never),
  );
}

export type MarketingTouch = {
  id: number;
  customerId: number;
  campaignId: number | null;
  key: string;
  token: string;
  channel: string;
  sent: boolean;
  destination: string;
  createdAt: string;
  openedAt: string | null;
  clickedAt: string | null;
  convertedAt: string | null;
  deliveryStatus: string;
};

function touchFrom(row: DbRow): MarketingTouch {
  const data = row.data ?? {};
  return {
    id: row.id,
    customerId: number(data["customerId"]),
    campaignId: data["campaignId"] == null ? null : number(data["campaignId"]),
    key: text(data["key"]),
    token: text(data["token"]),
    channel: text(data["channel"]),
    sent: data["sent"] !== false,
    destination: text(data["destination"]),
    createdAt: text(data["createdAt"]) || row.created_at || "",
    openedAt: text(data["openedAt"]) || null,
    clickedAt: text(data["clickedAt"]) || null,
    convertedAt: text(data["convertedAt"]) || null,
    deliveryStatus: text(data["deliveryStatus"]),
  };
}

export type MarketingOverview = {
  triggers: MarketingTrigger[];
  campaigns: Array<Record<string, unknown> & { id: number }>;
  touches: MarketingTouch[];
  rates: MarketingRates;
  providers: { email: boolean; sms: boolean };
};

export async function marketingOverview(
  db: Db,
  wsId: number,
  origin: string,
): Promise<MarketingOverview> {
  const [campaignRows, touches, jobs, customers] = await Promise.all([
    rowsFor(db, wsId, "campaign"),
    rowsFor(db, wsId, "marketing_touch"),
    rowsFor(db, wsId, "job"),
    rowsFor(db, wsId, "customer"),
  ]);
  const parsedTouches = touches.map(touchFrom);
  const triggers = marketingTriggers({
    origin,
    jobs: jobs.map(row => ({ ...row.data, id: row.id }) as never),
    customers: customers.map(row => ({ ...row.data, id: row.id }) as never),
    sentKeys: parsedTouches.map(touch => touch.key).filter(Boolean),
  });
  return {
    triggers,
    campaigns: campaignRows.map(row => ({ ...row.data, id: row.id })),
    touches: parsedTouches,
    rates: marketingRates(parsedTouches),
    providers: { email: emailConfigured(), sms: smsConfigured() },
  };
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function sendMarketingEmail(
  to: string,
  subject: string,
  message: string,
  clickUrl: string,
  pixelUrl: string,
): Promise<{ accepted: boolean; detail: string }> {
  const key = process.env["SENDGRID_API_KEY"];
  const from = process.env["MESSAGING_FROM_EMAIL"];
  if (!key || !from) return { accepted: false, detail: "Email sender is not configured" };
  try {
    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: from },
        subject,
        content: [
          {
            type: "text/html",
            value: `<p>${escapeHtml(message)}</p><p><a href="${clickUrl}">Continue with MoveFlew</a></p><img src="${pixelUrl}" width="1" height="1" alt="" />`,
          },
        ],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok
      ? { accepted: true, detail: "SendGrid accepted the message" }
      : { accepted: false, detail: `SendGrid rejected the message (${response.status})` };
  } catch (error) {
    console.error("Marketing email failed", error instanceof Error ? error.message : error);
    return { accepted: false, detail: "SendGrid could not be reached" };
  }
}

export type ReengagementRun = {
  created: number;
  sent: number;
  blocked: number;
  failed: number;
  triggers: number;
  rates: MarketingRates;
};

/**
 * Sends eligible follow-ups once per dedupe key and stores the tracking token.
 * Marketing email uses a click redirect and a one-pixel open beacon; SMS uses
 * the same click redirect. Provider failures are recorded, never reported sent.
 */
export async function runReengagement(
  db: Db,
  wsId: number,
  ownerId: string,
  origin: string,
  campaignId: number | null = null,
): Promise<ReengagementRun> {
  const overview = await marketingOverview(db, wsId, origin);
  if (campaignId && !overview.campaigns.some(campaign => Number(campaign.id) === campaignId))
    throw new Error("That campaign is not in this workspace");
  const [customerRows, companyInfo] = await Promise.all([
    rowsFor(db, wsId, "customer"),
    company(db, wsId),
  ]);
  const customerById = new Map(
    customerRows.map(row => [row.id, row.data as Record<string, unknown>]),
  );
  let created = 0;
  let sent = 0;
  let blocked = 0;
  let failed = 0;
  for (const trigger of overview.triggers) {
    const customer = customerById.get(trigger.customerId) ?? {};
    if (customer["marketingOptOut"] === true || customer["unsubscribed"] === true) continue;
    if (trigger.channel === "none") continue;
    const token = randomToken();
    const clickUrl = `${base(origin)}/api/public/marketing/click/${token}`;
    const pixelUrl = `${base(origin)}/api/public/marketing/open/${token}`;
    let deliveryAccepted = false;
    let detail = "No provider is configured";
    if (trigger.channel === "email") {
      const email = trigger.email;
      const result = await sendMarketingEmail(
        email,
        `${companyInfo.name}: ${trigger.reason}`,
        `${trigger.reason}. We would love to help with your next move.`,
        clickUrl,
        pixelUrl,
      );
      deliveryAccepted = result.accepted;
      detail = result.detail;
    } else {
      const phone = trigger.phone;
      const result = await sendSms(
        phone,
        `${companyInfo.name}: ${trigger.reason}. ${clickUrl}`,
      );
      deliveryAccepted = result.status === "accepted";
      detail = result.detail;
    }
    await insertRow(db, wsId, "marketing_touch", {
      key: trigger.key,
      kind: trigger.kind,
      customerId: trigger.customerId,
      jobId: trigger.jobId,
      campaignId,
      channel: trigger.channel,
      token,
      destination: trigger.destination,
      sent: deliveryAccepted,
      deliveryStatus: deliveryAccepted ? "accepted" : "failed",
      deliveryDetail: detail,
      createdAt: nowIso(),
      openedAt: null,
      clickedAt: null,
      convertedAt: null,
      sentBy: ownerId,
    });
    created += 1;
    if (deliveryAccepted) sent += 1;
    else if (!emailConfigured() && !smsConfigured()) blocked += 1;
    else failed += 1;
  }
  return {
    created,
    sent,
    blocked,
    failed,
    triggers: overview.triggers.length,
    rates: marketingRates((await rowsFor(db, wsId, "marketing_touch")).map(touchFrom)),
  };
}

/** A booked job converts the most recent still-unconverted touch for its customer. */
export async function markMarketingConversion(
  db: Db,
  wsId: number,
  customerId: number,
): Promise<void> {
  if (!customerId) return;
  const touches = (await rowsFor(db, wsId, "marketing_touch"))
    .map(touchFrom)
    .filter(touch => touch.customerId === customerId && !touch.convertedAt);
  if (!touches.length) return;
  const current = await rowsFor(db, wsId, "marketing_touch");
  const row = current.find(item => item.id === touches[0].id);
  if (!row) return;
  await patchRow(db, wsId, row.id, { ...row.data, convertedAt: nowIso() });
}

export { reviewOutcome };
