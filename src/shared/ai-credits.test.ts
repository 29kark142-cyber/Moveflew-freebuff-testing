import { describe, expect, it } from "vitest";
import {
  AI_CREDIT_CHECKOUT_KIND,
  checkoutReturnUrls,
  creditPurchaseReceipt,
  findDuplicatePurchase,
  isPendingCreditStatus,
  parseCheckoutMetadata,
  sumPurchaseCredits,
} from "./ai-credits";

const valid = {
  kind: AI_CREDIT_CHECKOUT_KIND,
  workspaceId: "42",
  packId: "six",
  credits: "6",
  requestId: "17",
};

describe("AI credit checkout metadata", () => {
  it("accepts a well-formed scan pack session", () => {
    expect(parseCheckoutMetadata(valid)).toEqual({
      kind: AI_CREDIT_CHECKOUT_KIND,
      workspaceId: 42,
      packId: "six",
      credits: 6,
      requestId: "17",
    });
  });

  it("rejects metadata whose credit count does not match the pack", () => {
    expect(parseCheckoutMetadata({ ...valid, credits: "99" })).toBeNull();
    expect(parseCheckoutMetadata({ ...valid, packId: "huge" })).toBeNull();
    expect(parseCheckoutMetadata({ ...valid, workspaceId: "0" })).toBeNull();
    expect(parseCheckoutMetadata({ ...valid, kind: "deposit" })).toBeNull();
    expect(parseCheckoutMetadata(null)).toBeNull();
  });

  it("allows a request id to be omitted", () => {
    const { requestId: _unused, ...withoutRequest } = valid;
    expect(parseCheckoutMetadata(withoutRequest)?.credits).toBe(6);
  });

  it("builds a paid receipt with a normalized currency", () => {
    const receipt = creditPurchaseReceipt({
      eventId: "evt_1",
      sessionId: "cs_1",
      paymentIntent: "pi_1",
      packId: "six",
      credits: 6,
      amountCents: 2500,
      currency: "USD",
      livemode: true,
      workspaceId: 42,
      customerEmail: "owner@example.com",
      paidAt: "2026-11-05T10:00:00.000Z",
    });
    expect(receipt["status"]).toBe("paid");
    expect(receipt["credits"]).toBe(6);
    expect(receipt["amountCents"]).toBe(2500);
    expect(receipt["currency"]).toBe("usd");
    expect(receipt["eventId"]).toBe("evt_1");
  });

  it("ignores a webhook retry for the same event or session", () => {
    const purchases = [
      { eventId: "evt_1", sessionId: "cs_1" },
      { eventId: "evt_2", sessionId: "cs_2" },
    ];
    expect(findDuplicatePurchase(purchases, { eventId: "evt_1", sessionId: "cs_9" })).toBeDefined();
    expect(findDuplicatePurchase(purchases, { eventId: "evt_9", sessionId: "cs_2" })).toBeDefined();
    expect(findDuplicatePurchase(purchases, { eventId: "evt_9", sessionId: "cs_9" })).toBeUndefined();
    expect(findDuplicatePurchase([], { eventId: "evt_1", sessionId: "" })).toBeUndefined();
  });

  it("sums only usable purchased credits", () => {
    expect(sumPurchaseCredits([{ credits: 6 }, { credits: 1 }, { credits: -4 }, { credits: "x" }])).toBe(7);
    expect(sumPurchaseCredits([])).toBe(0);
  });

  it("recognises pending checkout states", () => {
    expect(isPendingCreditStatus("awaiting_payment")).toBe(true);
    expect(isPendingCreditStatus("checkout_created")).toBe(true);
    expect(isPendingCreditStatus("granted")).toBe(false);
    expect(isPendingCreditStatus(undefined)).toBe(false);
  });

  it("builds Stripe return links without double slashes", () => {
    expect(checkoutReturnUrls("https://quotes.example.com/").success).toContain(
      "https://quotes.example.com/app/dashboard?credits=success",
    );
    expect(checkoutReturnUrls("https://quotes.example.com").cancel).toBe(
      "https://quotes.example.com/app/dashboard?credits=cancelled",
    );
  });
});
