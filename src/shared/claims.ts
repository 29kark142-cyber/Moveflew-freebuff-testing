// Claim lifecycle shared by the office dashboard, the customer portal and tests.
// A status is only a record of a decision; a payout is a real finance expense.

export const CLAIM_STATUSES = [
  "pending",
  "under_review",
  "approved",
  "payout_issued",
  "rejected",
] as const;

export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export function isClaimStatus(value: unknown): value is ClaimStatus {
  return typeof value === "string" && (CLAIM_STATUSES as readonly string[]).includes(value);
}

/** Legacy names from earlier claim records are read without rewriting history. */
export function normalizeClaimStatus(value: unknown): ClaimStatus {
  if (isClaimStatus(value)) return value;
  const legacy: Record<string, ClaimStatus> = {
    open: "pending",
    investigating: "under_review",
    offered: "approved",
    resolved: "approved",
    rejected: "rejected",
  };
  return typeof value === "string" ? (legacy[value] ?? "pending") : "pending";
}

export function claimStatusLabel(value: unknown): string {
  const status = normalizeClaimStatus(value);
  return {
    pending: "Pending",
    under_review: "Under Review",
    approved: "Approved",
    payout_issued: "Payout Issued",
    rejected: "Rejected",
  }[status];
}

export function claimNeedsAmount(status: ClaimStatus): boolean {
  return status === "approved" || status === "payout_issued";
}

export function claimPayoutReady(status: ClaimStatus): boolean {
  return status === "approved";
}
