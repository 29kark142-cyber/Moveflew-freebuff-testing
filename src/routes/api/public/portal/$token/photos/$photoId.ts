import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/portal/$token/photos/$photoId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const { readPortalPhoto } = await import("@/server/portal-api");
          const photo = await readPortalPhoto(params.token, params.photoId);
          return new Response(photo.bytes as unknown as BodyInit, {
            headers: {
              "content-type": photo.contentType,
              "cache-control": "private, max-age=300",
              "referrer-policy": "no-referrer",
              "content-disposition": `inline; filename="${encodeURIComponent(photo.name)}"`,
            },
          });
        } catch (error) {
          const { PortalError } = await import("@/server/portal-api");
          if (error instanceof PortalError)
            return Response.json({ error: error.message }, { status: error.status });
          console.error("Portal photo read failed", error);
          return Response.json({ error: "Photo unavailable" }, { status: 503 });
        }
      },
    },
  },
});
