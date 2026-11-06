import { createFileRoute } from "@tanstack/react-router";

// Public review API. GET shows the private feedback form; POST saves the rating
// and returns the optional five-star Google redirect or escalation message.
export const Route = createFileRoute("/api/public/reviews/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const headers = { "cache-control": "no-store", "referrer-policy": "no-referrer" };
        try {
          const { readPublicReview } = await import("@/server/review-public");
          const review = await readPublicReview(params.token);
          if (!review) return Response.json({ error: "This feedback link is unavailable" }, { status: 404, headers });
          return Response.json(review, { headers });
        } catch (error) {
          console.error("Public review lookup failed", error);
          return Response.json({ error: "Feedback is temporarily unavailable" }, { status: 503, headers });
        }
      },
      POST: async ({ params, request }) => {
        const headers = { "cache-control": "no-store", "referrer-policy": "no-referrer" };
        try {
          const body = (await request.json().catch(() => ({}))) as { rating?: unknown; feedback?: unknown };
          const { submitPublicReview } = await import("@/server/review-public");
          const review = await submitPublicReview(params.token, body);
          if (!review) return Response.json({ error: "This feedback link is unavailable" }, { status: 404, headers });
          return Response.json(review, { headers });
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : "Could not save your feedback" },
            { status: 400, headers },
          );
        }
      },
    },
  },
});
