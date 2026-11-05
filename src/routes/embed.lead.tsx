import { createFileRoute } from "@tanstack/react-router";
import EmbedLeadPage from "@/pages/EmbedLead";

// Public, auth-free page loaded inside the website widget iframe.
export const Route = createFileRoute("/embed/lead")({
  head: () => ({
    meta: [
      { title: "Request a moving quote" },
      {
        name: "description",
        content: "Send your move details to the moving company for a free estimate.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: EmbedLeadPage,
});
