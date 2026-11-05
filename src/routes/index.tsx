import { createFileRoute } from "@tanstack/react-router";
import Home from "@/pages/Home";

const title = "MoveFlew — Precision Moving CRM & Conflict-Free Dispatch";
const desc = "Moving company CRM with lead capture, route pricing, e-sign proposals, crew dispatch and an offline field app. Free during beta.";

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "MoveFlew",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web, iOS, Android (PWA)",
    url: "https://moveflew.lovable.app/",
    description: desc,
    audience: { "@type": "BusinessAudience", audienceType: "Moving company owners and office teams" },
    featureList: [
      "Lead capture and website integrations",
      "Google Maps route, travel and fuel pricing",
      "Digital proposals with e-signatures and deposits",
      "Conflict-free crew and truck dispatch",
      "Offline-first mobile field app (PWA)",
      "Signed bills of lading and PDF documents with photos",
    ],
    offers: { "@type": "Offer", description: "Free during beta" },
  },
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "MoveFlew",
    url: "https://moveflew.lovable.app/",
    description: "Software for moving companies: CRM, dispatch and field operations.",
  },
];

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: desc },
      { property: "og:title", content: title },
      { property: "og:description", content: desc },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:url", content: "https://moveflew.lovable.app/" },
    ],
    links: [{ rel: "canonical", href: "https://moveflew.lovable.app/" }],
    scripts: jsonLd.map((d) => ({ type: "application/ld+json", children: JSON.stringify(d) })),
  }),
  component: Home,
});
