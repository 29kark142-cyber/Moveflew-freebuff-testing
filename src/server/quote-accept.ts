// Server-side quote acceptance: verifies the deposit payment, stores the signed contract
// and confirmation, and books the job. Public calls reach this through /api/quote/:token/*.
import type { SupabaseClient } from "@supabase/supabase-js";
import { depositRuleSchema } from "../lib/proposal-rules";
import { createStripeClient } from "../lib/stripe.server";
import { appendJobActivity } from "../shared/job-activity";
import {
  DEPOSIT_EVENT_TITLE,
  DEPOSIT_PAID_STATUS,
  QUOTE_CONFIRMATION_EMAIL,
  QUOTE_CONFIRMATION_SMS,
  SIGNATURE_RE,
  acceptanceEventDetail,
  formatUsdCents,
  isQuoteTestHost,
  quoteAcceptance,
  quoteDepositCents,
  renderQuoteConfirmation,
  type DepositRule,
  type QuoteAcceptance,
  type QuotePayment,
} from "../shared/quote-accept";
import { calculateQuote, type Job } from "../shared/crm";
import { QUOTE_TOKEN_RE } from "../shared/quote-dispatch";
import { jobReference } from "../shared/tracking";
import { deliverEmail, deliverSms } from "./quote-dispatch";

export class QuotePortalError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "QuotePortalError";
  }
}

type Row = { id: number; workspace_id: number; data: Record<string, unknown> };
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const dollars = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : Number(value) || 0;

export function stripeServerConfigured(): boolean {
  return Boolean(
    process.env["LOVABLE_API_KEY"] &&
    (process.env["STRIPE_SANDBOX_API_KEY"] || process.env["STRIPE_LIVE_API_KEY"]),
  );
}

function stripeEnvironment(): "sandbox" | "live" {
  return process.env["STRIPE_LIVE_API_KEY"] ? "live" : "sandbox";
}

/** Payment options the portal may offer for this host. */
export function quotePaymentsAvailability(host: string): { stripe: boolean; testMode: boolean } {
  const stripe = stripeServerConfigured();
  return { stripe, testMode: !stripe && isQuoteTestHost(host) };
}

async function adminClient() {
  try {
    const { supabaseAdmin } = await import("../integrations/supabase/client.server");
    return supabaseAdmin;
  } catch {
    throw new QuotePortalError("The quote portal is temporarily unavailable", 503);
  }
}

async function loadByToken(token: string): Promise<{ db: SupabaseClient; row: Row }> {
  if (!QUOTE_TOKEN_RE.test(token))
    throw new QuotePortalError("This quote link is unavailable or has expired", 404);
  const db = await adminClient();
  const { data, error } = await db
    .from("workspace_records")
    .select("id,workspace_id,data")
    .eq("kind", "job")
    .filter("data->>quoteToken", "eq", token)
    .maybeSingle();
  if (error) throw new QuotePortalError("The quote portal is temporarily unavailable", 503);
  if (!data) throw new QuotePortalError("This quote link is unavailable or has expired", 404);
  return { db, row: data as Row };
}

async function savePatch(db: SupabaseClient, row: Row, patch: Record<string, unknown>) {
  const next = { ...row.data, ...patch };
  const { error } = await db
    .from("workspace_records")
    .update({ data: next as never, updated_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("workspace_id", row.workspace_id);
  if (error) throw new QuotePortalError("Could not save this booking", 500);
  row.data = next;
}

/** Stored estimate total, or the same calculation the quote portal displays. */
function quoteTotal(data: Record<string, unknown>): number {
  const stored = dollars(data["total"]);
  if (stored > 0) return stored;
  try {
    return calculateQuote(data as unknown as Job);
  } catch {
    return 0;
  }
}

async function depositFor(db: SupabaseClient, row: Row) {
  const { data: workspace } = await db
    .from("workspaces")
    .select("name,deposit_rule,company_phone,office_email")
    .eq("id", row.workspace_id)
    .maybeSingle();
  let rule: DepositRule | null = null;
  try {
    rule = workspace?.deposit_rule ? depositRuleSchema.parse(workspace.deposit_rule) : null;
  } catch {
    rule = null;
  }
  const override =
    typeof row.data["depositOverride"] === "number" ? row.data["depositOverride"] : null;
  return {
    cents: quoteDepositCents(quoteTotal(row.data), rule, override),
    total: quoteTotal(row.data),
    workspace,
  };
}

export type QuotePortalOptions = {
  depositCents: number;
  total: number;
  acceptedAt: string | null;
  paymentMode: string | null;
  payments: { stripe: boolean; testMode: boolean };
};

/** Deposit and payment state the public portal renders before acceptance. */
export async function quotePortalOptions(token: string, host: string): Promise<QuotePortalOptions> {
  const { db, row } = await loadByToken(token);
  const deposit = await depositFor(db, row);
  const acceptance = quoteAcceptance(row.data["quoteAcceptance"]);
  return {
    depositCents: deposit.cents,
    total: deposit.total,
    acceptedAt: acceptance?.signedAt ?? null,
    paymentMode: acceptance?.payment.mode ?? null,
    payments: quotePaymentsAvailability(host),
  };
}

/** Creates the deposit PaymentIntent; the amount comes from the stored job, never the browser. */
export async function createQuoteDepositIntent(token: string) {
  if (!stripeServerConfigured())
    throw new QuotePortalError("Card payment is not configured on this site", 409);
  const { db, row } = await loadByToken(token);
  if (quoteAcceptance(row.data["quoteAcceptance"]))
    throw new QuotePortalError("This quote has already been accepted", 409);
  const status = text(row.data["status"]).toLowerCase();
  if (["cancelled", "canceled", "declined", "lost"].includes(status))
    throw new QuotePortalError("This quote is no longer available", 409);
  const deposit = await depositFor(db, row);
  if (deposit.cents < 50) throw new QuotePortalError("No deposit is due for this quote", 400);

  const env = stripeEnvironment();
  try {
    const stripe = createStripeClient(env);
    const intent = await stripe.paymentIntents.create({
      amount: deposit.cents,
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      description: `Move deposit · ${jobReference(row.id)}`,
      receipt_email: text(row.data["customerEmail"]) || undefined,
      metadata: { quoteToken: token, jobId: String(row.id), kind: "quote_deposit" },
    });
    await savePatch(db, row, {
      quoteDepositIntent: {
        id: intent.id,
        amountCents: deposit.cents,
        env,
        createdAt: new Date().toISOString(),
      },
    });
    return {
      clientSecret: intent.client_secret ?? "",
      paymentIntentId: intent.id,
      amountCents: deposit.cents,
    };
  } catch (error) {
    console.error("Quote deposit intent failed", error instanceof Error ? error.message : error);
    throw new QuotePortalError("Could not start the deposit payment. Please try again.", 502);
  }
}

export type AcceptQuoteInput = {
  token: string;
  signature: string;
  termsAccepted: boolean;
  customerName?: string;
  paymentIntentId?: string;
  paymentMode?: "test";
  ip: string;
  userAgent: string;
  host: string;
};

export type AcceptQuoteResult = {
  accepted: boolean;
  alreadyAccepted: boolean;
  status: string;
  reference: string;
  depositCents: number;
  paymentId: string;
  paymentMode: string;
  confirmation: { email: string; sms: string };
};

export function acceptanceSummary(
  acceptance: QuoteAcceptance,
  alreadyAccepted: boolean,
): AcceptQuoteResult {
  return {
    accepted: true,
    alreadyAccepted,
    status: DEPOSIT_PAID_STATUS,
    reference: acceptance.reference,
    depositCents: acceptance.payment.amountCents,
    paymentId: acceptance.payment.transactionId,
    paymentMode: acceptance.payment.mode,
    confirmation: acceptance.confirmation ?? { email: "skipped", sms: "skipped" },
  };
}

/**
 * Finalises the booking: verifies the deposit payment, stores the signed contract with its
 * IP and timestamp, books the job, logs the activity event and confirms to the customer.
 */
export async function acceptQuote(input: AcceptQuoteInput): Promise<AcceptQuoteResult> {
  if (!input.termsAccepted)
    throw new QuotePortalError("Please accept the terms and cancellation policy", 400);
  if (input.signature.length > 400_000 || !SIGNATURE_RE.test(input.signature))
    throw new QuotePortalError("Please sign in the box before confirming", 400);
  const customerName = text(input.customerName).slice(0, 120);

  const { db, row } = await loadByToken(input.token);
  const existing = quoteAcceptance(row.data["quoteAcceptance"]);
  if (existing) return acceptanceSummary(existing, true);

  const status = text(row.data["status"]).toLowerCase();
  if (["cancelled", "canceled", "declined", "lost", "archived"].includes(status))
    throw new QuotePortalError("This quote is no longer available", 409);

  const deposit = await depositFor(db, row);
  const depositIntent = row.data["quoteDepositIntent"] as { id?: string; env?: string } | undefined;

  let payment: QuotePayment;
  if (deposit.cents <= 0) {
    payment = {
      provider: "none",
      transactionId: "waived",
      amountCents: 0,
      mode: "waived",
      status: "waived",
    };
  } else if (input.paymentIntentId) {
    if (!stripeServerConfigured())
      throw new QuotePortalError("Card payment is not configured on this site", 409);
    const env = depositIntent?.env === "live" ? "live" : "sandbox";
    const stripe = createStripeClient(env);
    const intent = await stripe.paymentIntents.retrieve(input.paymentIntentId).catch(() => null);
    if (!intent || intent.metadata?.["quoteToken"] !== input.token)
      throw new QuotePortalError("We could not verify that payment", 400);
    if (intent.status !== "succeeded")
      throw new QuotePortalError("The card payment has not completed yet", 409);
    if (intent.amount_received < deposit.cents)
      throw new QuotePortalError("The payment did not cover the deposit", 400);
    if (Boolean(intent.livemode) !== (env === "live"))
      throw new QuotePortalError("The payment was made in a different Stripe mode", 400);
    payment = {
      provider: "stripe",
      transactionId: intent.id,
      amountCents: intent.amount_received,
      mode: intent.livemode ? "live" : "test",
      status: "paid",
    };
  } else if (input.paymentMode === "test") {
    const availability = quotePaymentsAvailability(input.host);
    if (availability.stripe || !availability.testMode)
      throw new QuotePortalError(
        "Test deposits are only available on preview addresses without live payment keys",
        403,
      );
    payment = {
      provider: "test",
      transactionId: `test_${crypto.randomUUID()}`,
      amountCents: deposit.cents,
      mode: "test",
      status: "paid",
    };
  } else {
    throw new QuotePortalError("Pay the deposit before accepting this quote", 400);
  }

  const signedAt = new Date().toISOString();
  const reference = jobReference(row.id);
  const companyName = text(deposit.workspace?.name) || "your moving company";
  const context = {
    customerName: customerName || text(row.data["customerName"]) || "there",
    companyName,
    reference,
    moveDate: text(row.data["moveDate"]).slice(0, 10) || "your move date",
    origin: text(row.data["origin"]) || "pickup address",
    destination: text(row.data["destination"]) || "drop-off address",
    crewSize: String(Math.max(1, dollars(row.data["crewSize"]) || 1)),
    total: formatUsdCents(Math.round(deposit.total * 100)),
    deposit: formatUsdCents(payment.amountCents),
    receiptId: payment.transactionId,
  };

  const emailTo = text(row.data["customerEmail"]);
  const phone = text(row.data["customerPhone"]);
  const emailDelivery = emailTo
    ? await deliverEmail(
        emailTo,
        renderQuoteConfirmation(QUOTE_CONFIRMATION_EMAIL.subject, context),
        renderQuoteConfirmation(QUOTE_CONFIRMATION_EMAIL.body, context),
      )
    : null;
  const smsDelivery = phone
    ? await deliverSms(phone, renderQuoteConfirmation(QUOTE_CONFIRMATION_SMS.body, context))
    : null;

  const acceptance: QuoteAcceptance = {
    signature: input.signature,
    signedAt,
    ip: text(input.ip).slice(0, 64),
    userAgent: text(input.userAgent).slice(0, 300),
    termsAcceptedAt: signedAt,
    customerName: context.customerName,
    reference,
    payment,
    confirmation: {
      email: emailDelivery?.status ?? "skipped",
      sms: smsDelivery?.status ?? "skipped",
    },
  };

  await savePatch(db, row, {
    status: DEPOSIT_PAID_STATUS,
    quoteAcceptedAt: signedAt,
    depositPaidCents: payment.amountCents,
    depositPaidAt: signedAt,
    ...(payment.mode === "waived" ? {} : { depositMode: payment.mode }),
    quoteAcceptance: acceptance,
    activity: appendJobActivity(row.data["activity"], [
      {
        id: `deposit:${signedAt}`,
        kind: "deposit_paid",
        title: DEPOSIT_EVENT_TITLE,
        detail: acceptanceEventDetail(acceptance),
        at: signedAt,
        by: context.customerName,
      },
    ]),
  });

  return acceptanceSummary(acceptance, false);
}
