import { describe, expect, it } from "vitest";
import { eligibleRevenue } from "./revenue";
describe("revenue eligibility", () => {
  it("excludes cancelled jobs", () => expect(eligibleRevenue({ status: "cancelled", customerId: 1 })).toBe(false));
  it("excludes jobs for declined customers", () =>
    expect(eligibleRevenue({ status: "estimate", customerId: 1 }, { id: 1, status: "declined" })).toBe(false));
  it("counts open estimates", () => expect(eligibleRevenue({ status: "estimate", customerId: 1 })).toBe(true));
});
