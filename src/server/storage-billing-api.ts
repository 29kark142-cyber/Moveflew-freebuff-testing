// Server-owned monthly storage billing. Invoice records live in workspace_records;
// email delivery is attempted through the existing messaging provider and its real
// accepted/blocked/failed result is stored on the invoice.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildMonthlyInvoices,
  isStorageInvoiceStatus,
  storageBillingSummary,
  storageInvoiceEmail,
  type StorageBillingSummary,
  type StorageEmailStatus,
  type StorageInvoice,
  type StorageInvoiceDraft,
} from "../shared/storage-billing";
import type { StorageVault } from "../shared/storage-vaults";
import { emailConfigured, sendEmail } from "./notifications";

const KIND = "storage_invoice";

type RecordRow = { id: number; data: Record<string, unknown> };
type RecordClient = Pick<SupabaseClient, "from">;

const text = (value: unknown) => (typeof value === "string" ? value : "");
const numberOrNull = (value: unknown) => (typeof value === "number" ? value : null);

function invoiceFrom(row: RecordRow): StorageInvoice {
  const data = row.data ?? {};
  const status = isStorageInvoiceStatus(data["status"]) ? data["status"] : "due";
  const emailStatuses: StorageEmailStatus[] = ["not_sent", "accepted", "failed", "blocked"];
  const emailStatus = emailStatuses.includes(data["emailStatus"] as StorageEmailStatus)
    ? (data["emailStatus"] as StorageEmailStatus)
    : "not_sent";
  return {
    id: row.id,
    vaultId: Number(data["vaultId"]) || 0,
    vaultCode: text(data["vaultCode"]),
    customerId: numberOrNull(data["customerId"]),
    customerName: text(data["customerName"]),
    customerEmail: text(data["customerEmail"]),
    period: text(data["period"]),
    invoiceDate: text(data["invoiceDate"]),
    dueDate: text(data["dueDate"]),
    amountCents: Number(data["amountCents"]) || 0,
    status,
    paidAt: text(data["paidAt"]) || null,
    emailStatus,
    emailDetail: text(data["emailDetail"]),
    createdAt: text(data["createdAt"]),
  };
}

function vaultFrom(row: RecordRow): StorageVault {
  return { ...(row.data as Omit<StorageVault, "id">), id: row.id };
}

async function rowsFor(db: RecordClient, wsId: number, kind: string): Promise<RecordRow[]> {
  const { data, error } = await db
    .from("workspace_records")
    .select("id,data")
    .eq("workspace_id", wsId)
    .eq("kind", kind)
    .order("id", { ascending: true })
    .limit(2000);
  if (error) throw new Error(error.message);
  return (data ?? []) as RecordRow[];
}

async function companyName(db: RecordClient, wsId: number): Promise<string> {
  const { data } = await db.from("workspaces").select("name").eq("id", wsId).maybeSingle();
  return text((data as { name?: unknown } | null)?.name);
}

export type StorageBillingOverview = {
  vaults: StorageVault[];
  invoices: StorageInvoice[];
  summary: StorageBillingSummary;
  emailConfigured: boolean;
};

export async function storageBillingOverview(
  db: RecordClient,
  wsId: number,
): Promise<StorageBillingOverview> {
  const [vaultRows, invoiceRows] = await Promise.all([rowsFor(db, wsId, "vault"), rowsFor(db, wsId, KIND)]);
  const invoices = invoiceRows.map(invoiceFrom);
  const signal = new Date();
  return {
    vaults: vaultRows.map(vaultFrom),
    invoices,
    summary: storageBillingSummary(invoices, signal),
    emailConfigured: emailConfigured(),
  };
}

export type StorageBillingRun = {
  created: StorageInvoice[];
  emailed: number;
  blocked: number;
  failed: number;
  summary: StorageBillingSummary;
};

/** Generates this month's invoices, then emails each new invoice exactly once. */
export async function runStorageBilling(
  db: RecordClient,
  wsId: number,
  origin: string,
): Promise<StorageBillingRun> {
  const [vaultRows, invoiceRows, name] = await Promise.all([
    rowsFor(db, wsId, "vault"),
    rowsFor(db, wsId, KIND),
    companyName(db, wsId),
  ]);
  const existing = invoiceRows.map(invoiceFrom);
  const drafts = buildMonthlyInvoices(vaultRows.map(vaultFrom), existing, new Date());
  const created: StorageInvoice[] = [];
  let emailed = 0;
  let blocked = 0;
  let failed = 0;

  for (const draft of drafts) {
    const mail = storageInvoiceEmail(draft, name);
    let emailStatus: StorageEmailStatus = "not_sent";
    let emailDetail = "";
    if (!draft.customerEmail) {
      emailStatus = "blocked";
      emailDetail = "No customer email on the vault";
      blocked += 1;
    } else if (!emailConfigured()) {
      emailStatus = "blocked";
      emailDetail = "Email provider is not configured";
      blocked += 1;
    } else {
      const delivery = await sendEmail(draft.customerEmail, mail.subject, mail.body);
      emailStatus =
        delivery.status === "accepted"
          ? "accepted"
          : delivery.status === "failed"
            ? "failed"
            : "blocked";
      emailDetail = delivery.detail;
      if (emailStatus === "accepted") emailed += 1;
      else if (emailStatus === "failed") failed += 1;
      else blocked += 1;
    }
    const data: StorageInvoiceDraft & { emailStatus: StorageEmailStatus; emailDetail: string } = {
      ...draft,
      emailStatus,
      emailDetail,
    };
    const { data: inserted, error } = await db
      .from("workspace_records")
      .insert({ workspace_id: wsId, kind: KIND, data })
      .select("id,data")
      .single();
    if (error) throw new Error(error.message);
    const invoice = invoiceFrom(inserted as RecordRow);
    created.push(invoice);
    // The origin is kept available for future hosted invoice links without changing
    // today's email-only delivery contract.
    void origin;
  }

  const all = [...existing, ...created];
  return {
    created,
    emailed,
    blocked,
    failed,
    summary: storageBillingSummary(all, new Date()),
  };
}

export async function markStorageInvoicePaid(
  db: RecordClient,
  wsId: number,
  invoiceId: number,
  paid: boolean,
): Promise<StorageInvoice> {
  const { data, error } = await db
    .from("workspace_records")
    .select("id,data")
    .eq("workspace_id", wsId)
    .eq("kind", KIND)
    .eq("id", invoiceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw Object.assign(new Error("Storage invoice not found"), { status: 404 });
  const current = invoiceFrom(data as RecordRow);
  const next = {
    ...current,
    status: paid ? ("paid" as const) : ("due" as const),
    paidAt: paid ? new Date().toISOString() : null,
  };
  const { id: _id, ...payload } = next;
  const { data: updated, error: writeError } = await db
    .from("workspace_records")
    .update({ data: payload })
    .eq("workspace_id", wsId)
    .eq("kind", KIND)
    .eq("id", invoiceId)
    .select("id,data")
    .single();
  if (writeError) throw new Error(writeError.message);
  return invoiceFrom(updated as RecordRow);
}
