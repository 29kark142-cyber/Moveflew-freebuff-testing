import { describe, expect, it } from "vitest";
import {
  allocationTotal,
  MAX_TIP_CENTS,
  splitTip,
  TIP_PRESETS,
  tipSummary,
  validTipCents,
} from "./tipping";

describe("crew tipping", () => {
  it("offers the posted presets and rejects amounts outside the allowed range", () => {
    expect(TIP_PRESETS).toEqual([2000, 5000, 10000]);
    expect(validTipCents(0)).toBe(0);
    expect(validTipCents(2000)).toBe(2000);
    expect(validTipCents(MAX_TIP_CENTS)).toBe(MAX_TIP_CENTS);
    expect(validTipCents(MAX_TIP_CENTS + 1)).toBeNull();
    expect(validTipCents(-1)).toBeNull();
    expect(validTipCents(12.5)).toBeNull();
    expect(validTipCents("50")).toBe(50);
    expect(validTipCents("abc")).toBeNull();
  });

  it("splits a tip across the crew without losing or inventing cents", () => {
    const crew = [
      { id: 1, name: "Dana" },
      { id: 2, name: "Luis" },
      { id: 3, name: "Sam" },
    ];
    const split = splitTip(10000, crew);
    expect(split.map((line) => line.cents)).toEqual([3334, 3333, 3333]);
    expect(allocationTotal(split)).toBe(10000);

    const odd = splitTip(5000, crew.slice(0, 2));
    expect(odd.map((line) => line.cents)).toEqual([2500, 2500]);
    expect(allocationTotal(odd)).toBe(5000);
  });

  it("records no allocation for a custom of zero or an empty crew", () => {
    expect(splitTip(0, [{ id: 1, name: "Dana" }])).toEqual([]);
    expect(splitTip(2000, [])).toEqual([]);
  });

  it("describes the recorded tip for the office screens", () => {
    expect(tipSummary(null)).toBe("No tip recorded");
    expect(tipSummary({ cents: 0, method: "none", at: "x", by: "u", allocation: [] })).toBe(
      "Customer chose no tip",
    );
    expect(
      tipSummary({
        cents: 5000,
        method: "card",
        at: "x",
        by: "u",
        allocation: [
          { crewId: 1, name: "Dana", cents: 2500 },
          { crewId: 2, name: "Luis", cents: 2500 },
        ],
      }),
    ).toBe("$50.00 split across Dana, Luis");
  });
});
