// Packing supplies and add-on services offered on the public quote. Prices live here so the
// portal display, the saved job and the deposit calculation all use one catalog; the server
// always reprices a selection and never trusts a browser-supplied amount.
export type PackingMaterial = {
  id: string;
  label: string;
  unit: string;
  unitCents: number;
  max: number;
};

export type PackingService = {
  id: string;
  label: string;
  amountCents: number;
  description: string;
};

export type PackingSelection = {
  materials: Record<string, number>;
  services: string[];
};

export type PackingLine = {
  id: string;
  label: string;
  kind: "material" | "service";
  quantity: number;
  amountCents: number;
};

export const PACKING_MATERIALS: readonly PackingMaterial[] = [
  { id: "small_box", label: "Small box", unit: "box", unitCents: 250, max: 80 },
  { id: "medium_box", label: "Medium box", unit: "box", unitCents: 350, max: 80 },
  { id: "large_box", label: "Large box", unit: "box", unitCents: 450, max: 50 },
  { id: "bubble_wrap", label: "Bubble wrap roll", unit: "roll", unitCents: 1800, max: 20 },
  { id: "furniture_cover", label: "Furniture cover", unit: "cover", unitCents: 1200, max: 30 },
  { id: "packing_tape", label: "Packing tape", unit: "roll", unitCents: 500, max: 20 },
];

export const PACKING_SERVICES: readonly PackingService[] = [
  {
    id: "tv_dismount",
    label: "TV dismount & protect",
    amountCents: 7500,
    description: "Crew dismounts wall-mounted TVs, wraps the screen and boxes the hardware.",
  },
  {
    id: "safe_handling",
    label: "Safe & heavy item handling",
    amountCents: 12000,
    description: "Extra crew and equipment for safes, pianos and gym equipment.",
  },
  {
    id: "full_packing",
    label: "Full packing service",
    amountCents: 25000,
    description: "Crew packs an average apartment before move day, materials included.",
  },
];

const MATERIAL_INDEX = new Map(PACKING_MATERIALS.map((material) => [material.id, material]));
const SERVICE_INDEX = new Map(PACKING_SERVICES.map((service) => [service.id, service]));

export const emptyPacking = (): PackingSelection => ({ materials: {}, services: [] });

/**
 * Defensive parse of a stored or submitted selection: unknown ids, decimals, negatives and
 * quantities above the catalog maximum are dropped or clamped rather than trusted.
 */
export function parsePackingSelection(value: unknown): PackingSelection {
  const selection = emptyPacking();
  if (!value || typeof value !== "object") return selection;
  const entry = value as Record<string, unknown>;
  const materials = entry["materials"];
  if (materials && typeof materials === "object") {
    for (const material of PACKING_MATERIALS) {
      const raw = (materials as Record<string, unknown>)[material.id];
      const quantity = Math.floor(Number(raw));
      if (Number.isFinite(quantity) && quantity > 0)
        selection.materials[material.id] = Math.min(material.max, quantity);
    }
  }
  const services = entry["services"];
  if (Array.isArray(services)) {
    selection.services = PACKING_SERVICES.filter((service) => services.includes(service.id)).map(
      (service) => service.id,
    );
  }
  return selection;
}

export function isPackingEmpty(selection: PackingSelection): boolean {
  const safe = parsePackingSelection(selection);
  return !Object.keys(safe.materials).length && !safe.services.length;
}

export function packingSubtotal(selection: PackingSelection): number {
  return packingLines(selection).reduce((total, line) => total + line.amountCents, 0);
}

export function packingLines(selection: PackingSelection): PackingLine[] {
  const safe = parsePackingSelection(selection);
  const lines: PackingLine[] = [];
  for (const material of PACKING_MATERIALS) {
    const quantity = safe.materials[material.id] ?? 0;
    if (!quantity) continue;
    lines.push({
      id: material.id,
      label: material.label,
      kind: "material",
      quantity,
      amountCents: quantity * material.unitCents,
    });
  }
  for (const service of PACKING_SERVICES) {
    if (!safe.services.includes(service.id)) continue;
    lines.push({
      id: service.id,
      label: service.label,
      kind: "service",
      quantity: 1,
      amountCents: service.amountCents,
    });
  }
  return lines;
}

export function materialById(id: string): PackingMaterial | null {
  return MATERIAL_INDEX.get(id) ?? null;
}

export function serviceById(id: string): PackingService | null {
  return SERVICE_INDEX.get(id) ?? null;
}
