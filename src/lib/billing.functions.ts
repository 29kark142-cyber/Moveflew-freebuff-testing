import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { effectivePrice } from "@/shared/tenant-pricing";

/** The rate this workspace will be charged — custom override when is_custom_pricing, else the tier rate. Members only (RLS). */
export const getWorkspaceBillingRate = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ workspaceId: z.number().int().positive() }).parse(v))
  .handler(async ({ data, context }) => {
    const { data: w, error } = await context.supabase.from("workspaces")
      .select("plan_id,is_custom_pricing,pricing_mode,custom_monthly_price,custom_annual_price,discount_percent")
      .eq("id", data.workspaceId).maybeSingle();
    if (error || !w) throw new Error("Workspace not found");
    return effectivePrice({
      planId: w.plan_id, isCustomPricing: w.is_custom_pricing, pricingMode: w.pricing_mode,
      customMonthly: w.custom_monthly_price == null ? null : Number(w.custom_monthly_price),
      customAnnual: w.custom_annual_price == null ? null : Number(w.custom_annual_price),
      discountPercent: w.discount_percent == null ? null : Number(w.discount_percent),
    });
  });
