import MoveFlewFaq from "@/components/MoveFlewFaq";
import { Link } from "@/lib/wouter";
import { ArrowRight, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import SaasLayout from "@/components/SaasLayout";
import { ComparisonHighlights, ComparisonMatrix } from "@/components/SmartMovingComparison";
import { comparisonFooter } from "@/lib/smartmoving-comparison";

export default function SmartMovingAlternative() {
  return (
    <SaasLayout light footerNote={comparisonFooter}>
      <section className="saas-wrap saas-alt-hero">
        <span className="saas-eyebrow">SMARTMOVING ALTERNATIVE</span>
        <h1>The Modern SmartMoving Alternative for Growing Moving Companies</h1>
        <p className="saas-alt-sub">
          Everything you need to dispatch crews, capture e-signatures offline, and grow your business
          — without per-user fees or rigid annual contracts.
        </p>
        <div className="saas-pricing-actions">
          <Button asChild size="lg">
            <Link href="/register">
              Try MoveFlew Free <ArrowRight />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/demo/proposal">
              <PlayCircle size={18} aria-hidden="true" /> View Live Demo
            </Link>
          </Button>
        </div>
        <small className="saas-pricing-footnote">
          Free during beta. No credit card, no contract, no setup fee, unlimited users.
        </small>
      </section>

      <section className="saas-wrap saas-alt-matrix">
        <div className="saas-pricing-heading">
          <div>
            <span className="saas-eyebrow">FEATURE &amp; CAPABILITY MATRIX</span>
            <h2>Where the two platforms part ways.</h2>
          </div>
          <p>
            Six things decide a moving CRM on move day: what the crew can do without signal, what it
            costs per user, how documents get signed and sent, whose brand is on them, how miles and
            fuel get priced, and how tenant data is kept apart.
          </p>
        </div>
        <ComparisonMatrix />
        <p className="saas-pricing-footnote">
          MoveFlew describes this product as built today. Competitor values are based on publicly
          available information and are not independently verified.
        </p>
      </section>

      <section className="saas-wrap saas-alt-roi">
        <span className="saas-eyebrow">FOR MOVING BUSINESS OWNERS</span>
        <h2>What it means for your operation.</h2>
        <ComparisonHighlights />
      </section>

      <section className="saas-wrap saas-pricing-closing">
        <div>
          <span className="saas-eyebrow">GET STARTED</span>
          <h2>Run your next move on MoveFlew.</h2>
          <p>Set up a workspace, invite your crew and price a real job. Free during beta.</p>
        </div>
        <Button asChild size="lg">
          <Link href="/register">
            Try MoveFlew Free <ArrowRight />
          </Link>
        </Button>
      </section>
      <MoveFlewFaq />
    </SaasLayout>
  );
}
