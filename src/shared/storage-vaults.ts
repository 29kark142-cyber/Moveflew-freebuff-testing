// Storage vault rules shared by the warehouse screen and the server. Vaults are stored
// as `workspace_records` JSONB documents, so no warehouse tables are needed.
import type { VaultPhoto } from "./vault-photos";

export const VAULT_STATUSES = ["available", "occupied", "reserved", "maintenance"] as const;
export type VaultStatus = (typeof VAULT_STATUSES)[number];

export const BILLING_MODES = ["flat", "sqft"] as const;
export type BillingMode = (typeof BILLING_MODES)[number];

export type VaultItem = {
  name: string;
  quantity: number;
  cuft?: number;
  note?: string;
};

/** A vault document. `id` comes from the workspace record; the rest lives in `data`. */
export type StorageVault = {
  id: number;
  code: string;
  section: string;
  squareFeet: number;
  capacityCuft: number;
  status: VaultStatus;
  billingMode: BillingMode;
  /** Flat monthly price for the whole vault. */
  monthlyRateCents: number;
  /** Monthly price per square foot, used when billingMode is "sqft". */
  ratePerSqftCents: number;
  customerId: number | null;
  /** Contact snapshot kept with the storage record, independent of the customer ledger. */
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  jobId: number | null;
  items: VaultItem[];
  /** Compressed inspection photos, mirrored onto the linked job when saved. */
  photos?: VaultPhoto[];
  moveInAt: string | null;
  /** Projected move-out; the vault frees up when this date passes and status changes. */
  moveOutAt: string | null;
  /** Day of the month the recurring storage charge is billed (1–28). */
  invoiceDay: number;
  notes: string;
};

export type VaultDraft = Omit<StorageVault, "id">;

export function isVaultStatus(value: unknown): value is VaultStatus {
  return typeof value === "string" && (VAULT_STATUSES as readonly string[]).includes(value);
}

export function isBillingMode(value: unknown): value is BillingMode {
  return typeof value === "string" && (BILLING_MODES as readonly string[]).includes(value);
}

/**
 * Scanned labels are normalised so `a-101`, `A 101` and a `vault:A-101` QR payload
 * all resolve to the same vault code.
 */
export function normalizeVaultTag(value: string): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const tail = raw.includes("/") ? raw.slice(raw.lastIndexOf("/") + 1) : raw;
  return tail
    .replace(/^vault[:\s-]*/i, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/** Finds the vault a scanned tag belongs to, or null when nothing matches. */
export function findVaultByTag(
  vaults: Pick<StorageVault, "id" | "code">[],
  tag: string,
): Pick<StorageVault, "id" | "code"> | null {
  const wanted = normalizeVaultTag(tag);
  if (!wanted) return null;
  return vaults.find((vault) => normalizeVaultTag(vault.code) === wanted) ?? null;
}

export function vaultStatusLabel(status: VaultStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

const money = (cents: number) => Math.round(cents);
const num = (value: unknown) => {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
};

/** Monthly holding fee: a flat vault price, or square footage × the per-sq-ft rate. */
export function monthlyStorageCents(
  vault: Pick<StorageVault, "billingMode" | "monthlyRateCents" | "ratePerSqftCents" | "squareFeet">,
): number {
  if (vault.billingMode === "sqft") {
    return money(num(vault.ratePerSqftCents) * num(vault.squareFeet));
  }
  return money(num(vault.monthlyRateCents));
}

export function vaultUsage(vault: Pick<StorageVault, "items" | "capacityCuft">): {
  cuft: number;
  percent: number;
} {
  const cuft = (vault.items ?? []).reduce(
    (sum, item) => sum + num(item.cuft) * Math.max(1, Math.round(num(item.quantity) || 1)),
    0,
  );
  const capacity = num(vault.capacityCuft);
  return { cuft, percent: capacity ? Math.min(100, Math.round((cuft / capacity) * 100)) : 0 };
}

function dateOnly(value: string | null | undefined): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  return value.slice(0, 10);
}

/** Next monthly invoice date at or after `now`, on the vault's billing day. */
export function nextInvoiceDate(vault: Pick<StorageVault, "invoiceDay">, now = new Date()): string {
  const day = Math.max(1, Math.min(28, Math.round(num(vault.invoiceDay) || 1)));
  const at = new Date(now.getFullYear(), now.getMonth(), day);
  if (at.getTime() < new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) {
    at.setMonth(at.getMonth() + 1);
  }
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

/** True when a projected move-out is today or earlier, so the vault can be released. */
export function dueForRelease(
  vault: Pick<StorageVault, "moveOutAt" | "status">,
  now = new Date(),
): boolean {
  if (vault.status !== "occupied") return false;
  const moveOut = dateOnly(vault.moveOutAt);
  if (!moveOut) return false;
  const pad = (value: number) => String(value).padStart(2, "0");
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return moveOut <= today;
}

export const occupancyStatuses: VaultStatus[] = ["occupied", "reserved"];

export type StorageSummary = {
  total: number;
  available: number;
  occupied: number;
  reserved: number;
  maintenance: number;
  occupiedSqft: number;
  monthlyCents: number;
};

export function storageSummary(vaults: StorageVault[]): StorageSummary {
  const count = (status: VaultStatus) => vaults.filter((vault) => vault.status === status).length;
  return {
    total: vaults.length,
    available: count("available"),
    occupied: count("occupied"),
    reserved: count("reserved"),
    maintenance: count("maintenance"),
    occupiedSqft: vaults
      .filter((vault) => vault.status === "occupied")
      .reduce((sum, vault) => sum + num(vault.squareFeet), 0),
    monthlyCents: vaults
      .filter((vault) => vault.status === "occupied")
      .reduce((sum, vault) => sum + monthlyStorageCents(vault), 0),
  };
}

export type CustomerStorageBilling = {
  key: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  vaults: string[];
  monthlyCents: number;
  nextInvoiceOn: string;
};

/** One recurring charge per customer, combining every vault they occupy. */
export function recurringByCustomer(
  vaults: StorageVault[],
  now = new Date(),
): CustomerStorageBilling[] {
  const groups = new Map<string, CustomerStorageBilling>();
  for (const vault of vaults) {
    if (vault.status !== "occupied") continue;
    const key = vault.customerId ? `c${vault.customerId}` : `n${vault.contactName.toLowerCase()}`;
    const current = groups.get(key) ?? {
      key,
      contactName: vault.contactName || "Unassigned",
      contactPhone: vault.contactPhone,
      contactEmail: vault.contactEmail,
      vaults: [],
      monthlyCents: 0,
      nextInvoiceOn: nextInvoiceDate(vault, now),
    };
    current.vaults.push(vault.code);
    current.monthlyCents += monthlyStorageCents(vault);
    const next = nextInvoiceDate(vault, now);
    if (next < current.nextInvoiceOn) current.nextInvoiceOn = next;
    groups.set(key, current);
  }
  return [...groups.values()].sort((a, b) => b.monthlyCents - a.monthlyCents);
}

/** Suggests the next free code in a section, e.g. A-101 → A-102. */
export function nextVaultCode(existing: Pick<StorageVault, "code">[], section: string): string {
  const prefix = `${section.toUpperCase()}-`;
  const used = existing
    .map((vault) => vault.code)
    .filter((code) => code.toUpperCase().startsWith(prefix))
    .map((code) => Number(code.slice(prefix.length)))
    .filter((number) => Number.isFinite(number));
  const next = used.length ? Math.max(...used) + 1 : 101;
  return `${prefix}${next}`;
}
