// Payroll review rules shared by the server report and tests. These are review totals, not
// tax withholding or an employment classification.

export const WEEKLY_REGULAR_MINUTES = 40 * 60;
export const OVERTIME_MULTIPLIER = 1.5;

export function netMinutes(minutes: unknown, breakMinutes: unknown): number {
  const worked = Math.max(0, Math.floor(Number(minutes) || 0));
  const breaks = Math.max(0, Math.floor(Number(breakMinutes) || 0));
  return Math.max(0, worked - breaks);
}

export function splitOvertime(minutes: number): {
  regularMinutes: number;
  overtimeMinutes: number;
} {
  const total = Math.max(0, Math.floor(Number(minutes) || 0));
  const regularMinutes = Math.min(total, WEEKLY_REGULAR_MINUTES);
  return { regularMinutes, overtimeMinutes: total - regularMinutes };
}

export function payrollPayCents(
  regularMinutes: number,
  overtimeMinutes: number,
  rateCents: number,
): { regularPayCents: number; overtimePayCents: number } {
  const rate = Math.max(0, Math.round(Number(rateCents) || 0));
  return {
    regularPayCents: Math.round((regularMinutes / 60) * rate),
    overtimePayCents: Math.round((overtimeMinutes / 60) * rate * OVERTIME_MULTIPLIER),
  };
}

export type TipAllocationInput = { crewMemberId: number; amountCents: number };

export function tipAllocationIssue(
  amountCents: number,
  allocations: TipAllocationInput[],
  assignedCrewIds: number[],
): string | null {
  if (!Number.isInteger(amountCents) || amountCents <= 0)
    return "Enter a tip amount greater than zero";
  const assigned = new Set(assignedCrewIds.map(Number));
  const seen = new Set<number>();
  let total = 0;
  for (const allocation of allocations) {
    const crewId = Number(allocation.crewMemberId);
    const cents = Number(allocation.amountCents);
    if (!Number.isInteger(crewId) || !assigned.has(crewId))
      return "Every tip allocation must belong to crew assigned to this move";
    if (seen.has(crewId)) return "Each crew member can appear only once";
    seen.add(crewId);
    if (!Number.isInteger(cents) || cents < 0) return "Tip allocations must be whole cents";
    total += cents;
  }
  if (total !== amountCents) return "Tip allocations must add up to the full tip amount";
  if (!allocations.length) return "Add at least one crew allocation";
  return null;
}

export function tipAllocations(
  value: unknown,
): Array<{
  crewMemberId: number;
  amountCents: number;
  payoutId?: number | null;
  paidMethod?: string | null;
}> {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => {
      const row = (raw ?? {}) as Record<string, unknown>;
      return {
        crewMemberId: Number(row["crewMemberId"]),
        amountCents: Math.max(0, Math.round(Number(row["amountCents"]) || 0)),
        ...(row["payoutId"] == null ? {} : { payoutId: Number(row["payoutId"]) }),
        ...(typeof row["paidMethod"] === "string" ? { paidMethod: row["paidMethod"] } : {}),
      };
    })
    .filter((row) => Number.isInteger(row.crewMemberId) && row.crewMemberId > 0);
}
