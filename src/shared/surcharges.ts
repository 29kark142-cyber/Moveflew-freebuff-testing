// Smart dynamic tariff surcharges: access difficulty, heavy items and route costs.
// The engine returns priced lines; the quote builder stores them as fee lines on the
// job so the server's `calculateQuote` total and the builder preview stay identical.

export const SURCHARGE_FEE_NAMES = {
  stairs: "Stair carry surcharge",
  carry: "Long carry surcharge",
  heavy: "Heavy item surcharge",
} as const;

export const HEAVY_ITEM_PRESETS = [
  "Grand piano",
  "Gun safe",
  "Marble table",
  "Hot tub",
  "Aquarium",
] as const;

export type SurchargeSettings = {
  /** Charge per flight of stairs above the first floor, per billable hour. */
  stairEnabled: boolean;
  stairFeePerFlightPerHour: number;
  /** Flights included before the surcharge starts (the "above 1st floor" allowance). */
  stairFreeFlights: number;
  carryEnabled: boolean;
  carryThresholdFt: number;
  carryFeePer25Ft: number;
  heavyEnabled: boolean;
  heavyDefaultFee: number;
};

export const DEFAULT_SURCHARGE_SETTINGS: SurchargeSettings = {
  stairEnabled: true,
  stairFeePerFlightPerHour: 25,
  stairFreeFlights: 1,
  carryEnabled: true,
  carryThresholdFt: 75,
  carryFeePer25Ft: 25,
  heavyEnabled: true,
  heavyDefaultFee: 150,
};

export type AccessProfile = { stairsFlights?: number; carryDistanceFt?: number };

export type HeavyItemInput = { name: string; quantity?: number; fee?: number };

export type SurchargeLine = {
  key: "stairs" | "carry" | "heavy";
  name: string;
  amount: number;
  detail: string;
};

const round2 = (value: number) => Math.round(value * 100) / 100;
const nonNegative = (value: unknown): number => {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
};

/** Whole number from storage, keeping zero but falling back when nothing usable was saved. */
const countOr = (value: unknown, fallback: number): number => {
  if (value === null || value === undefined || value === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : fallback;
};

/** Settings from storage with every field validated, falling back to the defaults. */
export function parseSurchargeSettings(input: unknown): SurchargeSettings {
  const raw = (input && typeof input === "object" ? input : {}) as Partial<SurchargeSettings>;
  const flag = (value: unknown, fallback: boolean) =>
    typeof value === "boolean" ? value : fallback;
  return {
    stairEnabled: flag(raw.stairEnabled, DEFAULT_SURCHARGE_SETTINGS.stairEnabled),
    stairFeePerFlightPerHour:
      nonNegative(raw.stairFeePerFlightPerHour) ||
      DEFAULT_SURCHARGE_SETTINGS.stairFeePerFlightPerHour,
    stairFreeFlights: Math.min(
      20,
      countOr(raw.stairFreeFlights, DEFAULT_SURCHARGE_SETTINGS.stairFreeFlights),
    ),
    carryEnabled: flag(raw.carryEnabled, DEFAULT_SURCHARGE_SETTINGS.carryEnabled),
    carryThresholdFt:
      nonNegative(raw.carryThresholdFt) || DEFAULT_SURCHARGE_SETTINGS.carryThresholdFt,
    carryFeePer25Ft: nonNegative(raw.carryFeePer25Ft) || DEFAULT_SURCHARGE_SETTINGS.carryFeePer25Ft,
    heavyEnabled: flag(raw.heavyEnabled, DEFAULT_SURCHARGE_SETTINGS.heavyEnabled),
    heavyDefaultFee: nonNegative(raw.heavyDefaultFee) || DEFAULT_SURCHARGE_SETTINGS.heavyDefaultFee,
  };
}

/** Flights above the allowance, priced per hour the crew is on the job. */
export function stairSurcharge(
  flights: unknown,
  settings: SurchargeSettings,
  hours: unknown,
): number {
  if (!settings.stairEnabled) return 0;
  const charged = Math.max(0, Math.floor(nonNegative(flights)) - settings.stairFreeFlights);
  if (!charged) return 0;
  return round2(charged * settings.stairFeePerFlightPerHour * Math.max(1, nonNegative(hours)));
}

/** Long carries are billed in whole 25 ft blocks beyond the free distance. */
export function carrySurcharge(feet: unknown, settings: SurchargeSettings): number {
  if (!settings.carryEnabled) return 0;
  const distance = nonNegative(feet);
  if (distance <= settings.carryThresholdFt) return 0;
  const blocks = Math.ceil((distance - settings.carryThresholdFt) / 25);
  return round2(blocks * settings.carryFeePer25Ft);
}

/** Flat fee per heavy item, with an optional per-item override from the quote. */
export function heavyItemFee(item: HeavyItemInput, settings: SurchargeSettings): number {
  if (!settings.heavyEnabled) return 0;
  const quantity = Math.max(1, Math.round(nonNegative(item.quantity) || 1));
  const fee = nonNegative(item.fee) || settings.heavyDefaultFee;
  return round2(fee * quantity);
}

export function surchargeLines(input: {
  settings?: SurchargeSettings;
  access?: AccessProfile;
  hours?: number;
  heavyItems?: HeavyItemInput[];
}): SurchargeLine[] {
  const settings = input.settings ?? DEFAULT_SURCHARGE_SETTINGS;
  const lines: SurchargeLine[] = [];

  const flights = Math.max(0, Math.floor(nonNegative(input.access?.stairsFlights)));
  const stairs = stairSurcharge(flights, settings, input.hours);
  if (stairs > 0) {
    lines.push({
      key: "stairs",
      name: SURCHARGE_FEE_NAMES.stairs,
      amount: stairs,
      detail: `${flights} flight(s) · ${settings.stairFreeFlights} included · ${flights - settings.stairFreeFlights} × $${settings.stairFeePerFlightPerHour}/hr`,
    });
  }

  const feet = Math.max(0, Math.round(nonNegative(input.access?.carryDistanceFt)));
  const carry = carrySurcharge(feet, settings);
  if (carry > 0) {
    lines.push({
      key: "carry",
      name: SURCHARGE_FEE_NAMES.carry,
      amount: carry,
      detail: `${feet} ft carry · over ${settings.carryThresholdFt} ft · $${settings.carryFeePer25Ft} per 25 ft`,
    });
  }

  const heavy = (input.heavyItems ?? []).filter((item) => item && item.name);
  const heavyTotal = round2(heavy.reduce((sum, item) => sum + heavyItemFee(item, settings), 0));
  if (heavyTotal > 0) {
    lines.push({
      key: "heavy",
      name: SURCHARGE_FEE_NAMES.heavy,
      amount: heavyTotal,
      detail: heavy
        .map((item) => `${item.name}${(item.quantity ?? 1) > 1 ? ` × ${item.quantity}` : ""}`)
        .join(", "),
    });
  }

  return lines;
}

export function surchargeTotal(lines: SurchargeLine[]): number {
  return round2(lines.reduce((sum, line) => sum + line.amount, 0));
}

/** Fee entries ready to merge into a job's `fees` array. */
export function surchargeFeeEntries(
  lines: SurchargeLine[],
): Array<{ name: string; amount: number }> {
  return lines
    .filter((line) => line.amount > 0)
    .map((line) => ({ name: line.name, amount: line.amount }));
}

export function isSurchargeFeeName(name: string): boolean {
  return (Object.values(SURCHARGE_FEE_NAMES) as string[]).includes(name);
}
