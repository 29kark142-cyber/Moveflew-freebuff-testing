import { describe, expect, it } from "vitest";
import {
  billingPeriod,
  buildMonthlyInvoices,
  isStorageInvoiceOverdue,
  overdueByVault,
  storageBillingSummary,
  storageInvoiceDate,
  storageInvoiceEmail,
  type StorageInvoice,
} from "./storage-billing";
import type { StorageVault } from "./storage-vaults";

const vault = (patch: Partial<StorageVault> = {}): StorageVault => ({
  id: 1,
  code: "A-101",
  section: "A",
  squareFeet: 100,
  capacityCuft: 600,
  status: "occupied",
  billingMode: "flat",
  monthlyRateCents: 24000,
  ratePerSqftCents: 500,
  customerId: 7,
  contactName: "Casey Client",
  contactPhone: "555-0100",
  contactEmail: "casey@example.com",
  jobId: null,
  items: [],
  moveInAt: "2026-01-01",
  moveOutAt: null,
  invoiceDay: 5,
  notes: "",
  ...patch,
});

const invoice = (patch: Partial<StorageInvoice> = {}): StorageInvoice => ({
  id: 1,
  vaultId: 1,
  vaultCode: "A-101",
  customerId: 7,
  customerName: "Casey Client",
  customerEmail: "casey@example.com",
  period: "2026-11",
  invoiceDate: "2026-11-05",
  dueDate: "2026-11-05",
  amountCents: 24000,
  status: "due",
  paidAt: null,
  emailStatus: "not_sent",
  emailDetail: "",
  createdAt: "2026-11-01T00:00:00.000Z",
  ...patch,
});

describe("storage billing", () => {
  it("clamps billing days and formats periods", () => {
    expect(billingPeriod(new Date(2026, 10, 6))).toBe("2026-11");
    expect(storageInvoiceDate("2026-11", 5)).toBe("2026-11-05");
    expect(storageInvoiceDate("2026-11", 31)).toBe("2026-11-28");
    expect(() => storageInvoiceDate("November", 5)).toThrow();
  });

  it("creates current invoices only after the billing day", () => {
    const before = buildMonthlyInvoices([vault()], [], new Date(2026, 10, 3));
    expect(before).toEqual([]);
    const due = buildMonthlyInvoices([vault()], [], new Date(2026, 10, 5));
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({
      vaultId: 1,
      period: "2026-11",
      invoiceDate: "2026-11-05",
      amountCents: 24000,
      status: "due",
      emailStatus: "not_sent",
    });
  });

  it("includes square-foot pricing and skips vacancies, free units and existing invoices", () => {
    const vaults = [
      vault({ id: 1, billingMode: "sqft", squareFeet: 50, ratePerSqftCents: 500 }),
      vault({ id: 2, status: "available" }),
      vault({ id: 3, monthlyRateCents: 0 }),
    ];
    const drafts = buildMonthlyInvoices(vaults, [], new Date(2026, 10, 10));
    expect(drafts.map((entry) => entry.vaultId)).toEqual([1]);
    expect(drafts[0]?.amountCents).toBe(25000);
    const again = buildMonthlyInvoices(
      vaults,
      drafts.map((entry) => ({ vaultId: entry.vaultId, period: entry.period })),
      new Date(2026, 10, 10),
    );
    expect(again).toEqual([]);
  });

  it("does not bill before move-in or after move-out", () => {
    const late = buildMonthlyInvoices(
      [vault({ moveInAt: "2026-11-20" })],
      [],
      new Date(2026, 10, 10),
    );
    const gone = buildMonthlyInvoices(
      [vault({ moveOutAt: "2026-11-01" })],
      [],
      new Date(2026, 10, 10),
    );
    expect(late).toEqual([]);
    expect(gone).toEqual([]);
  });

  it("marks unpaid invoices overdue and aggregates them per vault", () => {
    const old = invoice({ id: 1, dueDate: "2026-10-05", amountCents: 24000 });
    const current = invoice({ id: 2, dueDate: "2026-11-10", amountCents: 30000 });
    expect(isStorageInvoiceOverdue(old, new Date(2026, 10, 6))).toBe(true);
    expect(isStorageInvoiceOverdue(current, new Date(2026, 10, 5))).toBe(false);
    expect(overdueByVault([old, current], new Date(2026, 10, 6)).get(1)).toEqual({
      count: 1,
      amountCents: 24000,
      oldestDue: "2026-10-05",
    });
  });

  it("summarises due, overdue and paid invoices", () => {
    const summary = storageBillingSummary(
      [
        invoice({ id: 1, dueDate: "2026-10-05" }),
        invoice({ id: 2, dueDate: "2026-11-10" }),
        invoice({ id: 3, status: "paid", paidAt: "2026-11-05T12:00:00.000Z" }),
      ],
      new Date(2026, 10, 6),
    );
    expect(summary).toEqual({
      invoiceCount: 3,
      dueCount: 1,
      overdueCount: 1,
      paidCount: 1,
      dueCents: 24000,
      overdueCents: 24000,
      paidCents: 24000,
    });
  });

  it("composes an invoice email", () => {
    const mail = storageInvoiceEmail(invoice(), "MoveFlew");
    expect(mail.subject).toContain("2026-11");
    expect(mail.body).toContain("A-101");
    expect(mail.body).toContain("240.00");
  });
});
