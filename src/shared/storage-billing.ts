// Recurring storage invoices. Vaults already carry the monthly rate and billing day,
// so invoices are generated idempotently from that data instead of a separate table.
import { monthlyStorageCents, type StorageVault } from "./storage-vaults";

export const STORAGE_INVOICE_STATUSES = ["due", "paid", "void"] as const;
export type StorageInvoiceStatus = (typeof STORAGE_INVOICE_STATUSES)[number];

export type StorageEmailStatus = "not_sent" | "accepted" | "failed" | "blocked";

export type StorageInvoice = {
  id: number;
  vaultId: number;
  vaultCode: string;
  customerId: number | null;
  customerName: string;
  customerEmail: string;
  /** Billing month in YYYY-MM form. */
  period: string;
  invoiceDate: string;
  dueDate: string;
  amountCents: number;
  status: StorageInvoiceStatus;
  paidAt: string | null;
  emailStatus: StorageEmailStatus;
  emailDetail: string;
  createdAt: string;
};

export type StorageInvoiceDraft = Omit<StorageInvoice, "id">;

export type StorageInvoiceKey = Pick<StorageInvoice, "vaultId" | "period">;

export function storageInvoiceKey(invoice: StorageInvoiceKey): string {
  return `${invoice.vaultId}:${invoice.period}`;
}

export function storageInvoiceNumber(invoice: Pick<StorageInvoice, "vaultCode" | "period">): string {
  return `ST-${invoice.period.replace("-", "")}-${invoice.vaultCode.replace(/[^A-Za-z0-9]/g, "").toUpperCase()}`;
}

const pad = (value: number) => String(value).padStart(2, "0");
const validPeriod = (period: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(period);
const dateOnly = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** First day of the billing period, independent of the host timezone. */
export function billingPeriod(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
}

/** Invoice date for a period, clamped to day 28 so every month has the same billing day. */
export function storageInvoiceDate(period: string, invoiceDay: number): string {
  if (!validPeriod(period)) throw new Error("Billing period must be YYYY-MM");
  const day = Math.max(1, Math.min(28, Math.round(invoiceDay) || 1));
  return `${period}-${pad(day)}`;
}

export function isStorageInvoiceStatus(value: unknown): value is StorageInvoiceStatus {
  return typeof value === "string" && (STORAGE_INVOICE_STATUSES as readonly string[]).includes(value);
}

/** Invoices are due on their invoice date; unpaid invoices become overdue the next day. */
export function isStorageInvoiceOverdue(
  invoice: Pick<StorageInvoice, "status" | "dueDate">,
  now = new Date(),
): boolean {
  return invoice.status === "due" && invoice.dueDate < dateOnly(now);
}

/**
 * Builds the current month's invoices for occupied, priced vaults. Existing invoices are
 * skipped, so a cron run, a page reload and a manual retry can all run safely.
 */
export function buildMonthlyInvoices(
  vaults: StorageVault[],
  existing: StorageInvoiceKey[],
  now = new Date(),
): StorageInvoiceDraft[] {
  const today = dateOnly(now);
  const period = billingPeriod(now);
  const seen = new Set(existing.map(storageInvoiceKey));
  const createdAt = now.toISOString();
  const drafts: StorageInvoiceDraft[] = [];

  for (const vault of vaults) {
    if (vault.status !== "occupied") continue;
    const amountCents = monthlyStorageCents(vault);
    if (amountCents <= 0) continue;
    if (!vault.contactEmail && !vault.contactName) continue;
    if (seen.has(`${vault.id}:${period}`)) continue;
    const invoiceDate = storageInvoiceDate(period, vault.invoiceDay);
    if (invoiceDate > today) continue;
    const moveIn = typeof vault.moveInAt === "string" ? vault.moveInAt.slice(0, 10) : "";
    if (moveIn && moveIn > invoiceDate) continue;
    const moveOut = typeof vault.moveOutAt === "string" ? vault.moveOutAt.slice(0, 10) : "";
    if (moveOut && moveOut < invoiceDate) continue;

    drafts.push({
      vaultId: vault.id,
      vaultCode: vault.code,
      customerId: vault.customerId,
      customerName: vault.contactName || "Storage customer",
      customerEmail: vault.contactEmail,
      period,
      invoiceDate,
      dueDate: invoiceDate,
      amountCents,
      status: "due",
      paidAt: null,
      emailStatus: "not_sent",
      emailDetail: "",
      createdAt,
    });
  }
  return drafts;
}

export type VaultOverdue = {
  count: number;
  amountCents: number;
  oldestDue: string;
};

export function overdueByVault(
  invoices: StorageInvoice[],
  now = new Date(),
): Map<number, VaultOverdue> {
  const result = new Map<number, VaultOverdue>();
  for (const invoice of invoices) {
    if (!isStorageInvoiceOverdue(invoice, now)) continue;
    const current = result.get(invoice.vaultId) ?? {
      count: 0,
      amountCents: 0,
      oldestDue: invoice.dueDate,
    };
    current.count += 1;
    current.amountCents += invoice.amountCents;
    if (invoice.dueDate < current.oldestDue) current.oldestDue = invoice.dueDate;
    result.set(invoice.vaultId, current);
  }
  return result;
}

export type StorageBillingSummary = {
  invoiceCount: number;
  dueCount: number;
  overdueCount: number;
  paidCount: number;
  dueCents: number;
  overdueCents: number;
  paidCents: number;
};

export function storageBillingSummary(
  invoices: StorageInvoice[],
  now = new Date(),
): StorageBillingSummary {
  const summary: StorageBillingSummary = {
    invoiceCount: invoices.length,
    dueCount: 0,
    overdueCount: 0,
    paidCount: 0,
    dueCents: 0,
    overdueCents: 0,
    paidCents: 0,
  };
  for (const invoice of invoices) {
    if (invoice.status === "paid") {
      summary.paidCount += 1;
      summary.paidCents += invoice.amountCents;
    } else if (isStorageInvoiceOverdue(invoice, now)) {
      summary.overdueCount += 1;
      summary.overdueCents += invoice.amountCents;
    } else if (invoice.status === "due") {
      summary.dueCount += 1;
      summary.dueCents += invoice.amountCents;
    }
  }
  return summary;
}

export function storageInvoiceEmail(
  invoice: Pick<StorageInvoice, "vaultCode" | "period" | "amountCents" | "customerName">,
  companyName: string,
): { subject: string; body: string } {
  const amount = (invoice.amountCents / 100).toFixed(2);
  const period = invoice.period;
  return {
    subject: `Storage invoice ${period} — vault ${invoice.vaultCode}`,
    body: [
      `Hi ${invoice.customerName || "there"},`,
      "",
      `Your monthly storage charge for vault ${invoice.vaultCode} is $${amount} for ${period}.`,
      `Please pay by the invoice date shown in your account.`,
      "",
      companyName ? `${companyName} storage team` : "Storage team",
    ].join("\n"),
  };
}
