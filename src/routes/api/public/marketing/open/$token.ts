import { createFileRoute } from "@tanstack/react-router";

// Public one-pixel open tracker. Missing/invalid tokens still return the pixel,
// so a mail client never sees an error or learns whether a token exists.
export const Route = createFileRoute("/api/public/marketing/open/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const { trackMarketingOpen } = await import("@/server/marketing-public");
          await trackMarketingOpen(params.token);
        } catch (error) {
          console.error("Marketing open tracking failed", error);
        }
        const gif = Uint8Array.from(atob("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="), c =>
          c.charCodeAt(0),
        );
        return new Response(gif, {
          headers: {
            "content-type": "image/gif",
            "cache-control": "no-store, max-age=0",
            "referrer-policy": "no-referrer",
          },
        });
      },
    },
  },
});
