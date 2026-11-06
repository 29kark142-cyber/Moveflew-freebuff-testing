import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/portal/$token/photos")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const headers = { "cache-control": "no-store", "referrer-policy": "no-referrer" };
        try {
          const length = Number(request.headers.get("content-length") ?? 0);
          if (length > 4_000_000)
            return Response.json({ error: "Those photos are too large" }, { status: 413, headers });
          const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
          const { submitPortalPhotos } = await import("@/server/portal-api");
          return Response.json(await submitPortalPhotos(params.token, body), { headers });
        } catch (error) {
          const { PortalError } = await import("@/server/portal-api");
          if (error instanceof PortalError)
            return Response.json({ error: error.message }, { status: error.status, headers });
          console.error("Portal photo upload failed", error);
          return Response.json({ error: "Could not save those photos" }, { status: 503, headers });
        }
      },
    },
  },
});
