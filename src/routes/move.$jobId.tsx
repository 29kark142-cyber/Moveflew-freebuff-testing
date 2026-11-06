import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { PageLoader } from "@/components/loaders/MoveFlewLoader";

const TrackingPage = lazy(() => import("@/pages/TrackingPage"));

// The URL segment is an opaque, unguessable tracking token — never a raw job id.
export const Route = createFileRoute("/move/$jobId")({
  head: () => ({
    meta: [
      { title: "Track your move | MoveFlew" },
      {
        name: "description",
        content: "Follow your move live: crew status, truck location and estimated arrival.",
      },
      { property: "og:title", content: "Track your move | MoveFlew" },
      {
        property: "og:description",
        content: "Follow your move live: crew status, truck location and estimated arrival.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: TrackingRoute,
});

function TrackingRoute() {
  const { jobId } = Route.useParams();
  return (
    <ClientOnly fallback={<PageLoader label="Loading your move…" />}>
      <Suspense fallback={<PageLoader label="Loading your move…" />}>
        <TrackingPage token={jobId} />
      </Suspense>
    </ClientOnly>
  );
}
