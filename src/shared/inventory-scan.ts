// Per-box QR labels for a move and the origin/destination scan record. Codes are derived
// from the saved inventory, so a label can only ever refer to a real item on that job.
import type { InventoryEntry } from "./crm";

export type InventoryScanPhase = "origin" | "destination";

export type InventoryScan = {
  code: string;
  phase: InventoryScanPhase;
  at: string;
  by: string;
  operationId?: string;
  note?: string;
};

export type InventoryLabel = {
  code: string;
  jobId: number;
  itemIndex: number;
  unitIndex: number;
  name: string;
  room: string;
  quantity: number;
};

export type InventoryScanSummary = {
  total: number;
  originCount: number;
  destinationCount: number;
  missingOrigin: InventoryLabel[];
  missingDestination: InventoryLabel[];
  complete: boolean;
};

export const INVENTORY_CODE_RE = /^INV-(\d{1,10})-(\d{1,4})-(\d{1,4})$/;
export const MAX_INVENTORY_LABELS = 500;
export const MAX_INVENTORY_SCANS = 800;

const codeFor = (jobId: number, itemIndex: number, unitIndex: number) =>
  `INV-${jobId}-${itemIndex + 1}-${unitIndex + 1}`;

const units = (value: unknown) => {
  const quantity = Math.floor(Number(value));
  return Number.isFinite(quantity) ? Math.min(200, Math.max(1, quantity)) : 1;
};

/** One label per physical box/unit, not one per inventory line. */
export function inventoryLabels(job: { id: number; inventory?: unknown }): InventoryLabel[] {
  const entries = Array.isArray(job.inventory) ? (job.inventory as Partial<InventoryEntry>[]) : [];
  const labels: InventoryLabel[] = [];
  entries.forEach((entry, itemIndex) => {
    if (labels.length >= MAX_INVENTORY_LABELS) return;
    const quantity = units(entry?.quantity);
    const name =
      typeof entry?.name === "string" && entry.name.trim() ? entry.name.trim() : "Inventory item";
    const room = typeof entry?.room === "string" ? entry.room.trim() : "";
    for (let unitIndex = 0; unitIndex < quantity; unitIndex += 1) {
      if (labels.length >= MAX_INVENTORY_LABELS) break;
      labels.push({
        code: codeFor(job.id, itemIndex, unitIndex),
        jobId: job.id,
        itemIndex,
        unitIndex,
        name,
        room,
        quantity,
      });
    }
  });
  return labels;
}

export function parseInventoryCode(
  value: unknown,
): { jobId: number; itemIndex: number; unitIndex: number } | null {
  if (typeof value !== "string") return null;
  const match = INVENTORY_CODE_RE.exec(value.trim().toUpperCase());
  if (!match) return null;
  const jobId = Number(match[1]);
  const itemIndex = Number(match[2]);
  const unitIndex = Number(match[3]);
  if (![jobId, itemIndex, unitIndex].every((number) => Number.isSafeInteger(number) && number > 0))
    return null;
  return { jobId, itemIndex: itemIndex - 1, unitIndex: unitIndex - 1 };
}

export function scanKey(code: string, phase: InventoryScanPhase): string {
  return `${code.toUpperCase()}:${phase}`;
}

/** Saved scans, newest first, de-duplicated by box + phase, with garbage dropped. */
export function inventoryScans(value: unknown): InventoryScan[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const scans: InventoryScan[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const code = typeof row["code"] === "string" ? row["code"].trim().toUpperCase() : "";
    if (!INVENTORY_CODE_RE.test(code)) continue;
    const phase =
      row["phase"] === "destination" ? "destination" : row["phase"] === "origin" ? "origin" : null;
    if (!phase) continue;
    const at = typeof row["at"] === "string" ? row["at"] : "";
    if (!Number.isFinite(Date.parse(at))) continue;
    const key = scanKey(code, phase);
    if (seen.has(key)) continue;
    seen.add(key);
    scans.push({
      code,
      phase,
      at,
      by: typeof row["by"] === "string" ? row["by"].slice(0, 120) : "",
      ...(typeof row["operationId"] === "string"
        ? { operationId: row["operationId"].slice(0, 80) }
        : {}),
      ...(typeof row["note"] === "string" && row["note"]
        ? { note: row["note"].slice(0, 200) }
        : {}),
    });
    if (scans.length >= MAX_INVENTORY_SCANS) break;
  }
  return scans.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

/** Adds one scan idempotently: replaying the same operation or box/phase is a no-op. */
export function withInventoryScan(value: unknown, scan: InventoryScan): InventoryScan[] {
  const scans = inventoryScans(value);
  if (scan.operationId && scans.some((entry) => entry.operationId === scan.operationId))
    return scans;
  if (scans.some((entry) => entry.code === scan.code && entry.phase === scan.phase)) return scans;
  return [scan, ...scans].slice(0, MAX_INVENTORY_SCANS);
}

export function inventoryScanSummary(job: {
  id: number;
  inventory?: unknown;
  inventoryScans?: unknown;
}): InventoryScanSummary {
  const labels = inventoryLabels(job);
  const scans = inventoryScans(job.inventoryScans);
  const origin = new Set(scans.filter((scan) => scan.phase === "origin").map((scan) => scan.code));
  const destination = new Set(
    scans.filter((scan) => scan.phase === "destination").map((scan) => scan.code),
  );
  const missingOrigin = labels.filter((label) => !origin.has(label.code));
  // Every box needs a delivery scan; a missed pickup scan must not hide a delivery miss.
  const missingDestination = labels.filter((label) => !destination.has(label.code));
  return {
    total: labels.length,
    originCount: labels.filter((label) => origin.has(label.code)).length,
    destinationCount: labels.filter((label) => destination.has(label.code)).length,
    missingOrigin,
    missingDestination,
    complete: labels.length > 0 && missingDestination.length === 0,
  };
}
