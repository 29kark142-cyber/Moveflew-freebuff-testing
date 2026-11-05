import { describe, expect, it } from "vitest";
import { buildInvoicePdf } from "./invoice-pdf";
import type { StorageVault } from "@shared/storage-vaults";

// 1x1 transparent PNG, enough to exercise the embedded signature path.
const PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const job = {
  id: 42,
  customerName: "Alex Morgan",
  customerEmail: "alex@example.test",
  customerPhone: "+15551234567",
  moveDate: "2026-11-05",
  origin: "12 Cedar Lane",
  destination: "88 Harbour View Rd",
  fees: [{ name: "Stairs fee", amount: 50 }],
  bill: { hours: 3.5, labor: 525, travel: 75, fees: 25, deposit: 100, due: 525 },
};

const vault: StorageVault = {
  id: 3,
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
  jobId: 42,
  items: [{ name: "Sofa", quantity: 1, cuft: 50 }],
  moveInAt: "2026-10-01",
  moveOutAt: "2026-12-01",
  invoiceDay: 5,
  notes: "",
};

const header = (bytes: Uint8Array) => new TextDecoder().decode(bytes.slice(0, 5));

describe("client invoice PDF", () => {
  it("renders a readable PDF from job data alone", async () => {
    const bytes = await buildInvoicePdf({ job, company: { name: "MoveFlew" } });
    expect(header(bytes)).toBe("%PDF-");
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });

  it("includes storage fees, damage photos and the signature when present", async () => {
    const bytes = await buildInvoicePdf({
      job,
      company: { name: "MoveFlew Moving Co.", phone: "+15550100789", email: "office@example.test" },
      vaults: [vault],
      photos: [{ id: 1, phase: "pre", note: "Scratch", photoUrl: PIXEL, item: "Dresser", room: "Bedroom" }],
      signature: PIXEL,
    });
    expect(header(bytes)).toBe("%PDF-");
    // Signature + photo + storage table must add real content, not be silently skipped.
    const plain = await buildInvoicePdf({ job, company: { name: "MoveFlew Moving Co." } });
    expect(bytes.byteLength).toBeGreaterThan(plain.byteLength);
  });

  it("ignores broken photo and signature payloads instead of failing the download", async () => {
    const bytes = await buildInvoicePdf({
      job,
      company: { name: "MoveFlew" },
      photos: [{ id: 1, phase: "pre", note: "", photoUrl: "data:image/png;base64,not-an-image" }],
      signature: "data:image/png;base64,broken",
    });
    expect(header(bytes)).toBe("%PDF-");
  });
});
