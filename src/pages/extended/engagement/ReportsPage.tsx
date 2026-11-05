import { Download, RefreshCw } from "lucide-react";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ModuleProps } from "@shared/expansion";
import { useI18n } from "@/lib/i18n";
import { EmptyState, useRemote } from "@/components/workspace/WorkspaceUI";
import { engage } from "@/lib/engage-api";
import {
  PageFailure,
  PageHead,
  PageLoading,
  cents,
  downloadSafeCsv,
  monthBounds,
} from "./EngagementUI";

export function ReportsPage(_props: ModuleProps) {
  const { t } = useI18n();
  const initial = monthBounds(new Date().toISOString().slice(0, 7));
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [applied, setApplied] = useState(initial);
  const {
    data: report,
    loading,
    error,
    refresh,
  } = useRemote(
    () => engage.reports(applied.from, applied.to),
    [applied.from, applied.to]
  );
  if (loading) return <PageLoading label="Loading live reporting data…" />;
  if (error || !report)
    return (
      <PageFailure
        heading="Reports"
        caption="Actual workspace records for the selected dates."
        error={error}
        retry={() => void refresh()}
      />
    );
  const exportRows = report.records || [];
  return (
    <>
      <PageHead
        heading="Reports"
        caption="Revenue, costs, and attribution calculated from actual records in the selected period."
        actions={
          <>
            <label className="eg-date-filter">
              {t("From")}
              <input
                className="ws-input"
                type="date"
                value={from}
                onChange={event => setFrom(event.target.value)}
              />
            </label>
            <label className="eg-date-filter">
              {t("To")}
              <input
                className="ws-input"
                type="date"
                value={to}
                onChange={event => setTo(event.target.value)}
              />
            </label>
            <button className="ws-btn" onClick={() => setApplied({ from, to })}>
              <RefreshCw size={14} />
              {t("Apply dates")}
            </button>
            <button
              className="ws-btn"
              disabled={!exportRows.length}
              onClick={() =>
                downloadSafeCsv(
                  `engagement-records-${applied.from}-to-${applied.to}.csv`,
                  exportRows
                )
              }
            >
              <Download size={14} />
              {t("Export actual records")}
            </button>
          </>
        }
      />
      {!exportRows.length && (
        <p className="eg-muted eg-export-note">
          {t(
            "Record-level CSV export is available when the reporting API returns filtered records; no record-level rows were returned for this period."
          )}
        </p>
      )}
      <section className="eg-kpi-grid">
        <Kpi
          label="Leads"
          value={String(report.kpis.leads)}
          detail="Saved customer leads"
        />
        <Kpi
          label="Booked"
          value={String(report.kpis.booked)}
          detail="Booked jobs in date range"
        />
        <Kpi
          label="Completed"
          value={String(report.kpis.completed)}
          detail="Completed jobs in date range"
        />
        <Kpi
          label="Estimated revenue"
          value={cents(report.kpis.estimatedRevenueCents)}
          detail="Saved estimate totals"
        />
        <Kpi
          label="Collected revenue"
          value={cents(report.kpis.collectedRevenueCents)}
          detail="Recorded collections only"
        />
        <Kpi
          label="Recorded expenses"
          value={cents(report.kpis.expenseCents)}
          detail="Expense records in date range"
        />
        <Kpi
          label="Net contribution"
          value={cents(report.kpis.netContributionCents)}
          detail="Estimated revenue contribution, not audited profit"
          emphasis
        />
      </section>
      <p className="eg-disclaimer">
        {t(
          "Net contribution is an estimate based on recorded revenue and expenses. It excludes unmodeled costs and is not a profit, tax, or financial-statement figure."
        )}
      </p>
      <div className="ws-grid eg-report-grid">
        <section className="ws-card ws-card-pad">
          <div className="ws-card-title">
            <div>
              <h2>{t("Funnel")}</h2>
              <p>{t("Counts by saved customer stage.")}</p>
            </div>
          </div>
          {report.funnel.length ? (
            <div className="eg-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={report.funnel}>
                  <CartesianGrid vertical={false} stroke="#e9eef4" />
                  <XAxis dataKey="stage" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar
                    dataKey="count"
                    name={t("Customers")}
                    fill="#0877eb"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              title="No funnel data"
              detail="Saved customer stages in this date range will appear here."
            />
          )}
        </section>
        <section className="ws-card ws-card-pad">
          <div className="ws-card-title">
            <div>
              <h2>{t("Revenue by month")}</h2>
              <p>{t("Booked and collected values use recorded cents.")}</p>
            </div>
          </div>
          {report.months.length ? (
            <div className="eg-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={report.months}>
                  <CartesianGrid vertical={false} stroke="#e9eef4" />
                  <XAxis dataKey="month" />
                  <YAxis tickFormatter={value => cents(value)} />
                  <Tooltip formatter={(value: number) => cents(value)} />
                  <Legend />
                  <Bar
                    dataKey="bookedCents"
                    name={t("Booked revenue")}
                    fill="#31b3ed"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="collectedCents"
                    name={t("Collected revenue")}
                    fill="#0877eb"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              title="No monthly revenue data"
              detail="Actual booked and collected records will populate this chart."
            />
          )}
        </section>
      </div>
      <section className="ws-card ws-card-pad eg-source-table">
        <div className="ws-card-title">
          <div>
            <h2>{t("Source attribution")}</h2>
            <p>
              {t(
                report.attributionBasis || report.basis?.attribution ||
                  "Source metrics reflect saved lead source and recorded campaign spend, not third-party advertising claims."
              )}
            </p>
          </div>
        </div>
        <div className="ws-table-wrap">
          <table className="ws-table">
            <thead>
              <tr>
                <th>{t("Source")}</th>
                <th>{t("Leads")}</th>
                <th>{t("Booked")}</th>
                <th>{t("Collected revenue")}</th>
                <th>{t("Spend")}</th>
                <th>{t("Cost per lead")}</th>
                <th>{t("ROAS")}</th>
              </tr>
            </thead>
            <tbody>
              {report.sources.map(row => (
                <tr key={row.source}>
                  <td className="ws-table-main">{row.source || "—"}</td>
                  <td>{row.leads}</td>
                  <td>{row.booked}</td>
                  <td>{cents(row.collectedCents)}</td>
                  <td>{cents(row.spendCents)}</td>
                  <td>
                    {row.costPerLeadCents === null
                      ? "—"
                      : cents(row.costPerLeadCents)}
                  </td>
                  <td>{row.roas === null ? "—" : row.roas.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!report.sources.length && (
          <EmptyState
            title="No source metrics"
            detail="Campaign spend and saved lead source data will appear when recorded."
          />
        )}
      </section>
    </>
  );
}

function Kpi({
  label,
  value,
  detail,
  emphasis = false,
}: {
  label: string;
  value: string;
  detail: string;
  emphasis?: boolean;
}) {
  const { t } = useI18n();
  return (
    <article className={`ws-card eg-kpi ${emphasis ? "eg-kpi--emphasis" : ""}`}>
      <span>{t(label)}</span>
      <b>{value}</b>
      <small>{t(detail)}</small>
    </article>
  );
}

export default ReportsPage;
