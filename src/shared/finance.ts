// Workspace finance rules shared by the analytics page, the job-sheet expense log and CSV
// exports. Revenue is only counted from completed moves, labor is derived from assigned crew
// rates and actual hours, and expenses are bucketed by category so fuel stays visible.
export type FinanceRange = "this_month" | "last_month" | "ytd";

export type FinanceBounds = {
  from: string;
  to: string;
  label: string;
};

export type FinanceJob = {
  id: number;
  title?: string;
  status?: string;
  moveDate?: string;
  total?: number;
  finalTotal?: number | null;
  crewIds?: number[];
  actualHours?: number | null;
  duration?: number;
};

export type FinanceCrewMember = {
  id: number;
  name?: string;
  hourlyRate?: number;
};

export type FinanceExpense = {
  id: number;
  jobId: number | null;
  category: string;
  amountCents: number;
  incurredDate: string;
  vendor: string;
  notes: string;
};

export type TripMargin = {
  jobId: number;
  title: string;
  moveDate: string;
  revenueCents: number;
  laborCents: number;
  expenseCents: number;
  netCents: number;
  marginPercent: number;
};

export type FinanceSummary = {
  range: FinanceRange;
  bounds: FinanceBounds;
  revenueCents: number;
  laborCents: number;
  fuelCents: number;
  otherExpenseCents: number;
  expenseCents: number;
  netCents: number;
  marginPercent: number;
  completedJobs: number;
  trips: TripMargin[];
  expenses: FinanceExpense[];
};

const COMPLETED = new Set(["completed"]);
const FUEL = /fuel|gas|mileage|diesel/i;
const pad = (value: number) => String(value).padStart(2, "0");
const key = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const round = (value: number, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

/** Local calendar-day key for a stored date or timestamp. */
export function dayKey(value: unknown): string {
  return typeof value === "string" ? value.slice(0, 10) : "";
}

export function inBounds(value: unknown, bounds: FinanceBounds): boolean {
  const day = dayKey(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && day >= bounds.from && day <= bounds.to;
}

export function financeBounds(range: FinanceRange, now = new Date()): FinanceBounds {
  if (range === "ytd")
    return { from: `${now.getFullYear()}-01-01`, to: key(now), label: "Year to date" };
  const start = new Date(now.getFullYear(), now.getMonth() + (range === "last_month" ? -1 : 0), 1);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
  return {
    from: key(start),
    to: key(end),
    label: range === "last_month" ? "Last month" : "This month",
  };
}

/** Billed revenue for a completed move; `finalTotal` wins once the invoice is locked. */
export function jobRevenueCents(job: FinanceJob): number {
  const value = Number(job.finalTotal ?? job.total ?? 0);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : 0;
}

/** Actual hours when the crew clocked the job, otherwise the booked duration. */
export function jobHours(job: FinanceJob): number {
  const actual = Number(job.actualHours);
  if (Number.isFinite(actual) && actual > 0) return actual;
  const booked = Number(job.duration);
  return Number.isFinite(booked) && booked > 0 ? booked : 0;
}

export function isFuelExpense(category: string): boolean {
  return FUEL.test(category);
}

export function laborCentsFor(
  job: FinanceJob,
  crew: FinanceCrewMember[],
  rates: Map<number, number> = new Map(
    crew.map((member) => [member.id, Number(member.hourlyRate) || 0]),
  ),
): number {
  const ids = Array.isArray(job.crewIds) ? job.crewIds : [];
  const hourly = ids.reduce((total, id) => total + (rates.get(id) ?? 0), 0);
  return Math.max(0, Math.round(hourly * jobHours(job) * 100));
}

export function financeSummary(input: {
  jobs: FinanceJob[];
  crew: FinanceCrewMember[];
  expenses: FinanceExpense[];
  range: FinanceRange;
  now?: Date;
}): FinanceSummary {
  const bounds = financeBounds(input.range, input.now);
  const rates = new Map(input.crew.map((member) => [member.id, Number(member.hourlyRate) || 0]));
  const completed = input.jobs.filter(
    (job) =>
      COMPLETED.has(String(job.status ?? "").toLowerCase()) && inBounds(job.moveDate, bounds),
  );
  const expenses = input.expenses
    .filter((expense) => inBounds(expense.incurredDate, bounds))
    .sort(
      (a, b) =>
        dayKey(b.incurredDate).localeCompare(dayKey(a.incurredDate)) || Number(b.id) - Number(a.id),
    );

  const expenseTotals = new Map<number, number>();
  let fuelCents = 0;
  let expenseCents = 0;
  for (const expense of expenses) {
    const amount = Math.max(0, Math.round(Number(expense.amountCents) || 0));
    expenseCents += amount;
    if (isFuelExpense(expense.category)) fuelCents += amount;
    if (expense.jobId)
      expenseTotals.set(expense.jobId, (expenseTotals.get(expense.jobId) ?? 0) + amount);
  }

  const trips = completed
    .map((job) => {
      const revenueCents = jobRevenueCents(job);
      const laborCents = laborCentsFor(job, input.crew, rates);
      const linked = expenseTotals.get(job.id) ?? 0;
      const netCents = revenueCents - laborCents - linked;
      return {
        jobId: job.id,
        title: String(job.title ?? "").trim() || `Job #${job.id}`,
        moveDate: dayKey(job.moveDate),
        revenueCents,
        laborCents,
        expenseCents: linked,
        netCents,
        marginPercent: revenueCents ? round((netCents / revenueCents) * 100, 1) : 0,
      };
    })
    .sort((a, b) => b.moveDate.localeCompare(a.moveDate));

  const revenueCents = trips.reduce((total, trip) => total + trip.revenueCents, 0);
  const laborCents = trips.reduce((total, trip) => total + trip.laborCents, 0);
  const netCents = revenueCents - laborCents - expenseCents;
  return {
    range: input.range,
    bounds,
    revenueCents,
    laborCents,
    fuelCents,
    otherExpenseCents: expenseCents - fuelCents,
    expenseCents,
    netCents,
    marginPercent: revenueCents ? round((netCents / revenueCents) * 100, 1) : 0,
    completedJobs: trips.length,
    trips,
    expenses,
  };
}

const dollars = (cents: number) => round(cents / 100, 2);

export function summaryCsvRows(summary: FinanceSummary): unknown[][] {
  return [
    ["Metric", "Value"],
    ["Range", `${summary.bounds.from} to ${summary.bounds.to}`],
    ["Completed moves", summary.completedJobs],
    ["Revenue (USD)", dollars(summary.revenueCents)],
    ["Labor (USD)", dollars(summary.laborCents)],
    ["Fuel (USD)", dollars(summary.fuelCents)],
    ["Other expenses (USD)", dollars(summary.otherExpenseCents)],
    ["Net profit (USD)", dollars(summary.netCents)],
    ["Net margin (%)", summary.marginPercent],
  ];
}

export function tripMarginCsvRows(summary: FinanceSummary): unknown[][] {
  return [
    [
      "Job",
      "Move date",
      "Revenue (USD)",
      "Labor (USD)",
      "Expenses (USD)",
      "Net (USD)",
      "Margin (%)",
    ],
    ...summary.trips.map((trip) => [
      trip.title,
      trip.moveDate,
      dollars(trip.revenueCents),
      dollars(trip.laborCents),
      dollars(trip.expenseCents),
      dollars(trip.netCents),
      trip.marginPercent,
    ]),
  ];
}

export function expenseCsvRows(expenses: FinanceExpense[]): unknown[][] {
  return [
    ["Date", "Vendor", "Category", "Related job", "Notes", "Amount (USD)"],
    ...expenses.map((expense) => [
      dayKey(expense.incurredDate),
      expense.vendor,
      expense.category,
      expense.jobId ?? "",
      expense.notes,
      dollars(expense.amountCents),
    ]),
  ];
}
