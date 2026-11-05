import { describe, expect, it } from "vitest";
import {
  creditBalance,
  includedSurveyCredits,
  normalizePlanId,
  planPriceLabel,
  planPriceNote,
  planTier,
  SCAN_PACKS,
  scanPackById,
  whiteLabelEntitled,
} from "./plans";

describe("plan catalog", () => {
  it("publishes the four tiers with the requested prices", () => {
    expect(planTier("solo").monthly).toBe(49);
    expect(planTier("solo").annual).toBe(500);
    expect(planTier("starter").monthly).toBe(75);
    expect(planTier("starter").annual).toBe(750);
    expect(planTier("professional").monthly).toBe(149);
    expect(planTier("professional").annual).toBe(1500);
    expect(planTier("enterprise").monthly).toBeNull();
  });

  it("labels custom and billed prices per period", () => {
    expect(planPriceLabel(planTier("pro"), "monthly")).toBe("$149");
    expect(planPriceLabel(planTier("pro"), "annual")).toBe("$1,500");
    expect(planPriceLabel(planTier("enterprise"), "annual")).toBe("Custom");
    expect(planPriceNote(planTier("enterprise"), "monthly")).toContain("$299");
  });

  it("normalizes legacy workspace plan ids", () => {
    expect(normalizePlanId("professional")).toBe("pro");
    expect(normalizePlanId("scale")).toBe("pro");
    expect(normalizePlanId("beta")).toBe("pro");
    expect(normalizePlanId("starter")).toBe("starter");
    expect(normalizePlanId(undefined)).toBe("pro");
  });

  it("counts included and purchased survey credits", () => {
    expect(includedSurveyCredits("solo")).toBe(0);
    expect(includedSurveyCredits("starter")).toBe(5);
    expect(includedSurveyCredits("professional")).toBe(20);
    expect(includedSurveyCredits("starter", 6)).toBe(11);
  });

  it("computes the remaining credit balance", () => {
    expect(creditBalance(7, 20)).toEqual({ used: 7, included: 20, remaining: 13, percent: 35 });
    expect(creditBalance(0, 0)).toEqual({ used: 0, included: 0, remaining: 0, percent: 0 });
    expect(creditBalance(-2, 5).used).toBe(0);
  });

  it("entitles paid Pro and Enterprise plans plus the beta window to white-labeling", () => {
    expect(whiteLabelEntitled({ planId: "professional", subscriptionStatus: "active" })).toBe(true);
    expect(whiteLabelEntitled({ planId: "starter", subscriptionStatus: "active" })).toBe(false);
    expect(whiteLabelEntitled({ planId: "solo", subscriptionStatus: "active" })).toBe(false);
    expect(whiteLabelEntitled({ planId: "starter", subscriptionStatus: "beta" })).toBe(true);
    expect(whiteLabelEntitled({ planId: "studio", subscriptionStatus: "canceled" })).toBe(false);
  });

  it("prices the scan packs", () => {
    expect(SCAN_PACKS.map((pack) => pack.priceCents)).toEqual([500, 2500]);
    expect(scanPackById("six")?.credits).toBe(6);
    expect(scanPackById("nope")).toBeNull();
  });
});
