// Crew tipping rules shared by the field screen and the server, so the amount the
// customer picks and the amount recorded on the job can never drift apart.

/** Presets offered on the field tipping screen, in cents. */
export const TIP_PRESETS = [2000, 5000, 10000] as const;

/** A tip above this is almost certainly a mistyped custom amount. */
export const MAX_TIP_CENTS = 200_000;

export type TipAllocation = { crewId: number | null; name: string; cents: number };

export type TipRecord = {
  /** Total tip in cents. Zero records a deliberate "No tip" decision. */
  cents: number;
  method: "card" | "cash" | "check" | "none";
  at: string;
  by: string;
  /** Even split across the crew assigned to the job, remainder to the first members. */
  allocation: TipAllocation[];
};

/** Integer cents inside the allowed range, or null when the value is unusable. */
export function validTipCents(value: unknown): number | null {
  const cents = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(cents)) return null;
  const whole = Math.round(cents);
  if (whole !== cents || whole < 0 || whole > MAX_TIP_CENTS) return null;
  return whole;
}

/**
 * Splits a tip evenly across the crew. The whole cents always add back up to the
 * amount the customer chose: the remainder goes one cent at a time to the first
 * members rather than being dropped.
 */
export function splitTip(
  cents: number,
  crew: Array<{ id: number; name: string }>,
): TipAllocation[] {
  if (!Number.isInteger(cents) || cents <= 0 || crew.length === 0) return [];
  const base = Math.floor(cents / crew.length);
  let remainder = cents - base * crew.length;
  return crew.map((member) => {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    return { crewId: member.id, name: member.name, cents: base + extra };
  });
}

export function allocationTotal(allocation: TipAllocation[]): number {
  return allocation.reduce((sum, line) => sum + line.cents, 0);
}

export function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

/** Short line for the crew and office screens. */
export function tipSummary(tip: TipRecord | null | undefined): string {
  if (!tip) return "No tip recorded";
  if (tip.cents <= 0) return "Customer chose no tip";
  const names = tip.allocation.map((line) => line.name).filter(Boolean);
  const who = names.length ? names.join(", ") : "the assigned crew";
  return `${formatCents(tip.cents)} split across ${who}`;
}
