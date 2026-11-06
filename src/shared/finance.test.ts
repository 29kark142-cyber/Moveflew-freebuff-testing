import { describe, expect, it } from "vitest";
import {
  expenseCsvRows,
  financeBounds,
  financeSummary,
  inBounds,
  isFuelExpense,
  jobHours,
  jobRevenueCents,
  summaryCsvRows,
  tripMarginCsvRows,
  type FinanceExpense,
  type FinanceJob,
} from "./finance";

const now = new Date(2026, 5, 15); // June 15, 2026

const crew = [
  { id: 1, name: "Marcus", hourlyRate: 30 },
  { id: 2, name: "Dana", hourlyRate: 20 },
];

const job = (patch: Partial<FinanceJob> = {}): FinanceJob => ({
  id: 1,
  title: "Maple St move",
  status: "completed",
  moveDate: "2026-06-10",
  total: 900,
  finalTotal: 1000,
  crewIds: [1, 2],
  actualHours: 4,
  ...patch,
});

const expense = (patch: Partial<FinanceExpense> = {}): FinanceExpense => ({
  id: 1,
  jobId: 1,
  category: "Fuel/mileage",
  amountCents: 5000,
  incurredDate: "2026-06-10",
  vendor: "Shell",
  notes: "",
  ...patch,
});

describe("finance ranges", () => {
  it("builds calendar bounds for each preset", () => {
    expect(financeBounds("this_month", now)).toMatchObject({
      from: "2026-06-01",
      to: "2026-06-30",
      label: "This month",
    });
    expect(financeBounds("last_month", now)).toMatchObject({
      from: "2026-05-01",
      to: "2026-05-31",
    });
    expect(financeBounds("ytd", now)).toMatchObject({ from: "2026-01-01", to: "2026-06-15" });
  });

  it("matches stored dates and timestamps inside the range only", () => {
    const bounds = financeBounds("this_month", now);
    expect(inBounds("2026-06-01", bounds)).toBe(true);
    expect(inBounds("2026-06-30T18:00:00.000Z", bounds)).toBe(true);
    expect(inBounds("2026-07-01", bounds)).toBe(false);
    expect(inBounds("", bounds)).toBe(false);
  });
});

describe("job revenue and labor", () => {
  it("prefers the locked final total and ignores negative or missing amounts", () => {
    expect(jobRevenueCents(job())).toBe(100000);
    expect(jobRevenueCents(job({ finalTotal: null }))).toBe(90000);
    expect(jobRevenueCents(job({ finalTotal: -5, total: 0 }))).toBe(0);
  });

  it("uses actual hours, then the booked duration", () => {
    expect(jobHours(job())).toBe(4);
    expect(jobHours(job({ actualHours: null, duration: 6 }))).toBe(6);
    expect(jobHours(job({ actualHours: null, duration: 0 }))).toBe(0);
  });

  it("buckets fuel-like categories", () => {
    expect(isFuelExpense("Fuel/mileage")).toBe(true);
    expect(isFuelExpense("Diesel")).toBe(true);
    expect(isFuelExpense("Tolls")).toBe(false);
    expect(isFuelExpense("Crew wages")).toBe(false);
  });
});

describe("finance summary", () => {
  it("derives revenue, labor, fuel, expenses and net margin", () => {
    const summary = financeSummary({
      jobs: [
        job(),
        job({
          id: 2,
          status: "completed",
          moveDate: "2026-06-12",
          finalTotal: 500,
          crewIds: [1],
          actualHours: 2,
        }),
      ],
      crew,
      expenses: [
        expense(),
        expense({
          id: 2,
          category: "Tolls",
          amountCents: 1500,
          jobId: 2,
          incurredDate: "2026-06-12",
        }),
        expense({
          id: 3,
          jobId: null,
          category: "Fuel",
          amountCents: 3000,
          incurredDate: "2026-06-02",
        }),
      ],
      range: "this_month",
      now,
    });

    expect(summary.completedJobs).toBe(2);
    expect(summary.revenueCents).toBe(150000);
    // 4h x ($30 + $20) = $200; 2h x $30 = $60
    expect(summary.laborCents).toBe(26000);
    expect(summary.fuelCents).toBe(8000);
    expect(summary.otherExpenseCents).toBe(1500);
    expect(summary.expenseCents).toBe(9500);
    expect(summary.netCents).toBe(114500);
    expect(summary.marginPercent).toBe(76.3);
    expect(summary.trips[0]).toMatchObject({
      jobId: 2,
      revenueCents: 50000,
      laborCents: 6000,
      expenseCents: 1500,
      netCents: 42500,
    });
    expect(summary.expenses.map((row) => row.id)).toEqual([2, 1, 3]);
  });

  it("excludes open jobs and out-of-range records", () => {
    const summary = financeSummary({
      jobs: [
        job({ id: 1, status: "booked" }),
        job({ id: 2, moveDate: "2026-05-31" }),
        job({ id: 3, title: "", moveDate: "2026-06-01" }),
      ],
      crew,
      expenses: [expense({ id: 1, incurredDate: "2026-05-31" })],
      range: "this_month",
      now,
    });
    expect(summary.completedJobs).toBe(1);
    expect(summary.revenueCents).toBe(100000);
    expect(summary.expenses).toEqual([]);
    expect(summary.trips[0]?.title).toBe("Job #3");
  });

  it("never divides by zero when a completed move billed nothing", () => {
    const summary = financeSummary({
      jobs: [job({ total: 0, finalTotal: 0, crewIds: [], actualHours: 3 })],
      crew,
      expenses: [],
      range: "this_month",
      now,
    });
    expect(summary.marginPercent).toBe(0);
    expect(summary.laborCents).toBe(0);
    expect(summary.netCents).toBe(0);
  });
});

describe("finance CSV rows", () => {
  const summary = financeSummary({
    jobs: [job()],
    crew,
    expenses: [expense()],
    range: "this_month",
    now,
  });

  it("exports summary, trip and expense tables with numeric money", () => {
    expect(summaryCsvRows(summary)).toContainEqual(["Revenue (USD)", 1000]);
    expect(tripMarginCsvRows(summary)[1]).toEqual([
      "Maple St move",
      "2026-06-10",
      1000,
      200,
      50,
      750,
      75,
    ]);
    expect(expenseCsvRows(summary.expenses)[1]).toEqual([
      "2026-06-10",
      "Shell",
      "Fuel/mileage",
      1,
      "",
      50,
    ]);
  });
});
