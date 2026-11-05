import type {
  Claim,
  Expense,
  Facility,
  Invoice,
  StorageAccount,
  StorageItem,
  Timecard,
  Tip,
  Vault,
} from "@shared/expansion";
import { crmFetch } from "@/lib/crm";

const json = (method: string, value?: unknown): RequestInit => ({
  method,
  body: value === undefined ? undefined : JSON.stringify(value),
});

export type StorageMovement = {
  id: number;
  accountId: number;
  itemId?: number;
  kind?: string;
  quantity?: number;
  notes?: string;
  createdAt?: string;
  [key: string]: unknown;
};
export type PaymentLedgerRow = {
  id: number;
  invoiceId?: number;
  amountCents: number;
  method: string;
  reference: string;
  createdAt?: string;
  [key: string]: unknown;
};
export type ClaimEvent = {
  id: number;
  claimId: number;
  note: string;
  createdAt?: string;
  [key: string]: unknown;
};
export type Unavailability = {
  id: number;
  resourceType: "crew" | "truck";
  resourceId: number;
  fromDate: string;
  toDate: string;
  reason: string;
};
export type PayrollRow = {
  crewMemberId: number;
  name: string;
  regularMinutes: number;
  overtimeMinutes: number;
  rateCents: number;
  regularPayCents: number;
  overtimePayCents: number;
  tipCents: number;
  totalCents: number;
};
export type PayrollReport = {
  rows: PayrollRow[];
  totalCents: number;
  disclaimer: string;
};
export type BolDocument = {
  job: Record<string, unknown>;
  customer: Record<string, unknown>;
  company: Record<string, unknown>;
  damages: Array<Record<string, unknown>>;
  terms: string;
  generatedAt: string;
  recordkeepingOnly: boolean;
};

export const ops = {
  facilities: () => crmFetch<Facility[]>("/ops/facilities"),
  createFacility: (value: Pick<Facility, "name" | "address" | "notes">) =>
    crmFetch<Facility>("/ops/facilities", json("POST", value)),
  updateFacility: (id: number, value: Partial<Facility>) =>
    crmFetch<Facility>(`/ops/facilities/${id}`, json("PATCH", value)),

  vaults: () => crmFetch<Vault[]>("/ops/vaults"),
  createVault: (value: Omit<Vault, "id" | "occupiedCuft">) =>
    crmFetch<Vault>("/ops/vaults", json("POST", value)),
  updateVault: (id: number, value: Partial<Vault>) =>
    crmFetch<Vault>(`/ops/vaults/${id}`, json("PATCH", value)),

  storageAccounts: () => crmFetch<StorageAccount[]>("/ops/storage-accounts"),
  createStorageAccount: (
    value: Omit<StorageAccount, "id" | "customerName">
  ) =>
    crmFetch<StorageAccount>("/ops/storage-accounts", json("POST", value)),
  updateStorageAccount: (id: number, value: Partial<StorageAccount>) =>
    crmFetch<StorageAccount>(`/ops/storage-accounts/${id}`, json("PATCH", value)),

  storageItems: () => crmFetch<StorageItem[]>("/ops/storage-items"),
  createStorageItem: (value: Omit<StorageItem, "id" | "status">) =>
    crmFetch<StorageItem>("/ops/storage-items", json("POST", value)),
  releaseStorageItem: (id: number, quantity: number, notes: string) =>
    crmFetch<StorageItem>(
      `/ops/storage-items/${id}/release`,
      json("PATCH", { quantity, notes })
    ),
  storageMovements: (accountId?: number) =>
    crmFetch<StorageMovement[]>(
      `/ops/storage-movements${accountId ? `?accountId=${accountId}` : ""}`
    ),
  runBilling: (period: string) =>
    crmFetch<{ created: number; skipped: number }>(
      "/ops/billing/run",
      json("POST", { period })
    ),

  invoices: () => crmFetch<Invoice[]>("/ops/invoices"),
  createInvoice: (value: {
    customerId: number;
    jobId?: number;
    kind: "manual" | "deposit" | "tip";
    dueDate: string;
    items: Array<{ name: string; quantity: number; unitCents: number }>;
    notes?: string;
  }) => crmFetch<Invoice>("/ops/invoices", json("POST", value)),
  updateInvoice: (id: number, value: { dueDate?: string; notes?: string; void?: boolean }) =>
    crmFetch<Invoice>(`/ops/invoices/${id}`, json("PATCH", value)),
  recordPayment: (id: number, value: {
    amountCents: number;
    method: "cash" | "check" | "external_card" | "other";
    reference: string;
    operationKey: string;
  }) => crmFetch<Invoice>(`/ops/invoices/${id}/payments`, json("POST", value)),
  checkout: (id: number, origin: string, amountCents?: number) =>
    crmFetch<{ url: string }>(
      `/ops/invoices/${id}/checkout`,
      json("POST", { origin, ...(amountCents ? { amountCents } : {}) })
    ),
  payments: () => crmFetch<PaymentLedgerRow[]>("/ops/payments"),

  expenses: () => crmFetch<Expense[]>("/ops/expenses"),
  createExpense: (value: Omit<Expense, "id">) =>
    crmFetch<Expense>("/ops/expenses", json("POST", value)),

  claims: () => crmFetch<Claim[]>("/ops/claims"),
  createClaim: (value: {
    jobId: number;
    type: string;
    description: string;
    claimedCents: number;
    dueDate?: string;
  }) => crmFetch<Claim>("/ops/claims", json("POST", value)),
  updateClaim: (id: number, value: {
    status: string;
    approvedCents: number;
    resolution: string;
    dueDate?: string;
  }) => crmFetch<Claim>(`/ops/claims/${id}`, json("PATCH", value)),
  claimEvents: (id: number) => crmFetch<ClaimEvent[]>(`/ops/claims/${id}/events`),
  createClaimEvent: (id: number, note: string) =>
    crmFetch<ClaimEvent>(`/ops/claims/${id}/events`, json("POST", { note })),

  timecards: () => crmFetch<Timecard[]>("/ops/timecards"),
  createTimecard: (value: Omit<Timecard, "id" | "crewName">) =>
    crmFetch<Timecard>("/ops/timecards", json("POST", value)),
  updateTimecard: (id: number, value: Omit<Timecard, "id" | "crewName">) =>
    crmFetch<Timecard>(`/ops/timecards/${id}`, json("PATCH", value)),
  payroll: (from: string, to: string) =>
    crmFetch<PayrollReport>(`/ops/payroll?from=${from}&to=${to}`),
  tips: () => crmFetch<Tip[]>("/ops/tips"),
  createTip: (value: Omit<Tip, "id">) =>
    crmFetch<Tip>("/ops/tips", json("POST", value)),

  unavailability: () => crmFetch<Unavailability[]>("/ops/unavailability"),
  createUnavailability: (value: Omit<Unavailability, "id">) =>
    crmFetch<Unavailability>("/ops/unavailability", json("POST", value)),
  revokeUnavailability: (id: number) =>
    crmFetch<void>(`/ops/unavailability/${id}`, { method: "DELETE" }),
  bol: (jobId: number) => crmFetch<BolDocument>(`/ops/bol/${jobId}`),
};
