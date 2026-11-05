import { createFileRoute } from "@tanstack/react-router";
import WorkspaceApp from "@/pages/app/WorkspaceApp";

export const Route = createFileRoute("/app/$")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Your workspace — MoveFlew" },
      { name: "description", content: "Moving operations, reports, tariffs, dispatch and billing in your MoveFlew workspace." },
      { property: "og:title", content: "Your workspace — MoveFlew" },
      { property: "og:description", content: "Moving operations, reports, tariffs, dispatch and billing in your MoveFlew workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: WorkspaceApp,
});
