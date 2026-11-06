import { createFileRoute } from "@tanstack/react-router";

// Public customer portal read. /api/public/* bypasses site auth; the opaque token is the
// credential and the response is scoped to that customer's own moves and invoices.
export const Route = createFileRoute("/api/public/portal/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const headers = { "cache-control": "no-store", "referrer-policy": "no-referrer" };
        try {
          const { readPortal } = await import("@/server/portal-api");
          return Response.json(await readPortal(params.token), { headers });
        } catch (error) {
          const { PortalError } = await import("@/server/portal-api");
          if (error instanceof PortalError)
            return Response.json({ error: error.message }, { status: error.status, headers });
          console.error("Customer portal read failed", error);
          return Response.json(
            { error: "The customer portal is temporarily unavailable" },
            { status: 503, headers },
          );
        }
      },
    },
  },
});
