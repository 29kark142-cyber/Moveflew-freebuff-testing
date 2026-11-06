import { describe, expect, it } from "vitest";
import {
  inventoryLabels,
  inventoryScanSummary,
  inventoryScans,
  parseInventoryCode,
  withInventoryScan,
  type InventoryScan,
} from "./inventory-scan";

const inventory = [
  { key: "sofa", name: "Sofa", room: "Living room", cuft: 35, weight: 120, quantity: 1 },
  { key: "boxes", name: "Book boxes", room: "Office", cuft: 1.5, weight: 40, quantity: 3 },
];

const scan = (
  code: string,
  phase: "origin" | "destination",
  patch: Partial<InventoryScan> = {},
): InventoryScan => ({
  code,
  phase,
  at: "2026-06-15T10:00:00.000Z",
  by: "Marcus",
  ...patch,
});

describe("inventory labels", () => {
  it("creates one unique code per physical unit", () => {
    const labels = inventoryLabels({ id: 42, inventory });
    expect(labels.map((label) => label.code)).toEqual([
      "INV-42-1-1",
      "INV-42-2-1",
      "INV-42-2-2",
      "INV-42-2-3",
    ]);
    expect(new Set(labels.map((label) => label.code)).size).toBe(4);
    expect(labels[2]).toMatchObject({
      name: "Book boxes",
      room: "Office",
      quantity: 3,
      unitIndex: 1,
    });
  });

  it("clamps bad quantities and caps total labels", () => {
    expect(inventoryLabels({ id: 1, inventory: [{ name: "Odd", quantity: 0 }] })).toHaveLength(1);
    expect(
      inventoryLabels({
        id: 1,
        inventory: Array.from({ length: 60 }, () => ({ name: "Boxes", quantity: 200 })),
      }),
    ).toHaveLength(500);
  });

  it("round-trips a code and rejects foreign ones", () => {
    expect(parseInventoryCode("inv-42-2-3")).toEqual({ jobId: 42, itemIndex: 1, unitIndex: 2 });
    expect(parseInventoryCode("A-101")).toBeNull();
    expect(parseInventoryCode("INV-0-1-1")).toBeNull();
  });
});

describe("inventory scans", () => {
  it("dedupes a box/phase replay and a repeated operation id", () => {
    const first = withInventoryScan([], scan("INV-42-1-1", "origin"));
    const replay = withInventoryScan(first, scan("INV-42-1-1", "origin"));
    expect(replay).toHaveLength(1);
    const operation = withInventoryScan([], scan("INV-42-1-1", "origin", { operationId: "op-1" }));
    const repeated = withInventoryScan(
      operation,
      scan("INV-42-2-1", "origin", { operationId: "op-1" }),
    );
    expect(repeated.map((entry) => entry.code)).toEqual(["INV-42-1-1"]);
  });

  it("drops malformed stored scans and sorts newest first", () => {
    const scans = inventoryScans([
      scan("INV-42-1-1", "origin", { at: "2026-06-15T09:00:00.000Z" }),
      scan("INV-42-2-1", "destination", { at: "2026-06-15T11:00:00.000Z" }),
      { code: "bad", phase: "origin", at: "nope" },
      scan("INV-42-1-1", "origin"),
    ]);
    expect(scans.map((entry) => entry.code)).toEqual(["INV-42-2-1", "INV-42-1-1"]);
  });
});

describe("missing box summary", () => {
  it("separates boxes not loaded from boxes not delivered", () => {
    const job = {
      id: 42,
      inventory,
      inventoryScans: [
        scan("INV-42-1-1", "origin"),
        scan("INV-42-2-1", "origin"),
        scan("INV-42-1-1", "destination"),
        scan("INV-42-2-1", "destination"),
      ],
    };
    const summary = inventoryScanSummary(job);
    expect(summary).toMatchObject({
      total: 4,
      originCount: 2,
      destinationCount: 2,
      complete: false,
    });
    expect(summary.missingOrigin.map((label) => label.code)).toEqual(["INV-42-2-2", "INV-42-2-3"]);
    expect(summary.missingDestination.map((label) => label.code)).toEqual([
      "INV-42-2-2",
      "INV-42-2-3",
    ]);
  });

  it("ignores destination scans for boxes never loaded and reports completion", () => {
    const job = {
      id: 42,
      inventory,
      inventoryScans: [
        scan("INV-42-1-1", "origin"),
        scan("INV-42-1-1", "destination"),
        scan("INV-42-2-1", "destination"),
      ],
    };
    const summary = inventoryScanSummary(job);
    expect(summary.destinationCount).toBe(2);
    expect(summary.missingDestination.map((label) => label.code)).toEqual([
      "INV-42-2-2",
      "INV-42-2-3",
    ]);
    expect(inventoryScanSummary({ id: 1, inventory: [] })).toMatchObject({
      total: 0,
      complete: false,
    });
  });
});
