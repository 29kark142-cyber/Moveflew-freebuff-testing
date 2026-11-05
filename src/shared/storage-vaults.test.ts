import { describe, expect, it } from "vitest";
import {
  dueForRelease,
  monthlyStorageCents,
  nextInvoiceDate,
  nextVaultCode,
  recurringByCustomer,
  storageSummary,
  vaultUsage,
  type StorageVault,
} from "./storage-vaults";

const vault = (over: Partial<StorageVault> = {}): StorageVault => ({
  id: 1,
  code: "A-101",
  section: "A",
  squareFeet: 50,
  capacityCuft: 600,
  status: "occupied",
  billingMode: "flat",
  monthlyRateCents: 24000,
  ratePerSqftCents: 500,
  customerId: 7,
  contactName: "Alex Morgan",
  contactPhone: "+15551234567",
  contactEmail: "alex@example.test",
  jobId: 12,
  items: [
    { name: "Sofa", quantity: 1, cuft: 50 },
    { name: "Medium box", quantity: 10, cuft: 3 },
  ],
  moveInAt: "2026-10-01",
  moveOutAt: "2026-12-01",
  invoiceDay: 5,
  notes: "",
  ...over,
});

describe("storage vaults", () => {
  it("prices a vault flat or by the square foot", () => {
    expect(monthlyStorageCents(vault())).toBe(24000);
    expect(monthlyStorageCents(vault({ billingMode: "sqft" }))).toBe(25000);
    expect(monthlyStorageCents(vault({ billingMode: "sqft", squareFeet: 0 }))).toBe(0);
  });

  it("measures stored volume against the vault capacity", () => {
    expect(vaultUsage(vault())).toEqual({ cuft: 80, percent: 13 });
    expect(vaultUsage(vault({ capacityCuft: 0, items: [] }))).toEqual({ cuft: 0, percent: 0 });
  });

  it("schedules the next recurring invoice on the vault billing day", () => {
    expect(nextInvoiceDate({ invoiceDay: 5 }, new Date(2026, 10, 3))).toBe("2026-11-05");
    expect(nextInvoiceDate({ invoiceDay: 5 }, new Date(2026, 10, 20))).toBe("2026-12-05");
    expect(nextInvoiceDate({ invoiceDay: 31 }, new Date(2026, 10, 3))).toBe("2026-11-28");
  });

  it("frees a vault once its projected move-out has passed", () => {
    expect(dueForRelease(vault({ moveOutAt: "2026-11-05" }), new Date(2026, 10, 5))).toBe(true);
    expect(dueForRelease(vault({ moveOutAt: "2026-12-01" }), new Date(2026, 10, 5))).toBe(false);
    expect(
      dueForRelease(vault({ status: "available", moveOutAt: "2026-01-01" }), new Date(2026, 10, 5)),
    ).toBe(false);
  });

  it("summarises occupancy and billable storage revenue", () => {
    const summary = storageSummary([
      vault(),
      vault({ id: 2, code: "A-102", status: "available", monthlyRateCents: 0 }),
      vault({ id: 3, code: "B-201", status: "occupied", monthlyRateCents: 48000, squareFeet: 100 }),
      vault({ id: 4, code: "B-202", status: "reserved", monthlyRateCents: 0 }),
    ]);
    expect(summary).toEqual({
      total: 4,
      available: 1,
      occupied: 2,
      reserved: 1,
      maintenance: 0,
      occupiedSqft: 150,
      monthlyCents: 72000,
    });
  });

  it("combines a customer's vaults into one recurring charge", () => {
    const billing = recurringByCustomer(
      [
        vault(),
        vault({ id: 2, code: "B-201", monthlyRateCents: 48000 }),
        vault({ id: 3, code: "A-102", status: "available", monthlyRateCents: 99999 }),
      ],
      new Date(2026, 10, 3),
    );
    expect(billing).toHaveLength(1);
    expect(billing[0]?.vaults).toEqual(["A-101", "B-201"]);
    expect(billing[0]?.monthlyCents).toBe(72000);
    expect(billing[0]?.nextInvoiceOn).toBe("2026-11-05");
  });

  it("suggests the next free vault code in a section", () => {
    expect(nextVaultCode([], "A")).toBe("A-101");
    expect(nextVaultCode([{ code: "A-101" }, { code: "A-104" }, { code: "B-101" }], "a")).toBe(
      "A-105",
    );
  });
});
