export const WAREHOUSE_LABEL_KINDS = [
  "vault",
  "container",
  "item",
] as const;
export type WarehouseLabelKind = (typeof WAREHOUSE_LABEL_KINDS)[number];

export const WAREHOUSE_ACTIONS = [
  "intake",
  "release",
  "cross_dock",
] as const;
export type WarehouseAction = (typeof WAREHOUSE_ACTIONS)[number];

export type WarehouseLabel = {
  id: number;
  targetKind: WarehouseLabelKind;
  targetId: number;
  value: string;
  displayName: string;
  createdAt: string;
};

export type WarehouseVault = {
  id: number;
  name: string;
  kind: string;
  status: string;
  capacityCuft: number;
  occupiedCuft: number;
};

export type WarehouseItem = {
  id: number;
  accountId: number;
  vaultId: number;
  name: string;
  quantity: number;
  cuft: number;
  weightLbs: number;
  status: string;
  notes: string;
};

export type WarehouseAudit = {
  id: number;
  eventType: "resolved" | "rejected" | "confirmed";
  targetKind: WarehouseLabelKind | null;
  targetId: number | null;
  action: WarehouseAction | null;
  quantity: number | null;
  createdAt: string;
};

export type WarehouseOverview = {
  labels: WarehouseLabel[];
  vaults: WarehouseVault[];
  items: WarehouseItem[];
  audits: WarehouseAudit[];
};

export type WarehouseResolveResult =
  | {
      found: true;
      targetKind: WarehouseLabelKind;
      targetId: number;
      displayName: string;
      label: WarehouseLabel;
    }
  | { found: false };

export type WarehouseTransferRequest = {
  action: WarehouseAction;
  itemId: number;
  quantity: number;
  destinationVaultId?: number;
  idempotencyKey: string;
  notes?: string;
};

/**
 * Scanner labels are opaque, local identifiers—not URLs. Keeping the accepted
 * shape narrow prevents a scanned string from being interpreted as a network
 * location or deep link.
 */
export function isOpaqueScannerValue(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 16 &&
    value.length <= 128 &&
    /^[A-Za-z0-9_-]+$/.test(value) &&
    !/^https?|ftp/i.test(value)
  );
}

export function isWarehouseLabelKind(value: unknown): value is WarehouseLabelKind {
  return (
    typeof value === "string" &&
    (WAREHOUSE_LABEL_KINDS as readonly string[]).includes(value)
  );
}

export function isWarehouseAction(value: unknown): value is WarehouseAction {
  return (
    typeof value === "string" &&
    (WAREHOUSE_ACTIONS as readonly string[]).includes(value)
  );
}

/** Client-generated keys make a confirmed physical action safe to retry. */
export function isWarehouseIdempotencyKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 8 &&
    value.length <= 96 &&
    /^[A-Za-z0-9._:-]+$/.test(value)
  );
}

export function capacityRequiredCuft(
  unitCuft: number,
  quantity: number
): number {
  return unitCuft * quantity;
}

export function canFitWarehouseCapacity(
  occupiedCuft: number,
  capacityCuft: number,
  unitCuft: number,
  quantity: number
): boolean {
  return (
    Number.isFinite(occupiedCuft) &&
    Number.isFinite(capacityCuft) &&
    Number.isFinite(unitCuft) &&
    Number.isInteger(quantity) &&
    quantity > 0 &&
    occupiedCuft + capacityRequiredCuft(unitCuft, quantity) <=
      capacityCuft + 1e-8
  );
}

/** Stable input identity; the server hashes this before persistence. */
export function warehouseActionFingerprint(input: {
  action: WarehouseAction;
  itemId: number;
  quantity: number;
  destinationVaultId?: number | null;
}): string {
  return [
    input.action,
    input.itemId,
    input.quantity,
    input.destinationVaultId ?? "",
  ].join("|");
}
