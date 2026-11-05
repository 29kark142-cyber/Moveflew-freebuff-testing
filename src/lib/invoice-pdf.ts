// Client-side invoice & estimate export. Read-only by design: every value is taken
// from records the signed-in user can already open, and the customer signature is
// the one captured in the audited field sign-off. Nothing here signs or changes a job.
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
import { monthlyStorageCents, nextInvoiceDate, type StorageVault } from "@shared/storage-vaults";
import type { DamagePhoto } from "@shared/damage";

/** Jobs arrive from both the CRM and the field app, so read fields defensively. */
export type InvoiceJob = Record<string, unknown> & { id: number };

export type InvoiceInput = {
  job: InvoiceJob;
  company: { name: string; phone?: string; email?: string };
  photos?: DamagePhoto[];
  signature?: string | null;
  vaults?: StorageVault[];
  issuedAt?: Date;
};

const PAGE: [number, number] = [612, 792];
const MARGIN = 48;
const WIDTH = PAGE[0] - MARGIN * 2;
const INK = rgb(0.06, 0.1, 0.16);
const MUTED = rgb(0.42, 0.47, 0.54);
const RULE = rgb(0.85, 0.88, 0.92);
const BRAND = rgb(0.13, 0.35, 0.86);

/** Standard PDF fonts only cover WinAnsi, so unsupported glyphs become spaces. */
const clean = (value: unknown): string =>
  String(value ?? "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[^\x20-\x7E\n]/g, " ");

const usd = (amount: number): string => {
  const value = Number.isFinite(amount) ? amount : 0;
  return `$${Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const number = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const text = (value: unknown): string => clean(value).trim();

export async function buildInvoicePdf(input: InvoiceInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const job = input.job;
  let page: PDFPage = pdf.addPage(PAGE);
  let y = PAGE[1] - MARGIN;

  const newPage = () => {
    page = pdf.addPage(PAGE);
    y = PAGE[1] - MARGIN;
  };
  const ensure = (needed: number) => {
    if (y - needed < MARGIN + 26) newPage();
  };
  const wrap = (value: string, size: number, face: PDFFont, maxWidth: number): string[] => {
    const lines: string[] = [];
    for (const paragraph of value.split("\n")) {
      let current = "";
      for (const word of paragraph.split(/\s+/)) {
        if (!word) continue;
        const candidate = current ? `${current} ${word}` : word;
        if (face.widthOfTextAtSize(candidate, size) <= maxWidth) {
          current = candidate;
          continue;
        }
        if (current) lines.push(current);
        let rest = word;
        while (rest.length > 1 && face.widthOfTextAtSize(rest, size) > maxWidth) {
          let cut = rest.length - 1;
          while (cut > 1 && face.widthOfTextAtSize(rest.slice(0, cut), size) > maxWidth) cut -= 1;
          lines.push(rest.slice(0, cut));
          rest = rest.slice(cut);
        }
        current = rest;
      }
      lines.push(current);
    }
    return lines.length ? lines : [""];
  };
  const line = (
    value: unknown,
    options: { size?: number; strong?: boolean; color?: typeof INK; gap?: number } = {},
  ) => {
    const size = options.size ?? 10.5;
    const face = options.strong ? bold : font;
    const color = options.color ?? INK;
    for (const row of wrap(clean(value), size, face, WIDTH)) {
      ensure(size + 4);
      page.drawText(row, { x: MARGIN, y: y - size, size, font: face, color });
      y -= size + 4;
    }
    y -= options.gap ?? 0;
  };
  const heading = (label: string) => {
    ensure(40);
    y -= 10;
    page.drawText(clean(label).toUpperCase(), {
      x: MARGIN,
      y: y - 10,
      size: 10,
      font: bold,
      color: BRAND,
    });
    y -= 16;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: MARGIN + WIDTH, y },
      thickness: 0.8,
      color: RULE,
    });
    y -= 12;
  };
  const row = (
    label: string,
    amount: string,
    options: { strong?: boolean; muted?: boolean } = {},
  ) => {
    const size = options.strong ? 11.5 : 10.5;
    const face = options.strong ? bold : font;
    const color = options.muted ? MUTED : INK;
    ensure(size + 10);
    page.drawText(clean(label).slice(0, 78), { x: MARGIN, y: y - size, size, font: face, color });
    const width = face.widthOfTextAtSize(amount, size);
    page.drawText(amount, { x: MARGIN + WIDTH - width, y: y - size, size, font: face, color });
    y -= size + 7;
  };
  const image = async (dataUrl: string, maxWidth: number, maxHeight: number) => {
    const match = /^data:image\/(png|jpe?g);base64,([A-Za-z0-9+/=]+)$/i.exec(String(dataUrl ?? ""));
    if (!match) return null;
    try {
      const bytes = Uint8Array.from(atob(match[2] as string), (char) => char.charCodeAt(0));
      const embedded: PDFImage = /png/i.test(match[1] as string)
        ? await pdf.embedPng(bytes)
        : await pdf.embedJpg(bytes);
      const scale = Math.min(maxWidth / embedded.width, maxHeight / embedded.height);
      return { embedded, width: embedded.width * scale, height: embedded.height * scale };
    } catch {
      // A corrupt or oversized capture must not abort the whole invoice.
      return null;
    }
  };

  // ---- Branding header -----------------------------------------------------
  page.drawRectangle({
    x: 0,
    y: PAGE[1] - 92,
    width: PAGE[0],
    height: 92,
    color: rgb(0.03, 0.09, 0.17),
  });
  page.drawText("MoveFlew", {
    x: MARGIN,
    y: PAGE[1] - 50,
    size: 22,
    font: bold,
    color: rgb(1, 1, 1),
  });
  page.drawText(clean(input.company.name || "MoveFlew").slice(0, 64), {
    x: MARGIN,
    y: PAGE[1] - 70,
    size: 10.5,
    font,
    color: rgb(0.76, 0.83, 0.91),
  });
  const issued = input.issuedAt ?? new Date();
  const issuedLabel = issued.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const docTitle = "INVOICE & ESTIMATE";
  page.drawText(docTitle, {
    x: PAGE[0] - MARGIN - bold.widthOfTextAtSize(docTitle, 11),
    y: PAGE[1] - 50,
    size: 11,
    font: bold,
    color: rgb(1, 1, 1),
  });
  const issuedText = `Issued ${issuedLabel}`;
  page.drawText(issuedText, {
    x: PAGE[0] - MARGIN - font.widthOfTextAtSize(issuedText, 9.5),
    y: PAGE[1] - 66,
    size: 9.5,
    font,
    color: rgb(0.76, 0.83, 0.91),
  });
  y = PAGE[1] - 118;

  // ---- Customer & move details --------------------------------------------
  heading("Billed to");
  line(text(job.customerName) || text(job.title) || "Customer", { size: 12, strong: true });
  const contact = [text(job.customerPhone), text(job.customerEmail)].filter(Boolean).join("  ·  ");
  if (contact) line(contact, { color: MUTED });
  line(`Job #${job.id}${text(job.moveDate) ? `  ·  Move date ${text(job.moveDate)}` : ""}`, {
    color: MUTED,
  });
  if (text(job.origin) || text(job.destination)) {
    line(`Pickup: ${text(job.origin) || "To be confirmed"}`, { color: MUTED });
    line(`Delivery: ${text(job.destination) || "To be confirmed"}`, { color: MUTED });
  }
  if (input.company.phone || input.company.email) {
    line([input.company.phone, input.company.email].filter(Boolean).join("  ·  "), {
      color: MUTED,
    });
  }

  // ---- Itemised move services ---------------------------------------------
  const bill = (job.bill ?? {}) as Record<string, unknown>;
  const hours = number(bill.hours ?? job.actualHours ?? job.estimatedHours);
  const labor = number(bill.labor);
  const travel = number(bill.travel) || number(job.travelFee);
  const extra = number(bill.fees);
  const fees = Array.isArray(job.fees)
    ? (job.fees as { name?: unknown; amount?: unknown }[]).slice(0, 20)
    : [];
  const feesTotal = fees.reduce((sum, fee) => sum + number(fee.amount), 0);
  const deposit = Math.abs(number(bill.deposit));

  heading("Itemized move services");
  if (hours > 0) row(`Moving labor — ${hours.toFixed(2).replace(/\.00$/, "")} hours`, usd(labor));
  if (travel > 0) row("Travel and transport", usd(travel));
  if (extra > 0) row("Additional move charges", usd(extra));
  for (const fee of fees) row(text(fee.name) || "Move fee", usd(number(fee.amount)));
  if (!hours && !travel && !extra && !fees.length) {
    row("Move service (estimate)", usd(number(job.total) || number(job.finalTotal)));
  }
  const subtotal = labor + travel + extra + feesTotal;
  if (deposit > 0) row("Deposit received", `-${usd(deposit)}`, { muted: true });
  row("Move subtotal", usd(subtotal || number(job.finalTotal) || number(job.total)), {
    strong: true,
  });
  const balance = number(bill.due) || Math.max(0, subtotal - deposit);
  row("Balance due", usd(balance), { strong: true });

  // ---- Monthly storage vault fees -----------------------------------------
  const vaults = input.vaults ?? [];
  if (vaults.length) {
    heading("Monthly storage vaults");
    const columns = [MARGIN, MARGIN + 110, MARGIN + 300, MARGIN + 420];
    const header = ["Vault", "Stored items", "Monthly", "Next invoice"];
    ensure(24);
    header.forEach((label, index) => {
      page.drawText(label, {
        x: columns[index] as number,
        y: y - 9,
        size: 9,
        font: bold,
        color: MUTED,
      });
    });
    y -= 18;
    let monthlyTotal = 0;
    for (const vault of vaults.slice(0, 12)) {
      const monthly = monthlyStorageCents(vault);
      monthlyTotal += monthly;
      const items = (vault.items ?? [])
        .map((item) => `${item.name} x${Math.max(1, Math.round(number(item.quantity) || 1))}`)
        .join(", ");
      ensure(18);
      page.drawText(clean(vault.code).slice(0, 16), {
        x: columns[0] as number,
        y: y - 9,
        size: 9.5,
        font: bold,
        color: INK,
      });
      page.drawText(clean(items || "No items logged").slice(0, 42), {
        x: columns[1] as number,
        y: y - 9,
        size: 9,
        font,
        color: INK,
      });
      const monthlyLabel = usd(monthly);
      page.drawText(monthlyLabel, {
        x: (columns[3] as number) - 12 - font.widthOfTextAtSize(monthlyLabel, 9.5),
        y: y - 9,
        size: 9.5,
        font,
        color: INK,
      });
      page.drawText(nextInvoiceDate(vault), {
        x: columns[3] as number,
        y: y - 9,
        size: 9.5,
        font,
        color: INK,
      });
      y -= 16;
      page.drawLine({
        start: { x: MARGIN, y: y + 4 },
        end: { x: MARGIN + WIDTH, y: y + 4 },
        thickness: 0.4,
        color: RULE,
      });
    }
    row("Storage total per month", usd(monthlyTotal), { strong: true });
    line(
      "Storage is billed monthly on each vault's invoice day and is separate from move-day charges.",
      { size: 9, color: MUTED },
    );
  }

  // ---- Pre-move damage photos ---------------------------------------------
  const photos = (input.photos ?? []).filter((photo) => photo.phase === "pre").slice(0, 6);
  if (photos.length) {
    heading("Pre-move damage photos");
    const thumbWidth = 150;
    const thumbHeight = 108;
    const gap = 12;
    for (let index = 0; index < photos.length; index += 3) {
      const group = photos.slice(index, index + 3);
      const embedded = await Promise.all(
        group.map((photo) => image(photo.photoUrl, thumbWidth, thumbHeight)),
      );
      ensure(thumbHeight + 26);
      embedded.forEach((shot, column) => {
        const x = MARGIN + column * (thumbWidth + gap);
        if (!shot) return;
        page.drawRectangle({
          x,
          y: y - shot.height,
          width: shot.width,
          height: shot.height,
          borderColor: RULE,
          borderWidth: 0.6,
        });
        page.drawImage(shot.embedded, {
          x,
          y: y - shot.height,
          width: shot.width,
          height: shot.height,
        });
      });
      y -= thumbHeight + 2;
      group.forEach((photo, column) => {
        const label = `${text(photo.item) || "Inspection photo"}${text(photo.room) ? ` — ${text(photo.room)}` : ""}`;
        const x = MARGIN + column * (thumbWidth + gap);
        page.drawText(clean(label).slice(0, 30), { x, y: y - 9, size: 7.5, font, color: MUTED });
      });
      y -= 20;
    }
  }

  // ---- Signature block ----------------------------------------------------
  heading("Customer signature");
  const signature = input.signature || text(job.completedSignature);
  const signedAt = text(job.signedOffAt);
  if (signature) {
    const ink = await image(signature, 240, 84);
    if (ink) {
      ensure(ink.height + 30);
      page.drawRectangle({
        x: MARGIN,
        y: y - ink.height - 6,
        width: 252,
        height: ink.height + 12,
        borderColor: RULE,
        borderWidth: 0.8,
        color: rgb(1, 1, 1),
      });
      page.drawImage(ink.embedded, {
        x: MARGIN + 6,
        y: y - ink.height - 2,
        width: ink.width,
        height: ink.height,
      });
      y -= ink.height + 22;
    } else {
      line("Signature on file with the signed bill of lading.", { color: MUTED });
    }
    line(`Signed by the customer${signedAt ? ` on ${signedAt}` : ""} at move-day sign-off.`, {
      size: 9,
      color: MUTED,
    });
  } else {
    line("No customer signature on file yet — this document is a draft, not a signed invoice.", {
      size: 9.5,
      color: MUTED,
    });
  }

  pdf.setTitle(`Invoice and estimate — Job ${job.id}`);
  pdf.setAuthor(input.company.name || "MoveFlew");
  const total = pdf.getPageCount();
  pdf.getPages().forEach((sheet, index) => {
    sheet.drawText(`Job ${job.id}  ·  Page ${index + 1} of ${total}`, {
      x: MARGIN,
      y: 28,
      size: 8.5,
      font,
      color: MUTED,
    });
  });
  return pdf.save();
}

/** Builds the PDF and hands it to the browser as a download. */
export async function downloadInvoicePdf(input: InvoiceInput, filename?: string): Promise<void> {
  const bytes = await buildInvoicePdf(input);
  // Slice to a plain ArrayBuffer: the signed save() buffer may be a view over shared memory.
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const blob = new Blob([buffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename || `MoveFlew-invoice-job-${input.job.id}.pdf`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
