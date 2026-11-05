import { createFileRoute } from "@tanstack/react-router";

// Public quote acceptance. The opaque token in the path is the credential; the deposit
// amount and the customer email are always read from the stored job server-side.
export const Route = createFileRoute("/api/quote/$token/accept")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const headers = { "cache-control": "no-store", "referrer-policy": "no-referrer" };
        try {
          const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
          const forwarded = request.headers.get("x-forwarded-for") ?? "";
          const ip =
            request.headers.get("cf-connecting-ip") ||
            request.headers.get("x-real-ip") ||
            forwarded.split(",")[0]?.trim() ||
            "";
          const { acceptQuote, QuotePortalError } = await import("@/server/quote-accept");
          const result = await acceptQuote({
            token: params.token,
            signature: typeof body["signature"] === "string" ? body["signature"] : "",
            termsAccepted: body["termsAccepted"] === true,
            customerName:
              typeof body["customerName"] === "string" ? body["customerName"] : undefined,
            paymentIntentId:
              typeof body["paymentIntentId"] === "string" ? body["paymentIntentId"] : undefined,
            paymentMode: body["paymentMode"] === "test" ? "test" : undefined,
            ip,
            userAgent: request.headers.get("user-agent") ?? "",
            host: new URL(request.url).hostname,
          });
          return Response.json(result, { headers });
        } catch (error) {
          const { QuotePortalError } = await import("@/server/quote-accept");
          if (error instanceof QuotePortalError)
            return Response.json({ error: error.message }, { status: error.status, headers });
          console.error("Quote acceptance failed", error);
          return Response.json(
            { error: "Could not accept this quote. Please try again." },
            { status: 500, headers },
          );
        }
      },
    },
  },
});
