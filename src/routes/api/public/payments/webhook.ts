import { createFileRoute } from "@tanstack/react-router";
import { type StripeEnv, verifyWebhook } from "@/lib/stripe.server";

async function settle(session: any, env: StripeEnv) {
  if (session.payment_status === "unpaid") return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.rpc("settle_proposal_checkout", {
    _session: session.id,
    _environment: env,
    _subtotal: session.amount_subtotal ?? 0,
    _paid: session.amount_total ?? 0,
    _currency: session.currency ?? "",
    _livemode: session.livemode === true,
  });
  if (error) throw new Error(`Settlement failed: ${error.message}`);
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawEnv = new URL(request.url).searchParams.get("env");
        if (rawEnv !== "sandbox" && rawEnv !== "live") {
          return Response.json({ received: true, ignored: "invalid env" });
        }
        try {
          const event = await verifyWebhook(request, rawEnv);
          if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
            await settle(event.data.object, rawEnv);
          }
          const { logPlatformEvent } = await import("@/lib/platform-events.server");
          await logPlatformEvent("stripe_webhook", "info", event.type, { env: rawEnv, session: event.data.object?.id });
          return Response.json({ received: true });
        } catch (e) {
          console.error("Webhook error:", e);
          const { logPlatformEvent } = await import("@/lib/platform-events.server");
          await logPlatformEvent("stripe_webhook", "error", "Webhook failed", { env: rawEnv, reason: String((e as Error)?.message ?? e).slice(0, 200) });
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});
