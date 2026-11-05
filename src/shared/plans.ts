// Presentation metadata for the four published tiers. Billing and enforcement stay in
// the subscription_plans table; this catalog is the single source for the marketing
// page, the AI credit allowances and white-label entitlements.

export type BillingPeriod = "monthly" | "annual";
export type PlanTierId = "solo" | "starter" | "pro" | "enterprise";

export type PlanTier = {
  id: PlanTierId;
  name: string;
  tagline: string;
  /** Monthly price in dollars, or null for custom enterprise pricing. */
  monthly: number | null;
  /** Annual price in dollars, or null for custom enterprise pricing. */
  annual: number | null;
  featured: boolean;
  trucks: string;
  crew: string;
  /** AI room survey scans included each month. */
  surveyCredits: number;
  cta: string;
  href: string;
  highlights: string[];
};

export const PLAN_TIERS: PlanTier[] = [
  {
    id: "solo",
    name: "Solo Mover",
    tagline: "For the owner-operator running every job themselves.",
    monthly: 49,
    annual: 500,
    featured: false,
    trucks: "1 truck",
    crew: "3 crew",
    surveyCredits: 0,
    cta: "Start with Solo",
    href: "/register",
    highlights: [
      "1 truck and 3 crew members",
      "Core field PWA with offline sync",
      "eBOL signatures and damage photo log",
      "Crew tipping and review booster",
      "AI survey add-on at $5 per survey",
    ],
  },
  {
    id: "starter",
    name: "Starter",
    tagline: "For small teams booking moves every week.",
    monthly: 75,
    annual: 750,
    featured: false,
    trucks: "Up to 3 trucks",
    crew: "10 crew",
    surveyCredits: 5,
    cta: "Start with Starter",
    href: "/register",
    highlights: [
      "Up to 3 trucks and 10 crew",
      "Dispatch calendar with conflict warnings",
      "Google Maps routing and fuel pricing",
      "5 AI room survey credits each month",
      "Website lead widget",
    ],
  },
  {
    id: "pro",
    name: "Pro / Scale",
    tagline: "For growing companies running multiple crews a day.",
    monthly: 149,
    annual: 1500,
    featured: true,
    trucks: "Up to 8 trucks",
    crew: "Unlimited crew",
    surveyCredits: 20,
    cta: "Scale on Pro",
    href: "/register",
    highlights: [
      "Up to 8 trucks and unlimited crew",
      "Website widget and full SMS engine",
      "Warehouse & storage vault module",
      "Live GPS tracking portal",
      "20 AI room survey credits each month",
      "White-label proposals with custom domain",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    tagline: "For multi-branch fleets that need their own systems.",
    monthly: null,
    annual: null,
    featured: false,
    trucks: "Unlimited fleet",
    crew: "Unlimited crew",
    surveyCredits: 50,
    cta: "Contact Sales",
    href: "/contact",
    highlights: [
      "Unlimited fleet and crew",
      "White-labeling and custom CNAME",
      "Smart tariff engine with custom rules",
      "Custom API and data exports",
      "Starting at $299+/mo or $3,000+/yr",
      "Priority onboarding and support",
    ],
  },
];

export const PLAN_BY_ID: Record<PlanTierId, PlanTier> = Object.fromEntries(
  PLAN_TIERS.map((tier) => [tier.id, tier]),
) as Record<PlanTierId, PlanTier>;

export const ANNUAL_SAVING_LABEL = "Save ~2 Months with Annual Billing";

export type ScanPack = { id: "single" | "six"; credits: number; priceCents: number; label: string };

export const SCAN_PACKS: ScanPack[] = [
  { id: "single", credits: 1, priceCents: 500, label: "Single scan" },
  { id: "six", credits: 6, priceCents: 2500, label: "Six-pack" },
];

export function scanPackById(value: unknown): ScanPack | null {
  return SCAN_PACKS.find((pack) => pack.id === value) ?? null;
}

/** Maps stored workspace plan ids (including legacy ids) onto this catalog. */
export function normalizePlanId(planId: string | null | undefined): PlanTierId {
  const value = (planId ?? "").toLowerCase();
  if (value === "solo") return "solo";
  if (value === "starter") return "starter";
  if (value === "professional" || value === "pro" || value === "scale") return "pro";
  if (value === "enterprise") return "enterprise";
  // Beta workspaces have full access, so they see the Pro allowance.
  return "pro";
}

export function planTier(planId: string | null | undefined): PlanTier {
  return PLAN_BY_ID[normalizePlanId(planId)];
}

export function includedSurveyCredits(planId: string | null | undefined, purchased = 0): number {
  return planTier(planId).surveyCredits + Math.max(0, Math.round(Number(purchased) || 0));
}

/** Pro and Enterprise include white-labeling; beta/trial windows keep full access. */
export function whiteLabelEntitled(input: { planId?: string | null; subscriptionStatus?: string | null }): boolean {
  const status = (input.subscriptionStatus ?? "").toLowerCase();
  // Beta and trial workspaces keep full access; otherwise the paid plan decides.
  if (status === "beta" || status === "trialing") return true;
  const plan = (input.planId ?? "").toLowerCase();
  return plan === "pro" || plan === "professional" || plan === "scale" || plan === "enterprise";
}

export function creditBalance(
  used: number,
  included: number,
): { used: number; included: number; remaining: number; percent: number } {
  const safeUsed = Math.max(0, Math.round(Number(used) || 0));
  const safeIncluded = Math.max(0, Math.round(Number(included) || 0));
  return {
    used: safeUsed,
    included: safeIncluded,
    remaining: Math.max(0, safeIncluded - safeUsed),
    percent: safeIncluded ? Math.min(100, Math.round((safeUsed / safeIncluded) * 100)) : 0,
  };
}

export function planPriceLabel(tier: PlanTier, billing: BillingPeriod): string {
  const amount = billing === "monthly" ? tier.monthly : tier.annual;
  return amount === null ? "Custom" : `$${amount.toLocaleString("en-US")}`;
}

export function planPriceSuffix(tier: PlanTier, billing: BillingPeriod): string {
  if (tier.monthly === null) return "";
  return billing === "monthly" ? "/mo" : "/yr";
}

export function planPriceNote(tier: PlanTier, billing: BillingPeriod): string {
  if (tier.monthly === null)
    return billing === "monthly" ? "starting at $299+/mo" : "starting at $3,000+/yr";
  return billing === "annual" ? "2 months free" : "billed monthly";
}
