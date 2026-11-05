import { createFileRoute } from "@tanstack/react-router";
import Contact from "@/pages/Contact";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact the crew — MoveFlew" },
      { name: "description", content: "Email or send a request to plan your next move with MoveFlew." },
      { property: "og:title", content: "Contact the crew — MoveFlew" },
      { property: "og:description", content: "Email or send a request to plan your next move with MoveFlew." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Contact,
});
