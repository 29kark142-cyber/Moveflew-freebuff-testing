import { describe, expect, it } from "vitest";
import { fuelCharge, travelCharge, type RoutePlan, type TravelSettings } from "./travel-rules";

const route: RoutePlan = {
  toPickup: { miles: 10, minutes: 30 },
  move: { miles: 20, minutes: 40 },
  returnToBase: { miles: 15, minutes: 30 },
};
const base: TravelSettings = {
  dispatchAddress: "Base", travelPricingType: "none", travelFlatRate: 75, travelMileageRate: 2,
  fuelSurchargeType: "none", fuelFlatRate: 40, fuelPerMileRate: 0.5, fuelPercentageRate: 10,
};

describe("travel charge", () => {
  it("hourly charges base→pickup plus drop-off→base drive time at the crew rate", () => {
    expect(travelCharge({ ...base, travelPricingType: "hourly" }, route, 130)).toBe(130);
  });
  it("flat fee uses the workspace amount", () => {
    expect(travelCharge({ ...base, travelPricingType: "flat_fee" }, route, 130)).toBe(75);
  });
  it("per mile charges the miles to and from the base", () => {
    expect(travelCharge({ ...base, travelPricingType: "per_mile" }, route, 130)).toBe(50);
  });
  it("none charges nothing", () => {
    expect(travelCharge(base, route, 130)).toBe(0);
  });
});

describe("fuel surcharge", () => {
  it("per mile uses all driven miles", () => {
    expect(fuelCharge({ ...base, fuelSurchargeType: "per_mile" }, route, 1000)).toBe(22.5);
  });
  it("percentage applies to the subtotal", () => {
    expect(fuelCharge({ ...base, fuelSurchargeType: "percentage" }, route, 1000)).toBe(100);
  });
  it("flat fee uses the workspace amount", () => {
    expect(fuelCharge({ ...base, fuelSurchargeType: "flat_fee" }, route, 1000)).toBe(40);
  });
  it("none is $0", () => {
    expect(fuelCharge(base, route, 1000)).toBe(0);
  });
});
