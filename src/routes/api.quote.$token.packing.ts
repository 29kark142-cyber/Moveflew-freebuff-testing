import { createFileRoute } from "@tanstack/react-router";

// Public packing selection for a quote. The token is the credential; the server reprices the
// selection from the catalog, so the browser can never choose what the deposit will be.
export const Route = createFileRoute("/api/quote/$token/packing")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const headers = { "cache-control": "no-store", "referrer-policy": "no-referrer" };
        try {
          const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
          const { saveQuotePacking, QuotePortalError } = await import("@/server/quote-accept");
          const result = await saveQuotePacking(params.token, body["selection"]);
          return Response.json(result, { headers });
        } catch (error) {
          const { QuotePortalError } = await import("@/server/quote-accept");
          if (error instanceof QuotePortalError)
            return Response.json({ error: error.message }, { status: error.status, headers });
          console.error("Quote packing selection failed", error);
          return Response.json(
            { error: "Could not update the packing selection. Please try again." },
            { status: 502, headers },
          );
        }
      },
    },
  },
});
