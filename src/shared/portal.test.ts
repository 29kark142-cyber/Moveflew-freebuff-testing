import { describe, expect, it } from "vitest";
import {
  appendPortalPhotos,
  appendPortalRequest,
  invoiceForJob,
  isValidPortalDate,
  MAX_PORTAL_PHOTOS,
  portalPhotos,
  portalRequests,
  type PortalRequest,
} from "./portal";

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const request = (patch: Partial<PortalRequest> = {}): PortalRequest => ({
  id: "request-1",
  kind: "date_change",
  status: "pending",
  at: "2026-06-01T10:00:00.000Z",
  ...patch,
});

describe("portal requests", () => {
  it("keeps only valid requests and caps the history", () => {
    expect(portalRequests([{ kind: "bogus", at: "nope" }, request()])).toHaveLength(1);
    const many = Array.from({ length: 30 }, (_, index) =>
      request({ id: `request-${index}`, at: new Date(2026, 0, index + 1).toISOString() }),
    );
    expect(portalRequests(many)).toHaveLength(20);
  });

  it("appends newest first without duplicating an id", () => {
    const first = appendPortalRequest([request()], request({ id: "request-2" }));
    expect(first.map((entry) => entry.id)).toEqual(["request-2", "request-1"]);
    expect(appendPortalRequest(first, request({ id: "request-2" }))).toHaveLength(2);
  });

  it("accepts today or later and rejects past or malformed dates", () => {
    const now = new Date(2026, 10, 6);
    expect(isValidPortalDate("2026-11-06", now)).toBe(true);
    expect(isValidPortalDate("2026-11-07", now)).toBe(true);
    expect(isValidPortalDate("2026-11-05", now)).toBe(false);
    expect(isValidPortalDate("11/06/2026", now)).toBe(false);
  });
});

describe("portal photos", () => {
  it("accepts png data URLs and rejects markup or oversized payloads", () => {
    const saved = appendPortalPhotos([], [{ name: "Sofa", dataUrl: PNG }]);
    expect(saved).toHaveLength(1);
    expect(saved[0]?.name).toBe("Sofa");
    expect(
      appendPortalPhotos([], [{ dataUrl: "data:text/html;base64,PHNjcmlwdD4=" }]),
    ).toHaveLength(0);
    expect(
      appendPortalPhotos([], [{ dataUrl: `data:image/png;base64,${"A".repeat(700_000)}` }]),
    ).toHaveLength(0);
  });

  it("caps how many photos a customer can attach", () => {
    const current = Array.from({ length: MAX_PORTAL_PHOTOS }, (_, index) => ({
      id: `photo-${index}`,
      name: "Box",
      at: "2026-06-01T10:00:00.000Z",
      dataUrl: PNG,
    }));
    expect(portalPhotos(current)).toHaveLength(MAX_PORTAL_PHOTOS);
    expect(appendPortalPhotos(current, [{ dataUrl: PNG }])).toHaveLength(MAX_PORTAL_PHOTOS);
  });
});

describe("portal invoices", () => {
  it("uses the locked final total and clears the balance once paid", () => {
    expect(
      invoiceForJob({ id: 42, total: 1000, finalTotal: 1250.5, invoiceStatus: "sent" }),
    ).toEqual({
      id: 42,
      invoiceNumber: "INV-00042",
      amountCents: 125050,
      balanceCents: 125050,
      status: "sent",
    });
    expect(invoiceForJob({ id: 42, total: 1000, invoiceStatus: "paid" })?.balanceCents).toBe(0);
    expect(invoiceForJob({ id: 42, total: 0 })).toBeNull();
  });
});
