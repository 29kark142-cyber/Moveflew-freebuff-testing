import { createFileRoute } from "@tanstack/react-router";

// Public click tracker: records the click, then redirects only to the stored
// http(s) destination. Invalid tokens go to the public home page.
export const Route = createFileRoute("/api/public/marketing/click/$token")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        let destination: string | null = null;
        try {
          const { trackMarketingClick } = await import("@/server/marketing-public");
          destination = await trackMarketingClick(params.token);
        } catch (error) {
          console.error("Marketing click tracking failed", error);
        }
        return new Response(null, {
          status: 302,
          headers: {
            location: destination ?? new URL("/", request.url).toString(),
            "cache-control": "no-store",
            "referrer-policy": "no-referrer",
          },
        });
      },
    },
  },
});
