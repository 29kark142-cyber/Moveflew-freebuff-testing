import { createFileRoute } from "@tanstack/react-router";
import { faqJsonLd } from "@/lib/moveflew-faq";
import Pricing from "@/pages/Pricing";

const title = "MoveFlew Pricing — Solo, Starter, Pro & Enterprise Tiers";
const description =
  "MoveFlew pricing: Solo Mover $49/mo, Starter $75/mo, Pro $149/mo and Enterprise from $299/mo, with two months free on annual billing and AI room survey credits.";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:url", content: "https://moveflew.lovable.app/pricing" },
    ],
    scripts: [faqJsonLd()],
    links: [{ rel: "canonical", href: "https://moveflew.lovable.app/pricing" }],
  }),
  component: Pricing,
});
