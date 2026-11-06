import { createFileRoute } from "@tanstack/react-router";
import WorkspaceApp from "@/pages/app/WorkspaceApp";

// Dedicated route so /app/storage/billing is in the generated route tree; the workspace
// shell resolves it to the monthly storage invoice queue.
export const Route = createFileRoute("/app/storage/billing")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Storage billing — MoveFlew" },
      {
        name: "description",
        content: "Monthly vault storage invoices, delivery state and overdue balances.",
      },
      { property: "og:title", content: "Storage billing — MoveFlew" },
      {
        property: "og:description",
        content: "Monthly vault storage invoices, delivery state and overdue balances.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: WorkspaceApp,
});
