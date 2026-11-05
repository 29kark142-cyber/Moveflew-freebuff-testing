import { describe, expect, it } from "vitest";
import { calculateQuote, type Job } from "@shared/crm";
import { clampDiscountPercent, routeSummaryLabel, routeTravelPricing } from "@shared/route-pricing";

const job = (
  overrides: Partial<Job>,
): Pick<
  Job,
  | "pricingMode"
  | "hourlyRate"
  | "estimatedHours"
  | "distanceMiles"
  | "travelFee"
  | "weightRate"
  | "mileRate"
  | "inventory"
  | "fees"
  | "discountPercent"
> => ({
  pricingMode: "hourly",
  hourlyRate: 130,
  estimatedHours: 3,
  distanceMiles: 0,
  travelFee: 0,
  weightRate: 0.5,
  mileRate: 2,
  inventory: [],
  fees: [],
  discountPercent: 0,
  ...overrides,
});

describe("routeTravelPricing", () => {
  it("prices mileage and drive time from the route", () => {
    const pricing = routeTravelPricing({
      distanceMiles: 24.5,
      travelMinutes: 42,
      perMileRate: 2.25,
      crewHourlyRate: 130,
    });
    expect(pricing.mileageSurcharge).toBe(55.13);
    expect(pricing.transitCost).toBe(91);
    expect(pricing.calculatedTravel).toBe(146.13);
    expect(pricing.travelCharge).toBe(146.13);
    expect(pricing.overrideUsed).toBe(false);
    expect(pricing.total).toBe(146.13);
  });

  it("lets an office override replace the calculated travel charge", () => {
    const pricing = routeTravelPricing({
      distanceMiles: 20,
      travelMinutes: 30,
      perMileRate: 2,
      crewHourlyRate: 120,
      manualOverride: 99.5,
    });
    expect(pricing.calculatedTravel).toBe(100);
    expect(pricing.travelCharge).toBe(99.5);
    expect(pricing.overrideUsed).toBe(true);
  });

  it("applies a percentage discount to the travel charge", () => {
    const pricing = routeTravelPricing({
      distanceMiles: 10,
      travelMinutes: 0,
      perMileRate: 3,
      crewHourlyRate: 100,
      discountPercent: 15,
    });
    expect(pricing.travelCharge).toBe(30);
    expect(pricing.discountAmount).toBe(4.5);
    expect(pricing.total).toBe(25.5);
  });

  it("ignores blank, negative and non-numeric overrides", () => {
    for (const manualOverride of ["", -5, Number.NaN] as unknown as (number | null)[]) {
      const pricing = routeTravelPricing({
        distanceMiles: 4,
        travelMinutes: 12,
        perMileRate: 2,
        crewHourlyRate: 60,
        manualOverride,
      });
      expect(pricing.overrideUsed).toBe(false);
      expect(pricing.travelCharge).toBe(20);
    }
  });

  it("treats missing or negative route data as zero", () => {
    const pricing = routeTravelPricing({});
    expect(pricing.miles).toBe(0);
    expect(pricing.minutes).toBe(0);
    expect(pricing.total).toBe(0);
    expect(clampDiscountPercent(-4)).toBe(0);
    expect(clampDiscountPercent(150)).toBe(100);
  });

  it("summarizes the route for the sheet", () => {
    expect(routeSummaryLabel(42.34, 75)).toBe("42.3 mi · 1 h 15 min");
    expect(routeSummaryLabel(3, 0)).toBe("3 mi");
  });
});

describe("calculateQuote with travel pricing", () => {
  it("includes the mileage and drive-time travel fee", () => {
    const travel = routeTravelPricing({
      distanceMiles: 30,
      travelMinutes: 45,
      perMileRate: 2,
      crewHourlyRate: 130,
    });
    expect(calculateQuote(job({ travelFee: travel.travelCharge, distanceMiles: 30 }))).toBe(547.5);
  });

  it("applies an estimate discount to the whole subtotal", () => {
    expect(calculateQuote(job({ discountPercent: 10 }))).toBe(351);
  });

  it("never inverts a total with an out-of-range discount", () => {
    expect(calculateQuote(job({ discountPercent: 250 }))).toBe(0);
    expect(calculateQuote(job({ discountPercent: -20 }))).toBe(390);
  });
});
