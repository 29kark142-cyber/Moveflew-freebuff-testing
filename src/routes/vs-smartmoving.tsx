import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@/lib/wouter";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import SaasLayout from "@/components/SaasLayout";

const title = "MoveFlew vs. SmartMoving — Explore a Free Beta CRM";
const description = "Considering a SmartMoving alternative? Explore MoveFlew’s free beta, moving-specific workflows and questions to ask before choosing your CRM.";
export const Route = createFileRoute("/vs-smartmoving")({
  head: () => ({ meta: [{ title }, { name: "description", content: description }, { property: "og:title", content: title }, { property: "og:description", content: description }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { property: "og:url", content: "https://moveflew.lovable.app/vs-smartmoving" }], links: [{ rel: "canonical", href: "https://moveflew.lovable.app/vs-smartmoving" }] }),
  component: ComparisonPage,
});
function ComparisonPage() {
  return <SaasLayout footerNote="SmartMoving® is a registered trademark of SmartMoving Software, Inc. MoveFlew is an independent software platform and is not affiliated with, endorsed by, or sponsored by SmartMoving. All competitor pricing and features are based on publicly available information and are used solely for comparative purposes."><section className="saas-wrap saas-comparison">
    <span className="saas-eyebrow">CHOOSING YOUR MOVING CRM</span>
    <h1>MoveFlew vs. SmartMoving</h1>
    <p className="saas-comparison-intro">Your next CRM should fit your operations—and your budget. Explore MoveFlew with free beta access before you commit.</p>
    <Button asChild size="lg"><Link href="/register">Start Free Beta Access <ArrowRight /></Link></Button>
    <div className="saas-comparison-table">
      <div className="saas-comparison-row saas-comparison-head"><strong>What to evaluate</strong><strong>MoveFlew beta</strong><strong>SmartMoving</strong></div>
      {[
        ["Cost to get started", "Free beta access; no card required", "Confirm current pricing and onboarding costs directly"],
        ["Website lead capture", "Embeddable widgets, API keys and inbound webhooks", "Ask about website and form integrations"],
        ["Estimate pricing", "Google Maps distance plus workspace travel/fuel rules", "Compare route pricing and surcharge configuration"],
        ["Customer approvals", "Digital proposals, signatures and Stripe deposits", "Compare proposal and payment workflows"],
        ["Daily operations", "Visual dispatch with overlap prevention; mobile crew sign-offs", "Compare dispatch and field-worker workflows"],
      ].map(([label, crew, competitor]) => <div className="saas-comparison-row" key={label}><strong>{label}</strong><span><Check size={16} />{crew}</span><span>{competitor}</span></div>)}
    </div>
    <p className="saas-comparison-note">MoveFlew is in beta. Paid subscriptions are not currently available; future pricing may change. SmartMoving pricing and features are not independently verified here. Confirm their current offering directly. Stripe payment processing charges may apply.</p>
    <Link href="/" className="saas-return">Explore the moving CRM <ArrowRight size={16} /></Link>
  </section></SaasLayout>;
}