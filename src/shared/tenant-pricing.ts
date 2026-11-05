/** Standard public tier rates (USD). Matches the public /pricing page. */
export const STANDARD_RATES: Record<string, { monthly: number; annual: number; label: string }> = {
  starter: { monthly: 75, annual: 750, label: "Starter" },
  professional: { monthly: 100, annual: 1000, label: "Pro" },
};

export type PricingMode = "standard" | "flat" | "percent";

export type PricingInput = {
  planId: string;
  isCustomPricing: boolean;
  pricingMode: PricingMode | string;
  customMonthly: number | null;
  customAnnual: number | null;
  discountPercent: number | null;
};

export type EffectivePrice = {
  planId: string;
  tierLabel: string;
  standardMonthly: number;
  standardAnnual: number;
  monthly: number;
  annual: number;
  custom: boolean;
  mode: PricingMode;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The rate a workspace is actually charged. Custom rates apply only when isCustomPricing is true. */
export function effectivePrice(p: PricingInput): EffectivePrice {
  const std = STANDARD_RATES[p.planId] ?? { monthly: 0, annual: 0, label: p.planId === "beta" ? "Free Beta" : p.planId };
  const base = { planId: p.planId, tierLabel: std.label, standardMonthly: std.monthly, standardAnnual: std.annual };
  if (!p.isCustomPricing || p.pricingMode === "standard") {
    return { ...base, monthly: std.monthly, annual: std.annual, custom: false, mode: "standard" };
  }
  if (p.pricingMode === "flat") {
    return {
      ...base,
      monthly: round2(p.customMonthly ?? std.monthly),
      annual: round2(p.customAnnual ?? (p.customMonthly != null ? p.customMonthly * 10 : std.annual)),
      custom: true, mode: "flat",
    };
  }
  const pct = Math.min(100, Math.max(0, p.discountPercent ?? 0));
  const f = 1 - pct / 100;
  return { ...base, monthly: round2(std.monthly * f), annual: round2(std.annual * f), custom: true, mode: "percent" };
}

/** Short plan status for the admin table. */
export function planStatusLabel(planId: string, isCustomPricing: boolean): string {
  if (isCustomPricing) return "Custom Rate";
  if (planId === "beta") return "Free Beta";
  return STANDARD_RATES[planId]?.label ?? planId;
}
