import { createFileRoute } from "@tanstack/react-router";

// Public customer tracking feed. /api/public/* is the only prefix that bypasses
// site authentication, and the opaque token in the path is the credential.
export const Route = createFileRoute("/api/public/v1/track/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const headers = { "cache-control": "no-store", "referrer-policy": "no-referrer" };
        try {
          const { readTracking } = await import("@/server/tracking-api");
          const payload = await readTracking(params.token);
          if (!payload) return Response.json({ error: "Tracking link not found" }, { status: 404, headers });
          return Response.json(payload, { headers });
        } catch (error) {
          // A missing service-role key or a database outage must not leak internals.
          console.error("Tracking lookup failed", error);
          return Response.json({ error: "Tracking is temporarily unavailable" }, { status: 503, headers });
        }
      },
    },
  },
});
