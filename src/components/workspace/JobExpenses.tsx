import { useCallback, useEffect, useState } from "react";
import { Plus, ReceiptText } from "lucide-react";
import { toast } from "sonner";
import type { FinanceExpense } from "@shared/finance";
import { expensesApi } from "@/lib/expenses-api";

const money = (cents: number) =>
  (Number(cents) || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });

const CATEGORIES = ["Crew wages", "Fuel/mileage", "Tolls", "Tips", "Supplies", "Other"];
const EDIT_ROLES = ["admin", "office_admin", "dispatcher"];

const todayKey = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
};

const shortDate = (value: string) => {
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : "—";
};

/**
 * Job-sheet expense log. Each row is a real saved cost linked to this job, so the finance
 * page can subtract it from the trip margin without duplicating payroll or fuel data.
 */
export default function JobExpenses({ jobId, role }: { jobId: number; role: string }) {
  const canEdit = EDIT_ROLES.includes(role);
  const [rows, setRows] = useState<FinanceExpense[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    category: CATEGORIES[1],
    amount: "",
    vendor: "",
    incurredDate: todayKey(),
    notes: "",
  });

  const load = useCallback(async () => {
    try {
      const all = await expensesApi.list();
      setRows(all.filter((row) => row.jobId === jobId));
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load expenses");
    }
  }, [jobId]);

  useEffect(() => {
    void load();
  }, [load]);

  const total = (rows ?? []).reduce((sum, row) => sum + row.amountCents, 0);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error("Enter a valid expense amount.");
      return;
    }
    setSaving(true);
    try {
      const saved = await expensesApi.create({
        jobId,
        category: form.category,
        amountCents: Math.round(amount * 100),
        incurredDate: form.incurredDate,
        vendor: form.vendor.trim(),
        notes: form.notes.trim(),
      });
      setRows((current) => [saved, ...(current ?? [])]);
      setForm((current) => ({ ...current, amount: "", vendor: "", notes: "" }));
      setOpen(false);
      toast.success("Expense saved to this job");
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not save expense");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="ws-card ws-card-pad" data-tour="job-expenses">
      <div className="ws-card-title">
        <div>
          <h2>Job expenses</h2>
          <p>Fuel, tolls, crew wages and tips logged against this move.</p>
        </div>
        <ReceiptText size={18} />
      </div>

      {error && <p className="ws-helper text-destructive">{error}</p>}

      {rows === null ? (
        <p className="ws-helper">Loading expenses…</p>
      ) : rows.length ? (
        <div className="ws-table-wrap">
          <table className="ws-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Vendor</th>
                <th>Notes</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{shortDate(row.incurredDate)}</td>
                  <td>{row.category}</td>
                  <td>{row.vendor || "—"}</td>
                  <td>{row.notes || "—"}</td>
                  <td className="ops-money">{money(row.amountCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="ws-helper">No expenses logged for this job yet.</p>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm">
          Logged total: <b>{money(total)}</b>
        </p>
        {canEdit && (
          <button type="button" className="ws-btn" onClick={() => setOpen((value) => !value)}>
            <Plus size={14} />
            {open ? "Close" : "Log expense"}
          </button>
        )}
      </div>

      {open && canEdit && (
        <form
          className="mt-3 grid gap-2 border-t border-border pt-3 sm:grid-cols-2"
          onSubmit={submit}
        >
          <label className="text-sm">
            Category
            <select
              className="ws-select"
              value={form.category}
              onChange={(event) => setForm({ ...form, category: event.target.value })}
            >
              {CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Amount (USD)
            <input
              className="ws-input"
              inputMode="decimal"
              required
              value={form.amount}
              onChange={(event) => setForm({ ...form, amount: event.target.value })}
            />
          </label>
          <label className="text-sm">
            Vendor
            <input
              className="ws-input"
              value={form.vendor}
              onChange={(event) => setForm({ ...form, vendor: event.target.value })}
            />
          </label>
          <label className="text-sm">
            Date
            <input
              className="ws-input"
              type="date"
              required
              value={form.incurredDate}
              onChange={(event) => setForm({ ...form, incurredDate: event.target.value })}
            />
          </label>
          <label className="text-sm sm:col-span-2">
            Notes
            <input
              className="ws-input"
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
            />
          </label>
          <div className="sm:col-span-2">
            <button className="ws-btn primary" disabled={saving}>
              {saving ? "Saving…" : "Save expense"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
