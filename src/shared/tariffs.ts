/**
 * Advanced tariff domain types and deterministic rating helpers.
 *
 * This module deliberately contains no carrier tariff values. A profile is only
 * rateable after an authenticated owner imports carrier-provided data with a
 * source and licensing/permission attestation.
 */

export const TARIFF_JURISDICTIONS = ["intrastate", "interstate"] as const;
export type TariffJurisdiction = (typeof TARIFF_JURISDICTIONS)[number];

export const TARIFF_RULE_KINDS = [
  "minimum_labor",
  "trip",
  "travel",
  "fuel",
  "stairs",
  "elevator",
  "wait",
  "heavy_item",
] as const;
export type TariffRuleKind = (typeof TARIFF_RULE_KINDS)[number];

export const TARIFF_CHARGE_TYPES = ["flat", "per_unit", "percent"] as const;
export type TariffChargeType = (typeof TARIFF_CHARGE_TYPES)[number];

export type TariffProfileRate = {
  id: number;
  tenantId: number;
  name: string;
  version: string;
  status: "active" | "archived";
  jurisdiction: TariffJurisdiction;
  originState: string | null;
  destinationState: string | null;
  carrierName: string;
  usdotNumber: string | null;
  authorityType: string;
  vanline: string | null;
  tariffReference: string;
  sourceUrl: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  sourceAttestedAt: string | null;
};

export type TariffRuleRate = {
  id: number;
  profileId: number;
  code: string;
  kind: TariffRuleKind;
  label: string;
  chargeType: TariffChargeType;
  rateCents: number;
  percentBps: number;
  includedQuantity: number;
  minimumQuantity: number;
  selector: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  active: boolean;
};

export type TariffWeightBandRate = {
  id: number;
  profileId: number;
  minLbs: number;
  maxLbs: number | null;
  baseCents: number;
  rateCentsPerLb: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  active: boolean;
};

export type TariffDistanceBandRate = {
  id: number;
  profileId: number;
  minMiles: number;
  maxMiles: number | null;
  baseCents: number;
  rateCentsPerMile: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  active: boolean;
};

export type HeavyItemInput = { code: string; quantity: number };

/** Rating inputs are explicitly captured in every applied snapshot. */
export type TariffRatingInput = {
  originState: string;
  destinationState: string;
  serviceDate: string;
  crewSize: number;
  estimatedHours: number;
  weightLb: number;
  distanceMi: number;
  tripCount?: number;
  travelMiles?: number;
  stairsFlights?: number;
  elevatorStops?: number;
  elevatorWaitMinutes?: number;
  heavyItems?: HeavyItemInput[];
  /** Required only when replacing an existing unsigned snapshot. */
  intentionalRevision?: boolean;
};

export type TariffLineItem = {
  key: string;
  category:
    | "base_labor"
    | "weight_band"
    | "distance_band"
    | TariffRuleKind;
  description: string;
  amountCents: number;
  quantity: number;
  unitCents: number | null;
  calculation: string;
  effectiveFrom: string;
  effectiveTo: string | null;
};

export type TariffQuote = {
  profileId: number;
  profileName: string;
  profileVersion: string;
  tariffReference: string;
  approvedHourlyRateCents: number;
  minimumLaborHours: number;
  lines: TariffLineItem[];
  totalCents: number;
};

/** Frozen rate material persisted in a snapshot so later profile edits cannot rewrite an accepted quote. */
export type FrozenTariffRating = {
  format: 1;
  profile: TariffProfileRate;
  rules: TariffRuleRate[];
  weightBands: TariffWeightBandRate[];
  distanceBands: TariffDistanceBandRate[];
  input: TariffRatingInput;
  approvedHourlyRateCents: number;
  tenantMinimumLaborHours: number;
};

export type TariffImportDocument = {
  schemaVersion: 1;
  profile: {
    name: string;
    version: string;
    jurisdiction: TariffJurisdiction;
    originState: string | null;
    destinationState: string | null;
    carrierName: string;
    usdotNumber: string | null;
    authorityType: string;
    vanline: string | null;
    tariffReference: string;
    sourceUrl: string | null;
    effectiveFrom: string;
    effectiveTo: string | null;
    /** Must be true; it is bound to the authenticated importer server-side. */
    licenseAndSourceAttested: true;
  };
  rules: Array<
    Omit<TariffRuleRate, "id" | "profileId"> & { effectiveFrom: string; effectiveTo: string | null }
  >;
  weightBands: Array<
    Omit<TariffWeightBandRate, "id" | "profileId"> & { effectiveFrom: string; effectiveTo: string | null }
  >;
  distanceBands: Array<
    Omit<TariffDistanceBandRate, "id" | "profileId"> & { effectiveFrom: string; effectiveTo: string | null }
  >;
};

export class TariffValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TariffValidationError";
  }
}

const MAX_CENTS = 1_000_000_000;
const MAX_QUANTITY = 10_000_000;
const STATE = /^[A-Z]{2}$/;
const CODE = /^[a-z0-9][a-z0-9_.-]{0,79}$/;

function fail(message: string): never {
  throw new TariffValidationError(message);
}
function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(`${field} must be an object`);
  return value as Record<string, unknown>;
}
function array(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) fail(`${field} must be an array`);
  return value;
}
function requiredText(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || !value.trim()) fail(`${field} is required`);
  const result = value.trim();
  if (result.length > max) fail(`${field} is too long`);
  return result;
}
function optionalText(
  value: unknown,
  field: string,
  max: number
): string | null {
  if (value === undefined || value === null || value === "") return null;
  return requiredText(value, field, max);
}
function numberValue(
  value: unknown,
  field: string,
  min: number,
  max: number,
  integer = false
): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    fail(`${field} must be a number`);
  if (integer && !Number.isInteger(value)) fail(`${field} must be an integer`);
  if (value < min || value > max) fail(`${field} must be between ${min} and ${max}`);
  return value;
}
function optionalNumberValue(
  value: unknown,
  field: string,
  min: number,
  max: number,
  fallback: number,
  integer = false
): number {
  if (value === undefined || value === null) return fallback;
  return numberValue(value, field, min, max, integer);
}
function date(value: unknown, field: string): string {
  const result = requiredText(value, field, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) fail(`${field} must be YYYY-MM-DD`);
  const parsed = new Date(`${result}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== result)
    fail(`${field} must be a valid calendar date`);
  return result;
}
function optionalDate(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  return date(value, field);
}
function state(value: unknown, field: string, optional = false): string | null {
  if (value === undefined || value === null || value === "") {
    if (optional) return null;
    fail(`${field} is required`);
  }
  if (typeof value !== "string" || !STATE.test(value.trim().toUpperCase()))
    fail(`${field} must be a two-letter US state code`);
  return value.trim().toUpperCase();
}
function enumValue<T extends readonly string[]>(
  value: unknown,
  field: string,
  allowed: T
): T[number] {
  if (typeof value !== "string" || !allowed.includes(value))
    fail(`${field} is invalid`);
  return value as T[number];
}
function checkedUrl(value: unknown, field: string): string | null {
  const result = optionalText(value, field, 700);
  if (!result) return null;
  try {
    const parsed = new URL(result);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
      fail(`${field} must be an http(s) URL`);
  } catch (error) {
    if (error instanceof TariffValidationError) throw error;
    fail(`${field} must be an http(s) URL`);
  }
  return result;
}
function assertDateRange(
  from: string,
  to: string | null,
  field: string
): void {
  if (to && to < from) fail(`${field}.effectiveTo must be on or after effectiveFrom`);
}
function rangesOverlap(
  fromA: string,
  toA: string | null,
  fromB: string,
  toB: string | null
): boolean {
  return (toB === null || fromA <= toB) && (toA === null || fromB <= toA);
}
function quantityRangesOverlap(
  minA: number,
  maxA: number | null,
  minB: number,
  maxB: number | null
): boolean {
  return (maxB === null || minA <= maxB) && (maxA === null || minB <= maxA);
}

function parseRule(raw: unknown, profile: TariffImportDocument["profile"], index: number) {
  const item = record(raw, `rules[${index}]`);
  const kind = enumValue(item.kind, `rules[${index}].kind`, TARIFF_RULE_KINDS);
  const chargeType = enumValue(
    item.chargeType ?? "flat",
    `rules[${index}].chargeType`,
    TARIFF_CHARGE_TYPES
  );
  const effectiveFrom = item.effectiveFrom
    ? date(item.effectiveFrom, `rules[${index}].effectiveFrom`)
    : profile.effectiveFrom;
  const effectiveTo = item.effectiveTo === undefined
    ? profile.effectiveTo
    : optionalDate(item.effectiveTo, `rules[${index}].effectiveTo`);
  assertDateRange(effectiveFrom, effectiveTo, `rules[${index}]`);
  if (effectiveFrom < profile.effectiveFrom || (profile.effectiveTo && (!effectiveTo || effectiveTo > profile.effectiveTo)))
    fail(`rules[${index}] effective interval must be inside the profile interval`);
  const code = requiredText(item.code, `rules[${index}].code`, 80).toLowerCase();
  if (!CODE.test(code)) fail(`rules[${index}].code must use lowercase letters, digits, dots, dashes, or underscores`);
  const rule = {
    code,
    kind,
    label: requiredText(item.label, `rules[${index}].label`, 180),
    chargeType,
    rateCents: optionalNumberValue(item.rateCents, `rules[${index}].rateCents`, 0, MAX_CENTS, 0, true),
    percentBps: optionalNumberValue(item.percentBps, `rules[${index}].percentBps`, 0, 100_000, 0, true),
    includedQuantity: optionalNumberValue(item.includedQuantity, `rules[${index}].includedQuantity`, 0, MAX_QUANTITY, 0),
    minimumQuantity: optionalNumberValue(item.minimumQuantity, `rules[${index}].minimumQuantity`, 0, 48, 0),
    selector: optionalText(item.selector, `rules[${index}].selector`, 80)?.toLowerCase() ?? null,
    effectiveFrom,
    effectiveTo,
    active: item.active === undefined ? true : item.active === true,
  };
  if (item.active !== undefined && typeof item.active !== "boolean")
    fail(`rules[${index}].active must be true or false`);
  if (kind === "minimum_labor") {
    if (rule.minimumQuantity <= 0)
      fail(`rules[${index}].minimumQuantity must be greater than zero for minimum_labor`);
    if (chargeType !== "flat" || rule.rateCents !== 0 || rule.percentBps !== 0)
      fail(`rules[${index}] minimum_labor only sets a minimum; its rate must be zero`);
  }
  if (kind === "fuel" && chargeType !== "percent")
    fail(`rules[${index}] fuel must use chargeType percent`);
  if (chargeType === "percent" && rule.percentBps <= 0)
    fail(`rules[${index}].percentBps must be greater than zero for percent charges`);
  if (chargeType !== "percent" && rule.percentBps !== 0)
    fail(`rules[${index}].percentBps is only valid for percent charges`);
  if (kind === "heavy_item" && !rule.selector)
    fail(`rules[${index}].selector is required for heavy_item`);
  return rule;
}

function parseBand(
  raw: unknown,
  profile: TariffImportDocument["profile"],
  index: number,
  type: "weightBands" | "distanceBands"
) {
  const item = record(raw, `${type}[${index}]`);
  const prefix = type === "weightBands" ? "Lbs" : "Miles";
  const min = numberValue(item[`min${prefix}`], `${type}[${index}].min${prefix}`, 0, MAX_QUANTITY);
  const maxRaw = item[`max${prefix}`];
  const max = maxRaw === undefined || maxRaw === null ? null : numberValue(maxRaw, `${type}[${index}].max${prefix}`, min, MAX_QUANTITY);
  const effectiveFrom = item.effectiveFrom
    ? date(item.effectiveFrom, `${type}[${index}].effectiveFrom`)
    : profile.effectiveFrom;
  const effectiveTo = item.effectiveTo === undefined
    ? profile.effectiveTo
    : optionalDate(item.effectiveTo, `${type}[${index}].effectiveTo`);
  assertDateRange(effectiveFrom, effectiveTo, `${type}[${index}]`);
  if (effectiveFrom < profile.effectiveFrom || (profile.effectiveTo && (!effectiveTo || effectiveTo > profile.effectiveTo)))
    fail(`${type}[${index}] effective interval must be inside the profile interval`);
  const active = item.active === undefined ? true : item.active === true;
  if (item.active !== undefined && typeof item.active !== "boolean")
    fail(`${type}[${index}].active must be true or false`);
  return {
    min,
    max,
    baseCents: optionalNumberValue(item.baseCents, `${type}[${index}].baseCents`, 0, MAX_CENTS, 0, true),
    rateCents: optionalNumberValue(item[`rateCentsPer${type === "weightBands" ? "Lb" : "Mile"}`], `${type}[${index}].rateCentsPer${type === "weightBands" ? "Lb" : "Mile"}`, 0, MAX_CENTS, 0, true),
    effectiveFrom,
    effectiveTo,
    active,
  };
}

/** Strictly validates an owner-supplied, carrier-specific JSON rate document. */
export function parseTariffImportDocument(value: unknown): TariffImportDocument {
  const source = record(value, "tariff import");
  if (source.schemaVersion !== 1) fail("schemaVersion must be 1");
  const rawProfile = record(source.profile, "profile");
  const jurisdiction = enumValue(rawProfile.jurisdiction, "profile.jurisdiction", TARIFF_JURISDICTIONS);
  const effectiveFrom = date(rawProfile.effectiveFrom, "profile.effectiveFrom");
  const effectiveTo = optionalDate(rawProfile.effectiveTo, "profile.effectiveTo");
  assertDateRange(effectiveFrom, effectiveTo, "profile");
  if (rawProfile.licenseAndSourceAttested !== true)
    fail("profile.licenseAndSourceAttested must be true before rates can be imported");
  const profile: TariffImportDocument["profile"] = {
    name: requiredText(rawProfile.name, "profile.name", 180),
    version: requiredText(rawProfile.version, "profile.version", 100),
    jurisdiction,
    originState: state(rawProfile.originState, "profile.originState", true),
    destinationState: state(rawProfile.destinationState, "profile.destinationState", true),
    carrierName: requiredText(rawProfile.carrierName, "profile.carrierName", 180),
    usdotNumber: optionalText(rawProfile.usdotNumber, "profile.usdotNumber", 40),
    authorityType: requiredText(rawProfile.authorityType, "profile.authorityType", 80),
    vanline: optionalText(rawProfile.vanline, "profile.vanline", 180),
    tariffReference: requiredText(rawProfile.tariffReference, "profile.tariffReference", 300),
    sourceUrl: checkedUrl(rawProfile.sourceUrl, "profile.sourceUrl"),
    effectiveFrom,
    effectiveTo,
    licenseAndSourceAttested: true,
  };
  if (jurisdiction === "interstate" && !profile.usdotNumber)
    fail("profile.usdotNumber is required for interstate profiles");
  if (jurisdiction === "intrastate" && profile.originState && profile.destinationState && profile.originState !== profile.destinationState)
    fail("intrastate profile originState and destinationState must match when both are supplied");

  const rules = array(source.rules ?? [], "rules").map((item, index) => parseRule(item, profile, index));
  const seenRules = new Set<string>();
  for (const rule of rules) {
    const key = `${rule.code}:${rule.effectiveFrom}:${rule.effectiveTo ?? "open"}`;
    if (seenRules.has(key)) fail(`rules contains duplicate effective rule ${rule.code}`);
    seenRules.add(key);
  }
  const rawWeightBands = array(source.weightBands ?? [], "weightBands").map((item, index) => parseBand(item, profile, index, "weightBands"));
  const rawDistanceBands = array(source.distanceBands ?? [], "distanceBands").map((item, index) => parseBand(item, profile, index, "distanceBands"));
  const validateBandSet = (
    bands: Array<{ min: number; max: number | null; effectiveFrom: string; effectiveTo: string | null }>,
    field: string
  ) => {
    for (let a = 0; a < bands.length; a += 1) {
      for (let b = a + 1; b < bands.length; b += 1) {
        if (
          quantityRangesOverlap(bands[a]!.min, bands[a]!.max, bands[b]!.min, bands[b]!.max) &&
          rangesOverlap(bands[a]!.effectiveFrom, bands[a]!.effectiveTo, bands[b]!.effectiveFrom, bands[b]!.effectiveTo)
        )
          fail(`${field} contains overlapping quantity/effective ranges`);
      }
    }
  };
  validateBandSet(rawWeightBands, "weightBands");
  validateBandSet(rawDistanceBands, "distanceBands");

  return {
    schemaVersion: 1,
    profile,
    rules: rules.map(rule => ({ id: 0, profileId: 0, ...rule })),
    weightBands: rawWeightBands.map(band => ({
      id: 0,
      profileId: 0,
      minLbs: band.min,
      maxLbs: band.max,
      baseCents: band.baseCents,
      rateCentsPerLb: band.rateCents,
      effectiveFrom: band.effectiveFrom,
      effectiveTo: band.effectiveTo,
      active: band.active,
    })),
    distanceBands: rawDistanceBands.map(band => ({
      id: 0,
      profileId: 0,
      minMiles: band.min,
      maxMiles: band.max,
      baseCents: band.baseCents,
      rateCentsPerMile: band.rateCents,
      effectiveFrom: band.effectiveFrom,
      effectiveTo: band.effectiveTo,
      active: band.active,
    })),
  };
}

export function isEffectiveOn(
  effectiveFrom: string,
  effectiveTo: string | null,
  serviceDate: string
): boolean {
  return serviceDate >= effectiveFrom && (!effectiveTo || serviceDate <= effectiveTo);
}

function validateRatingInput(input: TariffRatingInput): TariffRatingInput {
  const originState = state(input.originState, "originState")!;
  const destinationState = state(input.destinationState, "destinationState")!;
  const serviceDate = date(input.serviceDate, "serviceDate");
  const crewSize = numberValue(input.crewSize, "crewSize", 1, 6, true);
  const validated: TariffRatingInput = {
    originState,
    destinationState,
    serviceDate,
    crewSize,
    estimatedHours: numberValue(input.estimatedHours, "estimatedHours", 0, 48),
    weightLb: numberValue(input.weightLb, "weightLb", 0, MAX_QUANTITY),
    distanceMi: numberValue(input.distanceMi, "distanceMi", 0, MAX_QUANTITY),
    tripCount: optionalNumberValue(input.tripCount, "tripCount", 0, 1000, 1),
    travelMiles: optionalNumberValue(input.travelMiles, "travelMiles", 0, MAX_QUANTITY, input.distanceMi),
    stairsFlights: optionalNumberValue(input.stairsFlights, "stairsFlights", 0, 1000, 0),
    elevatorStops: optionalNumberValue(input.elevatorStops, "elevatorStops", 0, 1000, 0),
    elevatorWaitMinutes: optionalNumberValue(input.elevatorWaitMinutes, "elevatorWaitMinutes", 0, 10_000, 0),
    heavyItems: [],
    intentionalRevision: input.intentionalRevision === true,
  };
  if (input.intentionalRevision !== undefined && typeof input.intentionalRevision !== "boolean")
    fail("intentionalRevision must be true or false");
  if (input.heavyItems !== undefined) {
    if (!Array.isArray(input.heavyItems)) fail("heavyItems must be an array");
    if (input.heavyItems.length > 100) fail("heavyItems has too many entries");
    validated.heavyItems = input.heavyItems.map((item, index) => {
      const raw = record(item, `heavyItems[${index}]`);
      const code = requiredText(raw.code, `heavyItems[${index}].code`, 80).toLowerCase();
      if (!CODE.test(code)) fail(`heavyItems[${index}].code is invalid`);
      return {
        code,
        quantity: numberValue(raw.quantity, `heavyItems[${index}].quantity`, 1, 1000),
      };
    });
  }
  return validated;
}

/** Ensures a profile is geographically and temporally valid for this shipment. */
export function assertProfileMatchesInput(
  profile: TariffProfileRate,
  rawInput: TariffRatingInput
): TariffRatingInput {
  const input = validateRatingInput(rawInput);
  if (profile.status !== "active") fail("Tariff profile is archived and cannot be rated");
  if (!profile.sourceAttestedAt) fail("Tariff profile lacks a source/license attestation");
  if (!isEffectiveOn(profile.effectiveFrom, profile.effectiveTo, input.serviceDate))
    fail("Tariff profile is outside its effective interval for this service date");
  const interstate = input.originState !== input.destinationState;
  if ((interstate && profile.jurisdiction !== "interstate") || (!interstate && profile.jurisdiction !== "intrastate"))
    fail("Tariff profile jurisdiction does not match the shipment");
  if (profile.originState && profile.originState !== input.originState)
    fail("Tariff profile does not apply to the origin state");
  if (profile.destinationState && profile.destinationState !== input.destinationState)
    fail("Tariff profile does not apply to the destination state");
  return input;
}

function bandFor<T extends { active: boolean; effectiveFrom: string; effectiveTo: string | null }>(
  bands: T[],
  quantity: number,
  min: (item: T) => number,
  max: (item: T) => number | null,
  serviceDate: string,
  description: string
): T | null {
  const active = bands.filter(item => item.active && isEffectiveOn(item.effectiveFrom, item.effectiveTo, serviceDate));
  if (!active.length) return null;
  const matches = active.filter(item => quantity >= min(item) && (max(item) === null || quantity <= max(item)!));
  if (matches.length !== 1)
    fail(matches.length ? `${description} bands are ambiguous for the supplied quantity` : `No effective ${description.toLowerCase()} band covers the supplied quantity`);
  return matches[0]!;
}

function centsForRate(rateCents: number, quantity: number): number {
  const amount = Math.round(rateCents * quantity);
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > MAX_CENTS)
    fail("Calculated tariff amount is out of range");
  return amount;
}

function chargeForRule(
  rule: TariffRuleRate,
  quantity: number,
  subtotalCents: number
): number {
  if (quantity <= rule.includedQuantity) return 0;
  if (rule.chargeType === "flat") return rule.rateCents;
  if (rule.chargeType === "per_unit")
    return centsForRate(rule.rateCents, quantity - rule.includedQuantity);
  return Math.round((subtotalCents * rule.percentBps) / 10_000);
}

function quantityForRule(rule: TariffRuleRate, input: TariffRatingInput): number {
  switch (rule.kind) {
    case "trip":
      return input.tripCount ?? 1;
    case "travel":
      return input.travelMiles ?? input.distanceMi;
    case "stairs":
      return input.stairsFlights ?? 0;
    case "elevator":
      return input.elevatorStops ?? 0;
    case "wait":
      return input.elevatorWaitMinutes ?? 0;
    case "heavy_item":
      return (input.heavyItems ?? [])
        .filter(item => item.code === rule.selector)
        .reduce((sum, item) => sum + item.quantity, 0);
    default:
      return 0;
  }
}

export type TariffRatingContext = {
  profile: TariffProfileRate;
  rules: TariffRuleRate[];
  weightBands: TariffWeightBandRate[];
  distanceBands: TariffDistanceBandRate[];
  approvedHourlyRateCents: number;
  tenantMinimumLaborHours: number;
};

/**
 * Rates a shipment using imported data and approved base labor rates. No dollars
 * are used internally; every computed amount is an integer number of USD cents.
 */
export function calculateTariffQuote(
  context: TariffRatingContext,
  rawInput: TariffRatingInput
): TariffQuote {
  const input = assertProfileMatchesInput(context.profile, rawInput);
  if (!Number.isInteger(context.approvedHourlyRateCents) || context.approvedHourlyRateCents < 0)
    fail("Approved hourly rate must be non-negative integer cents");
  if (!Number.isFinite(context.tenantMinimumLaborHours) || context.tenantMinimumLaborHours < 0)
    fail("Tenant minimum labor hours are invalid");
  const effectiveRules = context.rules.filter(
    rule => rule.active && isEffectiveOn(rule.effectiveFrom, rule.effectiveTo, input.serviceDate)
  );
  const minHours = Math.max(
    context.tenantMinimumLaborHours,
    ...effectiveRules
      .filter(rule => rule.kind === "minimum_labor")
      .map(rule => rule.minimumQuantity)
  );
  const lines: TariffLineItem[] = [];
  const laborHours = Math.max(minHours, input.estimatedHours);
  lines.push({
    key: "approved_base_labor",
    category: "base_labor",
    description: "Approved base labor",
    amountCents: centsForRate(context.approvedHourlyRateCents, laborHours),
    quantity: laborHours,
    unitCents: context.approvedHourlyRateCents,
    calculation: `${laborHours} labor hours × approved hourly rate`,
    effectiveFrom: context.profile.effectiveFrom,
    effectiveTo: context.profile.effectiveTo,
  });

  const weightBand = bandFor(
    context.weightBands,
    input.weightLb,
    band => band.minLbs,
    band => band.maxLbs,
    input.serviceDate,
    "Weight"
  );
  if (weightBand) {
    lines.push({
      key: `weight_band:${weightBand.id}`,
      category: "weight_band",
      description: "Weight band charge",
      amountCents: weightBand.baseCents + centsForRate(weightBand.rateCentsPerLb, input.weightLb),
      quantity: input.weightLb,
      unitCents: weightBand.rateCentsPerLb,
      calculation: `${input.weightLb} lb within selected weight band`,
      effectiveFrom: weightBand.effectiveFrom,
      effectiveTo: weightBand.effectiveTo,
    });
  }
  const matchedDistanceBand = bandFor(
    context.distanceBands,
    input.distanceMi,
    band => band.minMiles,
    band => band.maxMiles,
    input.serviceDate,
    "Distance"
  );
  if (matchedDistanceBand) {
    lines.push({
      key: `distance_band:${matchedDistanceBand.id}`,
      category: "distance_band",
      description: "Distance band charge",
      amountCents:
        matchedDistanceBand.baseCents +
        centsForRate(matchedDistanceBand.rateCentsPerMile, input.distanceMi),
      quantity: input.distanceMi,
      unitCents: matchedDistanceBand.rateCentsPerMile,
      calculation: `${input.distanceMi} miles within selected distance band`,
      effectiveFrom: matchedDistanceBand.effectiveFrom,
      effectiveTo: matchedDistanceBand.effectiveTo,
    });
  }

  const nonFuelRules = effectiveRules.filter(
    rule => rule.kind !== "minimum_labor" && rule.kind !== "fuel"
  );
  for (const rule of nonFuelRules) {
    const quantity = quantityForRule(rule, input);
    const amountCents = chargeForRule(rule, quantity, 0);
    if (!amountCents) continue;
    lines.push({
      key: `rule:${rule.code}`,
      category: rule.kind,
      description: rule.label,
      amountCents,
      quantity,
      unitCents: rule.chargeType === "percent" ? null : rule.rateCents,
      calculation:
        rule.chargeType === "flat"
          ? "Flat tariff accessorial"
          : `${quantity - rule.includedQuantity} billable units`,
      effectiveFrom: rule.effectiveFrom,
      effectiveTo: rule.effectiveTo,
    });
  }
  const subtotalBeforeFuel = lines.reduce((sum, line) => sum + line.amountCents, 0);
  for (const rule of effectiveRules.filter(rule => rule.kind === "fuel")) {
    const amountCents = chargeForRule(rule, 1, subtotalBeforeFuel);
    if (!amountCents) continue;
    lines.push({
      key: `rule:${rule.code}`,
      category: rule.kind,
      description: rule.label,
      amountCents,
      quantity: 1,
      unitCents: null,
      calculation: `${rule.percentBps} basis points of pre-fuel rated subtotal`,
      effectiveFrom: rule.effectiveFrom,
      effectiveTo: rule.effectiveTo,
    });
  }
  const totalCents = lines.reduce((sum, line) => sum + line.amountCents, 0);
  if (!Number.isSafeInteger(totalCents) || totalCents < 0 || totalCents > MAX_CENTS)
    fail("Calculated tariff total is out of range");
  return {
    profileId: context.profile.id,
    profileName: context.profile.name,
    profileVersion: context.profile.version,
    tariffReference: context.profile.tariffReference,
    approvedHourlyRateCents: context.approvedHourlyRateCents,
    minimumLaborHours: minHours,
    lines,
    totalCents,
  };
}

export function createFrozenTariffRating(
  context: TariffRatingContext,
  input: TariffRatingInput
): FrozenTariffRating {
  return {
    format: 1,
    profile: structuredClone(context.profile),
    rules: structuredClone(context.rules),
    weightBands: structuredClone(context.weightBands),
    distanceBands: structuredClone(context.distanceBands),
    input: structuredClone(input),
    approvedHourlyRateCents: context.approvedHourlyRateCents,
    tenantMinimumLaborHours: context.tenantMinimumLaborHours,
  };
}

/** Re-rates only from frozen snapshot material, never from a later profile or tenant-rate edit. */
export function calculateFrozenTariffFinal(
  frozen: FrozenTariffRating,
  actualHours: number
): TariffQuote {
  if (!frozen || frozen.format !== 1) fail("Tariff snapshot format is not supported");
  const actual = numberValue(actualHours, "actualHours", 0, 48);
  return calculateTariffQuote(
    {
      profile: { ...frozen.profile, status: "active", sourceAttestedAt: frozen.profile.sourceAttestedAt ?? "snapshot" },
      rules: frozen.rules,
      weightBands: frozen.weightBands,
      distanceBands: frozen.distanceBands,
      approvedHourlyRateCents: frozen.approvedHourlyRateCents,
      tenantMinimumLaborHours: frozen.tenantMinimumLaborHours,
    },
    { ...frozen.input, estimatedHours: actual }
  );
}

export function centsToDollars(cents: number): number {
  if (!Number.isInteger(cents)) fail("cents must be an integer");
  return cents / 100;
}
