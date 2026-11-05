import { createFileRoute } from "@tanstack/react-router";

// Creates the Stripe PaymentIntent for the quote deposit. The browser never supplies an
// amount: it is derived from the stored job and the workspace deposit rule.
export const Route = createFileRoute("/api/quote/$token/deposit-intent")({
  server: {
    handlers: {
      POST: async ({ params }) => {
        const headers = { "cache-control": "no-store", "referrer-policy": "no-referrer" };
        try {
          const { createQuoteDepositIntent, QuotePortalError } =
            await import("@/server/quote-accept");
          const result = await createQuoteDepositIntent(params.token);
          return Response.json(result, { headers });
        } catch (error) {
          const { QuotePortalError } = await import("@/server/quote-accept");
          if (error instanceof QuotePortalError)
            return Response.json({ error: error.message }, { status: error.status, headers });
          console.error("Quote deposit intent failed", error);
          return Response.json(
            { error: "Could not start the deposit payment. Please try again." },
            { status: 502, headers },
          );
        }
      },
    },
  },
});
