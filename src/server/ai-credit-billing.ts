// Stripe billing for AI scan packs. All Stripe calls fail with an actionable
// BillingConfigError when the environment is incomplete, so a missing key never
// takes the whole server down.
import Stripe from "stripe";
import { createStripeClient, type StripeEnv } from "@/lib/stripe.server";
import {
  AI_CREDIT_CHECKOUT_KIND,
  checkoutReturnUrls,
  creditPurchaseReceipt,
  findDuplicatePurchase,
  parseCheckoutMetadata,
} from "@/shared/ai-credits";
import type { ScanPack } from "@/shared/plans";

export class BillingConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BillingConfigError";
  }
}

export class StripeSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeSignatureError";
  }
}

type BillingClient = { stripe: Stripe; mode: StripeEnv };

export function stripeBillingConfigured(): boolean {
  return Boolean(
    process.env["STRIPE_SECRET_KEY"] ||
    (process.env["LOVABLE_API_KEY"] &&
      (process.env["STRIPE_SANDBOX_API_KEY"] || process.env["STRIPE_LIVE_API_KEY"])),
  );
}

function billingClient(): BillingClient {
  const secret = process.env["STRIPE_SECRET_KEY"];
  if (secret) {
    const mode: StripeEnv = secret.startsWith("sk_live") ? "live" : "sandbox";
    return {
      stripe: new Stripe(secret, {
        apiVersion: "2026-03-25.dahlia",
        httpClient: Stripe.createFetchHttpClient(),
      }),
      mode,
    };
  }
  const mode: StripeEnv = process.env["STRIPE_LIVE_API_KEY"] ? "live" : "sandbox";
  const connectionKey = process.env[`STRIPE_${mode.toUpperCase()}_API_KEY`];
  if (!connectionKey || !process.env["LOVABLE_API_KEY"]) {
    throw new BillingConfigError(
      "Stripe is not configured. Set STRIPE_SECRET_KEY (and STRIPE_WEBHOOK_SECRET) in the production environment.",
    );
  }
  return { stripe: createStripeClient(mode), mode };
}

function publicOrigin(origin: string): string {
  const base = (origin || process.env["PUBLIC_SITE_URL"] || "").replace(/\/+$/, "");
  if (!base) {
    throw new BillingConfigError(
      "PUBLIC_SITE_URL is required to build Stripe return links. Set it in the production environment.",
    );
  }
  return base;
}

/** Creates a hosted Checkout Session for one scan pack. Returns the URL to redirect to. */
export async function createScanPackCheckout(input: {
  workspaceId: number;
  pack: ScanPack;
  email: string;
  origin: string;
  requestId?: number;
}): Promise<{ url: string; sessionId: string; mode: StripeEnv }> {
  const { stripe, mode } = billingClient();
  const urls = checkoutReturnUrls(publicOrigin(input.origin));
  const metadata: Record<string, string> = {
    kind: AI_CREDIT_CHECKOUT_KIND,
    workspaceId: String(input.workspaceId),
    packId: input.pack.id,
    credits: String(input.pack.credits),
  };
  if (input.requestId) metadata["requestId"] = String(input.requestId);

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    client_reference_id: String(input.workspaceId),
    customer_email: input.email || undefined,
    success_url: urls.success,
    cancel_url: urls.cancel,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: input.pack.priceCents,
          product_data: {
            name: `AI Room Survey Pack — ${input.pack.label}`,
            description: `${input.pack.credits} room survey credit${input.pack.credits === 1 ? "" : "s"}`,
          },
        },
      },
    ],
    metadata,
    payment_intent_data: {
      description: `AI room survey credits (${input.pack.credits})`,
      metadata: { kind: AI_CREDIT_CHECKOUT_KIND, workspaceId: String(input.workspaceId) },
    },
  });

  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return { url: session.url, sessionId: session.id, mode };
}

type StripeEvent = { id: string; type: string; data: { object: Record<string, unknown> } };

const encoder = new TextEncoder();

async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return Array.from(new Uint8Array(signature), (value) => value.toString(16).padStart(2, "0")).join(
    "",
  );
}

/** Verifies the raw request body against STRIPE_WEBHOOK_SECRET (5 minute tolerance). */
export async function verifyStripeWebhook(request: Request): Promise<StripeEvent> {
  const secret = process.env["STRIPE_WEBHOOK_SECRET"];
  if (!secret) {
    throw new BillingConfigError(
      "STRIPE_WEBHOOK_SECRET is not set; Stripe webhooks cannot be verified.",
    );
  }
  const header = request.headers.get("stripe-signature");
  const raw = await request.text();
  if (!header || !raw) throw new StripeSignatureError("Missing Stripe signature or body");

  let timestamp = "";
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [key, value] = part.split("=", 2);
    if (key === "t") timestamp = value ?? "";
    if (key === "v1" && value) signatures.push(value);
  }
  if (!timestamp || !signatures.length)
    throw new StripeSignatureError("Malformed Stripe signature");
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300)
    throw new StripeSignatureError("Stripe signature is too old");

  const expected = await hmacHex(secret, `${timestamp}.${raw}`);
  if (!signatures.includes(expected)) throw new StripeSignatureError("Invalid Stripe signature");

  try {
    return JSON.parse(raw) as StripeEvent;
  } catch {
    throw new StripeSignatureError("Webhook body is not JSON");
  }
}

export type FulfillResult = {
  credited: boolean;
  reason?: "unpaid" | "metadata" | "duplicate";
  credits?: number;
  workspaceId?: number;
};

type SessionLike = {
  id?: unknown;
  payment_status?: unknown;
  payment_intent?: unknown;
  amount_total?: unknown;
  currency?: unknown;
  livemode?: unknown;
  customer_email?: unknown;
  metadata?: unknown;
};

/**
 * Credits the workspace once per Stripe event. A duplicate event (or a second event for
 * the same session) is ignored, and only a paid session is ever fulfilled.
 */
export async function fulfillAiCreditCheckout(
  eventId: string,
  rawSession: Record<string, unknown>,
): Promise<FulfillResult> {
  const session = rawSession as SessionLike;
  if (session.payment_status !== "paid") return { credited: false, reason: "unpaid" };
  const metadata = parseCheckoutMetadata(session.metadata ?? {});
  if (!metadata) {
    console.error("[stripe] AI credit session has unrecognised metadata", {
      eventId,
      session: session.id,
    });
    return { credited: false, reason: "metadata" };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: prior, error: priorError } = await supabaseAdmin
    .from("workspace_records")
    .select("id,data")
    .eq("workspace_id", metadata.workspaceId)
    .eq("kind", "ai_credit_purchase")
    .limit(1000);
  if (priorError) throw new Error(`Could not check prior purchases: ${priorError.message}`);
  const recorded = (prior ?? []).map((row) => (row.data ?? {}) as Record<string, unknown>);
  if (findDuplicatePurchase(recorded, { eventId, sessionId: String(session.id ?? "") })) {
    return { credited: false, reason: "duplicate", workspaceId: metadata.workspaceId };
  }

  const paymentIntent =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : typeof (session.payment_intent as { id?: unknown } | null)?.id === "string"
        ? String((session.payment_intent as { id: string }).id)
        : "";

  const receipt = creditPurchaseReceipt({
    eventId,
    sessionId: String(session.id ?? ""),
    paymentIntent,
    packId: metadata.packId,
    credits: metadata.credits,
    amountCents: Number(session.amount_total ?? 0),
    currency: String(session.currency ?? "usd"),
    livemode: session.livemode === true,
    workspaceId: metadata.workspaceId,
    customerEmail: String(session.customer_email ?? ""),
    paidAt: new Date().toISOString(),
  });

  const { error } = await supabaseAdmin.from("workspace_records").insert({
    workspace_id: metadata.workspaceId,
    kind: "ai_credit_purchase",
    data: receipt as never,
  });
  if (error) throw new Error(`Could not record the AI credit purchase: ${error.message}`);

  // Reconcile the pending request created before checkout started, when present.
  if (metadata.requestId) {
    const { data: request } = await supabaseAdmin
      .from("workspace_records")
      .select("id,data")
      .eq("workspace_id", metadata.workspaceId)
      .eq("kind", "ai_credit_request")
      .eq("id", Number(metadata.requestId))
      .maybeSingle();
    if (request) {
      const current = (request.data ?? {}) as Record<string, unknown>;
      await supabaseAdmin
        .from("workspace_records")
        .update({
          data: {
            ...current,
            status: "granted",
            grantedAt: receipt["paidAt"],
            purchaseEventId: eventId,
            sessionId: receipt["sessionId"],
          } as never,
          updated_at: new Date().toISOString(),
        })
        .eq("id", request.id)
        .eq("workspace_id", metadata.workspaceId);
    }
  }

  return { credited: true, credits: metadata.credits, workspaceId: metadata.workspaceId };
}
