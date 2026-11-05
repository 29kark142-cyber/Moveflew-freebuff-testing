// Spreadsheet exports must never let a customer-entered cell run as a formula.
// Any text cell that starts with =, +, -, @, a tab or a carriage return is
// prefixed with an apostrophe so Excel/Sheets show it as plain text.
// Numbers are left alone: they come from the app, not from typed text, and an
// apostrophe would turn them into text and break column totals.
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function csvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  if (typeof value === "string" && FORMULA_PREFIX.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function csvContent(rows: unknown[][], lineEnd = "\r\n"): string {
  return rows.map(row => row.map(csvCell).join(",")).join(lineEnd);
}
