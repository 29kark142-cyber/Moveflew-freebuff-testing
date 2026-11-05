import { Plus, RefreshCw } from "lucide-react";
import { useState } from "react";
import type { Job } from "@shared/crm";
import type { Expense, ModuleProps } from "@shared/expansion";
import { crm } from "@/lib/crm";
import { useI18n } from "@/lib/i18n";
import {
  ErrorNotice,
  LoadingBlock,
  Modal,
  useRemote,
} from "@/components/workspace/WorkspaceUI";
import { ops } from "@/lib/ops-api";
import {
  canAccess,
  dateToday,
  dollarsToCents,
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

type ExpensesData = { expenses: Expense[]; jobs: Job[] };
const loadExpenses = async (): Promise<ExpensesData> => {
  const [expenses, jobs] = await Promise.all([ops.expenses(), crm.jobs()]);
  return { expenses, jobs };
};
export function ExpensesPage({ role }: ModuleProps) {
  const { t } = useI18n();
  if (!canAccess(role, officeFinanceRoles))
    return (
      <>
        <PageHead
          heading="Expenses"
          caption="Recorded operating expenses linked to saved jobs where applicable."
        />
        <PermissionNotice roles={officeFinanceRoles} />
      </>
    );
  return <ExpensesContent />;
}
function ExpensesContent() {
  const { t } = useI18n();
  const { data, loading, error, refresh } = useRemote(loadExpenses, []);
  const [open, setOpen] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const saved = async (message: string) => {
    await refresh();
    setSuccess(message);
  };
  if (loading) return <LoadingBlock label={t("Loading expenses…")} />;
  if (error || !data)
    return (
      <>
        <PageHead
          heading="Expenses"
          caption="Recorded operating expenses linked to saved jobs where applicable."
        />
        <ErrorNotice error={error} retry={() => void refresh()} />
      </>
    );
  return (
    <div className="ops">
      <PageHead
        heading="Expenses"
        caption="Actual expense records only; revenue and cash collection are tracked separately."
        actions={
          <>
            <button className="ws-btn" onClick={() => void refresh()}>
              <RefreshCw size={14} />
              {t("Refresh")}
            </button>
            <button className="ws-btn primary" onClick={() => setOpen(true)}>
              <Plus size={15} />
              {t("Add expense")}
            </button>
          </>
        }
      />
      <SuccessNotice message={success} />
      <section className="ws-card ws-card-pad">
        <SectionTitle
          title="Expense register"
          detail="Amounts are saved as cents and shown in your selected locale."
        />
        {data.expenses.length ? (
          <div className="ws-table-wrap">
            <table className="ws-table">
              <thead>
                <tr>
                  <th>{t("Date")}</th>
                  <th>{t("Vendor")}</th>
                  <th>{t("Category")}</th>
                  <th>{t("Related job")}</th>
                  <th>{t("Notes")}</th>
                  <th>{t("Amount")}</th>
                </tr>
              </thead>
              <tbody>
                {data.expenses.map(row => (
                  <tr key={row.id}>
                    <td>{shortDate(row.incurredDate)}</td>
                    <td className="ws-table-main">{row.vendor}</td>
                    <td>{row.category}</td>
                    <td>
                      {row.jobId
                        ? jobLabel(
                            data.jobs.find(job => job.id === row.jobId) || {
                              id: row.jobId,
                            }
                          )
                        : "—"}
                    </td>
                    <td>{row.notes || "—"}</td>
                    <td className="ops-money">{money(row.amountCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyRows
            title="No expenses"
            detail="Record a real expense when it is incurred."
          />
        )}
      </section>
      {open && (
        <ExpenseForm
          jobs={data.jobs}
          onClose={() => setOpen(false)}
          onSaved={saved}
        />
      )}
    </div>
  );
}
function ExpenseForm({
  jobs,
  onClose,
  onSaved,
}: {
  jobs: Job[];
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const [jobId, setJobId] = useState("");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [incurredDate, setIncurredDate] = useState(dateToday());
  const [vendor, setVendor] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountCents = dollarsToCents(amount);
    if (amountCents === null || amountCents < 0)
      return setError(
        t("Enter a valid expense amount with no more than two decimals.")
      );
    setSaving(true);
    setError("");
    try {
      await ops.createExpense({
        jobId: jobId ? Number(jobId) : null,
        category,
        amountCents,
        incurredDate,
        vendor,
        notes,
      });
      await onSaved("Expense saved.");
      onClose();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t("Could not save expense.")
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal title="Add expense" onClose={onClose}>
      <form className="ws-modal__body ops-form" onSubmit={submit}>
        <div className="ws-form-grid">
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
            <span>{t("Category")}</span>
            <input
              className="ws-input"
              required
              value={category}
              onChange={e => setCategory(e.target.value)}
            />
          </label>
          <label className="ws-field">
            <span>{t("Amount (USD)")}</span>
            <input
              className="ws-input"
              inputMode="decimal"
              required
              value={amount}
              onChange={e => setAmount(e.target.value)}
            />
          </label>
          <label className="ws-field">
            <span>{t("Incurred date")}</span>
            <input
              className="ws-input"
              type="date"
              required
              value={incurredDate}
              onChange={e => setIncurredDate(e.target.value)}
            />
          </label>
          <label className="ws-field full">
            <span>{t("Vendor")}</span>
            <input
              className="ws-input"
              required
              value={vendor}
              onChange={e => setVendor(e.target.value)}
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
        {error && <ErrorNotice error={new Error(error)} />}
        <div className="ops-form-actions">
          <button type="button" className="ws-btn" onClick={onClose}>
            {t("Cancel")}
          </button>
          <button className="ws-btn primary" disabled={saving}>
            {saving ? t("Saving…") : t("Save expense")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
