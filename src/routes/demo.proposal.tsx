import { createFileRoute } from "@tanstack/react-router";
import DemoProposal from "@/pages/DemoProposal";

const title = "Sample Moving Proposal — See What Your Customers Sign | MoveFlew";
const description =
  "A public sample of a MoveFlew customer proposal: itemized estimate with Google Maps travel and fuel, digital signature and Stripe booking deposit. Illustrative data only.";

export const Route = createFileRoute("/demo/proposal")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex, follow" },
      { property: "og:url", content: "https://moveflew.lovable.app/demo/proposal" },
    ],
    links: [{ rel: "canonical", href: "https://moveflew.lovable.app/demo/proposal" }],
  }),
  component: DemoProposal,
});
