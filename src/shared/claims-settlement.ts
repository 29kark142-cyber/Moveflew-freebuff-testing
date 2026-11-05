export const CLAIM_RESOLUTION_KINDS = ["cash", "repair"] as const;
export type ClaimResolutionKind = (typeof CLAIM_RESOLUTION_KINDS)[number];

/** These names deliberately distinguish an external record from provider execution. */
export const CLAIM_SETTLEMENT_METHODS = [
  "manual_external_cash_payout",
  "external_processor_refund_record",
  "repair_completed",
] as const;
export type ClaimSettlementMethod = (typeof CLAIM_SETTLEMENT_METHODS)[number];

export type ClaimJournalAccount =
  | "claims_expense"
  | "claims_liability"
  | "cash";

export type ClaimJournalLine = {
  account: ClaimJournalAccount;
  debitCents: number;
  creditCents: number;
};

export type SettlementValidation =
  | { ok: true; remainingCents: number }
  | { ok: false; reason: "invalid_amount" | "insufficient_approved_balance" };

export function claimRemainingCents(
  approvedCents: number,
  settledCents: number
): number {
  if (!Number.isInteger(approvedCents) || !Number.isInteger(settledCents))
    throw new Error("Claim amounts must be integer cents");
  return Math.max(0, approvedCents - settledCents);
}

/**
 * Validates against the approved amount, not a payment processor balance. It is
 * used before recording any manual/external settlement and never calls a provider.
 */
export function validateClaimSettlement(
  approvedCents: number,
  alreadySettledCents: number,
  requestedCents: number
): SettlementValidation {
  if (
    !Number.isInteger(approvedCents) ||
    !Number.isInteger(alreadySettledCents) ||
    !Number.isInteger(requestedCents) ||
    approvedCents < 0 ||
    alreadySettledCents < 0 ||
    requestedCents <= 0
  )
    return { ok: false, reason: "invalid_amount" };
  const remainingCents = claimRemainingCents(approvedCents, alreadySettledCents);
  return requestedCents <= remainingCents
    ? { ok: true, remainingCents: remainingCents - requestedCents }
    : { ok: false, reason: "insufficient_approved_balance" };
}

/** Approval recognizes expected claim expense and liability; it does not move money. */
export function buildClaimApprovalJournal(
  approvedCents: number
): ClaimJournalLine[] {
  if (!Number.isInteger(approvedCents) || approvedCents <= 0)
    throw new Error("approvedCents must be a positive integer");
  return [
    { account: "claims_expense", debitCents: approvedCents, creditCents: 0 },
    { account: "claims_liability", debitCents: 0, creditCents: approvedCents },
  ];
}

/**
 * Settlement clears only the remaining approved liability. `cash` denotes the
 * accounting side of a recorded external payout/refund; this helper never
 * executes a payout or refund API request.
 */
export function buildClaimSettlementJournal(
  settlementCents: number
): ClaimJournalLine[] {
  if (!Number.isInteger(settlementCents) || settlementCents <= 0)
    throw new Error("settlementCents must be a positive integer");
  return [
    { account: "claims_liability", debitCents: settlementCents, creditCents: 0 },
    { account: "cash", debitCents: 0, creditCents: settlementCents },
  ];
}

export function isBalancedClaimJournal(lines: ClaimJournalLine[]): boolean {
  const debit = lines.reduce((total, line) => total + line.debitCents, 0);
  const credit = lines.reduce((total, line) => total + line.creditCents, 0);
  return debit === credit && debit > 0;
}

export function isClaimResolutionKind(
  value: unknown
): value is ClaimResolutionKind {
  return typeof value === "string" && (CLAIM_RESOLUTION_KINDS as readonly string[]).includes(value);
}

export function isClaimSettlementMethod(
  value: unknown
): value is ClaimSettlementMethod {
  return typeof value === "string" && (CLAIM_SETTLEMENT_METHODS as readonly string[]).includes(value);
}
