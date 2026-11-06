import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@/lib/wouter";
import { toast } from "sonner";
import { ArrowLeft, CalendarClock, Loader2, Mail, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { crmFetch } from "@/lib/crm";
import { money } from "@shared/crm";
import {
  isStorageInvoiceOverdue,
  storageInvoiceNumber,
  type StorageBillingSummary,
  type StorageInvoice,
} from "@shared/storage-billing";
import { monthlyStorageCents, nextInvoiceDate, type StorageVault } from "@shared/storage-vaults";

const OFFICE = ["admin", "office_admin", "dispatcher"];
const EDITORS = ["admin", "office_admin"];

type Overview = {
  vaults: StorageVault[];
  invoices: StorageInvoice[];
  summary: StorageBillingSummary;
  emailConfigured: boolean;
};

type RunResult = {
  created: StorageInvoice[];
  emailed: number;
  blocked: number;
  failed: number;
};

const when = (value: string) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
};

/** Monthly vault invoices, delivery state and overdue balances in one office queue. */
export default function StorageBillingPage({ role }: { role: string }) {
  const allowed = OFFICE.includes(role);
  const canEdit = EDITORS.includes(role);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setOverview(await crmFetch<Overview>("/ops/storage-billing"));
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load storage billing.");
    }
  }, []);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  const active = useMemo(
    () => (overview?.vaults ?? []).filter((vault) => vault.status === "occupied"),
    [overview],
  );
  const invoices = useMemo(
    () =>
      [...(overview?.invoices ?? [])].sort(
        (a, b) => b.dueDate.localeCompare(a.dueDate) || b.id - a.id,
      ),
    [overview],
  );

  const run = async () => {
    setBusy(true);
    try {
      const result = await crmFetch<RunResult>("/ops/storage-billing/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      toast.success(
        result.created.length
          ? `${result.created.length} invoice${result.created.length === 1 ? "" : "s"} created · ${result.emailed} emailed`
          : "All current storage invoices are already generated",
      );
      if (result.blocked || result.failed) {
        toast.warning(
          `${result.blocked} invoice${result.blocked === 1 ? "" : "s"} logged without delivery${result.failed ? `, ${result.failed} failed` : ""}.`,
        );
      }
      await load();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not run storage billing");
    } finally {
      setBusy(false);
    }
  };

  const setPaid = async (invoice: StorageInvoice, paid: boolean) => {
    setBusy(true);
    try {
      await crmFetch<StorageInvoice>(`/ops/storage-billing/${invoice.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paid }),
      });
      toast.success(`Invoice ${storageInvoiceNumber(invoice)} marked ${paid ? "paid" : "due"}`);
      await load();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not update the invoice");
    } finally {
      setBusy(false);
    }
  };

  if (!allowed) {
    return (
      <div className="ws-card ws-card-pad">
        <h1 className="text-xl font-bold">Storage billing</h1>
        <p className="text-sm text-muted-foreground">Storage billing is available to office staff.</p>
        <Link href="/app/storage" className="ws-btn mt-3 inline-flex">
          Back to vaults
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/app/storage" className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
            <ArrowLeft size={13} /> Storage vaults
          </Link>
          <h1 className="text-2xl font-bold">Storage billing</h1>
          <p className="text-sm text-muted-foreground">
            Monthly vault invoices, email delivery and overdue balances.
          </p>
        </div>
        <Button
          className="ws-btn primary"
          disabled={busy || !canEdit || !overview}
          onClick={() => void run()}
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <ReceiptText size={15} />}
          Generate current invoices
        </Button>
      </header>

      {error && (
        <div className="ws-error" role="alert">
          {error}
        </div>
      )}

      {!overview ? (
        <div className="ws-card ws-card-pad flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 size={16} className="animate-spin" /> Loading storage billing…
        </div>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Due", value: money(overview.summary.dueCents / 100), note: `${overview.summary.dueCount} invoices` },
              { label: "Overdue", value: money(overview.summary.overdueCents / 100), note: `${overview.summary.overdueCount} invoices` },
              { label: "Paid", value: money(overview.summary.paidCents / 100), note: `${overview.summary.paidCount} invoices` },
              { label: "Active vaults", value: String(active.length), note: `${invoices.length} invoices on file` },
            ].map((metric) => (
              <div className="ws-card ws-card-pad" key={metric.label}>
                <small className="text-xs uppercase tracking-wide text-muted-foreground">
                  {metric.label}
                </small>
                <b className="mt-1 block text-2xl">{metric.value}</b>
                <span className="text-xs text-muted-foreground">{metric.note}</span>
              </div>
            ))}
          </section>

          {!overview.emailConfigured && (
            <div className="ws-card ws-card-pad flex items-start gap-2 text-sm">
              <Mail size={16} className="mt-0.5 shrink-0" />
              <p>
                Email delivery is not configured. New invoices are still recorded and shown here;
                set <code>SENDGRID_API_KEY</code> and <code>MESSAGING_FROM_EMAIL</code> to email
                customers automatically.
              </p>
            </div>
          )}

          <section className="ws-card overflow-x-auto">
            <div className="border-b border-border px-4 py-3">
              <b className="text-sm">Invoices</b>
            </div>
            {invoices.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                No storage invoices yet. Generate the current month for {active.length} active vault
                {active.length === 1 ? "" : "s"}.
              </p>
            ) : (
              <table className="ws-table min-w-[820px]">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Customer</th>
                    <th>Period</th>
                    <th>Due</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Email</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => {
                    const overdue = isStorageInvoiceOverdue(invoice);
                    return (
                      <tr key={invoice.id}>
                        <td>
                          <b>{storageInvoiceNumber(invoice)}</b>
                          <div className="text-xs text-muted-foreground">Vault {invoice.vaultCode}</div>
                        </td>
                        <td>
                          {invoice.customerName || "Storage customer"}
                          <div className="text-xs text-muted-foreground">{invoice.customerEmail || "No email"}</div>
                        </td>
                        <td>{invoice.period}</td>
                        <td>{when(invoice.dueDate)}</td>
                        <td>{money(invoice.amountCents / 100)}</td>
                        <td>
                          <span className={`ws-chip ${invoice.status === "paid" ? "green" : overdue ? "red" : "orange"}`}>
                            {invoice.status === "paid" ? "Paid" : overdue ? "Overdue" : "Due"}
                          </span>
                        </td>
                        <td>
                          <span className="text-xs">{invoice.emailStatus.replace("_", " ")}</span>
                          {invoice.emailDetail && (
                            <div className="text-xs text-muted-foreground">{invoice.emailDetail}</div>
                          )}
                        </td>
                        <td>
                          {canEdit && invoice.status !== "paid" && (
                            <Button className="ws-btn" disabled={busy} onClick={() => void setPaid(invoice, true)}>
                              Mark paid
                            </Button>
                          )}
                          {canEdit && invoice.status === "paid" && (
                            <Button className="ws-btn" disabled={busy} onClick={() => void setPaid(invoice, false)}>
                              Reopen
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>

          <section className="ws-card ws-card-pad space-y-2">
            <b className="text-sm">Active vault schedule</b>
            {active.length === 0 ? (
              <p className="text-sm text-muted-foreground">No occupied vaults to bill.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {active.map((vault) => (
                  <div key={vault.id} className="rounded-lg border border-border p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <b>{vault.code}</b>
                      <span className="ws-chip blue">Occupied</span>
                    </div>
                    <p className="text-muted-foreground">{vault.contactName || "Unassigned"}</p>
                    <p className="mt-1 font-medium">{money(monthlyStorageCents(vault) / 100)} / month</p>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <CalendarClock size={12} /> Next invoice {when(nextInvoiceDate(vault))} · day {vault.invoiceDay}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
