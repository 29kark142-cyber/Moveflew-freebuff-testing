// One-click quote dispatch. Providers are called only when credentials exist; otherwise the
// attempt is recorded as "logged" on the job so nothing claims a delivery that never happened.
import type { SupabaseClient } from "@supabase/supabase-js";
import { appendJobActivity } from "../shared/job-activity";
import {
  QUOTE_SENT_STATUS,
  QUOTE_TEMPLATES,
  QUOTE_TOKEN_RE,
  appendQuoteDeliveries,
  newQuoteToken,
  quoteActivityTitle,
  quoteDeliveries,
  quoteDispatchDetail,
  quoteLink,
  renderQuoteTemplate,
  type QuoteChannel,
  type QuoteDelivery,
  type QuoteMessageContext,
} from "../shared/quote-dispatch";
import { jobReference } from "../shared/tracking";
import { emailConfigured, smsConfigured } from "./notifications";

type Job = { id: number; data: Record<string, unknown> };

export type QuoteDispatchDeps = {
  db: SupabaseClient;
  wsId: number;
  userId: string;
  origin: string;
  save: (jobId: number, patch: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

const TIMEOUT_MS = 10_000;
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const usd = (value: unknown) => {
  const amount = typeof value === "number" && Number.isFinite(value) ? value : Number(value) || 0;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
};

type DeliveryResult = {
  status: QuoteDelivery["status"];
  detail: string;
  providerId?: string;
};

export async function deliverEmail(
  to: string,
  subject: string,
  body: string,
): Promise<DeliveryResult> {
  const key = process.env["SENDGRID_API_KEY"];
  const from = process.env["MESSAGING_FROM_EMAIL"];
  if (!key || !from) {
    return {
      status: "logged",
      detail: "No email sender is configured — the message was logged on the job instead of sent",
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
        status: "accepted",
        detail: "SendGrid accepted the message",
        providerId: response.headers.get("x-message-id") ?? undefined,
      };
    }
    console.error("SendGrid rejected a quote", { status: response.status });
    return { status: "failed", detail: `SendGrid rejected the message (${response.status})` };
  } catch (error) {
    console.error("SendGrid request failed", error instanceof Error ? error.message : error);
    return { status: "failed", detail: "SendGrid could not be reached" };
  }
}

export async function deliverSms(to: string, body: string): Promise<DeliveryResult> {
  const sid = process.env["TWILIO_ACCOUNT_SID"];
  const token = process.env["TWILIO_AUTH_TOKEN"];
  const from = process.env["TWILIO_FROM_NUMBER"];
  if (!sid || !token || !from) {
    return {
      status: "logged",
      detail: "Twilio is not configured — the message was logged on the job instead of sent",
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
        status: "accepted",
        detail: `Twilio accepted the message (${payload.status ?? "queued"})`,
        providerId: payload.sid,
      };
    }
    console.error("Twilio rejected a quote", { status: response.status });
    return { status: "failed", detail: `Twilio rejected the message (${response.status})` };
  } catch (error) {
    console.error("Twilio request failed", error instanceof Error ? error.message : error);
    return { status: "failed", detail: "Twilio could not be reached" };
  }
}

async function companyName(deps: QuoteDispatchDeps): Promise<string> {
  const { data } = await deps.db
    .from("workspaces")
    .select("name")
    .eq("id", deps.wsId)
    .maybeSingle();
  return text(data?.name) || "your moving company";
}

function tokenFor(job: Job): string {
  const current = text(job.data["quoteToken"]);
  return QUOTE_TOKEN_RE.test(current) ? current : "";
}

function messageContext(job: Job, company: string, link: string): QuoteMessageContext {
  return {
    customerName: text(job.data["customerName"]) || "there",
    companyName: company,
    reference: jobReference(job.id),
    moveDate: text(job.data["moveDate"]).slice(0, 10) || "your move date",
    total: usd(job.data["total"]),
    link,
  };
}

export type QuoteDispatchInput = {
  email: string;
  phone: string;
  channels: QuoteChannel[];
  subject: string;
  emailBody: string;
  smsBody: string;
};

export type QuoteDispatchResult = {
  link: string;
  status: string;
  sent: boolean;
  deliveries: QuoteDelivery[];
};

/**
 * Sends the approved email/SMS copy, mints the public quote link when needed, and records
 * the attempt on the job (delivery history + "Quote Sent via Email/SMS" activity event).
 */
export async function dispatchQuote(
  deps: QuoteDispatchDeps,
  job: Job,
  input: QuoteDispatchInput,
): Promise<QuoteDispatchResult> {
  const token = tokenFor(job) || newQuoteToken();
  const link = quoteLink(deps.origin, token);
  const company = await companyName(deps);
  const at = new Date().toISOString();

  const deliveries: QuoteDelivery[] = [];
  for (const channel of input.channels) {
    if (channel === "email") {
      const result = await deliverEmail(input.email, input.subject, input.emailBody);
      deliveries.push({ channel, target: input.email, at, ...result });
    } else {
      const result = await deliverSms(input.phone, input.smsBody);
      deliveries.push({ channel, target: input.phone, at, ...result });
    }
  }

  // "Quote Sent" is only written when a provider accepted a message; a log-only dispatch
  // keeps the estimate status so the board never shows an undelivered quote as sent.
  const sent = deliveries.some((delivery) => delivery.status === "accepted");
  const event = {
    id: `quote:${at}`,
    kind: "quote_sent" as const,
    title: quoteActivityTitle(deliveries),
    detail: quoteDispatchDetail(deliveries),
    at,
    by: deps.userId,
  };

  await deps.save(job.id, {
    quoteToken: token,
    quoteDispatchedAt: at,
    ...(sent ? { quoteSentAt: at, status: QUOTE_SENT_STATUS } : {}),
    quoteDispatch: appendQuoteDeliveries(job.data["quoteDispatch"], deliveries),
    activity: appendJobActivity(job.data["activity"], [event]),
  });

  return {
    link,
    status: sent ? QUOTE_SENT_STATUS : text(job.data["status"]),
    sent,
    deliveries,
  };
}

export type QuoteDispatchPreview = {
  reference: string;
  customerName: string;
  email: string;
  phone: string;
  link: string;
  providers: { email: boolean; sms: boolean };
  preview: { emailSubject: string; emailBody: string; smsBody: string };
  history: QuoteDelivery[];
};

/** Everything the dispatch modal pre-fills, derived from the saved job document. */
export async function quoteDispatchPreview(
  deps: QuoteDispatchDeps,
  job: Job,
): Promise<QuoteDispatchPreview> {
  const company = await companyName(deps);
  const existing = tokenFor(job);
  const context = messageContext(
    job,
    company,
    existing ? quoteLink(deps.origin, existing) : "(link created when you send)",
  );
  return {
    reference: jobReference(job.id),
    customerName: text(job.data["customerName"]),
    email: text(job.data["customerEmail"]),
    phone: text(job.data["customerPhone"]),
    link: existing ? quoteLink(deps.origin, existing) : "",
    providers: { email: emailConfigured(), sms: smsConfigured() },
    preview: {
      emailSubject: renderQuoteTemplate(QUOTE_TEMPLATES.email.subject, context),
      emailBody: renderQuoteTemplate(QUOTE_TEMPLATES.email.body, context),
      smsBody: renderQuoteTemplate(QUOTE_TEMPLATES.sms.body, context),
    },
    history: quoteDeliveries(job.data["quoteDispatch"]),
  };
}
