import { describe, expect, it } from "vitest";
import { effectivePrice, planStatusLabel } from "./tenant-pricing";

const base = { planId: "starter", isCustomPricing: false, pricingMode: "standard", customMonthly: null, customAnnual: null, discountPercent: null };

describe("tenant pricing", () => {
  it("uses standard Starter rate when no custom pricing", () => {
    const p = effectivePrice(base);
    expect([p.monthly, p.annual]).toEqual([75, 750]);
  });
  it("uses standard Pro rate", () => {
    const p = effectivePrice({ ...base, planId: "professional" });
    expect([p.monthly, p.annual]).toEqual([100, 1000]);
  });
  it("custom flat rate $50/mo, $500/yr replaces tier rate", () => {
    const p = effectivePrice({ ...base, isCustomPricing: true, pricingMode: "flat", customMonthly: 50, customAnnual: 500 });
    expect([p.monthly, p.annual]).toEqual([50, 500]);
  });
  it("20% discount on Starter", () => {
    const p = effectivePrice({ ...base, isCustomPricing: true, pricingMode: "percent", discountPercent: 20 });
    expect([p.monthly, p.annual]).toEqual([60, 600]);
  });
  it("100% discount is free", () => {
    const p = effectivePrice({ ...base, planId: "professional", isCustomPricing: true, pricingMode: "percent", discountPercent: 100 });
    expect([p.monthly, p.annual]).toEqual([0, 0]);
  });
  it("custom values are ignored when is_custom_pricing is false", () => {
    const p = effectivePrice({ ...base, pricingMode: "flat", customMonthly: 1 });
    expect(p.monthly).toBe(75);
  });
  it("labels", () => {
    expect(planStatusLabel("beta", false)).toBe("Free Beta");
    expect(planStatusLabel("professional", false)).toBe("Pro");
    expect(planStatusLabel("starter", true)).toBe("Custom Rate");
  });
});
