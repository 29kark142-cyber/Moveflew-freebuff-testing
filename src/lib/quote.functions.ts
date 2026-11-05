import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { clampDiscountPercent } from "@/shared/route-pricing";
import { jobReference } from "@/shared/tracking";
import { QUOTE_TOKEN_RE } from "@/shared/quote-dispatch";

export type PublicQuoteLine = { label: string; amount: number };

export type PublicQuote = {
  reference: string;
  customerName: string;
  title: string;
  moveDate: string;
  startHour: number;
  crewSize: number;
  pricingMode: "hourly" | "long_distance";
  origin: string;
  destination: string;
  distanceMiles: number;
  travelMinutes: number;
  lines: PublicQuoteLine[];
  discountPercent: number;
  total: number;
  company: { name: string; phone: string; email: string };
  sentAt: string | null;
};

const num = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : Number(value) || 0;
const str = (value: unknown) => (typeof value === "string" ? value : "");

/**
 * Public, read-only quote view. Only customer-visible estimate fields are returned: no crew,
 * payroll, internal notes or other tenants' records can be reached from a quote token.
 */
export const readQuote = createServerFn({ method: "GET" })
  .inputValidator((v: unknown) => z.object({ token: z.string().regex(QUOTE_TOKEN_RE) }).parse(v))
  .handler(async ({ data }): Promise<PublicQuote> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("workspace_records")
      .select("id,data,workspace_id")
      .eq("kind", "job")
      .filter("data->>quoteToken", "eq", data.token)
      .maybeSingle();
    if (error || !row) throw new Error("This quote link is unavailable or has expired");
    const job = (row.data ?? {}) as Record<string, unknown>;
    if (str(job["status"]) === "cancelled") throw new Error("This quote is no longer available");

    const { data: workspace } = await supabaseAdmin
      .from("workspaces")
      .select("name,company_phone,office_email")
      .eq("id", row.workspace_id)
      .maybeSingle();

    const pricingMode = job["pricingMode"] === "long_distance" ? "long_distance" : "hourly";
    const inventory = Array.isArray(job["inventory"])
      ? (job["inventory"] as { weight?: unknown; quantity?: unknown }[])
      : [];
    const base =
      pricingMode === "hourly"
        ? num(job["hourlyRate"]) * Math.max(2.5, num(job["estimatedHours"]))
        : inventory.reduce(
            (sum, item) => sum + num(item?.weight) * Math.max(1, num(item?.quantity)),
            0,
          ) *
            num(job["weightRate"]) +
          num(job["distanceMiles"]) * num(job["mileRate"]);
    const travelFee = num(job["travelFee"]);
    const fees = Array.isArray(job["fees"])
      ? (job["fees"] as { name?: unknown; amount?: unknown }[]).map((fee) => ({
          label: str(fee?.name) || "Fee",
          amount: num(fee?.amount),
        }))
      : [];
    const discountPercent = clampDiscountPercent(num(job["discountPercent"]));
    const subtotal = base + travelFee + fees.reduce((sum, fee) => sum + fee.amount, 0);
    const round = (value: number) => Math.round(value * 100) / 100;
    const total = round(subtotal * (1 - discountPercent / 100));
    const lines: PublicQuoteLine[] = [
      {
        label: pricingMode === "hourly" ? "Moving crew and truck" : "Weight and mileage",
        amount: round(base),
      },
      ...(travelFee > 0 ? [{ label: "Travel fee", amount: round(travelFee) }] : []),
      ...fees,
      ...(discountPercent > 0
        ? [{ label: `Discount (${discountPercent}%)`, amount: round(total - subtotal) }]
        : []),
    ];

    return {
      reference: jobReference(row.id),
      customerName: str(job["customerName"]),
      title: str(job["title"]),
      moveDate: str(job["moveDate"]).slice(0, 10),
      startHour: num(job["startHour"]) || 8,
      crewSize: Math.max(1, num(job["crewSize"]) || 1),
      pricingMode,
      origin: str(job["origin"]),
      destination: str(job["destination"]),
      distanceMiles: num(job["distanceMiles"]),
      travelMinutes: num(job["travelMinutes"]),
      lines,
      discountPercent,
      total,
      company: {
        name: str(workspace?.name),
        phone: str(workspace?.company_phone),
        email: str(workspace?.office_email),
      },
      sentAt: str(job["quoteSentAt"]) || null,
    };
  });
