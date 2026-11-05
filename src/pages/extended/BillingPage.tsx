import { CreditCard, Edit3, ExternalLink, Plus, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Customer, Job } from "@shared/crm";
import type { Invoice } from "@shared/expansion";
import type { ModuleProps } from "@shared/expansion";
import { crm } from "@/lib/crm";
import { useI18n } from "@/lib/i18n";
import {
  ErrorNotice,
  LoadingBlock,
  Modal,
  StatusChip,
  useRemote,
} from "@/components/workspace/WorkspaceUI";
import { ops, type PaymentLedgerRow } from "@/lib/ops-api";
import {
  canAccess,
  dollarsToCents,
  EmptyRows,
  money,
  monthToday,
  officeFinanceRoles,
  PageHead,
  PermissionNotice,
  SectionTitle,
  shortDate,
  SuccessNotice,
} from "./operations-common";

type BillingData = {
  invoices: Invoice[];
  payments: PaymentLedgerRow[];
  customers: Customer[];
  jobs: Job[];
};
type Tab = "invoices" | "payments" | "run";
const loadBilling = async (): Promise<BillingData> => {
  const [invoices, payments, customers, jobs] = await Promise.all([
    ops.invoices(),
    ops.payments(),
    crm.customers(),
    crm.jobs(),
  ]);
  return { invoices, payments, customers, jobs };
};

export function BillingPage({ role, navigate }: ModuleProps) {
  const { t } = useI18n();
  if (!canAccess(role, officeFinanceRoles))
    return (
      <>
        <PageHead
          heading="Billing"
          caption="Audited invoices, recorded payments, and storage billing."
        />
        <PermissionNotice roles={officeFinanceRoles} />
      </>
    );
  return <BillingContent navigate={navigate} />;
}

function BillingContent({ navigate }: { navigate: (path: string) => void }) {
  const { t } = useI18n();
  const { data, loading, error, refresh } = useRemote(loadBilling, []);
  const [tab, setTab] = useState<Tab>("invoices");
  const [newInvoice, setNewInvoice] = useState(false);
  const [editInvoice, setEditInvoice] = useState<Invoice | null>(null);
  const [paymentFor, setPaymentFor] = useState<Invoice | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [checkoutPending, setCheckoutPending] = useState<number | null>(null);
  const saved = async (message: string) => {
    await refresh();
    setSuccess(message);
  };
  useEffect(() => {
    if (!checkoutPending) return;
    const refreshVerifiedLedger = () =>
      window.setTimeout(() => void refresh(), 800);
    window.addEventListener("focus", refreshVerifiedLedger);
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => {
      window.removeEventListener("focus", refreshVerifiedLedger);
      window.clearInterval(timer);
    };
  }, [checkoutPending]);
  if (loading) return <LoadingBlock label={t("Loading billing records…")} />;
  if (error || !data)
    return (
      <>
        <PageHead
          heading="Billing"
          caption="Audited invoices, recorded payments, and storage billing."
        />
        <ErrorNotice error={error} retry={() => void refresh()} />
      </>
    );
  const launchCheckout = async (invoice: Invoice) => {
    const opened = window.open("", "_blank");
    try {
      if (!opened)
        throw new Error(t("Your browser blocked the checkout window."));
      const result = await ops.checkout(invoice.id, window.location.origin);
      opened.opener = null;
      opened.location.href = result.url;
      setCheckoutPending(invoice.id);
      setSuccess(
        t(
          "Stripe TEST checkout opened. The verified ledger will refresh when you return; payment is not assumed."
        )
      );
    } catch (reason) {
      opened?.close();
      setSuccess(null);
      alert(
        reason instanceof Error ? reason.message : t("Could not open checkout.")
      );
    }
  };
  return (
    <div className="ops">
      <PageHead
        heading="Billing"
        caption="Live invoice balances and record-only payment entries."
        actions={
          <>
            <button
              className="ws-btn"
              onClick={() => navigate("/app/invoices")}
            >
              <ExternalLink size={14} />
              {t("Original job invoices")}
            </button>
            <button className="ws-btn" onClick={() => void refresh()}>
              <RefreshCw size={14} />
              {t("Refresh")}
            </button>
            <button
              className="ws-btn primary"
              disabled={!data.customers.length}
              title={
                !data.customers.length
                  ? t("Create a customer first")
                  : undefined
              }
              onClick={() => setNewInvoice(true)}
            >
              <Plus size={15} />
              {t("New invoice")}
            </button>
          </>
        }
      />
      <SuccessNotice message={success} />
      <nav className="ops-tabs" aria-label={t("Billing sections")}>
        {(
          [
            ["invoices", "Invoices"],
            ["payments", "Payment ledger"],
            ["run", "Storage billing run"],
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
      {tab === "invoices" && (
        <InvoiceTable
          invoices={data.invoices}
          onPay={setPaymentFor}
          onEdit={setEditInvoice}
          onCheckout={launchCheckout}
          pending={checkoutPending}
        />
      )}
      {tab === "payments" && <PaymentTable rows={data.payments} />}
      {tab === "run" && <BillingRun onSuccess={saved} />}
      {newInvoice && (
        <InvoiceForm
          customers={data.customers}
          jobs={data.jobs}
          onClose={() => setNewInvoice(false)}
          onSaved={saved}
        />
      )}
      {editInvoice && (
        <InvoiceEditForm
          invoice={editInvoice}
          onClose={() => setEditInvoice(null)}
          onSaved={saved}
        />
      )}
      {paymentFor && (
        <PaymentForm
          invoice={paymentFor}
          onClose={() => setPaymentFor(null)}
          onSaved={saved}
        />
      )}
    </div>
  );
}

function InvoiceTable({
  invoices,
  onPay,
  onEdit,
  onCheckout,
  pending,
}: {
  invoices: Invoice[];
  onPay: (invoice: Invoice) => void;
  onEdit: (invoice: Invoice) => void;
  onCheckout: (invoice: Invoice) => void;
  pending: number | null;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const rows = useMemo(
    () =>
      invoices.filter(
        invoice =>
          (!status || invoice.status === status) &&
          `${invoice.invoiceNumber} ${invoice.customerName}`
            .toLowerCase()
            .includes(query.toLowerCase())
      ),
    [invoices, query, status]
  );
  const statuses = [...new Set(invoices.map(row => row.status))];
  return (
    <section className="ws-card ws-card-pad">
      <SectionTitle
        title="Invoices"
        detail="Balances are returned by the audited operations ledger; no amount here is simulated."
      />
      <p className="ops-meta">
        {t(
          "This audited operations ledger is separate from original job invoices and does not migrate legacy records automatically."
        )}
      </p>
      <div className="ws-toolbar">
        <div className="ws-toolbar__filters">
          <input
            className="ws-input search"
            placeholder={t("Search invoice or customer")}
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <select
            className="ws-select"
            value={status}
            onChange={e => setStatus(e.target.value)}
          >
            <option value="">{t("All statuses")}</option>
            {statuses.map(value => (
              <option value={value} key={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
      </div>
      {rows.length ? (
        <div className="ws-table-wrap">
          <table className="ws-table">
            <thead>
              <tr>
                <th>{t("Invoice")}</th>
                <th>{t("Customer")}</th>
                <th>{t("Due")}</th>
                <th>{t("Total")}</th>
                <th>{t("Paid")}</th>
                <th>{t("Balance")}</th>
                <th>{t("Status")}</th>
                <th>{t("Actions")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(invoice => (
                <tr key={invoice.id}>
                  <td className="ws-table-main">
                    {invoice.invoiceNumber}
                    <small>
                      {invoice.kind}
                      {invoice.period ? ` · ${invoice.period}` : ""}
                    </small>
                  </td>
                  <td>{invoice.customerName}</td>
                  <td>{shortDate(invoice.dueDate)}</td>
                  <td className="ops-money">{money(invoice.totalCents)}</td>
                  <td className="ops-money">{money(invoice.paidCents)}</td>
                  <td className="ops-money">{money(invoice.balanceCents)}</td>
                  <td>
                    <StatusChip status={invoice.status} />
                  </td>
                  <td>
                    <div className="ws-row-actions">
                      <button
                        className="ws-icon-btn"
                        title={t("Edit")}
                        onClick={() => onEdit(invoice)}
                      >
                        <Edit3 size={15} />
                      </button>
                      {invoice.balanceCents > 0 && (
                        <button
                          className="ws-btn"
                          onClick={() => onPay(invoice)}
                        >
                          {t("Record payment")}
                        </button>
                      )}
                      {invoice.balanceCents > 0 && (
                        <button
                          className="ws-btn"
                          disabled={pending === invoice.id}
                          onClick={() => onCheckout(invoice)}
                        >
                          <CreditCard size={14} />
                          {pending === invoice.id
                            ? t("Checking ledger…")
                            : t("Stripe TEST")}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyRows
          title="No invoices found"
          detail="Create a manual or deposit invoice for an existing customer."
        />
      )}
    </section>
  );
}
function PaymentTable({ rows }: { rows: PaymentLedgerRow[] }) {
  const { t } = useI18n();
  return (
    <section className="ws-card ws-card-pad">
      <SectionTitle
        title="Payment ledger"
        detail="Manual entries are accounting records only and do not process a card."
      />
      {rows.length ? (
        <div className="ws-table-wrap">
          <table className="ws-table">
            <thead>
              <tr>
                <th>{t("Date")}</th>
                <th>{t("Invoice")}</th>
                <th>{t("Method")}</th>
                <th>{t("Reference")}</th>
                <th>{t("Amount")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id}>
                  <td>{shortDate(row.createdAt)}</td>
                  <td>{row.invoiceId ?? "—"}</td>
                  <td>{row.method}</td>
                  <td>{row.reference}</td>
                  <td className="ops-money">{money(row.amountCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyRows
          title="No payment entries"
          detail="Recorded payments will appear once saved against an invoice."
        />
      )}
    </section>
  );
}
function BillingRun({
  onSuccess,
}: {
  onSuccess: (message: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const [period, setPeriod] = useState(monthToday());
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    created: number;
    skipped: number;
  } | null>(null);
  const run = async () => {
    setRunning(true);
    setError("");
    try {
      const actual = await ops.runBilling(period);
      setResult(actual);
      await onSuccess(t("Storage billing run completed."));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t("Could not run storage billing.")
      );
    } finally {
      setRunning(false);
    }
  };
  return (
    <section className="ws-card ws-card-pad">
      <SectionTitle
        title="Generate current-month storage invoices"
        detail="This explicit run creates only eligible active auto-invoice agreements once per period."
      />
      <div className="ops-inline-form">
        <label className="ws-field">
          <span>{t("Billing period")}</span>
          <input
            className="ws-input"
            type="month"
            value={period}
            onChange={e => setPeriod(e.target.value)}
          />
        </label>
        <button
          className="ws-btn primary"
          disabled={running}
          onClick={() => void run()}
        >
          {running ? t("Generating…") : t("Generate invoices")}
        </button>
      </div>
      <p className="ops-legal-note">
        {t(
          "Automatic collection is not connected until consented. This action generates invoices only; it never charges a customer."
        )}
      </p>
      {result && (
        <div className="ops-summary">
          <div>
            <small>{t("Created")}</small>
            <b>{result.created}</b>
          </div>
          <div>
            <small>{t("Skipped")}</small>
            <b>{result.skipped}</b>
          </div>
          <div>
            <small>{t("Period")}</small>
            <b>{period}</b>
          </div>
        </div>
      )}
      {error && <ErrorNotice error={new Error(error)} />}
    </section>
  );
}

type DraftLine = { name: string; quantity: string; dollars: string };
function InvoiceForm({
  customers,
  jobs,
  onClose,
  onSaved,
}: {
  customers: Customer[];
  jobs: Job[];
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const [customerId, setCustomerId] = useState(String(customers[0]?.id || ""));
  const [jobId, setJobId] = useState("");
  const [kind, setKind] = useState<"manual" | "deposit">("manual");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([
    { name: "", quantity: "1", dollars: "" },
  ]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const update = (index: number, key: keyof DraftLine, value: string) =>
    setLines(
      lines.map((line, i) => (i === index ? { ...line, [key]: value } : line))
    );
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const items = lines.map(line => ({
      name: line.name.trim(),
      quantity: Number(line.quantity),
      unitCents: dollarsToCents(line.dollars),
    }));
    if (!dueDate) return setError(t("A due date is required."));
    if (
      items.some(
        line =>
          !line.name ||
          !Number.isFinite(line.quantity) ||
          line.quantity <= 0 ||
          !Number.isInteger(line.quantity) ||
          line.unitCents === null ||
          line.unitCents < 0
      )
    )
      return setError(
        t(
          "Each line needs a name, whole quantity, and dollar amount with at most two decimals."
        )
      );
    setSaving(true);
    setError("");
    try {
      await ops.createInvoice({
        customerId: Number(customerId),
        jobId: jobId ? Number(jobId) : undefined,
        kind,
        dueDate,
        items: items as Array<{
          name: string;
          quantity: number;
          unitCents: number;
        }>,
        notes: notes || undefined,
      });
      await onSaved("Invoice saved.");
      onClose();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t("Could not save invoice.")
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal title="New invoice" onClose={onClose} wide>
      <form className="ws-modal__body ops-form" onSubmit={submit}>
        <div className="ws-form-grid">
          <label className="ws-field">
            <span>{t("Customer")}</span>
            <select
              className="ws-select"
              value={customerId}
              onChange={e => setCustomerId(e.target.value)}
            >
              {customers.map(customer => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
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
              {jobs
                .filter(job => job.customerId === Number(customerId))
                .map(job => (
                  <option key={job.id} value={job.id}>
                    {job.title || job.customerName}
                  </option>
                ))}
            </select>
          </label>
          <label className="ws-field">
            <span>{t("Invoice kind")}</span>
            <select
              className="ws-select"
              value={kind}
              onChange={e => setKind(e.target.value as "manual" | "deposit")}
            >
              <option value="manual">manual</option>
              <option value="deposit">deposit</option>
            </select>
          </label>
          <label className="ws-field">
            <span>{t("Due date")}</span>
            <input
              className="ws-input"
              type="date"
              required
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
            />
          </label>
        </div>
        <div>
          <b>{t("Line items")}</b>
          <div className="ops-lines">
            {lines.map((line, index) => (
              <div className="ops-line" key={index}>
                <label className="ws-field">
                  <span>{t("Description")}</span>
                  <input
                    className="ws-input"
                    required
                    value={line.name}
                    onChange={e => update(index, "name", e.target.value)}
                  />
                </label>
                <label className="ws-field">
                  <span>{t("Quantity")}</span>
                  <input
                    className="ws-input"
                    type="number"
                    min="1"
                    required
                    value={line.quantity}
                    onChange={e => update(index, "quantity", e.target.value)}
                  />
                </label>
                <label className="ws-field">
                  <span>{t("Unit price (USD)")}</span>
                  <input
                    className="ws-input"
                    inputMode="decimal"
                    required
                    value={line.dollars}
                    onChange={e => update(index, "dollars", e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="ws-btn"
                  disabled={lines.length === 1}
                  onClick={() => setLines(lines.filter((_, i) => i !== index))}
                >
                  {t("Remove")}
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="ws-btn"
            onClick={() =>
              setLines([...lines, { name: "", quantity: "1", dollars: "" }])
            }
          >
            <Plus size={14} />
            {t("Add line")}
          </button>
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
            {saving ? t("Saving…") : t("Save invoice")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function InvoiceEditForm({
  invoice,
  onClose,
  onSaved,
}: {
  invoice: Invoice;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const [dueDate, setDueDate] = useState(invoice.dueDate);
  const [notes, setNotes] = useState(
    String((invoice as Record<string, unknown>).notes || "")
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async (voidInvoice = false) => {
    setSaving(true);
    setError("");
    try {
      await ops.updateInvoice(
        invoice.id,
        voidInvoice ? { void: true } : { dueDate, notes }
      );
      await onSaved(voidInvoice ? "Invoice voided." : "Invoice updated.");
      onClose();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t("Could not update invoice.")
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal title="Edit invoice" onClose={onClose}>
      <div className="ws-modal__body ops-form">
        <label className="ws-field">
          <span>{t("Due date")}</span>
          <input
            className="ws-input"
            type="date"
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
          />
        </label>
        <label className="ws-field">
          <span>{t("Notes")}</span>
          <textarea
            className="ws-textarea"
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </label>
        <p className="ops-meta">
          {t(
            "The server applies financial rules before it permits changes or voiding."
          )}
        </p>
        {error && <ErrorNotice error={new Error(error)} />}
        <div className="ops-form-actions">
          <button
            className="ws-btn danger"
            disabled={saving}
            onClick={() => void save(true)}
          >
            {t("Void invoice")}
          </button>
          <button className="ws-btn" onClick={onClose}>
            {t("Cancel")}
          </button>
          <button
            className="ws-btn primary"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? t("Saving…") : t("Save changes")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
function PaymentForm({
  invoice,
  onClose,
  onSaved,
}: {
  invoice: Invoice;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const [amount, setAmount] = useState((invoice.balanceCents / 100).toFixed(2));
  const [method, setMethod] = useState<
    "cash" | "check" | "external_card" | "other"
  >("check");
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountCents = dollarsToCents(amount);
    if (
      amountCents === null ||
      amountCents <= 0 ||
      amountCents > invoice.balanceCents
    )
      return setError(
        t(
          "Enter an amount greater than zero and no more than the invoice balance."
        )
      );
    if (!reference.trim())
      return setError(t("A payment reference is required."));
    setSaving(true);
    setError("");
    try {
      await ops.recordPayment(invoice.id, {
        amountCents,
        method,
        reference: reference.trim(),
        operationKey: crypto.randomUUID(),
      });
      await onSaved("Payment record saved.");
      onClose();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t("Could not record payment.")
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal title="Record payment" onClose={onClose}>
      <form className="ws-modal__body ops-form" onSubmit={submit}>
        <p className="ops-legal-note">
          {t(
            "This is a manual accounting record. It does not process a card and no card details are stored here."
          )}
        </p>
        <div className="ops-summary">
          <div>
            <small>{t("Invoice")}</small>
            <b>{invoice.invoiceNumber}</b>
          </div>
          <div>
            <small>{t("Open balance")}</small>
            <b>{money(invoice.balanceCents)}</b>
          </div>
          <div>
            <small>{t("Customer")}</small>
            <b>{invoice.customerName}</b>
          </div>
        </div>
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
          <span>{t("Method")}</span>
          <select
            className="ws-select"
            value={method}
            onChange={e => setMethod(e.target.value as typeof method)}
          >
            <option value="cash">cash</option>
            <option value="check">check</option>
            <option value="external_card">external_card</option>
            <option value="other">other</option>
          </select>
        </label>
        <label className="ws-field">
          <span>{t("Reference")}</span>
          <input
            className="ws-input"
            required
            value={reference}
            onChange={e => setReference(e.target.value)}
          />
        </label>
        {error && <ErrorNotice error={new Error(error)} />}
        <div className="ops-form-actions">
          <button type="button" className="ws-btn" onClick={onClose}>
            {t("Cancel")}
          </button>
          <button className="ws-btn primary" disabled={saving}>
            {saving ? t("Saving…") : t("Record payment")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
