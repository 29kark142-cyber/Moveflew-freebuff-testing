import { createFileRoute } from "@tanstack/react-router";
import PlatformAdmin from "@/components/admin/PlatformAdmin";

export const Route = createFileRoute("/admin/platform")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Platform admin — MoveFlew" },
      { name: "description", content: "Manage subscriber workspaces, plans and platform health." },
      { property: "og:title", content: "Platform admin — MoveFlew" },
      { property: "og:description", content: "Manage subscriber workspaces, plans and platform health." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PlatformAdmin,
});
