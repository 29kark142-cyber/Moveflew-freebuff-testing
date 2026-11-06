import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { PageLoader } from "@/components/loaders/MoveFlewLoader";
const QuotePage = lazy(() => import("@/pages/QuotePage"));
export const Route = createFileRoute("/quote/$token")({
  head: () => ({
    meta: [
      { title: "Your moving quote | MoveFlew" },
      { name: "description", content: "Review the moving quote your mover prepared for you." },
      { property: "og:title", content: "Moving quote | MoveFlew" },
      { property: "og:description", content: "Review your moving quote and pricing breakdown." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: QuoteRoute,
});
function QuoteRoute() {
  const { token } = Route.useParams();
  return (
    <ClientOnly fallback={<PageLoader label="Loading quote…" />}>
      <Suspense fallback={<PageLoader label="Loading quote…" />}>
        <QuotePage token={token} />
      </Suspense>
    </ClientOnly>
  );
}
