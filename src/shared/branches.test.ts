import { describe, expect, it } from "vitest";
import { branchPerformance, isInBranch, type Branch } from "./branches";

const branches: Branch[] = [
  { id: 1, name: "North", code: "N", address: "", phone: "", manager: "", status: "active" },
  { id: 2, name: "South", code: "S", address: "", phone: "", manager: "", status: "active" },
];

describe("branch scoping", () => {
  it("keeps unassigned records out of a selected branch", () => {
    expect(isInBranch({ branchId: 1 }, 1)).toBe(true);
    expect(isInBranch({ branchId: 2 }, 1)).toBe(false);
    expect(isInBranch({}, 1)).toBe(false);
    expect(isInBranch({}, null)).toBe(true);
  });

  it("rolls jobs and expenses into branch net contribution", () => {
    const result = branchPerformance(
      branches,
      [
        { branchId: 1, status: "completed", finalTotal: 1200 },
        { branchId: 1, status: "booked", total: 300 },
        { branchId: 2, status: "completed", total: 500 },
      ],
      [
        { branchId: 1, amountCents: 25100 },
        { branchId: 2, amountCents: 10000 },
      ],
    );
    expect(result.totals).toEqual({
      jobs: 3,
      completedJobs: 2,
      revenueCents: 200000,
      expensesCents: 35100,
      netCents: 164900,
    });
    expect(result.branches[0]).toMatchObject({ name: "North", jobs: 2, netCents: 124900 });
  });

  it("returns one branch when a branch context is selected", () => {
    expect(branchPerformance(branches, [], [], 2).branches.map(branch => branch.code)).toEqual(["S"]);
  });
});
