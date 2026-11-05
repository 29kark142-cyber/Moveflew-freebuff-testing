import { describe, expect, it } from "vitest";
import { acceptedTime, billableHours, fieldStatus, finalBill, nextPhase } from "./field";

describe("field rules", () => {
  it("phases go in order", () => {
    expect(nextPhase({})).toBe("start_travel");
    expect(nextPhase({ start_travel: "x", arrive_pickup: "x" })).toBe("start_loading");
  });
  it("status badges follow phases", () => {
    expect(fieldStatus({})).toBe("Assigned");
    expect(fieldStatus({ start_travel: "x" })).toBe("In Transit");
    expect(fieldStatus({ start_travel: "x", arrive_pickup: "x" })).toBe("In Progress");
    expect(fieldStatus({ start_travel: "x", arrive_pickup: "x", start_loading: "x", in_transit: "x" })).toBe("In Transit");
    expect(fieldStatus({ complete: "x" })).toBe("Completed");
  });
  it("bills from pickup arrival to completion, rounded up to the quarter hour", () => {
    expect(billableHours({ arrive_pickup: "2026-10-28T08:00:00Z", complete: "2026-10-28T11:10:00Z" })).toBe(3.25);
    expect(billableHours({ arrive_pickup: "2026-10-28T08:00:00Z" })).toBe(0);
  });
  it("final bill = hours × rate + travel + fees − deposit", () => {
    const b = finalBill({ hourlyRate: 130, travelFee: 50, fees: [{ amount: 20 }], depositPaidCents: 10000 }, 3);
    expect(b.labor).toBe(390);
    expect(b.due).toBe(360);
    expect(finalBill({ hourlyRate: 10, depositPaidCents: 100000 }, 1).due).toBe(0);
  });
  it("adds a recorded crew tip to the final balance", () => {
    const base = { hourlyRate: 130, travelFee: 50, fees: [{ amount: 20 }], depositPaidCents: 10000 };
    const withTip = finalBill({ ...base, tipCents: 5000 }, 3);
    expect(withTip.tip).toBe(50);
    expect(withTip.subtotal).toBe(510);
    expect(withTip.due).toBe(410);
    expect(finalBill(base, 3).tip).toBe(0);
  });
  it("ignores future or stale offline timestamps", () => {
    const now = Date.parse("2026-10-28T12:00:00Z");
    expect(acceptedTime("2026-10-28T11:30:00Z", now)).toBe("2026-10-28T11:30:00.000Z");
    expect(acceptedTime("2026-10-29T12:00:00Z", now)).toBe("2026-10-28T12:00:00.000Z");
  });
});
