// Customer-facing estimate/invoice PDFs. Standard fonts only, so no network font fetch is
// needed inside the public request; the document contains no internal notes or crew data.
import { PDFDocument, StandardFonts, type PDFPage } from "pdf-lib";

export type PortalDocumentKind = "estimate" | "invoice";

export type PortalDocumentInput = {
  kind: PortalDocumentKind;
  token: string;
  company: { name: string; phone: string; email: string };
  customer: { name: string; email: string; phone: string };
  jobs: Array<{
    id: number;
    title: string;
    moveDate: string;
    origin: string;
    destination: string;
    status: string;
    invoiceStatus: string;
    total: number;
    finalTotal: number | null;
    inventory?: unknown;
    fees?: unknown;
  }>;
  invoices: Array<{
    id: number;
    invoiceNumber: string;
    amountCents: number;
    balanceCents: number;
    status: string;
  }>;
};

const money = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Number.isFinite(value) ? value : 0,
  );

export async function generatePortalPdf(input: PortalDocumentInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page: PDFPage = pdf.addPage([612, 792]);
  let y = 744;
  const newPage = () => {
    page = pdf.addPage([612, 792]);
    y = 744;
  };
  const line = (value: string, size = 11, weight: "normal" | "bold" = "normal") => {
    const used = weight === "bold" ? bold : font;
    const words = value.split(/\s+/);
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (used.widthOfTextAtSize(candidate, size) > 516 && current) {
        if (y < 60) newPage();
        page.drawText(current, { x: 48, y, size, font: used });
        y -= size + 6;
        current = word;
      } else current = candidate;
    }
    if (y < 60) newPage();
    page.drawText(current, { x: 48, y, size, font: used });
    y -= size + 7;
  };

  line(input.company.name, 20, "bold");
  line(input.kind === "invoice" ? "INVOICE AND BALANCE" : "MOVING ESTIMATE", 14, "bold");
  line(`Prepared for ${input.customer.name || "customer"}`, 11);
  if (input.customer.email) line(input.customer.email);
  if (input.customer.phone) line(input.customer.phone);
  line(
    [input.company.phone && `Office ${input.company.phone}`, input.company.email]
      .filter(Boolean)
      .join(" · "),
    10,
  );
  y -= 6;

  for (const job of input.jobs) {
    line(`Job #${job.id} — ${job.title}`, 12, "bold");
    line(`Move date: ${job.moveDate || "not scheduled"} · Status: ${job.status || "lead"}`);
    line(`Pickup: ${job.origin || "—"}`);
    line(`Delivery: ${job.destination || "—"}`);
    const inventory = Array.isArray(job.inventory)
      ? (job.inventory as Array<Record<string, unknown>>)
      : [];
    if (inventory.length) {
      line("Inventory", 11, "bold");
      for (const item of inventory.slice(0, 60))
        line(
          `${String(item["quantity"] ?? 1)} × ${String(item["name"] ?? "Item")}${item["room"] ? ` (${String(item["room"])})` : ""}`,
        );
    }
    const fees = Array.isArray(job.fees) ? (job.fees as Array<Record<string, unknown>>) : [];
    for (const fee of fees.slice(0, 30))
      line(`${String(fee["name"] ?? "Fee")}: ${money(Number(fee["amount"] ?? 0))}`);
    const total = Number(job.finalTotal ?? job.total ?? 0);
    line(
      job.finalTotal != null ? `Final total: ${money(total)}` : `Estimated total: ${money(total)}`,
      12,
      "bold",
    );
    if (input.kind === "invoice") {
      const invoice = input.invoices.find((entry) => entry.id === job.id);
      if (invoice) {
        line(`Invoice ${invoice.invoiceNumber} · ${invoice.status}`, 11, "bold");
        line(
          `Amount: ${money(invoice.amountCents / 100)} · Balance due: ${money(invoice.balanceCents / 100)}`,
        );
      } else line("No invoice has been issued for this move yet.");
    }
    y -= 10;
  }

  line(
    input.kind === "invoice"
      ? "Payments are applied only after verified processing. Contact the office with any question about this balance."
      : "This estimate is based on the inventory and services listed above. Contact the office to approve changes.",
    9,
  );
  line(
    `Portal reference: ${input.token.slice(0, 8)}… · Generated ${new Date().toISOString().slice(0, 10)}`,
    9,
  );
  pdf.setTitle(
    `${input.kind === "invoice" ? "Invoice" : "Estimate"} — ${input.customer.name || "Customer"}`,
  );
  pdf.setAuthor(input.company.name);
  return pdf.save();
}
