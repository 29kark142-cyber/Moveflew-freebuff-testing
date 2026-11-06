import { describe, expect, it } from "vitest";
import { netMinutes, payrollPayCents, splitOvertime, tipAllocationIssue } from "./payroll";

describe("payroll hours", () => {
  it("subtracts breaks and never goes below zero", () => {
    expect(netMinutes(480, 30)).toBe(450);
    expect(netMinutes(30, 45)).toBe(0);
    expect(netMinutes("nonsense", 0)).toBe(0);
  });

  it("splits weekly overtime after 40 hours", () => {
    expect(splitOvertime(2400)).toEqual({ regularMinutes: 2400, overtimeMinutes: 0 });
    expect(splitOvertime(2700)).toEqual({ regularMinutes: 2400, overtimeMinutes: 300 });
  });

  it("pays overtime at 1.5 times the rate", () => {
    expect(payrollPayCents(2400, 300, 2500)).toEqual({
      regularPayCents: 100_000,
      overtimePayCents: 18_750,
    });
  });
});

describe("tip allocation", () => {
  const crew = [1, 2, 3];

  it("requires the allocations to add up to the tip and belong to assigned crew", () => {
    expect(
      tipAllocationIssue(
        5000,
        [
          { crewMemberId: 1, amountCents: 2500 },
          { crewMemberId: 2, amountCents: 2500 },
        ],
        crew,
      ),
    ).toBeNull();
    expect(tipAllocationIssue(5000, [{ crewMemberId: 1, amountCents: 2500 }], crew)).toMatch(
      /add up/,
    );
    expect(tipAllocationIssue(5000, [{ crewMemberId: 9, amountCents: 5000 }], crew)).toMatch(
      /assigned/,
    );
    expect(
      tipAllocationIssue(
        4000,
        [
          { crewMemberId: 1, amountCents: 2000 },
          { crewMemberId: 1, amountCents: 2000 },
        ],
        crew,
      ),
    ).toMatch(/once/);
  });

  it("rejects zero tips and negative cents", () => {
    expect(tipAllocationIssue(0, [], crew)).toMatch(/greater than zero/);
    expect(tipAllocationIssue(1000, [{ crewMemberId: 1, amountCents: -5 }], crew)).toMatch(
      /whole cents/,
    );
  });
});
