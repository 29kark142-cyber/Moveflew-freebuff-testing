// Core workspace CRM API on Lovable Cloud. Replaces the Manus Express /api/crm router.
// Every request runs as the signed-in user, so database row security applies.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { QUOTE_EMAIL_RE, QUOTE_PHONE_RE } from "../shared/quote-dispatch";
import { calculateQuoteWithSurge, DEFAULT_PRICING, type Pricing } from "../shared/crm";
import { parseSurgeSettings, quoteSurgeFrom } from "../shared/surge";
import { conflictsFor, type ScheduledJob } from "../shared/dispatch";
import { fieldRoute } from "./field-api";
import { canTestBook } from "../lib/test-booking";
import {
  appearanceSchema,
  parseAppearance,
  validWallpaperScope,
} from "../lib/workspace-appearance";
import { SIGNED_URL_TTL_SECONDS } from "../lib/signed-url";
import { pricingSchema, canEditTariffs } from "../shared/workspace-tariffs";
import { operationalReport } from "../shared/workspace-reports";
import { travelSettingsSchema } from "../lib/travel-rules";
import { brandingSchema, isStorageImage, normalizeDomain, parseBranding } from "../shared/branding";
import {
  creditBalance,
  includedSurveyCredits,
  scanPackById,
  SCAN_PACKS,
  whiteLabelEntitled,
} from "../shared/plans";
import { isPendingCreditStatus, sumPurchaseCredits } from "../shared/ai-credits";
import {
  BillingConfigError,
  createScanPackCheckout,
  stripeBillingConfigured,
} from "./ai-credit-billing";

export type Ctx = {
  db: SupabaseClient;
  userId: string;
  email: string;
  wsId: number | null;
  role: string | null;
  /** Selected office location from the top-nav branch context. */
  branchId?: number | null;
  q?: URLSearchParams;
  origin?: string;
};
export type Row = { id: number; data: Record<string, unknown>; created_at: string };

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const fail = (status: number, message: string): never => {
  throw new HttpError(status, message);
};
const GENERIC_DB_ERRORS: Record<number, string> = {
  400: "The request could not be processed",
  403: "You don't have permission to do that",
  500: "Something went wrong",
};
// Database errors stay in server logs; callers only see app-authored rule messages
// (raised via RAISE EXCEPTION in our own functions, SQLSTATE P0001) or a generic text.
const dbFail = (status: number, error: { message?: string; code?: string }): never => {
  console.error("CRM database error", { status, code: error.code, message: error.message });
  const safe =
    status < 500 && error.code === "P0001" && error.message
      ? error.message
      : (GENERIC_DB_ERRORS[status] ?? "Something went wrong");
  throw new HttpError(status, safe);
};

const KINDS: Record<string, string> = {
  customers: "customer",
  jobs: "job",
  trucks: "truck",
  crew: "crew",
  reminders: "reminder",
  sequences: "sequence",
  vaults: "vault",
  expenses: "expense",
  inspections: "inspection",
  branches: "branch",
};

// Operational records carry a branchId so the top-nav context can scope them.
const BRANCH_SCOPED = new Set(["job", "truck", "expense", "reminder", "inspection"]);

const DEFAULTS: Record<string, Record<string, unknown>> = {
  customer: { name: "", email: "", phone: "", source: "", score: 0, status: "new", notes: "" },
  job: {
    title: "",
    moveDate: "",
    startHour: 8,
    duration: 4,
    origin: "",
    destination: "",
    originNotes: "",
    destinationNotes: "",
    storageAddress: "",
    routeCoords: null,
    discountPercent: 0,
    moveSize: "",
    status: "lead",
    pricingMode: "hourly",
    crewSize: 2,
    hourlyRate: 130,
    estimatedHours: 2.5,
    distanceMiles: 0,
    travelMinutes: 0,
    travelFee: 0,
    weightRate: 0.5,
    mileRate: 2,
    inventory: [],
    fees: [],
    total: 0,
    truckId: null,
    crewIds: [],
    requiredSkill: 1,
    signature: null,
    clockIn: null,
    clockOut: null,
    completedSignature: null,
    invoiceStatus: "draft",
    actualHours: null,
    finalTotal: null,
  },
  truck: {
    name: "",
    plate: "",
    capacityCuft: 0,
    weightLimit: 0,
    dimensions: "",
    status: "available",
    mileage: 0,
    serviceIntervalMiles: 5000,
    lastServiceMiles: 0,
    lastServiceDate: "",
    nextServiceDate: "",
    maintenanceNotes: "",
    maintenanceLog: [],
  },
  inspection: {
    truckId: null,
    truckName: "",
    driverId: null,
    driverName: "",
    date: "",
    items: [],
    passed: false,
    notes: "",
  },
  crew: {
    userId: null,
    name: "",
    email: "",
    phone: "",
    isDriver: false,
    skillLevel: 1,
    hourlyRate: 0,
    status: "active",
  },
  expense: {
    jobId: null,
    category: "",
    amountCents: 0,
    incurredDate: "",
    vendor: "",
    notes: "",
  },
  branch: {
    name: "",
    code: "",
    address: "",
    phone: "",
    manager: "",
    status: "active",
  },
  campaign: {
    name: "",
    source: "",
    startDate: "",
    endDate: "",
    spendCents: 0,
    notes: "",
    status: "draft",
    channel: "email",
    audience: "all",
    template: "",
  },
  reminder: { customerId: null, title: "", dueAt: "", completed: false },
  sequence: {
    name: "",
    trigger: "",
    channel: "email",
    delayHours: 0,
    condition: "",
    template: "",
    enabled: false,
    deliveryStatus: "not_sent",
  },
  vault: {
    code: "",
    section: "",
    squareFeet: 0,
    capacityCuft: 0,
    status: "available",
    billingMode: "flat",
    monthlyRateCents: 0,
    ratePerSqftCents: 0,
    customerId: null,
    contactName: "",
    contactPhone: "",
    contactEmail: "",
    jobId: null,
    items: [],
    photos: [],
    moveInAt: null,
    moveOutAt: null,
    invoiceDay: 1,
    notes: "",
  },
};

const toRecord = (r: Row, wsId: number) => ({
  ...r.data,
  id: r.id,
  tenantId: wsId,
  createdAt: r.created_at,
});

async function list(ctx: Ctx, kind: string) {
  const ws = requireWs(ctx);
  const { data, error } = await ctx.db
    .from("workspace_records")
    .select("id,data,created_at")
    .eq("workspace_id", ws)
    .eq("kind", kind)
    .order("id", { ascending: false })
    .limit(1000);
  if (error) dbFail(500, error);
  const records = (data as Row[]).map((r) => toRecord(r, ws));
  if (ctx.branchId && BRANCH_SCOPED.has(kind))
    return records.filter((record) => Number((record as Record<string, unknown>)["branchId"]) === ctx.branchId);
  return records;
}

async function getOne(ctx: Ctx, kind: string, id: number) {
  const ws = requireWs(ctx);
  const { data, error } = await ctx.db
    .from("workspace_records")
    .select("id,data,created_at")
    .eq("workspace_id", ws)
    .eq("kind", kind)
    .eq("id", id)
    .maybeSingle();
  if (error) dbFail(500, error);
  if (!data) fail(404, "Not found");
  if (ctx.branchId && BRANCH_SCOPED.has(kind) && Number((data as Row).data["branchId"]) !== ctx.branchId)
    fail(404, "Not found in the selected branch");
  return data as Row;
}

// Fields owned by the server (payments, proposals, derived customer info, account links) are never accepted from requests.
const SERVER_FIELDS = new Set([
  "id",
  "tenantId",
  "createdAt",
  "updatedAt",
  "workspaceId",
  "workspace_id",
  "depositPaidCents",
  "depositPaidAt",
  "depositPaymentSession",
  "depositMode",
  "depositOverride",
  "proposalToken",
  "customerName",
  "customerEmail",
  "customerPhone",
  "sourceChannel",
  "timeline",
  "finalPayment",
  "finalCheckout",
  "signedOffAt",
  "billableHours",
  "finalBill",
  "testApproval",
  "fieldDocuments",
  "fieldDocumentId",
  "fieldPdf",
  // Field checklist progress, milestone sign-offs and the activity log are server-appended only.
  "moveChecklist",
  "moveChecklistUpdatedAt",
  "activity",
  // Quote tokens and delivery history are minted and written by the server only.
  "quoteToken",
  "quoteDispatch",
  "quoteSentAt",
  "quoteDispatchedAt",
  // Quote acceptance signatures, payment receipts and intents are server-written only.
  "quoteAcceptance",
  "quoteAcceptedAt",
  "quoteDepositIntent",
  "quoteSurge",
  // Crew shift tokens, receipts and answers are written by the shift endpoints only.
  "crewDispatch",
  "crewShifts",
  "preMoveReminders",
  // Driver check-ins and the vault gallery are written by the field and storage endpoints.
  "driverCheckins",
  "driverLocation",
  "vaultGallery",
  "packingSelection",
  "packingSubtotalCents",
  "packingUpdatedAt",
  "inventoryScans",
  "portalRequests",
  "customerPhotos",
  "portalLastRequestAt",
]);
const FIELD_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

// Request bodies may only set the fields listed for each record kind (defaults plus these extras).
const EXTRA_FIELDS: Record<string, string[]> = {
  customer: ["company", "address", "tags", "assignedTo", "lostReason"],
  job: [
    "customerId",
    "customer",
    "date",
    "size",
    "mode",
    "distance",
    "notes",
    "travelMiles",
    "travelCharge",
    "fuelCharge",
    "surcharges",
    "stairsFlights",
    "carryDistanceFt",
    "surchargeLines",
  ],
  truck: [],
  crew: ["crewRole"],
  reminder: [],
  sequence: [],
  damage: ["jobId", "phase", "note", "photoUrl"],
  damageInput: ["phase", "note", "photoData"],
  vault: [],
  campaign: ["status", "channel", "audience", "template"],
};
const allowedFields = (kind: string) =>
  new Set([...Object.keys(DEFAULTS[kind] ?? {}), ...(EXTRA_FIELDS[kind] ?? [])]);

function clean(
  kind: string,
  input: unknown,
  existing?: Record<string, unknown>,
): Record<string, unknown> {
  const allowed = allowedFields(kind);
  if (!input || typeof input !== "object" || Array.isArray(input))
    fail(400, "Invalid request body");
  const out: Record<string, unknown> = {};
  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length > 120) fail(400, "Too many fields");
  for (const [k, v] of entries) {
    if (SERVER_FIELDS.has(k) || !FIELD_NAME.test(k) || !allowed.has(k)) continue;
    // Account links are set by the invitation flow; only allow keeping or clearing them.
    if (k === "userId" && v !== null && v !== (existing?.["userId"] ?? null)) continue;
    out[k] = v;
  }
  if (JSON.stringify(out).length > 900_000) fail(413, "Request is too large");
  return out;
}

async function enrichJob(ctx: Ctx, data: Record<string, unknown>, pricing: Pricing) {
  if (!data["customerId"] && data["customer"]) {
    const customer = z
      .object({
        name: z.string().trim().min(1).max(180),
        email: z.string().trim().email().or(z.literal("")).default(""),
        phone: z.string().max(40).default(""),
        source: z.string().max(100).default("Estimate"),
      })
      .parse(data["customer"]);
    const saved = await create(ctx, "customer", customer);
    data["customerId"] = saved.id;
    delete data["customer"];
  }
  const customerId = Number(data["customerId"]);
  if (customerId) {
    const c = await getOne(ctx, "customer", customerId);
    data["customerName"] = c.data["name"] ?? "";
    data["customerEmail"] = c.data["email"] ?? "";
    data["customerPhone"] = c.data["phone"] ?? "";
  }
  // Proposal links are issued only by publishing a proposal (moving_proposals); never invent one here.
  try {
    const priced = calculateQuoteWithSurge(
      data as never,
      pricing.minimumHours,
      parseSurgeSettings(pricing.surge),
      pricing.weekendPercent,
    );
    data["total"] = priced.total;
    data["quoteSurge"] = quoteSurgeFrom(
      priced.surge,
      String(data["moveDate"] ?? ""),
      new Date().toISOString(),
    );
  } catch {
    data["quoteSurge"] = null;
    /* keep provided total */
  }
  return data;
}

async function create(ctx: Ctx, kind: string, body: unknown) {
  const ws = requireWs(ctx);
  const input = clean(kind, body);
  if (kind === "job" && !PRICING_ROLES.includes(ctx.role ?? ""))
    for (const f of JOB_PRICING_FIELDS) delete input[f];
  let data: Record<string, unknown> = { ...DEFAULTS[kind], ...input };
  if (ctx.branchId && BRANCH_SCOPED.has(kind)) data["branchId"] = ctx.branchId;
  if (kind === "job") data = await enrichJob(ctx, data, await pricingFor(ctx));
  const { data: row, error } = await ctx.db
    .from("workspace_records")
    .insert({ workspace_id: ws, kind, data: data as never })
    .select("id,data,created_at")
    .single();
  if (error) dbFail(403, error);
  const saved = toRecord(row as Row, ws) as Record<string, unknown> & { id: number };
  if (
    kind === "job" &&
    Number(saved["customerId"]) &&
    ["booked", "won", "in_progress", "completed"].includes(String(saved["status"] ?? ""))
  ) {
    try {
      const { markMarketingConversion } = await import("./growth-api");
      await markMarketingConversion(ctx.db, ws, Number(saved["customerId"]));
    } catch (error) {
      console.error("Marketing conversion update failed", error);
    }
  }
  return saved;
}

// Billing inputs that drive the customer's final balance.
const JOB_PRICING_FIELDS = [
  "pricingMode",
  "crewSize",
  "hourlyRate",
  "estimatedHours",
  "distanceMiles",
  "travelMinutes",
  "travelFee",
  "discountPercent",
  "weightRate",
  "mileRate",
  "fees",
  "total",
  "actualHours",
  "finalTotal",
  "inventory",
  "travelMiles",
  "travelCharge",
  "fuelCharge",
  "distance",
  "mode",
  "size",
];
const PRICING_ROLES = ["admin", "office_admin", "estimator", "dispatcher"];

async function update(ctx: Ctx, kind: string, id: number, body: unknown) {
  const ws = requireWs(ctx);
  const current = await getOne(ctx, kind, id);
  const changes = clean(kind, body, current.data);
  if (kind === "job") {
    const touched = JOB_PRICING_FIELDS.filter(
      (f) => f in changes && JSON.stringify(changes[f]) !== JSON.stringify(current.data[f]),
    );
    if (touched.length) {
      if (!PRICING_ROLES.includes(ctx.role ?? ""))
        fail(403, "Only admins, office admins, estimators and dispatchers can change job pricing");
      if (
        current.data["signedOffAt"] ||
        current.data["finalBill"] ||
        current.data["finalCheckout"] ||
        current.data["finalPayment"]
      )
        fail(409, "Pricing is locked after the customer has signed off");
    }
  }
  let data: Record<string, unknown> = { ...current.data, ...changes };
  if (kind === "job") data = await enrichJob(ctx, data, await pricingFor(ctx));
  const { data: row, error } = await ctx.db
    .from("workspace_records")
    .update({ data: data as never, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("workspace_id", ws)
    .select("id,data,created_at")
    .single();
  if (error) dbFail(403, error);
  const saved = toRecord(row as Row, ws) as Record<string, unknown> & { id: number };
  if (
    kind === "job" &&
    ["booked", "won", "in_progress", "completed"].includes(String(saved["status"] ?? "")) &&
    ctx.origin
  ) {
    try {
      const { markMarketingConversion } = await import("./growth-api");
      await markMarketingConversion(ctx.db, ws, Number(saved["customerId"]));
    } catch (error) {
      console.error("Marketing conversion update failed", error);
    }
  }
  if (kind === "job" && saved["status"] === "completed" && ctx.origin) {
    try {
      const { ensureReviewForJob } = await import("./growth-api");
      await ensureReviewForJob(
        ctx.db,
        ws,
        ctx.userId,
        ctx.origin,
        { id, data: saved },
      );
    } catch (error) {
      // A review-provider outage must never roll back the completed job.
      console.error("Automatic review request failed", error);
    }
  }
  return saved;
}

const assignSchema = z
  .object({
    truckId: z.number().int().positive().nullable(),
    crewIds: z.array(z.number().int().positive()).max(30),
    moveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
    startHour: z.number().min(0).max(23.5),
    duration: z.number().min(0.5).max(24),
  })
  .strip();

// Only dispatch roles assign; truck/crew must belong to this workspace, be active, and be free at that time.
async function assignJob(ctx: Ctx, id: number, body: unknown) {
  if (!["admin", "office_admin", "dispatcher"].includes(ctx.role ?? ""))
    fail(403, "Only dispatch staff can assign trucks and crew");
  const parsed = assignSchema.safeParse(body);
  if (!parsed.success) return fail(400, "Invalid assignment");
  const a = { ...parsed.data, crewIds: [...new Set(parsed.data.crewIds)] };
  const current = await getOne(ctx, "job", id);
  const [trucks, crew, jobs] = (await Promise.all([
    list(ctx, "truck"),
    list(ctx, "crew"),
    list(ctx, "job"),
  ])) as Record<string, unknown>[][] as ({ id: number } & Record<string, unknown>)[][];
  if (a.truckId) {
    const t = trucks.find((x) => x.id === a.truckId);
    if (!t) fail(400, "That truck is not in this workspace");
    if (t && t["status"] === "maintenance")
      fail(
        409,
        `${String(t["name"])} is in maintenance and cannot be assigned until service is complete`,
      );
    if (t && t["status"] !== "active" && t["status"] !== "available")
      fail(409, `${String(t["name"])} is not active`);
  }
  for (const cid of a.crewIds) {
    const p = crew.find((x) => x.id === cid);
    if (!p) fail(400, "A selected crew member is not in this workspace");
    if (p && p["status"] === "inactive") fail(409, `${String(p["name"])} is inactive`);
  }
  const candidate: ScheduledJob = {
    id,
    moveDate: a.moveDate,
    startHour: a.startHour,
    duration: a.duration,
    status: String(current.data["status"] ?? ""),
    truckId: a.truckId,
    crewIds: a.crewIds,
  };
  const clash = conflictsFor(candidate, jobs as unknown as ScheduledJob[])[0];
  if (clash) {
    const other = jobs.find((j) => j.id === clash.otherJobId);
    const who =
      clash.resource === "truck"
        ? String(trucks.find((x) => x.id === clash.resourceId)?.["name"] ?? "This truck")
        : String(crew.find((x) => x.id === clash.resourceId)?.["name"] ?? "A crew member");
    fail(
      409,
      `Schedule conflict: ${who} is already on job #${clash.otherJobId}${other?.["title"] ? ` (${String(other["title"])})` : ""} at an overlapping time.`,
    );
  }
  return update(ctx, "job", id, a);
}

// Server-owned writes (timeline, payments) bypass the request field filter on purpose.
async function saveData(ctx: Ctx, id: number, patch: Record<string, unknown>) {
  const ws = requireWs(ctx);
  const current = await getOne(ctx, "job", id);
  const { data: row, error } = await ctx.db
    .from("workspace_records")
    .update({ data: { ...current.data, ...patch } as never, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("workspace_id", ws)
    .select("id,data,created_at")
    .single();
  if (error) dbFail(403, error);
  return toRecord(row as Row, ws);
}

function requireWs(ctx: Ctx): number {
  if (!ctx.wsId || !ctx.role) return fail(403, "Choose a workspace first");
  return ctx.wsId;
}

async function pricingFor(ctx: Ctx): Promise<Pricing> {
  const ws = requireWs(ctx);
  const { data } = await ctx.db.from("workspaces").select("pricing").eq("id", ws).maybeSingle();
  const raw = (data?.pricing as Partial<Pricing> | null) ?? {};
  return {
    ...DEFAULT_PRICING,
    ...raw,
    surge: parseSurgeSettings(raw.surge),
  };
}

const BRANDING_ROLES = ["admin", "office_admin"];

async function workspacePlan(ctx: Ctx) {
  const ws = requireWs(ctx);
  const { data } = await ctx.db
    .from("workspaces")
    .select("plan_id,subscription_status")
    .eq("id", ws)
    .maybeSingle();
  return {
    planId: String(data?.plan_id ?? "beta"),
    status: String(data?.subscription_status ?? "beta"),
  };
}

/** Branding and credit ledgers are single workspace_records rows, so no migration is needed. */
async function settingRecord(ctx: Ctx, kind: string) {
  const ws = requireWs(ctx);
  const { data, error } = await ctx.db
    .from("workspace_records")
    .select("id,data")
    .eq("workspace_id", ws)
    .eq("kind", kind)
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) dbFail(403, error);
  return (data as { id: number; data: Record<string, unknown> } | null) ?? null;
}

async function saveSettingRecord(ctx: Ctx, kind: string, data: Record<string, unknown>) {
  const ws = requireWs(ctx);
  const existing = await settingRecord(ctx, kind);
  if (existing) {
    const { error } = await ctx.db
      .from("workspace_records")
      .update({ data: data as never, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .eq("workspace_id", ws);
    if (error) dbFail(403, error);
    return;
  }
  const { error } = await ctx.db
    .from("workspace_records")
    .insert({ workspace_id: ws, kind, data: data as never });
  if (error) dbFail(403, error);
}

async function workspaces(ctx: Ctx) {
  const { data, error } = await ctx.db
    .from("workspace_members")
    .select(
      "role, workspace_id, workspaces(id,name,plan_id,subscription_status,onboarding_completed_at,travel_pricing_type,fuel_surcharge_type,deposit_rule,appearance)",
    )
    .eq("user_id", ctx.userId);
  if (error) dbFail(500, error);
  return (data ?? []).map((m) => {
    const w = m.workspaces as unknown as {
      id: number;
      name: string;
      plan_id: string;
      subscription_status: string;
      onboarding_completed_at: string | null;
      travel_pricing_type: string;
      fuel_surcharge_type: string;
      deposit_rule: { value?: number } | null;
      appearance: unknown;
    };
    return {
      id: w.id,
      name: w.name,
      role: m.role,
      appearance: parseAppearance(w.appearance),
      planId: w.plan_id,
      subscriptionStatus: w.subscription_status,
      onboardingCompleted: !!w.onboarding_completed_at,
      pricingDefaults:
        w.travel_pricing_type === "none" &&
        w.fuel_surcharge_type === "none" &&
        !Number(w.deposit_rule?.value ?? 0),
    };
  });
}

const quoteNumber = (value: unknown, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const quotePreviewSchema = z
  .object({
    moveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    pricingMode: z.enum(["hourly", "long_distance"]).default("hourly"),
    hourlyRate: z.coerce.number().finite().min(0).max(1_000_000).default(0),
    estimatedHours: z.coerce.number().finite().min(0).max(1000).default(2.5),
    distanceMiles: z.coerce.number().finite().min(0).max(100_000).default(0),
    travelFee: z.coerce.number().finite().min(0).max(100_000).default(0),
    weightRate: z.coerce.number().finite().min(0).max(1000).default(0),
    mileRate: z.coerce.number().finite().min(0).max(1000).default(0),
    discountPercent: z.coerce.number().finite().min(0).max(100).default(0),
    inventory: z
      .array(
        z
          .object({
            weight: z.coerce.number().finite().min(0).max(1_000_000),
            quantity: z.coerce.number().finite().min(0).max(100_000),
          })
          .strip(),
      )
      .max(1000)
      .default([]),
    fees: z
      .array(
        z
          .object({
            name: z.string().trim().max(120).default("Fee"),
            amount: z.coerce.number().finite().min(0).max(1_000_000),
          })
          .strip(),
      )
      .max(100)
      .default([]),
  })
  .strip();

async function route(ctx: Ctx, method: string, parts: string[], body: () => Promise<unknown>) {
  const [head, idRaw, sub] = parts;
  const id = idRaw ? Number(idRaw) : NaN;

  // Server-side quote preview. The office gets the same surge rules that enrichJob
  // persists, so a copied preview cannot drift from the saved quote.
  if (head === "quote" && method === "POST") {
    if (!PRICING_ROLES.includes(ctx.role ?? ""))
      fail(403, "Only office staff can price a quote");
    const parsed = quotePreviewSchema.safeParse(await body());
    if (!parsed.success) fail(400, "Invalid quote pricing input");
    const input = parsed.data!;
    const jobInput = {
      moveDate: String(input.moveDate ?? ""),
      pricingMode:
        input.pricingMode === "long_distance"
          ? ("long_distance" as const)
          : ("hourly" as const),
      hourlyRate: quoteNumber(input.hourlyRate),
      estimatedHours: quoteNumber(input.estimatedHours, 2.5),
      distanceMiles: quoteNumber(input.distanceMiles),
      travelFee: quoteNumber(input.travelFee),
      weightRate: quoteNumber(input.weightRate),
      mileRate: quoteNumber(input.mileRate),
      discountPercent: Math.min(100, Math.max(0, quoteNumber(input.discountPercent))),
      inventory: (Array.isArray(input.inventory) ? input.inventory : []).map((item) => ({
        key: "",
        name: "",
        room: "",
        cuft: 0,
        weight: quoteNumber(item?.weight),
        quantity: quoteNumber(item?.quantity),
      })),
      fees: (Array.isArray(input.fees) ? input.fees : []).map((fee) => ({
        name: String(fee?.name || "Fee").slice(0, 120),
        amount: quoteNumber(fee?.amount),
      })),
    };
    const pricing = await pricingFor(ctx);
    const priced = calculateQuoteWithSurge(
      jobInput,
      pricing.minimumHours,
      parseSurgeSettings(pricing.surge),
      pricing.weekendPercent,
    );
    return {
      moveDate: jobInput.moveDate,
      pricingMode: jobInput.pricingMode,
      discountPercent: jobInput.discountPercent,
      preSurgeTotal: priced.base,
      surge: priced.surge,
      total: priced.total,
      currency: "USD",
    };
  }

  // Workspace pre-move reminder rules: lead times, tiers, channels and copy overrides.
  if (head === "reminder-settings" && (method === "GET" || method === "PUT")) {
    if (!["admin", "office_admin", "dispatcher"].includes(ctx.role ?? ""))
      fail(403, "Only office staff can view pre-move reminder settings");
    const ws = requireWs(ctx);
    const { loadReminderSettings, saveReminderSettings } = await import("./reminders");
    const { reminderSettingsInput } = await import("../shared/reminders");
    const { smsConfigured, emailConfigured } = await import("./notifications");
    const canEdit = ["admin", "office_admin"].includes(ctx.role ?? "");
    const providers = { sms: smsConfigured(), email: emailConfigured() };
    if (method === "GET")
      return { settings: await loadReminderSettings(ctx.db, ws), canEdit, providers };
    if (!canEdit) fail(403, "Only workspace managers can change pre-move reminder settings");
    const parsed = reminderSettingsInput(await body());
    if (!parsed.ok) throw new HttpError(400, parsed.error);
    const settings = await saveReminderSettings(ctx.db, ws, ctx.userId, parsed.settings);
    return { settings, canEdit, providers };
  }

  if (head === "appearance" && (method === "GET" || method === "PUT")) {
    const ws = requireWs(ctx);
    let appearance;
    if (method === "PUT") {
      if (!["admin", "office_admin"].includes(ctx.role ?? ""))
        fail(403, "Only workspace managers can save appearance");
      const parsed = appearanceSchema.safeParse(await body());
      if (!parsed.success) return fail(400, "Invalid appearance preferences");
      appearance = parsed.data;
      if (!validWallpaperScope(appearance, ws)) fail(403, "Wallpaper belongs to another workspace");
      if (appearance.wallpaper?.kind === "storage") {
        const { data, error } = await ctx.db.storage
          .from("workspace-wallpapers")
          .createSignedUrl(appearance.wallpaper.value, SIGNED_URL_TTL_SECONDS);
        if (error || !data) fail(400, "Upload the wallpaper before saving");
      }
      const { data, error } = await ctx.db
        .from("workspaces")
        .update({ appearance })
        .eq("id", ws)
        .select("appearance")
        .single();
      if (error || !data) error ? dbFail(403, error) : fail(403, "Could not save appearance");
    } else {
      const { data, error } = await ctx.db
        .from("workspaces")
        .select("appearance")
        .eq("id", ws)
        .single();
      if (error || !data) fail(403, "Could not read appearance");
      appearance = parseAppearance(data?.appearance);
    }
    return { appearance, wallpaperUrl: null };
  }

  if (head === "branding" && (method === "GET" || method === "PUT")) {
    const plan = await workspacePlan(ctx);
    const entitled = whiteLabelEntitled({ planId: plan.planId, subscriptionStatus: plan.status });
    if (method === "PUT") {
      if (!BRANDING_ROLES.includes(ctx.role ?? ""))
        fail(403, "Only workspace managers can change branding");
      if (!entitled) fail(403, "White-label branding is available on Pro and Enterprise plans");
      const parsed = brandingSchema.safeParse(await body());
      if (!parsed.success) throw new HttpError(400, "Invalid branding settings");
      const branding = parsed.data;
      if (branding.customDomain) {
        const domain = normalizeDomain(branding.customDomain);
        if (domain === null) throw new HttpError(400, "Enter a valid custom domain");
        branding.customDomain = domain;
      }
      for (const image of [branding.logo, branding.background]) {
        if (image?.kind !== "storage") continue;
        if (!isStorageImage(image, requireWs(ctx)))
          fail(403, "That image belongs to another workspace");
        const { data, error } = await ctx.db.storage
          .from("workspace-wallpapers")
          .createSignedUrl(image.value, 60);
        if (error || !data) fail(400, "Upload the image before saving");
      }
      await saveSettingRecord(ctx, "branding", branding);
      return { branding, whiteLabel: entitled, planId: plan.planId, canEdit: true };
    }
    const record = await settingRecord(ctx, "branding");
    return {
      branding: parseBranding(record?.data),
      whiteLabel: entitled,
      planId: plan.planId,
      canEdit: entitled && BRANDING_ROLES.includes(ctx.role ?? ""),
    };
  }

  if (head === "ai-credits" && method === "GET") {
    const plan = await workspacePlan(ctx);
    const [jobRows, requestRows, purchaseRows] = await Promise.all([
      list(ctx, "job"),
      list(ctx, "ai_credit_request"),
      list(ctx, "ai_credit_purchase"),
    ]);
    const jobs = jobRows as Array<Record<string, unknown>>;
    const requests = requestRows as Array<Record<string, unknown>>;
    const purchases = purchaseRows as Array<Record<string, unknown>>;
    const month = new Date().toISOString().slice(0, 7);
    const used = jobs.filter(
      (job) =>
        (job["aiSurvey"] === true || job["source"] === "AI Room Survey") &&
        String(job["createdAt"] ?? "").slice(0, 7) === month,
    ).length;
    const pending = requests.filter((request) => isPendingCreditStatus(request["status"]));
    const purchased = sumPurchaseCredits(purchases);
    const included = includedSurveyCredits(plan.planId, purchased);
    const balance = creditBalance(used, included);
    return {
      planId: plan.planId,
      purchased,
      ...balance,
      packs: SCAN_PACKS,
      checkoutConfigured: stripeBillingConfigured(),
      pending: pending.map((request) => ({
        id: request["id"],
        packId: request["packId"],
        credits: request["credits"],
        amountCents: request["amountCents"],
        status: request["status"],
        requestedAt: request["createdAt"],
      })),
    };
  }

  if (head === "ai-credits" && method === "POST" && idRaw === "checkout") {
    if (!BRANDING_ROLES.includes(ctx.role ?? ""))
      fail(403, "Only workspace managers can buy scan packs");
    const input = (await body()) as { packId?: unknown };
    const pack = scanPackById(input?.packId);
    if (!pack) throw new HttpError(400, "Choose a scan pack");
    const ws = requireWs(ctx);
    // Record the intent first so the webhook can reconcile the paid session with it.
    const requestData = {
      packId: pack.id,
      credits: pack.credits,
      amountCents: pack.priceCents,
      status: "checkout_created",
      requestedBy: ctx.email,
      requestedAt: new Date().toISOString(),
    };
    const { data: requestRow, error } = await ctx.db
      .from("workspace_records")
      .insert({ workspace_id: ws, kind: "ai_credit_request", data: requestData as never })
      .select("id")
      .single();
    if (error || !requestRow) {
      if (error) dbFail(403, error);
      throw new HttpError(403, "Could not start checkout");
    }
    try {
      const session = await createScanPackCheckout({
        workspaceId: ws,
        pack,
        email: ctx.email,
        origin: ctx.origin ?? "",
        requestId: requestRow.id,
      });
      await ctx.db
        .from("workspace_records")
        .update({
          data: {
            ...requestData,
            status: "awaiting_payment",
            sessionId: session.sessionId,
            checkoutMode: session.mode,
          } as never,
          updated_at: new Date().toISOString(),
        })
        .eq("id", requestRow.id)
        .eq("workspace_id", ws);
      return { url: session.url, sessionId: session.sessionId, requestId: requestRow.id };
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Stripe checkout failed";
      await ctx.db
        .from("workspace_records")
        .update({
          data: { ...requestData, status: "failed", failure: message.slice(0, 300) } as never,
          updated_at: new Date().toISOString(),
        })
        .eq("id", requestRow.id)
        .eq("workspace_id", ws);
      if (reason instanceof BillingConfigError) throw new HttpError(503, message);
      console.error("Stripe scan pack checkout failed", message);
      throw new HttpError(502, "Stripe could not start checkout. Try again in a moment.");
    }
  }

  if (head === "ai-credits" && method === "POST" && idRaw === "purchase") {
    if (!BRANDING_ROLES.includes(ctx.role ?? ""))
      fail(403, "Only workspace managers can buy scan packs");
    const input = (await body()) as { packId?: unknown };
    const pack = scanPackById(input?.packId);
    if (!pack) throw new HttpError(400, "Choose a scan pack");
    const ws = requireWs(ctx);
    const { data, error } = await ctx.db
      .from("workspace_records")
      .insert({
        workspace_id: ws,
        kind: "ai_credit_request",
        data: {
          packId: pack.id,
          credits: pack.credits,
          amountCents: pack.priceCents,
          status: "pending",
          requestedBy: ctx.email,
          requestedAt: new Date().toISOString(),
        } as never,
      })
      .select("id,data")
      .single();
    if (error) dbFail(403, error);
    return {
      request: data,
      message: "Scan pack requested. Credits are added once payment is confirmed.",
    };
  }

  if (head === "bootstrap" && method === "GET") {
    const all = await workspaces(ctx);
    const workspace = all.find((w) => w.id === ctx.wsId) ?? all[0] ?? null;
    if (ctx.wsId && !all.some((w) => w.id === ctx.wsId)) fail(403, "No access to that workspace");
    const pricing = workspace
      ? await pricingFor({ ...ctx, wsId: workspace.id, role: workspace.role })
      : DEFAULT_PRICING;
    return {
      user: { id: 0, name: ctx.email.split("@")[0] ?? "", email: ctx.email },
      workspaces: all,
      workspace,
      pricing,
    };
  }
  if (head === "workspaces" && method === "POST") {
    const { name } = (await body()) as { name?: unknown };
    if (typeof name !== "string") fail(400, "Name is required");
    const { data, error } = await ctx.db.rpc("create_workspace", { _name: name as string });
    if (error) dbFail(400, error);
    return { id: data as number, name: (name as string).trim(), role: "admin" };
  }
  if (head === "dashboard" && method === "GET") {
    const [customers, jobs, reminders, trucks, crew] = await Promise.all(
      ["customer", "job", "reminder", "truck", "crew"].map((k) => list(ctx, k)),
    );
    const { dashboardReviewMetrics } = await import("./growth-api");
    return {
      customers,
      jobs,
      reminders,
      trucks,
      crew,
      payments: [],
      reviews: await dashboardReviewMetrics(ctx.db, requireWs(ctx)),
    };
  }
  if (head === "review-metrics" && method === "GET") {
    const { dashboardReviewMetrics } = await import("./growth-api");
    return dashboardReviewMetrics(ctx.db, requireWs(ctx));
  }
  if (head === "branch-performance" && method === "GET") {
    if (!["admin", "office_admin"].includes(ctx.role ?? ""))
      fail(403, "Only workspace managers can view the multi-branch roll-up");
    const { branchPerformanceFor } = await import("./growth-api");
    return branchPerformanceFor(ctx.db, requireWs(ctx));
  }
  if (head === "engage") {
    const section = idRaw ?? "";
    const sectionId = sub ? Number(sub) : NaN;
    if (!["admin", "office_admin", "estimator", "dispatcher"].includes(ctx.role ?? ""))
      fail(403, "Growth tools are for office staff");
    const { reviewsOverview, createReviewRequest, dispatchCompletedReviews, marketingOverview, runReengagement } =
      await import("./growth-api");
    const ws = requireWs(ctx);
    if (section === "reviews") {
      if (method === "GET" && !sub) return reviewsOverview(ctx.db, ws);
      if (method === "POST" && sub === "run")
        return dispatchCompletedReviews(ctx.db, ws, ctx.userId, ctx.origin ?? "https://invalid.local");
      if (method === "PATCH" && sectionId) {
        const { resolveReviewEscalation } = await import("./growth-api");
        return resolveReviewEscalation(ctx.db, ws, sectionId);
      }
      if (method === "POST" && !sub)
        return createReviewRequest(ctx.db, ws, ctx.userId, ctx.origin ?? "https://invalid.local", (await body()) as never);
    }
    if (section === "marketing" && method === "GET")
      return marketingOverview(ctx.db, ws, ctx.origin ?? "https://invalid.local");
    if (section === "followups" && method === "POST" && sub === "run") {
      const parsed = (await body()) as { campaignId?: unknown };
      const campaignId = parsed?.campaignId == null ? null : Number(parsed.campaignId) || null;
      return runReengagement(ctx.db, ws, ctx.userId, ctx.origin ?? "https://invalid.local", campaignId);
    }
    if (section === "campaigns") {
      if (method === "GET" && !sub) return list(ctx, "campaign");
      if (method === "POST" && !sub) return create(ctx, "campaign", await body());
      if (method === "PATCH" && sectionId)
        return update(ctx, "campaign", sectionId, await body());
    }
    if (section === "reports" && method === "GET") {
      const [jobRows, customerRows, expenseRows, campaignRows] = await Promise.all([
        list(ctx, "job"),
        list(ctx, "customer"),
        list(ctx, "expense"),
        list(ctx, "campaign"),
      ]);
      const jobs = jobRows as Array<Record<string, unknown>>;
      const customers = customerRows as Array<Record<string, unknown>>;
      const expenses = expenseRows as Array<Record<string, unknown>>;
      const campaigns = campaignRows as Array<Record<string, unknown>>;
      const booked = jobs.filter((job) => !["lead", "estimate", "lost", "cancelled"].includes(String(job.status)));
      const completed = jobs.filter((job) => String(job.status) === "completed");
      const revenueCents = completed.reduce((sum, job) => sum + Math.round(Number(job.finalTotal ?? job.total ?? 0) * 100), 0);
      const expenseCents = expenses.reduce((sum, expense) => sum + Number(expense.amountCents || 0), 0);
      const sourceRows = new Map<string, { source: string; leads: number; booked: number; collectedCents: number; spendCents: number }>();
      for (const customer of customers) {
        const key = String(customer.source || "Unattributed");
        const row = sourceRows.get(key) ?? { source: key, leads: 0, booked: 0, collectedCents: 0, spendCents: 0 };
        row.leads += 1;
        const customerJobs = booked.filter((job) => Number(job.customerId) === Number(customer.id));
        row.booked += customerJobs.length;
        row.collectedCents += customerJobs
          .filter((job) => String(job.invoiceStatus) === "paid")
          .reduce((sum, job) => sum + Math.round(Number(job.finalTotal ?? job.total ?? 0) * 100), 0);
        sourceRows.set(key, row);
      }
      for (const campaign of campaigns) {
        const key = String(campaign.source || campaign.name || "Unattributed");
        const row = sourceRows.get(key) ?? { source: key, leads: 0, booked: 0, collectedCents: 0, spendCents: 0 };
        row.spendCents += Number(campaign.spendCents || 0);
        sourceRows.set(key, row);
      }
      return {
        kpis: {
          leads: customers.length,
          booked: booked.length,
          completed: completed.length,
          estimatedRevenueCents: revenueCents,
          collectedRevenueCents: revenueCents,
          expenseCents,
          netContributionCents: revenueCents - expenseCents,
        },
        funnel: ["lead", "estimate", "booked", "completed"].map((stage) => ({
          stage,
          count: jobs.filter((job) => String(job.status) === stage).length,
        })),
        sources: [...sourceRows.values()].map((row) => ({
          ...row,
          costPerLeadCents: row.leads ? Math.round(row.spendCents / row.leads) : null,
          roas: row.spendCents ? row.collectedCents / row.spendCents : null,
        })),
        months: [],
      };
    }
  }
  if (head === "pricing") {
    if (method === "GET") return pricingFor(ctx);
    if (method === "PUT") {
      if (!canEditTariffs(ctx.role)) fail(403, "Only admins can edit tariffs");
      const parsed = pricingSchema.safeParse(await body());
      if (!parsed.success) return fail(400, "Invalid pricing settings");
      const value = parsed.data;
      const { error } = await ctx.db
        .from("workspaces")
        .update({ pricing: value as never })
        .eq("id", requireWs(ctx));
      if (error) dbFail(403, error);
      return value;
    }
  }
  if (head === "reports" && method === "GET") {
    const [jobs, crew, customers] = await Promise.all(
      ["job", "crew", "customer"].map((k) => list(ctx, k)),
    );
    return {
      ...operationalReport(jobs as never, crew as never, customers as never),
      hasJobs: jobs.length > 0,
    };
  }
  if (head === "tariffs" && (method === "GET" || method === "PUT")) {
    const ws = requireWs(ctx);
    if (method === "PUT") {
      if (!canEditTariffs(ctx.role)) fail(403, "Only admins can edit tariffs");
      const parsed = z
        .object({ pricing: pricingSchema, travel: travelSettingsSchema })
        .safeParse(await body());
      if (!parsed.success) fail(400, "Invalid tariff settings");
      if (!parsed.success) return;
      const s = parsed.data.travel;
      const { error } = await ctx.db
        .from("workspaces")
        .update({
          pricing: parsed.data.pricing as never,
          dispatch_address: s.dispatchAddress || null,
          travel_pricing_type: s.travelPricingType,
          travel_flat_rate: s.travelFlatRate,
          travel_mileage_rate: s.travelMileageRate,
          fuel_surcharge_type: s.fuelSurchargeType,
          fuel_flat_rate: s.fuelFlatRate,
          fuel_per_mile_rate: s.fuelPerMileRate,
          fuel_percentage_rate: s.fuelPercentageRate,
        })
        .eq("id", ws);
      if (error) fail(403, "Could not save tariff settings");
    }
    const { data: row, error } = await ctx.db
      .from("workspaces")
      .select(
        "pricing,dispatch_address,travel_pricing_type,travel_flat_rate,travel_mileage_rate,fuel_surcharge_type,fuel_flat_rate,fuel_per_mile_rate,fuel_percentage_rate",
      )
      .eq("id", ws)
      .single();
    if (error || !row) return fail(500, "Could not load tariff settings");
    return {
      pricing: {
        ...DEFAULT_PRICING,
        ...((row.pricing as object) ?? {}),
        truckFee: Number((row.pricing as Record<string, unknown> | null)?.["truckFee"] ?? 0),
      },
      travel: {
        dispatchAddress: row.dispatch_address ?? "",
        travelPricingType: row.travel_pricing_type,
        travelFlatRate: Number(row.travel_flat_rate),
        travelMileageRate: Number(row.travel_mileage_rate),
        fuelSurchargeType: row.fuel_surcharge_type,
        fuelFlatRate: Number(row.fuel_flat_rate),
        fuelPerMileRate: Number(row.fuel_per_mile_rate),
        fuelPercentageRate: Number(row.fuel_percentage_rate),
      },
    };
  }
  if (head === "members") {
    const ws = requireWs(ctx);
    if (method === "GET") {
      const { data } = await ctx.db
        .from("workspace_members")
        .select("id,user_id,name,email,role")
        .eq("workspace_id", ws);
      return (data ?? []).map((m) => ({
        id: m.id,
        userId: 0,
        name: m.name,
        email: m.email,
        role: m.role,
      }));
    }
    if (method === "PATCH" && id) {
      const { role } = (await body()) as { role?: unknown };
      if (typeof role !== "string") fail(400, "Role is required");
      const { data, error } = await ctx.db
        .from("workspace_members")
        .update({ role: role as string })
        .eq("id", id)
        .eq("workspace_id", ws)
        .select("id,name,email,role")
        .single();
      if (error) dbFail(403, error);
      return { ...data, userId: 0 };
    }
    if (method === "POST") fail(405, "Use workspace invitations to add a teammate.");
  }
  if (head === "workers" && method === "GET" && !idRaw) {
    const crew = await list(ctx, "crew");
    const from = ctx.q?.get("from") ?? "";
    const to = ctx.q?.get("to") ?? "";
    return {
      period: { from, to },
      workers: crew.map((c) => ({
        ...c,
        approvedMinutes: 0,
        baseEarnedCents: 0,
        tipsCents: 0,
        totalEarnedCents: 0,
        completedJobs: 0,
        paidCents: 0,
      })),
    };
  }
  if (head === "invitations") {
    const ws = requireWs(ctx);
    if (!["admin", "office_admin"].includes(ctx.role ?? ""))
      fail(403, "Only Admin and Office admin can manage invitations");
    const COLS =
      "id,kind,email,role,hourly_rate,candidate_id,token,status,send_count,last_sent_at,accepted_at,expires_at,created_at";
    type Inv = {
      id: number;
      kind: string;
      email: string | null;
      role: string;
      hourly_rate: number;
      candidate_id: number | null;
      token: string;
      status: string;
      send_count: number;
      last_sent_at: string | null;
      accepted_at: string | null;
      expires_at: string;
      created_at: string;
    };
    const origin = (o: unknown) => {
      const v = typeof o === "string" ? o : "";
      return /^https?:\/\/[^/\s]+$/.test(v) ? v : "";
    };
    const shape = (r: Inv, o = "") => {
      const expired = r.status === "pending" && new Date(r.expires_at) < new Date();
      return {
        id: r.id,
        kind: r.kind,
        email: r.email,
        role: r.role,
        hourlyRateCents: Math.round(Number(r.hourly_rate) * 100),
        workerId: r.candidate_id,
        status: expired ? "expired" : r.status,
        expiresAt: r.expires_at,
        createdAt: r.created_at,
        acceptedAt: r.accepted_at,
        acceptedByUserId: null,
        sendStatus:
          r.kind === "email" ? (r.send_count ? "opened in email app" : "not sent") : "link",
        lastSentAt: r.last_sent_at,
        sendError: null,
        token: r.token,
        inviteUrl: `${o}/join-crew?token=${r.token}`,
      };
    };
    if (method === "GET" && !idRaw) {
      const { data, error } = await ctx.db
        .from("workspace_invitations")
        .select(COLS)
        .eq("workspace_id", ws)
        .neq("status", "revoked")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) dbFail(500, error);
      return (data as Inv[]).map((r) => shape(r));
    }
    if (method === "POST" && !idRaw) {
      const b = (await body()) as Record<string, unknown>;
      const kind = b["kind"] === "email" ? "email" : "link";
      const email =
        kind === "email"
          ? String(b["email"] ?? "")
              .trim()
              .slice(0, 200)
          : null;
      if (kind === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email ?? ""))
        fail(400, "Enter a valid email address");
      const role = ["crew", "dispatcher", "estimator", "office_admin", "admin"].includes(
        String(b["role"]),
      )
        ? String(b["role"])
        : "crew";
      if (role === "admin" && ctx.role !== "admin")
        fail(403, "Only an Admin can invite another Admin");
      const cents = Number(b["hourlyRateCents"] ?? 0);
      if (!Number.isFinite(cents) || cents < 0 || cents > 100000)
        fail(400, "Enter a valid hourly rate");
      const cand = b["workerId"] == null || b["workerId"] === "" ? null : Number(b["workerId"]);
      if (cand !== null) await getOne(ctx, "crew", cand);
      const { data, error } = await ctx.db
        .from("workspace_invitations")
        .insert({
          workspace_id: ws,
          kind,
          email,
          role,
          hourly_rate: cents / 100,
          candidate_id: cand,
          send_count: kind === "email" ? 1 : 0,
          last_sent_at: kind === "email" ? new Date().toISOString() : null,
        })
        .select(COLS)
        .single();
      if (error) dbFail(403, error);
      const inv = shape(data as Inv, origin(b["publicOrigin"]));
      return { invitation: inv, inviteUrl: inv.inviteUrl };
    }
    if (method === "POST" && id && (sub === "resend" || sub === "revoke")) {
      const b = (await body()) as Record<string, unknown>;
      const patch =
        sub === "revoke"
          ? { status: "revoked" }
          : {
              expires_at: new Date(Date.now() + 14 * 864e5).toISOString(),
              last_sent_at: new Date().toISOString(),
            };
      const { data, error } = await ctx.db
        .from("workspace_invitations")
        .update(patch)
        .eq("id", id)
        .eq("workspace_id", ws)
        .eq("status", "pending")
        .select(COLS)
        .maybeSingle();
      if (error) dbFail(403, error);
      if (sub === "revoke") {
        if (data) return { revoked: true, status: "revoked" };
        // A repeated revoke is successful; never overwrite an accepted invitation.
        const { data: current, error: readError } = await ctx.db
          .from("workspace_invitations")
          .select("status")
          .eq("id", id)
          .eq("workspace_id", ws)
          .maybeSingle();
        if (readError) dbFail(403, readError);
        if (!current) return fail(404, "Invitation not found");
        return { revoked: current.status === "revoked", status: current.status };
      }
      if (!data) fail(409, "This invitation is no longer pending");
      const inv = shape(data as Inv, origin(b["publicOrigin"]));
      return { invitation: inv, inviteUrl: inv.inviteUrl };
    }
  }
  if (head === "invites") {
    const ws = requireWs(ctx);
    if (!["admin", "office_admin", "dispatcher"].includes(ctx.role ?? ""))
      fail(403, "Only managers can invite crew");
    if (method === "GET") {
      const { data, error } = await ctx.db
        .from("crew_invites")
        .select("id,token,email,crew_role,accepted_at,expires_at,created_at")
        .eq("workspace_id", ws)
        .order("id", { ascending: false })
        .limit(100);
      if (error) dbFail(500, error);
      return data;
    }
    if (method === "POST") {
      const b = (await body()) as { email?: string; crewRole?: string };
      const email = String(b.email ?? "")
        .trim()
        .slice(0, 200);
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(400, "Enter a valid email");
      const crewRole = ["driver", "helper", "crew_lead"].includes(String(b.crewRole))
        ? String(b.crewRole)
        : "helper";
      const { data, error } = await ctx.db
        .from("crew_invites")
        .insert({ workspace_id: ws, email, crew_role: crewRole })
        .select("id,token,email,crew_role,accepted_at,expires_at,created_at")
        .single();
      if (error) dbFail(403, error);
      return data;
    }
    if (method === "DELETE" && id) {
      const { error } = await ctx.db
        .from("crew_invites")
        .delete()
        .eq("id", id)
        .eq("workspace_id", ws);
      if (error) dbFail(403, error);
      return { deleted: true };
    }
  }
  if (head === "feedback" && method === "POST") {
    const b = z
      .object({
        kind: z.enum(["feedback", "bug"]),
        message: z.string().trim().min(3).max(4000),
        page: z.string().max(300).default(""),
      })
      .safeParse(await body());
    if (!b.success) fail(400, "Please write at least a few words");
    const { error } = await ctx.db.from("beta_feedback").insert({
      user_id: ctx.userId,
      user_email: ctx.email,
      workspace_id: ctx.wsId,
      kind: b.data!.kind,
      message: b.data!.message,
      page: b.data!.page,
    });
    if (error) fail(403, "Could not send feedback");
    return { sent: true };
  }
  if (head === "demo" && method === "POST") {
    if (!["admin", "office_admin"].includes(ctx.role ?? ""))
      fail(403, "Only admins can load demo data");
    const b = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).safeParse(await body());
    if (!b.success) fail(400, "Choose a day");
    const { DEMO_TRUCK, DEMO_CREW, DEMO_CUSTOMER, demoJob } = await import("../shared/demo-job");
    const truck = await create(ctx, "truck", DEMO_TRUCK);
    const crew = [];
    for (const c of DEMO_CREW) crew.push(await create(ctx, "crew", c));
    const customer = await create(ctx, "customer", DEMO_CUSTOMER);
    const job = await create(
      ctx,
      "job",
      demoJob(
        b.data!.date,
        truck.id,
        crew.map((c) => c.id),
        customer.id,
      ),
    );
    return { job, truck, crew, customer };
  }
  if (head === "demo" && method === "DELETE") {
    if (!["admin", "office_admin"].includes(ctx.role ?? ""))
      fail(403, "Only admins can clear demo data");
    const ws = requireWs(ctx);
    const { isDemoRecord } = await import("../shared/demo-job");
    const { data: rows, error } = await ctx.db
      .from("workspace_records")
      .select("id,kind,data")
      .eq("workspace_id", ws)
      .in("kind", ["job", "truck", "crew", "customer"]);
    if (error) dbFail(403, error);
    const ids = (rows ?? [])
      .filter((r) => isDemoRecord(r.kind as string, (r.data ?? {}) as Record<string, unknown>))
      .map((r) => r.id as number);
    if (ids.length) {
      const { error: delError } = await ctx.db
        .from("workspace_records")
        .delete()
        .eq("workspace_id", ws)
        .in("id", ids);
      if (delError) dbFail(403, delError);
    }
    return { deleted: ids.length };
  }
  if (head === "field")
    return fieldRoute(ctx, method, parts.slice(1), body, {
      list,
      getOne,
      update,
      saveData,
      create,
      requireWs,
      fail,
      toRecord,
    });
  // Bill of lading: the document is workspace-scoped, signing is idempotent per role,
  // and the generated pdf-lib file is attached to the job's documents map.
  if (head === "ops" && idRaw === "bol") {
    const jobId = Number(parts[2]);
    if (!Number.isInteger(jobId) || jobId <= 0) fail(400, "Unknown job");
    const deps = {
      db: ctx.db,
      wsId: requireWs(ctx),
      userId: ctx.userId,
      getJob: (id: number) => getOne(ctx, "job", id),
      saveJob: (id: number, patch: Record<string, unknown>) => saveData(ctx, id, patch),
    };
    const mod = await import("./bol-api");
    if (method === "GET" && parts[3] === "pdf") return mod.streamBolPdf(deps, jobId);
    if (method === "GET") return mod.getBol(deps, jobId);
    if (method === "POST" && parts[3] === "sign") {
      if (!["admin", "office_admin", "dispatcher", "crew"].includes(ctx.role ?? ""))
        fail(403, "Only dispatch or crew can sign a bill of lading");
      return mod.signBol(deps, jobId, (await body()) as { role?: unknown; signature?: unknown; signerName?: unknown });
    }
    fail(404, "Unknown bill of lading action");
  }
  // Recurring storage billing: office staff can review invoices, generate the current
  // month idempotently and mark an invoice paid. Delivery results stay on each invoice.
  if (head === "ops" && idRaw === "storage-billing") {
    const ws = requireWs(ctx);
    if (!["admin", "office_admin", "dispatcher"].includes(ctx.role ?? ""))
      fail(403, "Storage billing is for office staff");
    const mod = await import("./storage-billing-api");
    if (method === "GET" && !sub) return mod.storageBillingOverview(ctx.db, ws);
    if (method === "POST" && sub === "run") {
      if (!["admin", "office_admin"].includes(ctx.role ?? ""))
        fail(403, "Only office admins can run monthly storage billing");
      return mod.runStorageBilling(ctx.db, ws, ctx.origin ?? "https://invalid.local");
    }
    if (method === "PATCH" && sub) {
      if (!["admin", "office_admin"].includes(ctx.role ?? ""))
        fail(403, "Only office admins can update storage invoices");
      const invoiceId = Number(sub);
      if (!Number.isInteger(invoiceId) || invoiceId <= 0) fail(400, "Unknown storage invoice");
      const input = (await body()) as { paid?: unknown };
      return mod.markStorageInvoicePaid(ctx.db, ws, invoiceId, input.paid !== false);
    }
    fail(404, "Unknown storage billing action");
  }
  // Vaults hold customer belongings and contact details, so they stay with office staff.
  if (head === "vaults" && !["admin", "office_admin", "dispatcher"].includes(ctx.role ?? ""))
    fail(403, "Storage vaults are for office staff");
  // Expense records feed labor, fuel and margin reporting, so crew phones cannot write them.
  if (head === "ops" && (idRaw === "timecards" || idRaw === "tips" || idRaw === "payroll")) {
    const ws = requireWs(ctx);
    const id = Number(parts[2]) || 0;
    const mod = await import("./payroll-api");
    try {
      if (idRaw === "timecards") {
        if (method === "GET" && !id) return await mod.listTimecards(ctx.db, ws);
        if (method === "POST" && !id)
          return await mod.createTimecard(ctx.db, ws, ctx.role, await body());
        if (method === "PATCH" && id)
          return await mod.updateTimecard(ctx.db, ws, ctx.role, id, await body());
      }
      if (idRaw === "tips") {
        if (method === "GET") return await mod.listTips(ctx.db, ws);
        if (method === "POST")
          return await mod.createTip(ctx.db, ws, ctx.role, await body());
      }
      if (idRaw === "payroll" && method === "GET")
        return await mod.payrollReport(ctx.db, ws, ctx.q?.get("from") ?? null, ctx.q?.get("to") ?? null);
    } catch (error) {
      if (error instanceof mod.PayrollError) fail(error.status, error.message);
      throw error;
    }
  }

  if (head === "ops" && idRaw === "claims") {
    const ws = requireWs(ctx);
    const claimId = Number.isFinite(Number(parts[2])) ? Number(parts[2]) : 0;
    const action = parts[3];
    const mod = await import("./claims-api");
    try {
      if (method === "GET" && !claimId) return await mod.listClaims(ctx.db, ws);
      if (method === "POST" && !claimId)
        return await mod.createClaim(ctx.db, ws, ctx.role, ctx.email, await body());
      if (method === "PATCH" && claimId)
        return await mod.updateClaim(ctx.db, ws, ctx.role, ctx.email, claimId, await body());
      if (method === "GET" && claimId && action === "events")
        return await mod.claimEvents(ctx.db, ws, claimId);
      if (method === "POST" && claimId && action === "events")
        return await mod.addClaimEvent(ctx.db, ws, ctx.role, ctx.email, claimId, await body());
    } catch (error) {
      if (error instanceof mod.ClaimError) fail(error.status, error.message);
      throw error;
    }
  }

  if (head === "expenses" && !["admin", "office_admin", "dispatcher"].includes(ctx.role ?? ""))
    fail(403, "Expenses are for office staff");
  // Saving a vault mirrors its inspection photos and assets onto the active job payload.
  if (head === "vaults" && id && method === "PATCH") {
    const saved = (await update(ctx, "vault", id, await body())) as Record<string, unknown>;
    const { syncVaultToJob } = await import("./storage-vaults");
    const { vaultPhotos } = await import("../shared/vault-photos");
    const jobSync = await syncVaultToJob(
      {
        getJob: (jobId) => getOne(ctx, "job", jobId),
        saveJob: (jobId, patch) => saveData(ctx, jobId, patch),
        actor: ctx.email || "Office",
      },
      { ...saved, photos: vaultPhotos(saved["photos"]) } as never,
    );
    return { ...saved, jobSync };
  }
  // Crew members work through the field endpoints; they cannot edit jobs or customers directly.
  if (ctx.role === "crew" && method !== "GET" && (head === "jobs" || head === "customers"))
    fail(403, "Crew members can update jobs only from the field screen");
  // Crew roster and fleet (roles, driver status, pay) are managed by office staff only.
  if (ctx.role === "crew" && method !== "GET" && (head === "crew" || head === "trucks"))
    fail(403, "Only office staff can change the crew roster or fleet");
  if (head === "payments" && method === "GET") return [];
  if (head === "outbox" && method === "GET") return [];
  // Sends every lifecycle message that is due and not yet accepted. Safe to repeat.
  if (head === "notifications" && method === "POST") {
    if (!["admin", "office_admin", "dispatcher"].includes(ctx.role ?? ""))
      fail(403, "Only office staff can send customer messages");
    const ws = requireWs(ctx);
    const { sweepDueNotifications } = await import("./notifications");
    const { data: rows, error } = await ctx.db
      .from("workspace_records")
      .select("id,data")
      .eq("workspace_id", ws)
      .eq("kind", "job");
    if (error) dbFail(403, error);
    const result = await sweepDueNotifications(
      {
        db: ctx.db,
        wsId: ws,
        userId: ctx.userId,
        origin: ctx.origin ?? "https://invalid.local",
        save: (jobId: number, patch: Record<string, unknown>) => saveData(ctx, jobId, patch),
      },
      (rows ?? []) as { id: number; data: Record<string, unknown> }[],
    );
    return { attempted: result.attempted, sent: result.results.filter((r) => r.sent).length };
  }

  if (head === "jobs" && id && (sub === "deletion-preview" || (!sub && method === "DELETE"))) {
    if (ctx.role !== "admin" && ctx.role !== "office_admin")
      fail(403, "Only admins can delete jobs");
    const job = await getOne(ctx, "job", id);
    const revision = String(job.data["updatedAt"] ?? job.created_at);
    if (sub === "deletion-preview")
      return {
        jobId: id,
        title: String(job.data["title"] ?? ""),
        timecards: 0,
        inventory: Array.isArray(job.data["inventory"])
          ? (job.data["inventory"] as unknown[]).length
          : 0,
        invoices: 0,
        blockers: [],
        revision,
      };
    const b = (await body()) as { confirm?: boolean };
    if (!b.confirm) fail(400, "Please confirm the deletion");
    const { error } = await ctx.db
      .from("workspace_records")
      .delete()
      .eq("id", id)
      .eq("workspace_id", requireWs(ctx))
      .eq("kind", "job");
    if (error) dbFail(403, error);
    return { deleted: true };
  }
  if (head === "jobs" && id && sub) {
    // One-click quote dispatch: GET returns the pre-filled preview, POST sends and records it.
    if (sub === "quote-dispatch") {
      if (!["admin", "office_admin", "dispatcher", "estimator"].includes(ctx.role ?? ""))
        fail(403, "Only office staff can send quotes to customers");
      const ws = requireWs(ctx);
      const current = await getOne(ctx, "job", id);
      const job = { id, data: current.data };
      const deps = {
        db: ctx.db,
        wsId: ws,
        userId: ctx.userId,
        origin: ctx.origin ?? "https://invalid.local",
        save: (jobId: number, patch: Record<string, unknown>) => saveData(ctx, jobId, patch),
      };
      const { dispatchQuote, quoteDispatchPreview } = await import("./quote-dispatch");
      if (method === "GET") return quoteDispatchPreview(deps, job);
      if (method === "POST") {
        const b = z
          .object({
            email: z.string().trim().max(200).default(""),
            phone: z.string().trim().max(40).default(""),
            channels: z
              .array(z.enum(["email", "sms"]))
              .min(1)
              .max(2),
            subject: z.string().trim().min(1).max(200),
            emailBody: z.string().trim().min(1).max(4000),
            smsBody: z.string().trim().min(1).max(1000),
          })
          .parse(await body());
        if (b.channels.includes("email") && !QUOTE_EMAIL_RE.test(b.email))
          fail(400, "Add a valid customer email address");
        if (b.channels.includes("sms") && !QUOTE_PHONE_RE.test(b.phone))
          fail(400, "Add a valid customer mobile number");
        return dispatchQuote(deps, job, b);
      }
    }
    if (sub === "notifications") {
      if (!["admin", "office_admin", "dispatcher"].includes(ctx.role ?? ""))
        fail(403, "Only office staff can send customer messages");
      const { notificationPanel, sendJobNotification } = await import("./notifications");
      const { isJobNotificationKind } = await import("../shared/notifications");
      const ws = requireWs(ctx);
      const deps = {
        db: ctx.db,
        wsId: ws,
        userId: ctx.userId,
        origin: ctx.origin ?? "https://invalid.local",
        save: (jobId: number, patch: Record<string, unknown>) => saveData(ctx, jobId, patch),
      };
      const job = { id, data: (await getOne(ctx, "job", id)).data };
      if (method === "GET") return notificationPanel(deps, job);
      if (method === "POST") {
        const b = (await body()) as { kind?: unknown; force?: unknown };
        const kind = b.kind;
        if (!isJobNotificationKind(kind)) throw new HttpError(400, "Unknown message trigger");
        const result = await sendJobNotification(deps, job, kind, { force: Boolean(b.force) });
        return { ...result, panel: await notificationPanel(deps, job) };
      }
    }
    if (sub === "test-approve" && method === "POST") {
      if (!canTestBook(new URL(ctx.origin ?? "https://invalid.local").hostname, ctx.role))
        fail(403, "Manual test booking is available to admins on preview only");
      const parsed = z
        .object({ confirm: z.literal(true) })
        .strict()
        .safeParse(await body());
      if (!parsed.success) fail(400, "Please confirm the test booking");
      const ws = requireWs(ctx);
      const current = await getOne(ctx, "job", id);
      if (
        current.data["status"] !== "estimate" &&
        !(current.data["status"] === "booked" && current.data["testApproval"])
      )
        fail(409, "Only estimates can be approved for testing");
      const { supabaseAdmin } = await import("../integrations/supabase/client.server");
      const { error } = await supabaseAdmin.rpc("book_job_for_preview", {
        _ws: ws,
        _job: id,
        _actor: ctx.userId,
      });
      if (error) fail(409, "Could not approve this estimate for testing");
      return toRecord(await getOne(ctx, "job", id), ws);
    }
    if (sub === "assign" && method === "POST") return assignJob(ctx, id, await body());
    // Calendar scheduling: capacity, overlap, activity logging and optional crew notifications.
    if (sub === "schedule" && method === "POST") {
      if (!["admin", "office_admin", "dispatcher"].includes(ctx.role ?? ""))
        fail(403, "Only dispatch staff can schedule jobs");
      const { scheduleJob } = await import("./schedule");
      const { data: workspace } = await ctx.db
        .from("workspaces")
        .select("name")
        .eq("id", requireWs(ctx))
        .maybeSingle();
      const result = await scheduleJob(
        {
          getJob: (jobId) => getOne(ctx, "job", jobId),
          listTrucks: async () =>
            (await list(ctx, "truck")).map((row) => row as Record<string, unknown>),
          listCrew: async () =>
            (await list(ctx, "crew")).map((row) => row as Record<string, unknown>),
          listJobs: async () =>
            (await list(ctx, "job")).map((row) => row as Record<string, unknown>),
          save: (jobId, patch) => saveData(ctx, jobId, patch),
          fail,
          actor: ctx.email || "Dispatch",
          origin: ctx.origin ?? "https://invalid.local",
          companyName: String(workspace?.name ?? ""),
        },
        id,
        await body(),
      );
      const saved = toRecord(await getOne(ctx, "job", id), requireWs(ctx));
      return { ...saved, schedule: result } as typeof saved & { schedule: typeof result };
    }
    // Crew shift confirmations: mint per-crew tokens and send the accept/decline links.
    if (sub === "shift-dispatch" && method === "POST") {
      if (!["admin", "office_admin", "dispatcher"].includes(ctx.role ?? ""))
        fail(403, "Only dispatch staff can send shift confirmations");
      const current = await getOne(ctx, "job", id);
      const crewIds = Array.isArray(current.data["crewIds"])
        ? (current.data["crewIds"] as unknown[]).filter(
            (value): value is number => typeof value === "number",
          )
        : [];
      if (!crewIds.length) fail(409, "Assign crew before sending shift confirmations");
      const { sendCrewShiftInvites } = await import("./shift-response");
      const [{ data: workspace }, crewRows] = await Promise.all([
        ctx.db.from("workspaces").select("name").eq("id", requireWs(ctx)).maybeSingle(),
        list(ctx, "crew"),
      ]);
      const invite = await sendCrewShiftInvites({
        jobId: id,
        data: current.data,
        crew: crewRows as Record<string, unknown>[],
        crewIds,
        companyName: String(workspace?.name ?? ""),
        origin: ctx.origin ?? "https://invalid.local",
      });
      await saveData(ctx, id, { crewShifts: invite.shifts });
      const saved = toRecord(await getOne(ctx, "job", id), requireWs(ctx));
      return {
        ...saved,
        shiftInvites: {
          notified: invite.notified,
          logged: invite.logged,
          results: invite.results,
        },
      };
    }
    // Pre-move reminders: GET the schedule and previews, POST sends or resends one now.
    if (sub === "reminders") {
      if (!["admin", "office_admin", "dispatcher"].includes(ctx.role ?? ""))
        fail(403, "Only dispatch staff can send pre-move reminders");
      const { ReminderError, reminderPanel, sendPreMoveReminder } = await import("./reminders");
      const { isPreMoveReminderKind } = await import("../shared/reminders");
      const deps = {
        db: ctx.db,
        wsId: requireWs(ctx),
        userId: ctx.userId,
        origin: ctx.origin ?? "https://invalid.local",
        save: (jobId: number, patch: Record<string, unknown>) => saveData(ctx, jobId, patch),
      };
      const job = { id, data: (await getOne(ctx, "job", id)).data };
      if (method === "GET") return reminderPanel(deps, job);
      if (method === "POST") {
        const b = (await body()) as { kind?: unknown; force?: unknown };
        const kind = b.kind;
        if (!isPreMoveReminderKind(kind)) throw new HttpError(400, "Unknown pre-move reminder");
        try {
          const result = await sendPreMoveReminder(deps, job, kind, { force: Boolean(b.force) });
          return { ...result, panel: await reminderPanel(deps, job) };
        } catch (error) {
          if (error instanceof ReminderError) fail(error.status, error.message);
          throw error;
        }
      }
    }
    // One-click replacement crew: rank eligible crew, then swap and notify in one action.
    if (sub === "replacements") {
      if (!["admin", "office_admin", "dispatcher"].includes(ctx.role ?? ""))
        fail(403, "Only dispatch staff can find replacement crew");
      const { ReplacementError, assignReplacement, replacementPanel } =
        await import("./crew-replacement");
      const { data: workspace } = await ctx.db
        .from("workspaces")
        .select("name")
        .eq("id", requireWs(ctx))
        .maybeSingle();
      const deps = {
        getJob: (jobId: number) => getOne(ctx, "job", jobId),
        listCrew: async () =>
          (await list(ctx, "crew")).map((row) => row as Record<string, unknown>),
        listJobs: async () => (await list(ctx, "job")).map((row) => row as Record<string, unknown>),
        save: (jobId: number, patch: Record<string, unknown>) => saveData(ctx, jobId, patch),
        actor: ctx.email || "Dispatch",
        origin: ctx.origin ?? "https://invalid.local",
        companyName: String(workspace?.name ?? ""),
      };
      try {
        if (method === "GET") return replacementPanel(deps, id);
        if (method === "POST") {
          const result = await assignReplacement(deps, id, await body());
          const saved = toRecord(await getOne(ctx, "job", id), requireWs(ctx));
          return { ...saved, replacement: result };
        }
      } catch (error) {
        if (error instanceof ReplacementError) fail(error.status, error.message);
        throw error;
      }
    }
    if (sub === "clock" && method === "POST") {
      const { action } = (await body()) as { action?: string };
      const now = new Date().toISOString();
      return update(
        ctx,
        "job",
        id,
        action === "in" ? { clockIn: now, status: "in_progress" } : { clockOut: now },
      );
    }
    if (sub === "complete" && method === "POST") {
      const { signature } = (await body()) as { signature?: string };
      return update(ctx, "job", id, { completedSignature: signature ?? null, status: "completed" });
    }
    if (sub === "damage") {
      if (method === "GET")
        return (await list(ctx, "damage")).filter(
          (d) => (d as Record<string, unknown>)["jobId"] === id,
        );
      if (method === "POST") {
        const b = clean("damageInput", await body());
        return create(ctx, "damage", {
          jobId: id,
          phase: b["phase"],
          note: b["note"],
          photoUrl: b["photoData"] ?? null,
        });
      }
    }
  }

  const kind = head ? KINDS[head] : undefined;
  if (kind) {
    if (method === "GET" && !idRaw) return list(ctx, kind);
    if (method === "GET" && id) return toRecord(await getOne(ctx, kind, id), requireWs(ctx));
    if (method === "POST" && !idRaw) return create(ctx, kind, await body());
    if (method === "PATCH" && id) return update(ctx, kind, id, await body());
  }
  return fail(404, "This request could not be found. Refresh the page and try again.");
}

export async function handleCrm(request: Request, splat: string) {
  try {
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key) fail(500, "Backend is not configured");
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) fail(401, "Please sign in");
    const db = createClient(url as string, key as string, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: claims, error } = await db.auth.getClaims(token as string);
    if (error || !claims?.claims?.sub) fail(401, "Please sign in");
    const verifiedClaims = claims?.claims;
    if (!verifiedClaims?.sub) return fail(401, "Please sign in");
    const userId = verifiedClaims.sub as string;
    const email = (verifiedClaims["email"] as string | undefined) ?? "";
    const wsHeader = Number(request.headers.get("x-workspace-id")) || null;
    let role: string | null = null;
    let branchId: number | null = Number(request.headers.get("x-branch-id")) || null;
    if (wsHeader) {
      const { data } = await db.rpc("workspace_role", { _ws: wsHeader });
      role = (data as string | null) ?? null;
    }
    if (!role) branchId = null;
    if (branchId && wsHeader) {
      const { data: branch } = await db
        .from("workspace_records")
        .select("id")
        .eq("workspace_id", wsHeader)
        .eq("kind", "branch")
        .eq("id", branchId)
        .maybeSingle();
      // A deleted or stale branch context is ignored; the shell will clear it.
      if (!branch) branchId = null;
    }
    const parts = splat.split("/").filter(Boolean);
    if (role && request.method !== "GET" && parts[0] !== "workspaces") {
      const { data: writable } = await db.rpc("workspace_writable", { _ws: wsHeader as number });
      if (!writable)
        fail(402, "This workspace is read-only. Update the subscription or contact support.");
    }
    const result = await route(
      {
        db,
        userId,
        email,
        wsId: role ? wsHeader : null,
        role,
        branchId,
        q: new URL(request.url).searchParams,
        origin: new URL(request.url).origin,
      },
      request.method,
      parts,
      async () => {
        try {
          return await request.json();
        } catch {
          return {};
        }
      },
    );
    if (result instanceof Response) return result;
    return Response.json(result ?? null);
  } catch (e) {
    if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
    console.error(e);
    return Response.json({ error: "Something went wrong" }, { status: 500 });
  }
}
