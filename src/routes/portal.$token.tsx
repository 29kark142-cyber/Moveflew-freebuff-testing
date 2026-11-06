import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const CustomerPortal = lazy(() => import("@/pages/extended/CustomerPortal"));

export const Route = createFileRoute("/portal/$token")({
  head: () => ({
    meta: [
      { title: "Your move portal | MoveFlew" },
      {
        name: "description",
        content:
          "Change your move date, update addresses, upload inventory photos and download your estimate or invoice.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: PortalRoute,
});

function PortalRoute() {
  const { token } = Route.useParams();
  return (
    <ClientOnly fallback={<p className="p-8">Loading your portal…</p>}>
      <Suspense fallback={<p className="p-8">Loading your portal…</p>}>
        <CustomerPortal params={{ token }} />
      </Suspense>
    </ClientOnly>
  );
}
