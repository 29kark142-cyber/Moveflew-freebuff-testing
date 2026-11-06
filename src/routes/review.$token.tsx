import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const ReviewFeedback = lazy(() => import("@/pages/extended/ReviewFeedback"));

export const Route = createFileRoute("/review/$token")({
  head: () => ({
    meta: [
      { title: "Share feedback | MoveFlew" },
      { name: "description", content: "Share private feedback about your recent move." },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: ReviewRoute,
});

function ReviewRoute() {
  const { token } = Route.useParams();
  return (
    <ClientOnly fallback={<p className="p-8">Loading feedback form…</p>}>
      <Suspense fallback={<p className="p-8">Loading feedback form…</p>}>
        <ReviewFeedback params={{ token }} />
      </Suspense>
    </ClientOnly>
  );
}
