import { createFileRoute } from "@tanstack/react-router";
import {
  BillingConfigError,
  fulfillAiCreditCheckout,
  StripeSignatureError,
  verifyStripeWebhook,
} from "@/server/ai-credit-billing";

// Stripe calls this endpoint unauthenticated; the signature is the authorization.
export const Route = createFileRoute("/api/webhooks/stripe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { logPlatformEvent } = await import("@/lib/platform-events.server");
        try {
          const event = await verifyStripeWebhook(request);
          if (
            event.type !== "checkout.session.completed" &&
            event.type !== "checkout.session.async_payment_succeeded"
          ) {
            return Response.json({ received: true, ignored: event.type });
          }
          const result = await fulfillAiCreditCheckout(event.id, event.data.object);
          await logPlatformEvent(
            "stripe_webhook",
            result.credited ? "info" : "warn",
            result.credited ? "AI credit pack paid" : `AI credit event ignored (${result.reason})`,
            { eventId: event.id, session: event.data.object?.["id"], credits: result.credits ?? 0 },
            result.workspaceId ?? null,
          );
          return Response.json({ received: true, ...result });
        } catch (error) {
          if (error instanceof BillingConfigError) {
            console.error(`[stripe] ${error.message}`);
            await logPlatformEvent("stripe_webhook", "error", "Stripe webhook is not configured", {
              reason: error.message.slice(0, 200),
            });
            return Response.json({ error: "Stripe webhook is not configured" }, { status: 503 });
          }
          if (error instanceof StripeSignatureError) {
            console.error(`[stripe] ${error.message}`);
            await logPlatformEvent("stripe_webhook", "warn", "Stripe webhook rejected", {
              reason: error.message.slice(0, 200),
            });
            return Response.json({ error: "Invalid Stripe signature" }, { status: 400 });
          }
          console.error("[stripe] Webhook processing failed", error);
          await logPlatformEvent("stripe_webhook", "error", "Stripe webhook failed", {
            reason: String(error instanceof Error ? error.message : error).slice(0, 200),
          });
          return Response.json({ error: "Webhook processing failed" }, { status: 500 });
        }
      },
    },
  },
});
