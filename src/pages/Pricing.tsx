import { useState } from "react";
import MoveFlewFaq from "@/components/MoveFlewFaq";
import { Link } from "@/lib/wouter";
import {
  ArrowRight,
  Check,
  CreditCard,
  Map,
  Minus,
  Palette,
  PenLine,
  CalendarDays,
  PlayCircle,
  Smartphone,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import SaasLayout from "@/components/SaasLayout";
import { ComparisonHighlights, ComparisonMatrix } from "@/components/SmartMovingComparison";
import { comparisonFooter } from "@/lib/smartmoving-comparison";
import {
  ANNUAL_SAVING_LABEL,
  PLAN_TIERS,
  planPriceLabel,
  planPriceNote,
  planPriceSuffix,
  type BillingPeriod,
} from "@shared/plans";

const badge = "Free During Beta — Unlimited Access, No Credit Card Required";

type Billing = BillingPeriod;

const tierMatrix: [string, boolean | string, boolean | string, boolean | string, boolean | string][] = [
  ["Trucks", "1", "Up to 3", "Up to 8", "Unlimited"],
  ["Crew members", "Up to 3", "Up to 10", "Unlimited", "Unlimited"],
  ["Core estimates & proposals", true, true, true, true],
  ["Offline field PWA & eBOL signatures", true, true, true, true],
  ["Damage photo log & crew tipping", true, true, true, true],
  ["Dispatch calendar & conflict warnings", false, true, true, true],
  ["Google Maps routing & fuel pricing", false, true, true, true],
  ["Website lead widget", false, true, true, true],
  ["SMS & email automation", false, false, true, true],
  ["Warehouse & storage vault module", false, false, true, true],
  ["Live GPS tracking portal", false, false, true, true],
  ["AI room survey credits / month", "Add-on $5/scan", "5", "20", "Custom"],
  ["White-labeling & custom domain", false, false, true, true],
  ["Smart tariff engine", false, false, false, true],
  ["Custom API & data exports", false, false, false, true],
];

const comparison = [
  ["Price today", "Free during beta", "Paid plans, priced per tier"],
  ["Price after beta", "Solo $49, Starter $75, Pro $149", "Tiered plans and annual contracts are common"],
  ["Setup fee", "None", "Onboarding often charged separately"],
  ["User pricing", "Unlimited users included", "Seats and tiers add cost"],
  ["Contract", "Cancel anytime, zero contracts", "Annual lock-ins are common"],
];

const included = [
  {
    Icon: Map,
    title: "Distance-priced estimates",
    text: "Routes calculate miles and drive time, then apply your travel and fuel rules as estimate line items.",
  },
  {
    Icon: CalendarDays,
    title: "Conflict-free dispatch",
    text: "A visual board warns about overlapping trucks and crews before a job is assigned.",
  },
  {
    Icon: Smartphone,
    title: "Offline field workspace",
    text: "Crews capture timestamps, photos and signatures on site, then sync when they reconnect.",
  },
  {
    Icon: PenLine,
    title: "Signed documents",
    text: "Bill of Lading, damage waiver and inspection checklist, delivered as a signed PDF.",
  },
  {
    Icon: Users,
    title: "Everyone on the crew",
    text: "Invite drivers, helpers and crew leads without paying for each seat.",
  },
  {
    Icon: Palette,
    title: "White-label branding",
    text: "Proposals and documents carry your company name and colors, not ours.",
  },
];

export default function Pricing() {
  const [billing, setBilling] = useState<Billing>("monthly");
  return (
    <SaasLayout light footerNote={comparisonFooter}>
      <section className="saas-wrap saas-pricing-hero">
        <span className="saas-eyebrow">PRICING</span>
        <h1>Enterprise Moving CRM without the Enterprise Price Tag.</h1>
        <p className="saas-pricing-intro">
          Lead capture, distance-priced estimates, signed proposals, conflict-free dispatch and a
          mobile crew workspace — one flat platform your whole team can use.
        </p>
        <div className="saas-pricing-badge" role="note">
          <CreditCard size={18} aria-hidden="true" />
          <span>{badge}</span>
        </div>
        <div className="saas-pricing-actions">
          <Button asChild size="lg">
            <Link href="/register">Get Free Beta Access <ArrowRight /></Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/vs-smartmoving">Compare vs. SmartMoving</Link>
          </Button>
        </div>
        <small className="saas-pricing-footnote">
          Free beta access. No credit card, no contract, no setup fee.
        </small>
      </section>

      <section className="saas-wrap saas-pricing-plans">
        <div className="saas-billing-toggle" role="group" aria-label="Billing period">
          <button type="button" aria-pressed={billing === "monthly"} onClick={() => setBilling("monthly")}>Monthly</button>
          <button type="button" aria-pressed={billing === "annual"} onClick={() => setBilling("annual")}>Annual</button>
          <span className="saas-billing-save">{ANNUAL_SAVING_LABEL}</span>
        </div>
        <div className="saas-pricing-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))" }}>
          {PLAN_TIERS.map(tier => (
            <article className={tier.featured ? "saas-pricing-card is-featured" : "saas-pricing-card"} key={tier.id}>
              {tier.featured && <span className="saas-pricing-flag">Most Popular</span>}
              <h2>{tier.name}</h2>
              <p className="saas-pricing-tagline">{tier.tagline}</p>
              <div className="saas-pricing-amount">
                <strong>{planPriceLabel(tier, billing)}</strong>
                <span>{planPriceSuffix(tier, billing)}</span>
              </div>
              <small className="saas-pricing-tagline">{planPriceNote(tier, billing)}</small>
              <p className="saas-pricing-limits">
                <strong>{tier.trucks}</strong> · {tier.crew}
              </p>
              <ul className="saas-pricing-points">
                {tier.highlights.map(point => (
                  <li key={point}>
                    <Check size={16} aria-hidden="true" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
              <Button asChild size="lg" variant={tier.featured ? "default" : "outline"} className="saas-pricing-cta">
                <Link href={tier.href}>{tier.cta} <ArrowRight /></Link>
              </Button>
            </article>
          ))}
        </div>
        <p className="saas-pricing-footnote">
          AI room survey credits are included monthly with Starter and Pro. Solo can buy scans at $5 each; Pro can top
          up with a 6-pack for $25. Prices shown are planned launch prices — every workspace is free during beta.
        </p>
      </section>

      <section className="saas-wrap saas-pricing-compare saas-tier-matrix">
        <span className="saas-eyebrow">COMPARE PLANS</span>
        <h2>Compare all four tiers</h2>
        <div className="saas-pricing-table" role="table" aria-label="Solo Mover, Starter, Pro and Enterprise features">
          <div className="saas-pricing-row saas-pricing-head" role="row">
            <strong role="columnheader">Feature</strong>
            {PLAN_TIERS.map(tier => (
              <strong role="columnheader" key={tier.id}>{tier.name}</strong>
            ))}
          </div>
          {tierMatrix.map(([label, ...values]) => (
            <div className="saas-pricing-row" role="row" key={label}>
              <strong role="rowheader">{label}</strong>
              {values.map((value, index) => (
                <span role="cell" data-column={PLAN_TIERS[index]?.name} key={index}>
                  {value === true ? (
                    <><Check size={16} aria-label="Included" /></>
                  ) : value === false ? (
                    <Minus size={16} className="saas-tier-no" aria-label="Not included" />
                  ) : value}
                </span>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="saas-wrap saas-pricing-compare">
        <span className="saas-eyebrow">PLAN COMPARISON</span>
        <h2>MoveFlew vs. SmartMoving</h2>
        <p className="saas-pricing-sub">
          What moving company owners usually ask before they switch: what it costs now, what it costs
          later, and how hard it is to get out.
        </p>
        <div className="saas-pricing-table" role="table" aria-label="MoveFlew versus SmartMoving plans">
          <div className="saas-pricing-row saas-pricing-head" role="row">
            <strong role="columnheader">What you're comparing</strong>
            <strong role="columnheader">MoveFlew</strong>
            <strong role="columnheader">SmartMoving</strong>
          </div>
          {comparison.map(([label, moveflew, competitor]) => (
            <div className="saas-pricing-row" role="row" key={label}>
              <strong role="rowheader">{label}</strong>
              <span role="cell" data-column="MoveFlew">
                <Check size={16} aria-hidden="true" />
                {moveflew}
              </span>
              <span role="cell" data-column="SmartMoving">{competitor}</span>
            </div>
          ))}
        </div>
        <p className="saas-pricing-footnote">
          SmartMoving plan terms are based on publicly available information and may change; confirm
          current terms with the vendor before deciding.
        </p>
      </section>

      <section className="saas-wrap saas-alt-matrix">
        <div className="saas-pricing-heading">
          <div>
            <span className="saas-eyebrow">FEATURE &amp; CAPABILITY MATRIX</span>
            <h2>What you get beyond the price.</h2>
          </div>
          <p>
            The six things that decide a move: what the crew can do without signal, what it costs per
            user, how documents get signed and sent, whose brand is on them, how miles and fuel get
            priced, and how tenant data is kept apart.
          </p>
        </div>
        <ComparisonMatrix />
        <p className="saas-pricing-footnote">
          MoveFlew describes this product as built today. Competitor values are based on publicly
          available information and are not independently verified.
        </p>
        <div className="saas-pricing-actions saas-alt-more">
          <Button asChild size="lg" variant="outline">
            <Link href="/smartmoving-alternative">
              See the full SmartMoving comparison <ArrowRight />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/demo/proposal">
              <PlayCircle size={18} aria-hidden="true" /> View Live Demo
            </Link>
          </Button>
        </div>
        <ComparisonHighlights />
      </section>

      <section className="saas-wrap saas-pricing-included">
        <div className="saas-pricing-heading">
          <div>
            <span className="saas-eyebrow">IN EVERY WORKSPACE</span>
            <h2>Included in every workspace.</h2>
          </div>
          <p>
            The beta includes the modules most CRMs sell as add-ons, so you can run a full move
            without switching tools.
          </p>
        </div>
        <div className="saas-pricing-features">
          {included.map(({ Icon, title, text }) => (
            <article className="saas-pricing-feature" key={title}>
              <span className="saas-pricing-feature-icon"><Icon size={20} aria-hidden="true" /></span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="saas-wrap saas-pricing-closing">
        <div>
          <span className="saas-eyebrow">GET STARTED</span>
          <h2>Try it on your next move.</h2>
          <p>Create a workspace, invite your crew and run a real job. Free during beta.</p>
        </div>
        <Button asChild size="lg">
          <Link href="/register">Get Free Beta Access <ArrowRight /></Link>
        </Button>
      </section>
      <MoveFlewFaq />
    </SaasLayout>
  );
}
