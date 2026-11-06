import { describe, expect, it } from "vitest";
import {
  PACKING_MATERIALS,
  PACKING_SERVICES,
  emptyPacking,
  isPackingEmpty,
  packingLines,
  packingSubtotal,
  parsePackingSelection,
} from "./packing";

describe("packing selection parsing", () => {
  it("keeps known materials and services only", () => {
    const selection = parsePackingSelection({
      materials: { medium_box: 3, packing_tape: 2, free_piano: 99 },
      services: ["tv_dismount", "unknown_service", "tv_dismount"],
    });
    expect(selection).toEqual({
      materials: { medium_box: 3, packing_tape: 2 },
      services: ["tv_dismount"],
    });
  });

  it("clamps quantities to the catalog maximum and drops invalid numbers", () => {
    const selection = parsePackingSelection({
      materials: { small_box: 1_000, large_box: -2, bubble_wrap: 1.9, furniture_cover: "2" },
      services: "tv_dismount",
    });
    expect(selection.materials).toEqual({
      small_box: 80,
      bubble_wrap: 1,
      furniture_cover: 2,
    });
    expect(selection.services).toEqual([]);
  });

  it("returns an empty selection for garbage input", () => {
    expect(parsePackingSelection(null)).toEqual(emptyPacking());
    expect(parsePackingSelection("boxes")).toEqual(emptyPacking());
    expect(isPackingEmpty(emptyPacking())).toBe(true);
    expect(isPackingEmpty(parsePackingSelection({ materials: { small_box: 1 } }))).toBe(false);
  });
});

describe("packing pricing", () => {
  it("prices materials by quantity and services once", () => {
    const selection = parsePackingSelection({
      materials: { medium_box: 10, furniture_cover: 2 },
      services: ["safe_handling", "tv_dismount"],
    });
    const lines = packingLines(selection);
    expect(lines).toHaveLength(4);
    // 10 x $3.50 + 2 x $12 + $120 + $75
    expect(packingSubtotal(selection)).toBe(3500 + 2400 + 12000 + 7500);
    expect(lines.find((line) => line.id === "medium_box")).toMatchObject({
      quantity: 10,
      amountCents: 3500,
      kind: "material",
    });
    expect(lines.find((line) => line.id === "tv_dismount")).toMatchObject({
      quantity: 1,
      amountCents: 7500,
      kind: "service",
    });
  });

  it("prices an empty selection at zero", () => {
    expect(packingSubtotal(emptyPacking())).toBe(0);
    expect(packingLines(emptyPacking())).toEqual([]);
  });

  it("never prices a tampered line item", () => {
    // A browser cannot invent a cheaper amount: only catalog ids and quantities are read.
    const selection = parsePackingSelection({
      materials: Object.fromEntries(
        PACKING_MATERIALS.map((material) => [material.id, material.max]),
      ),
      services: PACKING_SERVICES.map((service) => service.id),
      amountCents: 1,
      total: 1,
    });
    const expected =
      PACKING_MATERIALS.reduce((sum, material) => sum + material.max * material.unitCents, 0) +
      PACKING_SERVICES.reduce((sum, service) => sum + service.amountCents, 0);
    expect(packingSubtotal(selection)).toBe(expected);
  });
});
