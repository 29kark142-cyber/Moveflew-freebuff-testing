import { describe, expect, it } from "vitest";
import { bolPricing, bolSignatures, bolValuation } from "./bol";

const signature = `data:image/png;base64,iVBOR${"A".repeat(120)}`;

describe("bill of lading", () => {
  it("uses explicit signatures and falls back to legacy field signatures", () => {
    const explicit = bolSignatures({
      bolSignatures: {
        origin: { signature, signerName: "Casey", signedAt: "2026-11-06T10:00:00Z", by: "u1" },
        delivery: null,
      },
    });
    expect(explicit.origin?.signerName).toBe("Casey");
    expect(explicit.delivery).toBeNull();
    const legacy = bolSignatures({ signature, completedSignature: signature, signedOffAt: "2026-11-06" });
    expect(legacy.origin?.signedAt).toBe("2026-11-06");
    expect(legacy.delivery?.signature).toBe(signature);
  });

  it("itemises declared values without inventing a valuation", () => {
    const result = bolValuation([
      { key: "sofa", name: "Sofa", room: "Living", cuft: 40, weight: 120, quantity: 2, declaredValue: 500 },
      { key: "box", name: "Box", room: "Kitchen", cuft: 4, weight: 20, quantity: 10 },
    ]);
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0]?.totalCents).toBe(50000);
    expect(result.totalCents).toBe(50000);
    expect(result.declared).toBe(true);
    expect(bolValuation([{ key: "x", name: "X", room: "", cuft: 0, weight: 0, quantity: 1 }]).declared).toBe(false);
  });

  it("uses the final total for customer pricing when present", () => {
    const pricing = bolPricing({
      pricingMode: "hourly",
      hourlyRate: 130,
      estimatedHours: 3,
      distanceMiles: 10,
      travelFee: 20,
      weightRate: 0.5,
      mileRate: 2,
      inventory: [],
      fees: [{ name: "Stairs", amount: 50 }],
      discountPercent: 10,
      total: 455,
      finalTotal: 500,
      quoteSurge: { amount: 20 } as never,
    });
    expect(pricing.finalCents).toBe(50000);
    expect(pricing.feesCents).toBe(5000);
    expect(pricing.surgeCents).toBe(2000);
    expect(pricing.balanceCents).toBe(50000);
  });
});
