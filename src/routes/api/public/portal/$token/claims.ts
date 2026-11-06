import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/portal/$token/claims")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const headers = { "cache-control": "no-store", "referrer-policy": "no-referrer" };
        try {
          const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
          const { submitPortalClaim } = await import("@/server/portal-api");
          return Response.json({ claim: await submitPortalClaim(params.token, body) }, { headers });
        } catch (error) {
          const { PortalError } = await import("@/server/portal-api");
          if (error instanceof PortalError)
            return Response.json({ error: error.message }, { status: error.status, headers });
          console.error("Portal claim failed", error);
          return Response.json({ error: "Could not submit this claim" }, { status: 503, headers });
        }
      },
    },
  },
});
