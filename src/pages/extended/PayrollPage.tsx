import RecordZellePayout from "../workers/RecordZellePayout";
import { Download, Edit3, Plus, Printer, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { CrewMember, Job } from "@shared/crm";
import type { ModuleProps, Timecard, Tip } from "@shared/expansion";
import { crm } from "@/lib/crm";
import { useI18n } from "@/lib/i18n";
import { workersApi } from "@/lib/workers-api";
import {
  ErrorNotice,
  LoadingBlock,
  Modal,
  StatusChip,
  useRemote,
} from "@/components/workspace/WorkspaceUI";
import { ops, type PayrollReport } from "@/lib/ops-api";
import {
  canAccess,
  dateToday,
  dollarsToCents,
  downloadCsv,
  EmptyRows,
  jobLabel,
  money,
  officeFinanceRoles,
  PageHead,
  PermissionNotice,
  SectionTitle,
  shortDate,
  SuccessNotice,
} from "./operations-common";

type Tab = "timecards" | "payroll" | "tips" | "payouts";
type PayrollData = {
  timecards: Timecard[];
  tips: Tip[];
  crew: CrewMember[];
  jobs: Job[];
  report: PayrollReport;
};
function monday(value = new Date()) {
  const next = new Date(value);
  const day = (next.getDay() + 6) % 7;
  next.setDate(next.getDate() - day);
  return next.toISOString().slice(0, 10);
}
function weekEnd(from: string) {
  const date = new Date(`${from}T12:00:00`);
  date.setDate(date.getDate() + 6);
  return date.toISOString().slice(0, 10);
}
const loadPayroll = async (from: string, to: string): Promise<PayrollData> => {
  const [timecards, tips, crew, jobs, report] = await Promise.all([
    ops.timecards(),
    ops.tips(),
    crm.crew(),
    crm.jobs(),
    ops.payroll(from, to),
  ]);
  return { timecards, tips, crew, jobs, report };
};

export function PayrollPage({ role }: ModuleProps) {
  const { t } = useI18n();
  if (!canAccess(role, officeFinanceRoles))
    return (
      <>
        <PageHead
          heading="Payroll"
          caption="Individual timecards, weekly review totals, and manual tip allocation."
        />
        <PermissionNotice roles={officeFinanceRoles} />
      </>
    );
  return <PayrollContent role={role} />;
}
function PayrollContent({ role }: { role: ModuleProps["role"] }) {
  const { t } = useI18n();
  const [from, setFrom] = useState(monday());
  const to = weekEnd(from);
  const { data, loading, error, refresh } = useRemote(
    () => loadPayroll(from, to),
    [from, to]
  );
  const [tab, setTab] = useState<Tab>("timecards");
  const [edit, setEdit] = useState<Timecard | null | undefined>();
  const [newTip, setNewTip] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const saved = async (message: string) => {
    await refresh();
    setSuccess(message);
  };
  if (loading) return <LoadingBlock label={t("Loading payroll records…")} />;
  if (error || !data)
    return (
      <>
        <PageHead
          heading="Payroll"
          caption="Individual timecards, weekly review totals, and manual tip allocation."
        />
        <ErrorNotice error={error} retry={() => void refresh()} />
      </>
    );
  return (
    <div className="ops">
      <PageHead
        heading="Payroll"
        caption="Time is reviewed independently from customer-billed job time."
        actions={
          <button className="ws-btn" onClick={() => void refresh()}>
            <RefreshCw size={14} />
            {t("Refresh")}
          </button>
        }
      />
      <SuccessNotice message={success} />
      <nav className="ops-tabs" aria-label={t("Payroll sections")}>
        {(
          [
            ["timecards", "Timecards"],
            ["payroll", "Weekly review"],
            ["tips", "Tips"],
            ["payouts", "Payouts"],
          ] as Array<[Tab, string]>
        ).map(([value, label]) => (
          <button
            key={value}
            className={tab === value ? "active" : ""}
            onClick={() => setTab(value)}
          >
            {t(label)}
          </button>
        ))}
      </nav>
      {tab === "timecards" && (
        <Timecards
          rows={data.timecards}
          canCreate={data.crew.length > 0}
          onNew={() => setEdit(null)}
          onEdit={setEdit}
        />
      )}{" "}
      {tab === "payroll" && (
        <PayrollReview
          report={data.report}
          from={from}
          to={to}
          onFrom={setFrom}
        />
      )}{" "}
      {tab === "tips" && (
        <TipsTab
          tips={data.tips}
          jobs={data.jobs}
          crew={data.crew}
          onNew={() => setNewTip(true)}
        />
      )}{" "}
      {tab === "payouts" && (
        <RecordZellePayout crew={data.crew} onRecorded={saved} />
      )}{" "}
      {edit !== undefined && (
        <TimecardForm
          row={edit}
          crew={data.crew}
          jobs={data.jobs}
          role={role}
          onClose={() => setEdit(undefined)}
          onSaved={saved}
        />
      )}{" "}
      {newTip && (
        <TipForm
          crew={data.crew}
          jobs={data.jobs}
          onClose={() => setNewTip(false)}
          onSaved={saved}
        />
      )}
    </div>
  );
}
function Timecards({
  rows,
  canCreate,
  onNew,
  onEdit,
}: {
  rows: Timecard[];
  canCreate: boolean;
  onNew: () => void;
  onEdit: (row: Timecard) => void;
}) {
  const { t } = useI18n();
  return (
    <section className="ws-card ws-card-pad">
      <SectionTitle
        title="Individual timecards"
        detail="Crew minutes, breaks, rates, and approvals are separate from raw customer-billed job time."
        action={
          <button
            className="ws-btn primary"
            disabled={!canCreate}
            title={!canCreate ? t("Add a crew member first") : undefined}
            onClick={onNew}
          >
            <Plus size={15} />
            {t("Add timecard")}
          </button>
        }
      />
      {rows.length ? (
        <div className="ws-table-wrap">
          <table className="ws-table">
            <thead>
              <tr>
                <th>{t("Crew member")}</th>
                <th>{t("Work date")}</th>
                <th>{t("Minutes")}</th>
                <th>{t("Break")}</th>
                <th>{t("Rate")}</th>
                <th>{t("Approved")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id}>
                  <td className="ws-table-main">
                    {row.crewName}
                    <small>
                      {row.jobId
                        ? `${t("Job")} #${row.jobId}`
                        : t("Not job-linked")}
                    </small>
                  </td>
                  <td>{shortDate(row.workDate)}</td>
                  <td>{row.minutes}</td>
                  <td>{row.breakMinutes}</td>
                  <td className="ops-money">
                    {money(row.rateCents)}
                    <small>{t("per hour")}</small>
                  </td>
                  <td>
                    <StatusChip
                      status={row.approved ? "approved" : "pending"}
                    />
                    {row.paidMethod === "zelle" && (
                      <small className="worker-paid-badge">
                        {t("Paid via Zelle")}
                      </small>
                    )}
                  </td>
                  <td>
                    <button
                      className="ws-icon-btn"
                      title={row.payoutId ? t("Paid via Zelle") : t("Edit")}
                      disabled={Boolean(row.payoutId)}
                      onClick={() => onEdit(row)}
                    >
                      <Edit3 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyRows
          title="No timecards"
          detail="Add actual crew work time for review."
        />
      )}
    </section>
  );
}
function PayrollReview({
  report,
  from,
  to,
  onFrom,
}: {
  report: PayrollReport;
  from: string;
  to: string;
  onFrom: (date: string) => void;
}) {
  const { t } = useI18n();
  const csv = () =>
    downloadCsv(`payroll-${from}-to-${to}.csv`, [
      [
        t("Crew member"),
        t("Regular minutes"),
        t("Overtime minutes"),
        t("Rate (USD)"),
        t("Regular pay (USD)"),
        t("Overtime pay (USD)"),
        t("Tips (USD)"),
        t("Total (USD)"),
      ],
      ...report.rows.map(row => [
        row.name,
        row.regularMinutes,
        row.overtimeMinutes,
        money(row.rateCents),
        money(row.regularPayCents),
        money(row.overtimePayCents),
        money(row.tipCents),
        money(row.totalCents),
      ]),
    ]);
  return (
    <section className="ws-card ws-card-pad">
      <SectionTitle
        title="Weekly payroll review"
        detail="Actual approved payroll data. The server applies 40-hour calendar-week and 1.5× overtime review rules."
        action={
          <div className="ws-row-actions ops-no-print">
            <button className="ws-btn" onClick={csv}>
              <Download size={14} />
              {t("Export CSV")}
            </button>
            <button className="ws-btn" onClick={() => window.print()}>
              <Printer size={14} />
              {t("Print")}
            </button>
          </div>
        }
      />
      <div className="ops-inline-form ops-no-print">
        <label className="ws-field">
          <span>{t("Week starting")}</span>
          <input
            className="ws-input"
            type="date"
            value={from}
            onChange={e => onFrom(e.target.value)}
          />
        </label>
        <span className="ops-meta">
          {t("Through")} {shortDate(to)}
        </span>
      </div>
      <div className="ops-summary">
        <div>
          <small>{t("Period")}</small>
          <b>
            {shortDate(from)} — {shortDate(to)}
          </b>
        </div>
        <div>
          <small>{t("Crew rows")}</small>
          <b>{report.rows.length}</b>
        </div>
        <div>
          <small>{t("Total")}</small>
          <b className="ops-money">{money(report.totalCents)}</b>
        </div>
      </div>
      {report.rows.length ? (
        <div className="ws-table-wrap">
          <table className="ws-table">
            <thead>
              <tr>
                <th>{t("Crew member")}</th>
                <th>{t("Regular")}</th>
                <th>{t("Overtime")}</th>
                <th>{t("Rate")}</th>
                <th>{t("Regular pay")}</th>
                <th>{t("Overtime pay")}</th>
                <th>{t("Tips")}</th>
                <th>{t("Total")}</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map(row => (
                <tr key={row.crewMemberId}>
                  <td className="ws-table-main">{row.name}</td>
                  <td>
                    {row.regularMinutes} {t("min")}
                  </td>
                  <td>
                    {row.overtimeMinutes} {t("min")}
                  </td>
                  <td className="ops-money">{money(row.rateCents)}</td>
                  <td className="ops-money">{money(row.regularPayCents)}</td>
                  <td className="ops-money">{money(row.overtimePayCents)}</td>
                  <td className="ops-money">{money(row.tipCents)}</td>
                  <td className="ops-money">
                    <b>{money(row.totalCents)}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyRows
          title="No payroll rows"
          detail="There are no payroll records for the selected period."
        />
      )}
      <p className="ops-legal-note">
        {report.disclaimer ||
          t(
            "Review totals only; no tax withholding, disbursement, or employment classification determination is made here."
          )}
      </p>
    </section>
  );
}
function TipsTab({
  tips,
  jobs,
  crew,
  onNew,
}: {
  tips: Tip[];
  jobs: Job[];
  crew: CrewMember[];
  onNew: () => void;
}) {
  const { t } = useI18n();
  const crewName = (id: number) =>
    crew.find(row => row.id === id)?.name || `#${id}`;
  return (
    <section className="ws-card ws-card-pad">
      <SectionTitle
        title="Manual tip allocation"
        detail="Each saved allocation must exactly match the manual tip amount and assigned job crew."
        action={
          <button
            className="ws-btn primary"
            disabled={!jobs.some(job => job.crewIds.length)}
            onClick={onNew}
          >
            <Plus size={15} />
            {t("Allocate tip")}
          </button>
        }
      />
      <p className="ops-legal-note">
        {t(
          "This is record-only manual tip allocation. A digital tip invoice is allocated only after independently verified payment."
        )}
      </p>
      {tips.length ? (
        <div className="ws-table-wrap">
          <table className="ws-table">
            <thead>
              <tr>
                <th>{t("Job")}</th>
                <th>{t("Method")}</th>
                <th>{t("Amount")}</th>
                <th>{t("Allocations")}</th>
              </tr>
            </thead>
            <tbody>
              {tips.map(tip => (
                <tr key={tip.id}>
                  <td>
                    {jobLabel(
                      jobs.find(job => job.id === tip.jobId) || {
                        id: tip.jobId,
                      }
                    )}
                  </td>
                  <td>{tip.method}</td>
                  <td className="ops-money">{money(tip.amountCents)}</td>
                  <td>
                    {tip.allocations
                      .map(
                        row =>
                          `${crewName(row.crewMemberId)}: ${money(row.amountCents)}${row.paidMethod === "zelle" ? ` · ${t("Paid via Zelle")}` : ""}`
                      )
                      .join(" · ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyRows
          title="No tips recorded"
          detail="Allocate a manual tip against a job with assigned crew."
        />
      )}
    </section>
  );
}
function TimecardForm({
  row,
  crew,
  jobs,
  role,
  onClose,
  onSaved,
}: {
  row: Timecard | null;
  crew: CrewMember[];
  jobs: Job[];
  role: ModuleProps["role"];
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const [crewMemberId, setCrewMemberId] = useState(
    String(row?.crewMemberId || crew[0]?.id || "")
  );
  const [jobId, setJobId] = useState(row?.jobId ? String(row.jobId) : "");
  const [workDate, setWorkDate] = useState(row?.workDate || dateToday());
  const [minutes, setMinutes] = useState(String(row?.minutes || ""));
  const [breakMinutes, setBreakMinutes] = useState(
    String(row?.breakMinutes || 0)
  );
  const [rate, setRate] = useState(
    row ? (row.rateCents / 100).toFixed(2) : String(crew[0]?.hourlyRate || "")
  );
  const [notes, setNotes] = useState(row?.notes || "");
  const [approved, setApproved] = useState(row?.approved || false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const admin = role === "admin";
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const rateCents = dollarsToCents(rate),
      worked = Number(minutes),
      breaks = Number(breakMinutes);
    if (
      rateCents === null ||
      rateCents < 0 ||
      !Number.isInteger(worked) ||
      worked < 0 ||
      !Number.isInteger(breaks) ||
      breaks < 0
    )
      return setError(
        t("Use whole non-negative minutes and a valid hourly dollar rate.")
      );
    setSaving(true);
    setError("");
    try {
      const value = {
        crewMemberId: Number(crewMemberId),
        jobId: jobId ? Number(jobId) : null,
        workDate,
        minutes: worked,
        breakMinutes: breaks,
        rateCents,
        notes,
        approved: admin ? approved : false,
      };
      row
        ? await ops.updateTimecard(row.id, value)
        : await ops.createTimecard(value);
      await onSaved(row ? "Timecard updated." : "Timecard saved.");
      onClose();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t("Could not save timecard.")
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      title={row ? "Edit timecard" : "Add timecard"}
      onClose={onClose}
      wide
    >
      <form className="ws-modal__body ops-form" onSubmit={submit}>
        <div className="ws-form-grid">
          <label className="ws-field">
            <span>{t("Crew member")}</span>
            <select
              className="ws-select"
              value={crewMemberId}
              onChange={e => setCrewMemberId(e.target.value)}
            >
              {crew.map(member => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>
          <label className="ws-field">
            <span>{t("Related job")}</span>
            <select
              className="ws-select"
              value={jobId}
              onChange={e => setJobId(e.target.value)}
            >
              <option value="">{t("No related job")}</option>
              {jobs.map(job => (
                <option key={job.id} value={job.id}>
                  {jobLabel(job)}
                </option>
              ))}
            </select>
          </label>
          <label className="ws-field">
            <span>{t("Work date")}</span>
            <input
              className="ws-input"
              type="date"
              required
              value={workDate}
              onChange={e => setWorkDate(e.target.value)}
            />
          </label>
          <label className="ws-field">
            <span>{t("Worked minutes")}</span>
            <input
              className="ws-input"
              type="number"
              min="0"
              required
              value={minutes}
              onChange={e => setMinutes(e.target.value)}
            />
          </label>
          <label className="ws-field">
            <span>{t("Break minutes")}</span>
            <input
              className="ws-input"
              type="number"
              min="0"
              required
              value={breakMinutes}
              onChange={e => setBreakMinutes(e.target.value)}
            />
          </label>
          <label className="ws-field">
            <span>{t("Hourly rate (USD)")}</span>
            <input
              className="ws-input"
              inputMode="decimal"
              required
              value={rate}
              onChange={e => setRate(e.target.value)}
            />
          </label>
        </div>
        <label className="ws-field">
          <span>{t("Notes")}</span>
          <textarea
            className="ws-textarea"
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </label>
        {admin ? (
          <label className="ws-checkbox">
            <input
              type="checkbox"
              checked={approved}
              onChange={e => setApproved(e.target.checked)}
            />
            <span>{t("Admin approval")}</span>
          </label>
        ) : (
          <p className="ops-meta">
            {t(
              "Only an Admin can set the approval checkbox. This timecard will remain unapproved."
            )}
          </p>
        )}
        {error && <ErrorNotice error={new Error(error)} />}
        <div className="ops-form-actions">
          <button type="button" className="ws-btn" onClick={onClose}>
            {t("Cancel")}
          </button>
          <button className="ws-btn primary" disabled={saving}>
            {saving ? t("Saving…") : t("Save timecard")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function TipForm({
  crew,
  jobs,
  onClose,
  onSaved,
}: {
  crew: CrewMember[];
  jobs: Job[];
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const validJobs = jobs.filter(job => job.crewIds.length);
  const [jobId, setJobId] = useState(String(validJobs[0]?.id || ""));
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [allocations, setAllocations] = useState<Record<number, string>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const job = jobs.find(item => item.id === Number(jobId));
  const assigned = crew.filter(member => job?.crewIds.includes(member.id));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountCents = dollarsToCents(amount);
    const rows = assigned.map(member => ({
      crewMemberId: member.id,
      amountCents: dollarsToCents(allocations[member.id] || ""),
    }));
    if (amountCents === null || amountCents <= 0 || !method.trim())
      return setError(t("Enter a positive amount and payment method."));
    if (
      rows.some(row => row.amountCents === null || row.amountCents < 0) ||
      rows.reduce((sum, row) => sum + Number(row.amountCents), 0) !==
        amountCents
    )
      return setError(
        t("Assigned crew allocations must equal the tip amount exactly.")
      );
    setSaving(true);
    setError("");
    try {
      await ops.createTip({
        jobId: Number(jobId),
        amountCents,
        method: method.trim(),
        allocations: rows as Array<{
          crewMemberId: number;
          amountCents: number;
        }>,
      });
      await onSaved("Tip allocation saved.");
      onClose();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t("Could not save tip allocation.")
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal title="Allocate manual tip" onClose={onClose}>
      <form className="ws-modal__body ops-form" onSubmit={submit}>
        <label className="ws-field">
          <span>{t("Job")}</span>
          <select
            className="ws-select"
            value={jobId}
            onChange={e => {
              setJobId(e.target.value);
              setAllocations({});
            }}
          >
            {validJobs.map(item => (
              <option key={item.id} value={item.id}>
                {jobLabel(item)}
              </option>
            ))}
          </select>
        </label>
        <div className="ws-form-grid">
          <label className="ws-field">
            <span>{t("Tip amount (USD)")}</span>
            <input
              className="ws-input"
              inputMode="decimal"
              required
              value={amount}
              onChange={e => setAmount(e.target.value)}
            />
          </label>
          <label className="ws-field">
            <span>{t("Method")}</span>
            <input
              className="ws-input"
              required
              value={method}
              onChange={e => setMethod(e.target.value)}
            />
          </label>
        </div>
        <div>
          <b>{t("Assigned crew allocation")}</b>
          {assigned.map(member => (
            <label className="ws-field" key={member.id}>
              <span>{member.name}</span>
              <input
                className="ws-input"
                inputMode="decimal"
                placeholder={t("USD amount")}
                value={allocations[member.id] || ""}
                onChange={e =>
                  setAllocations({
                    ...allocations,
                    [member.id]: e.target.value,
                  })
                }
              />
            </label>
          ))}
        </div>
        {error && <ErrorNotice error={new Error(error)} />}
        <div className="ops-form-actions">
          <button type="button" className="ws-btn" onClick={onClose}>
            {t("Cancel")}
          </button>
          <button className="ws-btn primary" disabled={saving}>
            {saving ? t("Saving…") : t("Save allocation")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
