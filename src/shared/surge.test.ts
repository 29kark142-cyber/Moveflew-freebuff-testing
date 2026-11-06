import { describe, expect, it } from "vitest";
import {
  DEFAULT_SURGE_SETTINGS,
  applySurge,
  parseQuoteSurge,
  parseSurgeSettings,
  quoteSurgeFrom,
  type SurgeSettings,
} from "@shared/surge";

const settings = (overrides: Partial<SurgeSettings> = {}): SurgeSettings => ({
  ...DEFAULT_SURGE_SETTINGS,
  enabled: true,
  ...overrides,
  endOfMonth: { ...DEFAULT_SURGE_SETTINGS.endOfMonth, ...(overrides.endOfMonth ?? {}) },
});

describe("applySurge", () => {
  it("does nothing when automatic pricing is disabled", () => {
    const result = applySurge("2026-11-07", 1000, settings({ enabled: false, peakRules: [] }), 15);
    expect(result.amount).toBe(0);
    expect(result.total).toBe(1000);
    expect(result.lines).toEqual([]);
  });

  it("applies an inclusive peak season range and a weekend surcharge", () => {
    const result = applySurge(
      "2026-11-07",
      1000,
      settings({
        peakRules: [
          {
            id: "holiday",
            name: "Holiday peak",
            startDate: "2026-11-01",
            endDate: "2026-11-07",
            percent: 15,
            enabled: true,
          },
        ],
      }),
      10,
    );
    expect(result.percent).toBe(25);
    expect(result.amount).toBe(250);
    expect(result.total).toBe(1250);
    expect(result.lines.map((line) => line.kind)).toEqual(["peak", "weekend"]);
  });

  it("uses only the highest overlapping seasonal range", () => {
    const result = applySurge(
      "2026-06-15",
      500,
      settings({
        peakRules: [
          {
            id: "summer",
            name: "Summer",
            startDate: "2026-06-01",
            endDate: "2026-08-31",
            percent: 10,
            enabled: true,
          },
          {
            id: "july",
            name: "July rush",
            startDate: "2026-06-01",
            endDate: "2026-07-15",
            percent: 18,
            enabled: true,
          },
        ],
      }),
      0,
    );
    expect(result.percent).toBe(18);
    expect(result.amount).toBe(90);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]?.label).toContain("July rush");
  });

  it("applies the end-of-month surcharge from the configured day", () => {
    const eom = { enabled: true, startDay: 25, percent: 5 };
    const early = applySurge("2026-11-24", 1000, settings({ endOfMonth: eom }), 0);
    const late = applySurge("2026-11-25", 1000, settings({ endOfMonth: eom }), 0);
    expect(early.amount).toBe(0);
    expect(late.amount).toBe(50);
    expect(late.lines[0]?.kind).toBe("end_of_month");
  });

  it("caps stacked surcharges and keeps line amounts reconciled", () => {
    const result = applySurge(
      "2026-12-26",
      1000,
      settings({
        maxPercent: 20,
        endOfMonth: { enabled: true, startDay: 25, percent: 5 },
        peakRules: [
          {
            id: "new-year",
            name: "New Year",
            startDate: "2026-12-20",
            endDate: "2027-01-05",
            percent: 15,
            enabled: true,
          },
        ],
      }),
      10,
    );
    expect(result.percent).toBe(20);
    expect(result.amount).toBe(200);
    expect(result.capped).toBe(true);
    expect(result.lines.at(-1)?.kind).toBe("cap");
    expect(result.lines.reduce((sum, line) => sum + line.amount, 0)).toBeCloseTo(200);
  });

  it("ignores invalid dates and disabled rules", () => {
    const result = applySurge(
      "2026-02-31",
      1000,
      settings({
        peakRules: [
          {
            id: "bad",
            name: "Bad range",
            startDate: "2026-02-01",
            endDate: "2026-02-28",
            percent: 20,
            enabled: false,
          },
        ],
      }),
      10,
    );
    expect(result.amount).toBe(0);
    expect(result.total).toBe(1000);
  });

  it("falls back safely for malformed workspace settings", () => {
    expect(parseSurgeSettings({ enabled: true, maxPercent: 999, peakRules: "nope" })).toEqual(
      DEFAULT_SURGE_SETTINGS,
    );
    expect(parseSurgeSettings(null)).toEqual(DEFAULT_SURGE_SETTINGS);
  });
});

describe("quote surge snapshots", () => {
  it("stores and validates the customer-visible breakdown", () => {
    const applied = applySurge(
      "2026-11-07",
      1000,
      settings({
        peakRules: [
          {
            id: "fall",
            name: "Fall peak",
            startDate: "2026-11-01",
            endDate: "2026-11-30",
            percent: 15,
            enabled: true,
          },
        ],
      }),
      10,
    );
    const snapshot = quoteSurgeFrom(applied, "2026-11-07", "2026-11-01T00:00:00.000Z");
    expect(snapshot).not.toBeNull();
    expect(parseQuoteSurge(snapshot)).toEqual(snapshot);
  });

  it("rejects inconsistent or negative snapshots", () => {
    expect(
      parseQuoteSurge({
        version: 1,
        moveDate: "2026-11-07",
        percent: 10,
        amount: 100,
        appliedAt: "2026-11-01T00:00:00.000Z",
        lines: [
          {
            id: "weekend",
            kind: "weekend",
            label: "Weekend service",
            percent: 10,
            amount: 50,
          },
        ],
      }),
    ).toBeNull();
    expect(parseQuoteSurge({ version: 1, amount: -1 })).toBeNull();
    expect(quoteSurgeFrom({ ...applySurge("2026-11-07", 1000, settings(), 0) }, "", "")).toBeNull();
  });
});
