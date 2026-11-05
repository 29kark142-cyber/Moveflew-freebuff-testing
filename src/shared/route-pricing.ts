// Automated travel pricing shared by the job sheet, the estimate builder and the
// public quote form. One implementation keeps the preview and the saved total equal.
export type RoutePricingInput = {
  distanceMiles?: number;
  travelMinutes?: number;
  /** Dollars charged per driving mile. */
  perMileRate?: number;
  /** Crew rate per hour, also used for paid drive time. */
  crewHourlyRate?: number;
  /** Office override: replaces the calculated travel total when set. */
  manualOverride?: number | null;
  /** Percentage discount applied to the estimate subtotal (0–100). */
  discountPercent?: number;
};

export type RoutePricing = {
  miles: number;
  minutes: number;
  hours: number;
  /** Miles × per-mile rate. */
  mileageSurcharge: number;
  /** Drive hours × crew hourly rate. */
  transitCost: number;
  /** Mileage + transit, before any override. */
  calculatedTravel: number;
  /** What is actually billed for travel (override wins when supplied). */
  travelCharge: number;
  overrideUsed: boolean;
  discountPercent: number;
  discountAmount: number;
  /** Travel charge after the discount percentage. */
  total: number;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

function amount(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

/** Percentages are always stored as 0–100 so a saved discount can never invert a total. */
export function clampDiscountPercent(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.min(100, round2(number));
}

export function routeTravelPricing(input: RoutePricingInput): RoutePricing {
  const miles = Math.max(0, round2(amount(input.distanceMiles)));
  const minutes = Math.max(0, Math.round(amount(input.travelMinutes)));
  const hours = round2(minutes / 60);
  const mileageSurcharge = round2(miles * amount(input.perMileRate));
  const transitCost = round2((minutes / 60) * amount(input.crewHourlyRate));
  const calculatedTravel = round2(mileageSurcharge + transitCost);
  const overrideUsed =
    input.manualOverride !== null &&
    input.manualOverride !== undefined &&
    String(input.manualOverride) !== "" &&
    Number.isFinite(Number(input.manualOverride)) &&
    Number(input.manualOverride) >= 0;
  const travelCharge = overrideUsed ? round2(Number(input.manualOverride)) : calculatedTravel;
  const discountPercent = clampDiscountPercent(input.discountPercent);
  const discountAmount = round2(travelCharge * (discountPercent / 100));
  return {
    miles,
    minutes,
    hours,
    mileageSurcharge,
    transitCost,
    calculatedTravel,
    travelCharge,
    overrideUsed,
    discountPercent,
    discountAmount,
    total: round2(travelCharge - discountAmount),
  };
}

/** Compact label used on the route summary card and in the stored quote notes. */
export function routeSummaryLabel(miles: number, minutes: number): string {
  const distance = `${Math.max(0, Math.round(miles * 10) / 10)} mi`;
  if (!minutes) return distance;
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  const duration = hours ? `${hours} h ${rest} min` : `${rest} min`;
  return `${distance} · ${duration}`;
}
