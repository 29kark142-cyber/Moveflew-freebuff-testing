/** Multi-branch records and the enterprise roll-up shown on /app/branches. */

export type Branch = {
  id: number;
  name: string;
  code: string;
  address: string;
  phone: string;
  manager: string;
  status: "active" | "inactive";
  createdAt?: string;
};

export type BranchScoped = {
  branchId?: number | null;
  status?: string;
  total?: number | null;
  finalTotal?: number | null;
  amountCents?: number | null;
};

export type BranchRollup = {
  branchId: number;
  name: string;
  code: string;
  status: string;
  jobs: number;
  completedJobs: number;
  revenueCents: number;
  expensesCents: number;
  netCents: number;
};

export type BranchPerformance = {
  branches: BranchRollup[];
  totals: Omit<BranchRollup, "branchId" | "name" | "code" | "status">;
};

/** A missing branch is legacy/unassigned and appears only in the aggregated view. */
export function isInBranch(record: BranchScoped, branchId: number | null): boolean {
  if (branchId === null) return true;
  return Number(record.branchId) === branchId;
}

const cents = (value: unknown) => Math.round((Number(value) || 0) * 100);

export function branchPerformance(
  branches: Branch[],
  jobs: BranchScoped[],
  expenses: BranchScoped[],
  selected: number | null = null,
): BranchPerformance {
  const visible = selected === null ? branches : branches.filter(branch => branch.id === selected);
  const rows = visible.map(branch => {
    const branchJobs = jobs.filter(job => Number(job.branchId) === branch.id);
    const branchExpenses = expenses.filter(expense => Number(expense.branchId) === branch.id);
    const revenueCents = branchJobs.reduce(
      (sum, job) => sum + cents(job.finalTotal ?? job.total),
      0,
    );
    const expensesCents = branchExpenses.reduce(
      (sum, expense) => sum + (Number(expense.amountCents) || 0),
      0,
    );
    return {
      branchId: branch.id,
      name: branch.name,
      code: branch.code,
      status: branch.status,
      jobs: branchJobs.length,
      completedJobs: branchJobs.filter(job => job.status === "completed").length,
      revenueCents,
      expensesCents,
      netCents: revenueCents - expensesCents,
    };
  });
  const totals = rows.reduce(
    (sum, row) => ({
      jobs: sum.jobs + row.jobs,
      completedJobs: sum.completedJobs + row.completedJobs,
      revenueCents: sum.revenueCents + row.revenueCents,
      expensesCents: sum.expensesCents + row.expensesCents,
      netCents: sum.netCents + row.netCents,
    }),
    { jobs: 0, completedJobs: 0, revenueCents: 0, expensesCents: 0, netCents: 0 },
  );
  return { branches: rows, totals };
}
