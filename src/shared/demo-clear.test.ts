import { describe, expect, it } from "vitest";
import { DEMO_CREW, DEMO_CUSTOMER, DEMO_TRUCK, demoJob, isDemoRecord } from "./demo-job";

describe("clear demo data matcher", () => {
  it("matches every record the demo loader creates", () => {
    expect(isDemoRecord("truck", DEMO_TRUCK)).toBe(true);
    for (const c of DEMO_CREW) expect(isDemoRecord("crew", c)).toBe(true);
    expect(isDemoRecord("customer", DEMO_CUSTOMER)).toBe(true);
    expect(isDemoRecord("job", demoJob("2026-11-02", 1, [2, 3], 4))).toBe(true);
  });
  it("never matches real user records", () => {
    expect(isDemoRecord("job", { title: "Demo move — 2BR apartment", notes: "real notes" })).toBe(false);
    expect(isDemoRecord("truck", { name: "Truck 1", plate: "DEMO-26" })).toBe(false);
    expect(isDemoRecord("crew", { ...DEMO_CREW[0], userId: "u1" })).toBe(false);
    expect(isDemoRecord("customer", { name: DEMO_CUSTOMER.name, source: "Website" })).toBe(false);
  });
});
