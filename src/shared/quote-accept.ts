// Quote acceptance rules shared by the public portal, the server verification and tests.
// The deposit amount is always derived from the workspace rule or an explicit office
// override, never from the browser.

export const QUOTE_TERMS_LABEL = "I agree to MoveFlew Terms of Service and Cancellation Policy";
export const QUOTE_TERMS_HREF = "/terms";

export const SIGNATURE_RE = /^data:image\/png;base64,iVBOR[A-Za-z0-9+/=]+$/;

export const DEPOSIT_PAID_STATUS = "booked";
export const DEPOSIT_EVENT_TITLE = "Deposit Paid & Quote Accepted";

/**
 * Preview addresses are the only places a credential-less test deposit may book a job.
 * Production hosts must have Stripe configured so no fake payment can confirm a move.
 */
export function isQuoteTestHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".style.dev") ||
    host.endsWith(".lovable.app") ||
    host.endsWith(".lovableproject.com")
  );
}

export type DepositRule = { mode: "fixed" | "percentage"; value: number };

/** Deposit in cents, capped at the estimate total. Anything unusable means "no deposit". */
export function quoteDepositCents(
  total: number,
  rule: DepositRule | null,
  override: number | null,
): number {
  if (!Number.isFinite(total) || total <= 0) return 0;
  const raw =
    override ?? (rule ? (rule.mode === "fixed" ? rule.value : (total * rule.value) / 100) : null);
  if (raw === null || !Number.isFinite(raw) || raw <= 0) return 0;
  return Math.min(Math.round(total * 100), Math.max(0, Math.round(raw * 100)));
}

export function formatUsdCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    (Number.isFinite(cents) ? cents : 0) / 100,
  );
}

export type QuotePaymentMode = "live" | "test" | "waived";
export type QuotePaymentProvider = "stripe" | "test" | "none";

export type QuotePayment = {
  provider: QuotePaymentProvider;
  /** Stripe PaymentIntent id, test reference, or "waived" when no deposit is due. */
  transactionId: string;
  amountCents: number;
  mode: QuotePaymentMode;
  status: "paid" | "waived";
};

export type QuoteAcceptance = {
  signature: string;
  signedAt: string;
  /** IP address the signature was captured from, from the edge request headers. */
  ip: string;
  userAgent: string;
  termsAcceptedAt: string;
  customerName: string;
  reference: string;
  payment: QuotePayment;
  confirmation?: { email: string; sms: string };
};

/** Saved acceptance records are untrusted: keep only a well-formed one. */
export function quoteAcceptance(value: unknown): QuoteAcceptance | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Record<string, unknown>;
  const payment = entry.payment as Record<string, unknown> | null | undefined;
  if (
    typeof entry.signature !== "string" ||
    !SIGNATURE_RE.test(entry.signature) ||
    typeof entry.signedAt !== "string" ||
    !payment ||
    typeof payment !== "object" ||
    typeof payment.transactionId !== "string" ||
    typeof payment.amountCents !== "number"
  )
    return null;
  const mode: QuotePaymentMode =
    payment.mode === "live" || payment.mode === "test" || payment.mode === "waived"
      ? payment.mode
      : "waived";
  return {
    signature: entry.signature,
    signedAt: entry.signedAt,
    ip: typeof entry.ip === "string" ? entry.ip : "",
    userAgent: typeof entry.userAgent === "string" ? entry.userAgent : "",
    termsAcceptedAt: typeof entry.termsAcceptedAt === "string" ? entry.termsAcceptedAt : "",
    customerName: typeof entry.customerName === "string" ? entry.customerName : "",
    reference: typeof entry.reference === "string" ? entry.reference : "",
    payment: {
      provider:
        payment.provider === "stripe" || payment.provider === "test" ? payment.provider : "none",
      transactionId: String(payment.transactionId),
      amountCents: Math.max(0, Math.round(Number(payment.amountCents) || 0)),
      mode,
      status: payment.status === "paid" ? "paid" : "waived",
    },
    ...(entry.confirmation && typeof entry.confirmation === "object"
      ? {
          confirmation: {
            email: String((entry.confirmation as Record<string, unknown>).email ?? ""),
            sms: String((entry.confirmation as Record<string, unknown>).sms ?? ""),
          },
        }
      : {}),
  };
}

/** Timeline detail naming the payment, its mode and the signature confirmation. */
export function acceptanceEventDetail(acceptance: QuoteAcceptance): string {
  const { payment } = acceptance;
  const amount =
    payment.status === "waived" || payment.amountCents === 0
      ? "Deposit waived"
      : `Deposit ${formatUsdCents(payment.amountCents)} ${payment.mode === "test" ? "(test)" : ""}`.trim();
  const who = acceptance.customerName || "customer";
  return `${amount} · payment ${payment.transactionId} · signed by ${who}`.slice(0, 500);
}

export type QuoteConfirmationContext = {
  customerName: string;
  companyName: string;
  reference: string;
  moveDate: string;
  origin: string;
  destination: string;
  crewSize: string;
  total: string;
  deposit: string;
  receiptId: string;
};

export const QUOTE_CONFIRMATION_EMAIL = {
  subject: "Booking confirmed {reference} — {companyName}",
  body: [
    "Hi {customerName},",
    "",
    "Your move is booked and your deposit has been received. Thank you!",
    "",
    "Reference: {reference}",
    "Move date: {moveDate}",
    "Crew: {crewSize} movers",
    "From: {origin}",
    "To: {destination}",
    "Estimated total: {total}",
    "Deposit paid: {deposit}",
    "Receipt / payment ID: {receiptId}",
    "",
    "Your signed quote and receipt are stored on your booking. If anything changes,",
    "reply to this email or call {companyName} and we will update it.",
    "",
    "— {companyName}",
  ].join("\n"),
};

export const QUOTE_CONFIRMATION_SMS = {
  body: "Hi {customerName}, your {companyName} move on {moveDate} is confirmed. Deposit {deposit} received (receipt {receiptId}). Ref {reference}.",
};

/** Renders only documented tokens; anything unknown becomes an empty string. */
export function renderQuoteConfirmation(
  template: string,
  context: QuoteConfirmationContext,
): string {
  return template.replace(/\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}/g, (_match, key: string) => {
    const value = (context as unknown as Record<string, unknown>)[key];
    return typeof value === "string" ? value : "";
  });
}
