import { describe, expect, it } from "vitest";
import { csvCell, csvContent } from "./csv-export";

// A spreadsheet cell as Excel sees it: wrapped in quotes.
const cell = (text: string) => `"${text}"`;

describe("spreadsheet exports", () => {
  it("neutralises text cells a customer could otherwise run as a formula", () => {
    expect(csvCell("=SUM(1,2)")).toBe(cell("'=SUM(1,2)"));
    expect(csvCell("+1+1")).toBe(cell("'+1+1"));
    expect(csvCell("-1+1")).toBe(cell("'-1+1"));
    expect(csvCell("@evil")).toBe(cell("'@evil"));
    expect(csvCell("\tscale")).toBe(cell("'\tscale"));
    expect(csvCell("\rscale")).toBe(cell("'\rscale"));
  });

  it("leaves numbers and normal text readable so column totals still work", () => {
    expect(csvCell(-500)).toBe(cell("-500"));
    expect(csvCell(1500.5)).toBe(cell("1500.5"));
    expect(csvCell("Fuel surcharge")).toBe(cell("Fuel surcharge"));
    expect(csvCell("")).toBe(cell(""));
    expect(csvCell(null)).toBe(cell(""));
    expect(csvCell(undefined)).toBe(cell(""));
  });

  it("keeps quotes inside a cell", () => {
    expect(csvCell('He said "yes"')).toBe(cell('He said ""yes""'));
  });

  it("builds a full sheet with one header row and one row per record", () => {
    const sheet = csvContent([
      ["Reference", "Description", "Amount"],
      ["INV-1", "=cmd|'/C calc'!A0", 2400],
      ["INV-2", "Piano", -150],
    ]);
    expect(sheet.split("\r\n")).toHaveLength(3);
    expect(sheet).toContain(cell("'=cmd|'/C calc'!A0"));
    expect(sheet).toContain(cell("2400"));
    expect(sheet).toContain(cell("-150"));
  });
});
