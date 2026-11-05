import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
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
    <ClientOnly fallback={<p className="p-8">Loading your shift…</p>}>
      <Suspense fallback={<p className="p-8">Loading your shift…</p>}>
        <ShiftResponsePage token={token} />
      </Suspense>
    </ClientOnly>
  );
}
