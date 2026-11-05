import { describe, expect, it } from "vitest";
import {
  carrySurcharge,
  DEFAULT_SURCHARGE_SETTINGS,
  heavyItemFee,
  isSurchargeFeeName,
  parseSurchargeSettings,
  stairSurcharge,
  SURCHARGE_FEE_NAMES,
  surchargeFeeEntries,
  surchargeLines,
  surchargeTotal,
} from "./surcharges";

const settings = DEFAULT_SURCHARGE_SETTINGS;

describe("smart tariff surcharges", () => {
  it("charges stairs per flight above the first floor, per billable hour", () => {
    expect(stairSurcharge(0, settings, 3)).toBe(0);
    expect(stairSurcharge(1, settings, 3)).toBe(0);
    expect(stairSurcharge(3, settings, 3)).toBe(150);
    expect(stairSurcharge(3, settings, 2)).toBe(100);
    expect(stairSurcharge(3, { ...settings, stairEnabled: false }, 3)).toBe(0);
  });

  it("bills long carries in whole 25 ft blocks past the free distance", () => {
    expect(carrySurcharge(75, settings)).toBe(0);
    expect(carrySurcharge(76, settings)).toBe(25);
    expect(carrySurcharge(100, settings)).toBe(25);
    expect(carrySurcharge(126, settings)).toBe(75);
    expect(carrySurcharge(76, { ...settings, carryEnabled: false })).toBe(0);
  });

  it("applies the default heavy item fee and honours a per-item override", () => {
    expect(heavyItemFee({ name: "Grand piano" }, settings)).toBe(150);
    expect(heavyItemFee({ name: "Gun safe", fee: 300 }, settings)).toBe(300);
    expect(heavyItemFee({ name: "Grand piano", quantity: 2 }, settings)).toBe(300);
    expect(heavyItemFee({ name: "Grand piano" }, { ...settings, heavyEnabled: false })).toBe(0);
  });

  it("composes priced lines with readable detail and matching fee entries", () => {
    const lines = surchargeLines({
      settings,
      access: { stairsFlights: 3, carryDistanceFt: 120 },
      hours: 3,
      heavyItems: [{ name: "Grand piano" }, { name: "Marble table", fee: 200 }],
    });
    expect(lines.map((line) => line.key)).toEqual(["stairs", "carry", "heavy"]);
    expect(lines[0]?.amount).toBe(150);
    expect(lines[1]?.amount).toBe(50);
    expect(lines[2]?.amount).toBe(350);
    expect(surchargeTotal(lines)).toBe(550);
    expect(surchargeFeeEntries(lines)).toEqual([
      { name: SURCHARGE_FEE_NAMES.stairs, amount: 150 },
      { name: SURCHARGE_FEE_NAMES.carry, amount: 50 },
      { name: SURCHARGE_FEE_NAMES.heavy, amount: 350 },
    ]);
    expect(isSurchargeFeeName(SURCHARGE_FEE_NAMES.heavy)).toBe(true);
    expect(isSurchargeFeeName("Fuel surcharge")).toBe(false);
  });

  it("returns no lines for an easy-access, light move", () => {
    expect(
      surchargeLines({ settings, access: { stairsFlights: 1, carryDistanceFt: 40 }, hours: 4 }),
    ).toEqual([]);
    expect(surchargeFeeEntries([])).toEqual([]);
  });

  it("falls back to safe defaults for stored settings", () => {
    const parsed = parseSurchargeSettings({
      stairFeePerFlightPerHour: -5,
      carryThresholdFt: "abc",
    });
    expect(parsed.stairFeePerFlightPerHour).toBe(25);
    expect(parsed.carryThresholdFt).toBe(75);
    expect(parsed.heavyDefaultFee).toBe(150);
    expect(parseSurchargeSettings(null)).toEqual(DEFAULT_SURCHARGE_SETTINGS);
    expect(parseSurchargeSettings({ stairEnabled: false }).stairEnabled).toBe(false);
  });
});
