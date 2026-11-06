// Move-day field rules shared by the crew phone screen and the server (one rule, no drift).

export const FIELD_PHASES = [
  { key: "start_travel", label: "Start Travel" },
  { key: "arrive_pickup", label: "Arrive at Pickup" },
  { key: "start_loading", label: "Start Loading" },
  { key: "in_transit", label: "In Transit" },
  { key: "arrive_dropoff", label: "Arrive at Drop-off" },
  { key: "complete", label: "Complete Job" },
] as const;

export type FieldPhase = (typeof FIELD_PHASES)[number]["key"];
export type Timeline = Partial<Record<FieldPhase, string>>;
export type FieldStatus = "Assigned" | "In Transit" | "In Progress" | "Completed";

export const isPhase = (v: unknown): v is FieldPhase => FIELD_PHASES.some(p => p.key === v);

export function nextPhase(t: Timeline | null | undefined): FieldPhase | null {
  for (const p of FIELD_PHASES) if (!t?.[p.key]) return p.key;
  return null;
}

export function fieldStatus(t: Timeline | null | undefined): FieldStatus {
  const done = FIELD_PHASES.filter(p => t?.[p.key]).map(p => p.key);
  const last = done[done.length - 1];
  if (!last) return "Assigned";
  if (last === "complete") return "Completed";
  if (last === "start_travel" || last === "in_transit") return "In Transit";
  return "In Progress";
}

/** Billable labour runs from arrival at pickup until the job is completed, rounded up to the next quarter hour. */
export function billableHours(t: Timeline | null | undefined): number {
  const start = t?.arrive_pickup ? Date.parse(t.arrive_pickup) : NaN;
  const end = t?.complete ? Date.parse(t.complete) : NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.ceil(((end - start) / 3_600_000) * 4) / 4;
}

export type FinalBill = {
  hours: number;
  labor: number;
  travel: number;
  fees: number;
  /** Crew tip the customer chose after signing the eBOL. */
  tip: number;
  deposit: number;
  /** Everything the customer owes before the deposit is applied. */
  subtotal: number;
  due: number;
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Final bill = billable hours × hourly rate + travel fee + other fees + tip − deposit paid (never below zero). */
export function finalBill(job: Record<string, unknown>, hours: number): FinalBill {
  const labor = r2(hours * num(job["hourlyRate"]));
  const travel = r2(num(job["travelFee"]));
  const packing = r2(num(job["packingSubtotalCents"]) / 100);
  const fees = r2(
    (Array.isArray(job["fees"]) ? (job["fees"] as { amount?: unknown }[]) : []).reduce((s, f) => s + num(f?.amount), 0) + packing,
  );
  const tip = r2(num(job["tipCents"]) / 100);
  const deposit = r2(num(job["depositPaidCents"]) / 100);
  const subtotal = r2(labor + travel + fees + tip);
  return { hours, labor, travel, fees, tip, deposit, subtotal, due: Math.max(0, r2(subtotal - deposit)) };
}

/** Accept a client-recorded time (for offline taps) only if it is recent and not in the future. */
export function acceptedTime(at: unknown, now = Date.now()): string {
  const t = typeof at === "string" ? Date.parse(at) : NaN;
  if (Number.isFinite(t) && t <= now + 2 * 60_000 && t >= now - 12 * 3_600_000) return new Date(t).toISOString();
  return new Date(now).toISOString();
}
