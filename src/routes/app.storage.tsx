import { createFileRoute } from "@tanstack/react-router";
import WorkspaceApp from "@/pages/app/WorkspaceApp";

// The workspace shell resolves this path to the storage vault manager; the dedicated
// route keeps the URL in the route tree instead of relying on the /app/$ fallback.
export const Route = createFileRoute("/app/storage")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Storage & warehouse vaults — MoveFlew" },
      {
        name: "description",
        content: "Warehouse vault availability, stored inventory and recurring holding fees.",
      },
      { property: "og:title", content: "Storage & warehouse vaults — MoveFlew" },
      {
        property: "og:description",
        content: "Warehouse vault availability, stored inventory and recurring holding fees.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: WorkspaceApp,
});
