import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { PageLoader } from "@/components/loaders/MoveFlewLoader";

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
    <ClientOnly fallback={<PageLoader label="Loading feedback form…" />}>
      <Suspense fallback={<PageLoader label="Loading feedback form…" />}>
        <ReviewFeedback params={{ token }} />
      </Suspense>
    </ClientOnly>
  );
}
