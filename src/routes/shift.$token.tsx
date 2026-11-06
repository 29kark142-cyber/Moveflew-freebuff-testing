import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { PageLoader } from "@/components/loaders/MoveFlewLoader";
const ShiftResponsePage = lazy(() => import("@/pages/ShiftResponsePage"));
export const Route = createFileRoute("/shift/$token")({
  head: () => ({
    meta: [
      { title: "Your shift | MoveFlew" },
      { name: "description", content: "Confirm or decline the moving shift dispatch assigned." },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: ShiftRoute,
});
function ShiftRoute() {
  const { token } = Route.useParams();
  return (
    <ClientOnly fallback={<PageLoader label="Loading your shift…" />}>
      <Suspense fallback={<PageLoader label="Loading your shift…" />}>
        <ShiftResponsePage token={token} />
      </Suspense>
    </ClientOnly>
  );
}
