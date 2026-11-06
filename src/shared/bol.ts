// Bill of lading rules shared by the document page, server signer and PDF renderer.
import type { InventoryEntry, Job } from "./crm";
import { calculateQuote } from "./crm";

export type BolRole = "origin" | "delivery";

export type BolSignature = {
  signature: string;
  signerName: string;
  signedAt: string;
  by: string;
};

export type BolSignatures = {
  origin: BolSignature | null;
  delivery: BolSignature | null;
};

export type BolPdf = {
  path: string;
  hash: string;
  generatedAt: string;
};

export type BolDocument = {
  job: Record<string, unknown>;
  signatures: BolSignatures;
  valuation: ReturnType<typeof bolValuation>;
  pricing: ReturnType<typeof bolPricing>;
  pdf: BolPdf | null;
  terms: string;
  generatedAt: string;
  recordkeepingOnly: boolean;
};

const recordText = (value: unknown) => (typeof value === "string" ? value : "");
const money = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) : 0;
};
const signatureFrom = (value: unknown): BolSignature | null => {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (!/^data:image\/png;base64,iVBOR/i.test(recordText(row.signature))) return null;
  return {
    signature: recordText(row.signature),
    signerName: recordText(row.signerName),
    signedAt: recordText(row.signedAt),
    by: recordText(row.by),
  };
};

/** Reads explicit BOL signatures, falling back to the legacy field signatures. */
export function bolSignatures(data: Record<string, unknown>): BolSignatures {
  const raw = (data["bolSignatures"] ?? {}) as Record<string, unknown>;
  const origin =
    signatureFrom(raw["origin"]) ??
    (recordText(data["signature"]).startsWith("data:image/png;base64,")
      ? {
          signature: recordText(data["signature"]),
          signerName: "Customer",
          signedAt: recordText(data["signedOffAt"]),
          by: "",
        }
      : null);
  const delivery =
    signatureFrom(raw["delivery"]) ??
    (recordText(data["completedSignature"]).startsWith("data:image/png;base64,")
      ? {
          signature: recordText(data["completedSignature"]),
          signerName: "Customer",
          signedAt: recordText(data["signedOffAt"]),
          by: "",
        }
      : null);
  return { origin, delivery };
}

export type BolValuationLine = {
  name: string;
  quantity: number;
  weight: number;
  declaredValueCents: number;
  totalCents: number;
};

/**
 * Itemised declared valuation. No value is invented: an item is worth what the
 * inventory record declares, and the document states when nothing was declared.
 */
export function bolValuation(inventory: InventoryEntry[] | undefined): {
  lines: BolValuationLine[];
  totalCents: number;
  declared: boolean;
} {
  const lines = (inventory ?? []).map((item) => {
    const quantity = Math.max(0, Math.round(Number(item.quantity) || 0));
    const declaredValueCents = Math.max(0, money((item as InventoryEntry & { declaredValue?: number }).declaredValue));
    return {
      name: recordText(item.name) || "Unnamed item",
      quantity,
      weight: Math.max(0, Number(item.weight) || 0),
      declaredValueCents,
      totalCents: declaredValueCents,
    };
  });
  return {
    lines,
    totalCents: lines.reduce((sum, line) => sum + line.totalCents, 0),
    declared: lines.some((line) => line.declaredValueCents > 0),
  };
}

export type BolPricing = {
  estimatedCents: number;
  feesCents: number;
  discountCents: number;
  surgeCents: number;
  finalCents: number;
  balanceCents: number;
};

/** Final customer pricing, using the signed/final total when one exists. */
export function bolPricing(job: Partial<Job> & Record<string, unknown>): BolPricing {
  const estimated = Number(job["total"]) || 0;
  const final = Number(job["finalTotal"]) || estimated;
  const base = (job as Partial<Job>).pricingMode
    ? calculateQuote(job as Pick<Job, "pricingMode" | "hourlyRate" | "estimatedHours" | "distanceMiles" | "travelFee" | "weightRate" | "mileRate" | "inventory" | "fees" | "discountPercent">)
    : estimated;
  const fees = ((job["fees"] as Array<{ amount?: unknown }> | undefined) ?? []).reduce(
    (sum, fee) => sum + (Number(fee.amount) || 0),
    0,
  );
  const surge = Number((job["quoteSurge"] as { amount?: unknown } | undefined)?.amount) || 0;
  return {
    estimatedCents: money(estimated),
    feesCents: money(fees),
    discountCents: money(Math.max(0, base - estimated)),
    surgeCents: money(surge),
    finalCents: money(final),
    balanceCents: money(Number(job["balanceDue"] ?? final)),
  };
}

export const BOL_LEGAL_TERMS =
  "The customer acknowledges the shipment, route, service times, inventory, declared valuation, recorded conditions, and final charges shown in this Bill of Lading. The customer's signatures record pickup and delivery. This document does not alter the agreed estimate, insurance coverage, or rights provided by applicable law. Claims for visible loss or damage must be noted at delivery.";
