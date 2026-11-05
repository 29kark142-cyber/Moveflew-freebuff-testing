import { describe, expect, it } from "vitest";
import { SKIP_DEFAULTS, isReadOnly } from "./onboarding";

describe("onboarding rules", () => {
  it("skip turns travel, fuel and deposit off at $0", () => {
    expect(SKIP_DEFAULTS.travel.travelPricingType).toBe("none");
    expect(SKIP_DEFAULTS.travel.fuelSurchargeType).toBe("none");
    expect(SKIP_DEFAULTS.deposit).toEqual({ mode: "fixed", value: 0 });
  });
  it("past due and canceled are read-only; beta stays editable", () => {
    expect(isReadOnly("past_due")).toBe(true);
    expect(isReadOnly("canceled")).toBe(true);
    expect(isReadOnly("beta")).toBe(false);
    expect(isReadOnly("active")).toBe(false);
  });
});
