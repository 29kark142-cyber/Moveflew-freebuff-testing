import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { planStatusLabel, type PricingMode } from "@/shared/tenant-pricing";

export const TENANT_STATUSES = ["beta", "trialing", "active", "past_due", "canceled", "suspended"] as const;
const INACTIVE_JOB = new Set(["cancelled", "canceled", "declined", "completed", "lost"]);

/** Platform role lives in platform_admins (checked as the caller); only then is the service client loaded. */
async function requirePlatformAdmin(supabase: any) {
  const { data, error } = await supabase.rpc("is_platform_admin");
  if (error || data !== true) throw new Error("Forbidden");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const getPlatformAccess = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.rpc("is_platform_admin");
    return { isAdmin: data === true };
  });

export const getPlatformOverview = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await requirePlatformAdmin(context.supabase);
    const [ws, members, jobs, plans, paid, notes] = await Promise.all([
      admin.from("workspaces").select("id,name,created_by,created_at,plan_id,subscription_status,trial_ends_at,beta_ends_at,feature_flags,limit_overrides,is_custom_pricing,pricing_mode,custom_monthly_price,custom_annual_price,discount_percent").order("created_at", { ascending: false }),
      admin.from("workspace_members").select("workspace_id,user_id,name,email,role"),
      admin.from("workspace_records").select("workspace_id,status:data->>status").eq("kind", "job").limit(100000),
      admin.from("subscription_plans").select("id,name,price_cents,limits").order("sort_order"),
      admin.from("proposal_checkouts").select("amount_cents,environment,proposal:moving_proposals(workspace_id)").eq("status", "paid"),
      admin.from("workspace_admin_notes").select("workspace_id,pricing_notes"),
    ]);
    if (ws.error || members.error || jobs.error || plans.error || paid.error) throw new Error("Could not load platform data");
    const jobCount = new Map<number, { total: number; active: number }>();
    for (const j of jobs.data as { workspace_id: number; status: string | null }[]) {
      const c = jobCount.get(j.workspace_id) ?? { total: 0, active: 0 };
      c.total++;
      if (!INACTIVE_JOB.has(String(j.status ?? "").toLowerCase())) c.active++;
      jobCount.set(j.workspace_id, c);
    }
    const planName = new Map(plans.data.map(p => [p.id, p.name]));
    const workspaces = ws.data.map(w => {
      const owner = members.data.find(m => m.workspace_id === w.id && m.user_id === w.created_by)
        ?? members.data.find(m => m.workspace_id === w.id && m.role === "admin");
      return {
        id: w.id, name: w.name, createdAt: w.created_at, planId: w.plan_id, planName: planName.get(w.plan_id) ?? w.plan_id,
        status: w.subscription_status, trialEndsAt: w.trial_ends_at, betaEndsAt: w.beta_ends_at,
        featureFlags: (w.feature_flags ?? {}) as Record<string, boolean>, limitOverrides: (w.limit_overrides ?? {}) as Record<string, number>,
        ownerName: owner?.name ?? "", ownerEmail: owner?.email ?? "",
        members: members.data.filter(m => m.workspace_id === w.id).length,
        totalJobs: jobCount.get(w.id)?.total ?? 0,
        pricing: {
          isCustomPricing: w.is_custom_pricing, pricingMode: w.pricing_mode as PricingMode,
          customMonthly: w.custom_monthly_price == null ? null : Number(w.custom_monthly_price),
          customAnnual: w.custom_annual_price == null ? null : Number(w.custom_annual_price),
          discountPercent: w.discount_percent == null ? null : Number(w.discount_percent),
          notes: (notes.data ?? []).find(n => n.workspace_id === w.id)?.pricing_notes ?? "",
        },
        planLabel: planStatusLabel(w.plan_id, w.is_custom_pricing),
      };
    });
    const live = (paid.data as { amount_cents: number; environment: string }[]).filter(p => p.environment === "live");
    return {
      metrics: {
        totalWorkspaces: workspaces.length,
        activeJobs: [...jobCount.values()].reduce((s, c) => s + c.active, 0),
        volumeCents: live.reduce((s, p) => s + p.amount_cents, 0),
        activeBeta: workspaces.filter(w => w.status === "beta").length,
      },
      workspaces,
      plans: plans.data.map(p => ({ id: p.id, name: p.name, priceCents: p.price_cents })),
    };
  });

const flagsSchema = z.record(z.string().regex(/^[a-z0-9_]{1,40}$/), z.boolean()).refine(o => Object.keys(o).length <= 30);
const limitsSchema = z.record(z.string().regex(/^[a-z0-9_]{1,40}$/), z.number().int().min(0).max(1_000_000)).refine(o => Object.keys(o).length <= 30);

export const updateTenantWorkspace = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({
    workspaceId: z.number().int().positive(),
    planId: z.string().min(1).max(40),
    status: z.enum(TENANT_STATUSES),
    betaEndsAt: z.string().datetime().nullable(),
    featureFlags: flagsSchema,
    limitOverrides: limitsSchema,
  }).strict().parse(v))
  .handler(async ({ data, context }) => {
    const admin = await requirePlatformAdmin(context.supabase);
    const { data: plan } = await admin.from("subscription_plans").select("id").eq("id", data.planId).maybeSingle();
    if (!plan) throw new Error("Unknown plan");
    const { error } = await admin.from("workspaces").update({
      plan_id: data.planId, subscription_status: data.status, beta_ends_at: data.betaEndsAt,
      feature_flags: data.featureFlags, limit_overrides: data.limitOverrides,
    }).eq("id", data.workspaceId);
    if (error) throw new Error("Could not update workspace");
    const { logPlatformEvent } = await import("./platform-events.server");
    await logPlatformEvent("admin", "info", `Workspace updated: ${data.status} / ${data.planId}`, { by: context.userId }, data.workspaceId);
    return { ok: true };
  });

export const updateTenantPricing = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({
    workspaceId: z.number().int().positive(),
    planId: z.enum(["starter", "professional"]),
    pricingMode: z.enum(["standard", "flat", "percent"]),
    customMonthly: z.number().min(0).max(100000).nullable(),
    customAnnual: z.number().min(0).max(1000000).nullable(),
    discountPercent: z.number().min(0).max(100).nullable(),
    notes: z.string().max(2000),
  }).strict().superRefine((d, ctx) => {
    if (d.pricingMode === "flat" && d.customMonthly == null && d.customAnnual == null) ctx.addIssue({ code: "custom", message: "Enter a custom monthly or annual rate" });
    if (d.pricingMode === "percent" && d.discountPercent == null) ctx.addIssue({ code: "custom", message: "Enter a discount percentage" });
  }).parse(v))
  .handler(async ({ data, context }) => {
    const admin = await requirePlatformAdmin(context.supabase);
    const custom = data.pricingMode !== "standard";
    const { error } = await admin.from("workspaces").update({
      plan_id: data.planId, is_custom_pricing: custom, pricing_mode: data.pricingMode,
      custom_monthly_price: data.pricingMode === "flat" ? data.customMonthly : null,
      custom_annual_price: data.pricingMode === "flat" ? data.customAnnual : null,
      discount_percent: data.pricingMode === "percent" ? data.discountPercent : null,
    }).eq("id", data.workspaceId);
    if (error) throw new Error("Could not update pricing");
    await admin.from("workspace_admin_notes").upsert({ workspace_id: data.workspaceId, pricing_notes: data.notes, updated_by: context.userId, updated_at: new Date().toISOString() });
    const { logPlatformEvent } = await import("./platform-events.server");
    await logPlatformEvent("admin", "info", `Pricing updated: ${data.planId} / ${data.pricingMode}`, { by: context.userId }, data.workspaceId);
    return { ok: true };
  });

/** Read-only support view of one tenant. Nothing here writes. */
export const inspectTenantWorkspace = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ workspaceId: z.number().int().positive() }).parse(v))
  .handler(async ({ data, context }) => {
    const admin = await requirePlatformAdmin(context.supabase);
    const id = data.workspaceId;
    const [w, members, records] = await Promise.all([
      admin.from("workspaces").select("id,name,plan_id,subscription_status,dispatch_address,company_phone,travel_pricing_type,fuel_surcharge_type,deposit_rule,onboarding_completed_at").eq("id", id).maybeSingle(),
      admin.from("workspace_members").select("name,email,role,created_at").eq("workspace_id", id),
      admin.from("workspace_records").select("id,kind,data,created_at").eq("workspace_id", id).in("kind", ["job", "customer", "truck", "crew"]).order("id", { ascending: false }).limit(400),
    ]);
    if (!w.data) throw new Error("Workspace not found");
    const { logPlatformEvent } = await import("./platform-events.server");
    await logPlatformEvent("admin", "info", "Support inspection opened", { by: context.userId }, id);
    const pick = (kind: string, keys: string[]) => (records.data ?? []).filter(r => r.kind === kind).slice(0, 100)
      .map(r => ({ id: r.id, createdAt: r.created_at, ...Object.fromEntries(keys.map(k => [k, String((r.data as Record<string, unknown>)?.[k] ?? "")])) }));
    return {
      workspace: w.data,
      members: members.data ?? [],
      jobs: pick("job", ["title", "status", "moveDate", "total"]),
      customers: pick("customer", ["name", "email", "phone", "status", "source"]),
      trucks: pick("truck", ["name", "plate", "status"]),
      crew: pick("crew", ["name", "phone", "status"]),
    };
  });

export const getPlatformLogs = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await requirePlatformAdmin(context.supabase);
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const [events, leads, quotes, ws] = await Promise.all([
      admin.from("platform_events").select("id,source,level,workspace_id,message,meta,created_at").order("created_at", { ascending: false }).limit(200),
      admin.from("integration_lead_receipts").select("workspace_id,created_at").gte("created_at", since).limit(20000),
      admin.from("quote_intake_receipts").select("workspace_id,created_at").gte("created_at", since).limit(20000),
      admin.from("workspaces").select("id,name"),
    ]);
    const names = new Map((ws.data ?? []).map(w => [w.id, w.name]));
    const hours = Array.from({ length: 24 }, (_, i) => ({ hour: new Date(Date.now() - (23 - i) * 3600_000).toISOString().slice(0, 13), count: 0 }));
    const perWs = new Map<number, number>();
    for (const r of [...(leads.data ?? []), ...(quotes.data ?? [])]) {
      const h = hours.find(x => x.hour === r.created_at.slice(0, 13));
      if (h) h.count++;
      perWs.set(r.workspace_id, (perWs.get(r.workspace_id) ?? 0) + 1);
    }
    const counts = hours.map(h => h.count);
    const avg = counts.reduce((a, b) => a + b, 0) / 24;
    return {
      events: (events.data ?? []).map(e => ({ ...e, workspaceName: e.workspace_id ? names.get(e.workspace_id) ?? `#${e.workspace_id}` : null })),
      apiHours: hours,
      spikeHours: hours.filter(h => h.count >= 10 && h.count > avg * 3).map(h => h.hour),
      topTenants: [...perWs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, n]) => ({ id, name: names.get(id) ?? `#${id}`, leads: n })),
    };
  });
