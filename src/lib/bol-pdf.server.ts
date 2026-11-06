import { PDFDocument, StandardFonts } from "pdf-lib";
import { BOL_LEGAL_TERMS, type BolDocument } from "@/shared/bol";

/** Renders the signed legal BOL; standard fonts keep the render independent of public URLs. */
export async function generateBolPdf(data: BolDocument): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([612, 792]);
  let y = 750;
  const width = 516;
  const next = () => {
    page = pdf.addPage([612, 792]);
    y = 750;
  };
  const line = (value: unknown, size = 10, isBold = false) => {
    const words = String(value ?? "").split(/\s+/);
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > width && current) {
        if (y < 54) next();
        page.drawText(current, { x: 48, y, size, font: isBold ? bold : font });
        y -= size + 5;
        current = word;
      } else current = candidate;
    }
    if (y < 54) next();
    page.drawText(current, { x: 48, y, size, font: isBold ? bold : font });
    y -= size + 7;
  };
  const signature = async (dataUrl: string, label: string) => {
    if (!/^data:image\/png;base64,iVBOR/i.test(dataUrl)) return;
    try {
      const bytes = Uint8Array.from(atob(dataUrl.split(",")[1] ?? ""), (char) => char.charCodeAt(0));
      const image = await pdf.embedPng(bytes);
      const scale = Math.min(width / image.width, 90 / image.height);
      if (y - image.height * scale < 54) next();
      page.drawImage(image, { x: 48, y: y - image.height * scale, width: image.width * scale, height: image.height * scale });
      y -= image.height * scale + 8;
    } catch {
      line(`${label}: image could not be rendered`, 9);
    }
  };
  const job = data.job;
  const company = (job["companyName"] as string) || "MoveFlew";
  line(company, 20, true);
  line("BILL OF LADING", 16, true);
  line(`Job #${job["id"] ?? ""} · ${job["moveDate"] ?? ""} · Generated ${data.generatedAt}`, 9);
  line(`Customer: ${job["customerName"] ?? job["title"] ?? ""}`);
  line(`Pickup: ${job["origin"] ?? ""}`);
  line(`Delivery: ${job["destination"] ?? ""}`);
  line(`Email: ${job["customerEmail"] ?? ""} · Phone: ${job["customerPhone"] ?? ""}`, 9);
  line("CONTRACT TERMS", 12, true);
  line(BOL_LEGAL_TERMS, 9);
  line("ITEMISED DECLARED VALUATION", 12, true);
  if (!data.valuation.lines.length) line("No shipment inventory was supplied.", 9);
  for (const item of data.valuation.lines) {
    line(`${item.name} · Qty ${item.quantity} · ${item.weight} lb · declared $${(item.totalCents / 100).toFixed(2)}`, 9);
  }
  line(`Total declared value: $${(data.valuation.totalCents / 100).toFixed(2)}${data.valuation.declared ? "" : " (no value declared)"}`, 10, true);
  line("FINAL PRICING", 12, true);
  line(`Estimated charges: $${(data.pricing.estimatedCents / 100).toFixed(2)}`);
  line(`Fees: $${(data.pricing.feesCents / 100).toFixed(2)} · Discount: $${(data.pricing.discountCents / 100).toFixed(2)} · Surge: $${(data.pricing.surgeCents / 100).toFixed(2)}`, 9);
  line(`Final amount: $${(data.pricing.finalCents / 100).toFixed(2)}`, 12, true);
  line(`Balance due: $${(data.pricing.balanceCents / 100).toFixed(2)}`, 10, true);
  line("SIGN-OFFS", 12, true);
  for (const [role, signatureData] of Object.entries(data.signatures) as Array<["origin" | "delivery", BolDocument["signatures"]["origin"]]>) {
    const label = role === "origin" ? "Origin pickup" : "Destination delivery";
    line(`${label}: ${signatureData?.signerName || "Not signed"}${signatureData?.signedAt ? ` · ${signatureData.signedAt}` : ""}`, 10, true);
    if (signatureData) await signature(signatureData.signature, label);
    else line("Signature not on file.", 9);
  }
  pdf.setTitle(`Bill of Lading — Job ${job["id"] ?? ""}`);
  pdf.setAuthor(company);
  for (const [index, current] of pdf.getPages().entries()) {
    current.drawText(`Job ${job["id"] ?? ""} · Page ${index + 1} of ${pdf.getPageCount()}`, {
      x: 48,
      y: 24,
      size: 8,
      font,
    });
  }
  return pdf.save();
}
