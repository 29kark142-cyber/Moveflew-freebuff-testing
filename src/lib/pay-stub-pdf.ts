import { PDFDocument, StandardFonts } from "pdf-lib";
import type { PayrollRow } from "@/lib/ops-api";

const money = (cents: number) =>
  (Number(cents) || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });

export async function downloadPayStub(
  row: PayrollRow,
  period: { from: string; to: string },
): Promise<void> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([612, 792]);
  let y = 740;
  const line = (value: string, size = 11, weight: "normal" | "bold" = "normal") => {
    page.drawText(value, { x: 48, y, size, font: weight === "bold" ? bold : font });
    y -= size + 8;
  };

  line("CREW PAY STUB", 18, "bold");
  line(`Pay period: ${period.from} — ${period.to}`);
  line(`Crew member: ${row.name}`, 12, "bold");
  y -= 8;
  line("Hours and rate", 12, "bold");
  line(`Regular: ${(row.regularMinutes / 60).toFixed(2)} hours at ${money(row.rateCents)}/hour`);
  line(`Overtime: ${(row.overtimeMinutes / 60).toFixed(2)} hours at 1.5×`);
  y -= 8;
  line("Earnings", 12, "bold");
  line(`Regular pay: ${money(row.regularPayCents)}`);
  line(`Overtime pay: ${money(row.overtimePayCents)}`);
  line(`Tips allocated: ${money(row.tipCents)}`);
  line(`Total review pay: ${money(row.totalCents)}`, 13, "bold");
  y -= 18;
  line("Review total only. No tax withholding or disbursement is represented by this stub.", 9);

  const bytes = await pdf.save();
  const blob = new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `pay-stub-${row.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${period.from}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}
