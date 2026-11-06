import { describe, expect, it } from "vitest";
import {
  CLAIM_STATUSES,
  claimNeedsAmount,
  claimPayoutReady,
  claimStatusLabel,
  normalizeClaimStatus,
} from "./claims";

describe("claim statuses", () => {
  it("exposes the five dashboard statuses", () => {
    expect(CLAIM_STATUSES).toEqual([
      "pending",
      "under_review",
      "approved",
      "payout_issued",
      "rejected",
    ]);
  });

  it("normalizes legacy records without losing their meaning", () => {
    expect(normalizeClaimStatus("open")).toBe("pending");
    expect(normalizeClaimStatus("investigating")).toBe("under_review");
    expect(normalizeClaimStatus("offered")).toBe("approved");
    expect(normalizeClaimStatus("resolved")).toBe("approved");
    expect(normalizeClaimStatus("payout_issued")).toBe("payout_issued");
    expect(normalizeClaimStatus("nonsense")).toBe("pending");
  });

  it("requires an amount before approval and only pays approved claims", () => {
    expect(claimNeedsAmount("approved")).toBe(true);
    expect(claimNeedsAmount("payout_issued")).toBe(true);
    expect(claimNeedsAmount("pending")).toBe(false);
    expect(claimPayoutReady("approved")).toBe(true);
    expect(claimPayoutReady("payout_issued")).toBe(false);
  });

  it("labels statuses for the UI", () => {
    expect(claimStatusLabel("under_review")).toBe("Under Review");
    expect(claimStatusLabel("payout_issued")).toBe("Payout Issued");
  });
});
