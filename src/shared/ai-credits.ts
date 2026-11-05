import { z } from "zod";
import { scanPackById } from "./plans";

// Metadata written onto a Stripe Checkout Session when an AI scan pack is purchased.
// Kept in shared code so the checkout endpoint and the webhook validate identically.

export const AI_CREDIT_CHECKOUT_KIND = "ai_credit_pack";

export const checkoutMetadataSchema = z.object({
  kind: z.literal(AI_CREDIT_CHECKOUT_KIND),
  workspaceId: z.coerce.number().int().positive(),
  packId: z.enum(["single", "six"]),
  credits: z.coerce.number().int().positive(),
  requestId: z
    .string()
    .regex(/^[1-9]\d*$/)
    .optional(),
});

export type AiCreditCheckoutMetadata = z.infer<typeof checkoutMetadataSchema>;

/** Returns null for anything that is not a well-formed scan pack session. */
export function parseCheckoutMetadata(value: unknown): AiCreditCheckoutMetadata | null {
  const parsed = checkoutMetadataSchema.safeParse(value);
  if (!parsed.success) return null;
  const pack = scanPackById(parsed.data.packId);
  // The credit count must match the catalog; never let metadata inflate an allowance.
  if (!pack || pack.credits !== parsed.data.credits) return null;
  return parsed.data;
}

export type CreditPurchaseReceiptInput = {
  eventId: string;
  sessionId: string;
  paymentIntent: string;
  packId: string;
  credits: number;
  amountCents: number;
  currency: string;
  livemode: boolean;
  workspaceId: number;
  customerEmail: string;
  paidAt: string;
};

/** The immutable receipt stored as an `ai_credit_purchase` workspace record. */
export function creditPurchaseReceipt(input: CreditPurchaseReceiptInput): Record<string, unknown> {
  return {
    status: "paid",
    source: "stripe_checkout",
    eventId: input.eventId,
    sessionId: input.sessionId,
    paymentIntent: input.paymentIntent,
    packId: input.packId,
    credits: Math.max(1, Math.round(input.credits)),
    amountCents: Math.max(0, Math.round(input.amountCents)),
    currency: input.currency.toLowerCase(),
    livemode: input.livemode,
    workspaceId: input.workspaceId,
    customerEmail: input.customerEmail,
    paidAt: input.paidAt,
  };
}

/**
 * Finds an already-recorded purchase for this event or session. Stripe retries webhooks,
 * so fulfilment must be a no-op once either identifier has been seen.
 */
export function findDuplicatePurchase(
  records: Array<Record<string, unknown>>,
  input: { eventId: string; sessionId: string },
): Record<string, unknown> | undefined {
  return records.find((record) => {
    if (record["eventId"] === input.eventId) return true;
    return Boolean(input.sessionId) && record["sessionId"] === input.sessionId;
  });
}

/** Sums purchased credits; malformed records contribute nothing. */
export function sumPurchaseCredits(records: Array<Record<string, unknown>>): number {
  return records.reduce((sum, record) => {
    const credits = Number(record["credits"]);
    return sum + (Number.isFinite(credits) && credits > 0 ? Math.round(credits) : 0);
  }, 0);
}

/** True when a purchase or request is still waiting for Stripe to confirm payment. */
export function isPendingCreditStatus(status: unknown): boolean {
  return ["pending", "checkout_created", "awaiting_payment"].includes(String(status ?? ""));
}

export function checkoutReturnUrls(origin: string): { success: string; cancel: string } {
  const base = origin.replace(/\/+$/, "");
  return {
    success: `${base}/app/dashboard?credits=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel: `${base}/app/dashboard?credits=cancelled`,
  };
}
