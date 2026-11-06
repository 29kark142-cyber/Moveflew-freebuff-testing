import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Plus, RefreshCw } from "lucide-react";
import type { ModuleProps } from "@shared/expansion";
import {
  expenseCsvRows,
  financeBounds,
  financeSummary,
  summaryCsvRows,
  tripMarginCsvRows,
  type FinanceRange,
} from "@shared/finance";
import { crm } from "@/lib/crm";
import { expensesApi } from "@/lib/expenses-api";
import { useI18n } from "@/lib/i18n";
import { ErrorNotice, LoadingBlock, useRemote } from "@/components/workspace/WorkspaceUI";
import {
  canAccess,
  downloadCsv,
  EmptyRows,
  money,
  officeFinanceRoles,
  PageHead,
  PermissionNotice,
  SectionTitle,
  shortDate,
} from "./operations-common";

const RANGES: { key: FinanceRange; label: string }[] = [
  { key: "this_month", label: "This Month" },
  { key: "last_month", label: "Last Month" },
  { key: "ytd", label: "YTD" },
];

const loadFinance = async () => {
  const [jobs, crew, expenses] = await Promise.all([crm.jobs(), crm.crew(), expensesApi.list()]);
  return { jobs, crew, expenses };
};

export default function FinancePage({ role }: ModuleProps) {
  const { t } = useI18n();
  if (!canAccess(role, officeFinanceRoles))
    return (
      <>
        <PageHead
          heading="Financial analytics"
          caption="Revenue, labor and trip margins for this workspace."
        />
        <PermissionNotice roles={officeFinanceRoles} />
      </>
    );
  return <FinanceContent />;
}

function FinanceContent() {
  const { t } = useI18n();
  const { data, loading, error, refresh } = useRemote(loadFinance, []);
  const [range, setRange] = useState<FinanceRange>("this_month");

  const summary = useMemo(
    () =>
      data
        ? financeSummary({
            jobs: data.jobs,
            crew: data.crew,
            expenses: data.expenses,
            range,
          })
        : null,
    [data, range],
  );

  const exportCsv = useCallback(() => {
    if (!summary) return;
    downloadCsv(`finance-${range}-${summary.bounds.from}-to-${summary.bounds.to}.csv`, [
      ...summaryCsvRows(summary),
      [],
      ["Trip margins"],
      ...tripMarginCsvRows(summary),
      [],
      ["Expense records"],
      ...expenseCsvRows(summary.expenses),
    ]);
  }, [range, summary]);

  if (loading) return <LoadingBlock label={t("Loading financials…")} />;
  if (error || !data || !summary)
    return (
      <>
        <PageHead
          heading="Financial analytics"
          caption="Revenue, labor and trip margins for this workspace."
        />
        <ErrorNotice error={error} retry={() => void refresh()} />
      </>
    );

  const metrics = [
    {
      label: "Revenue",
      value: money(summary.revenueCents),
      hint: `${summary.completedJobs} completed move${summary.completedJobs === 1 ? "" : "s"}`,
    },
    { label: "Labor", value: money(summary.laborCents), hint: "Assigned crew rates × hours" },
    { label: "Fuel", value: money(summary.fuelCents), hint: "Fuel and mileage expenses" },
    {
      label: "Other expenses",
      value: money(summary.otherExpenseCents),
      hint: "Tolls, wages, supplies, tips",
    },
    { label: "Net profit", value: money(summary.netCents), hint: "Revenue − labor − expenses" },
    { label: "Net margin", value: `${summary.marginPercent}%`, hint: "Of billed revenue" },
  ];

  return (
    <div className="ops">
      <PageHead
        heading="Financial analytics"
        caption="Completed-move revenue against logged crew hours and real expense records. Nothing is estimated beyond booked durations."
        actions={
          <>
            <button className="ws-btn" onClick={() => void refresh()}>
              <RefreshCw size={14} />
              {t("Refresh")}
            </button>
            <button
              className="ws-btn primary"
              onClick={exportCsv}
              disabled={!summary.trips.length && !summary.expenses.length}
            >
              <Download size={14} />
              {t("Export CSV")}
            </button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {RANGES.map((option) => (
          <button
            key={option.key}
            type="button"
            className={`ws-btn${range === option.key ? " primary" : ""}`}
            aria-pressed={range === option.key}
            onClick={() => setRange(option.key)}
          >
            {t(option.label)}
          </button>
        ))}
        <span className="text-xs text-muted-foreground">
          {summary.bounds.from} → {summary.bounds.to}
        </span>
      </div>

      <section className="ws-card ws-card-pad">
        <SectionTitle
          title="Margin summary"
          detail={`${summary.bounds.label} · ${financeBounds(range).label === summary.bounds.label ? "live workspace records" : "workspace records"}`}
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-xl border border-border p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t(metric.label)}
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                {metric.value}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{t(metric.hint)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="ws-card ws-card-pad">
        <SectionTitle
          title="Trip margins"
          detail="Only completed moves in the selected range; labor uses actual hours when the crew clocked the job."
        />
        {summary.trips.length ? (
          <div className="ws-table-wrap">
            <table className="ws-table">
              <thead>
                <tr>
                  <th>{t("Job")}</th>
                  <th>{t("Move date")}</th>
                  <th>{t("Revenue")}</th>
                  <th>{t("Labor")}</th>
                  <th>{t("Expenses")}</th>
                  <th>{t("Net")}</th>
                  <th>{t("Margin")}</th>
                </tr>
              </thead>
              <tbody>
                {summary.trips.map((trip) => (
                  <tr key={trip.jobId}>
                    <td className="ws-table-main">{trip.title}</td>
                    <td>{shortDate(trip.moveDate)}</td>
                    <td className="ops-money">{money(trip.revenueCents)}</td>
                    <td className="ops-money">{money(trip.laborCents)}</td>
                    <td className="ops-money">{money(trip.expenseCents)}</td>
                    <td className="ops-money">{money(trip.netCents)}</td>
                    <td className={trip.netCents < 0 ? "text-destructive" : ""}>
                      {trip.marginPercent}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyRows
            title="No completed moves in this range"
            detail="Complete a move or switch the date range to see trip margins."
          />
        )}
      </section>

      <section className="ws-card ws-card-pad">
        <SectionTitle
          title="Expense records"
          detail="Real logged expenses only. Add them from a job sheet or the Expenses page."
        />
        {summary.expenses.length ? (
          <div className="ws-table-wrap">
            <table className="ws-table">
              <thead>
                <tr>
                  <th>{t("Date")}</th>
                  <th>{t("Vendor")}</th>
                  <th>{t("Category")}</th>
                  <th>{t("Related job")}</th>
                  <th>{t("Amount")}</th>
                </tr>
              </thead>
              <tbody>
                {summary.expenses.map((expense) => (
                  <tr key={expense.id}>
                    <td>{shortDate(expense.incurredDate)}</td>
                    <td className="ws-table-main">{expense.vendor || "—"}</td>
                    <td>{expense.category}</td>
                    <td>{expense.jobId ? `#${expense.jobId}` : "—"}</td>
                    <td className="ops-money">{money(expense.amountCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyRows
            title="No expenses in this range"
            detail="Log fuel, tolls, wages and tips from a job sheet so margins stay accurate."
          />
        )}
        <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Plus size={13} />
          {t(
            "Expenses are recorded as real costs; deposits and payments are tracked under Billing.",
          )}
        </p>
      </section>
    </div>
  );
}
