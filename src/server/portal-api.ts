// Public customer portal API. The opaque URL token is the credential: it resolves one job,
// then the portal exposes only that customer's own jobs, invoices, documents and photos.
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { appendJobActivity } from "../shared/job-activity";
import {
  appendPortalPhotos,
  appendPortalRequest,
  invoiceForJob,
  isValidPortalDate,
  MAX_PORTAL_PHOTOS,
  photoMeta,
  portalPhotos,
  portalRequests,
  type PortalInvoice,
  type PortalPhotoMeta,
  type PortalRequest,
} from "../shared/portal";
import { QUOTE_TOKEN_RE } from "../shared/quote-dispatch";
import type { PortalClaim } from "../shared/portal";
import { createPortalClaim, portalClaim } from "./claims-api";

type Row = { id: number; workspace_id: number; data: Record<string, unknown>; created_at?: string };
type ClaimRow = { id: number; data: Record<string, unknown>; created_at: string };

export class PortalError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "PortalError";
  }
}

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const number = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

async function adminClient(): Promise<SupabaseClient> {
  try {
    const { supabaseAdmin } = await import("../integrations/supabase/client.server");
    return supabaseAdmin;
  } catch {
    throw new PortalError("The customer portal is temporarily unavailable", 503);
  }
}

type PortalContext = {
  db: SupabaseClient;
  token: string;
  job: Row;
  customer: Row;
  jobs: Row[];
  claims: ClaimRow[];
  company: { name: string; phone: string; email: string };
};

async function loadContext(token: string): Promise<PortalContext> {
  if (!QUOTE_TOKEN_RE.test(token))
    throw new PortalError("This customer portal link is unavailable or has expired", 404);
  const db = await adminClient();
  const { data: job, error } = await db
    .from("workspace_records")
    .select("id,workspace_id,data,created_at")
    .eq("kind", "job")
    .filter("data->>quoteToken", "eq", token)
    .maybeSingle();
  if (error) throw new PortalError("The customer portal is temporarily unavailable", 503);
  if (!job) throw new PortalError("This customer portal link is unavailable or has expired", 404);
  const row = job as Row;
  const customerId = number(row.data["customerId"]);
  if (!customerId) throw new PortalError("This portal is not linked to a customer", 404);

  const { data: customer } = await db
    .from("workspace_records")
    .select("id,workspace_id,data")
    .eq("kind", "customer")
    .eq("workspace_id", row.workspace_id)
    .eq("id", customerId)
    .maybeSingle();
  if (!customer) throw new PortalError("This portal is not linked to a customer", 404);

  const [{ data: jobs }, { data: workspace }, { data: claims }] = await Promise.all([
    db
      .from("workspace_records")
      .select("id,workspace_id,data,created_at")
      .eq("kind", "job")
      .eq("workspace_id", row.workspace_id)
      .filter("data->>customerId", "eq", String(customerId))
      .limit(100),
    db
      .from("workspaces")
      .select("name,company_phone,office_email")
      .eq("id", row.workspace_id)
      .maybeSingle(),
    db
      .from("workspace_records")
      .select("id,data,created_at")
      .eq("kind", "claim")
      .eq("workspace_id", row.workspace_id)
      .filter("data->>customerId", "eq", String(customerId))
      .order("id", { ascending: false })
      .limit(200),
  ]);

  return {
    db,
    token,
    job: row,
    customer: customer as Row,
    jobs: (jobs ?? []) as Row[],
    claims: (claims ?? []) as ClaimRow[],
    company: {
      name: text(workspace?.name) || "Your moving company",
      phone: text(workspace?.company_phone),
      email: text(workspace?.office_email),
    },
  };
}

export type PublicPortalJob = {
  id: number;
  title: string;
  moveDate: string;
  startHour: number;
  origin: string;
  destination: string;
  status: string;
  invoiceStatus: string;
  total: number;
  finalTotal: number | null;
  requests: PortalRequest[];
  photos: PortalPhotoMeta[];
};

function publicJob(row: Row): PublicPortalJob {
  const data = row.data;
  return {
    id: row.id,
    title: text(data["title"]) || `Move #${row.id}`,
    moveDate: text(data["moveDate"]).slice(0, 10),
    startHour: number(data["startHour"]),
    origin: text(data["origin"]),
    destination: text(data["destination"]),
    status: text(data["status"]),
    invoiceStatus: text(data["invoiceStatus"]) || "draft",
    total: number(data["total"]),
    finalTotal: data["finalTotal"] == null ? null : number(data["finalTotal"]),
    requests: portalRequests(data["portalRequests"]),
    photos: photoMeta(portalPhotos(data["customerPhotos"])),
  };
}

export type PortalPayload = {
  company: { name: string; phone: string; email: string };
  customer: { name: string; email: string; phone: string };
  jobs: PublicPortalJob[];
  claims: PortalClaim[];
  invoices: PortalInvoice[];
  documents: Array<{ id: string; name: string; kind: "estimate" | "invoice"; url: string }>;
};

export async function readPortal(token: string): Promise<PortalPayload> {
  const ctx = await loadContext(token);
  const jobs = ctx.jobs.map(publicJob);
  const invoices = ctx.jobs
    .map((row) =>
      invoiceForJob({
        id: row.id,
        total: row.data["total"],
        finalTotal: row.data["finalTotal"],
        invoiceStatus: row.data["invoiceStatus"],
      }),
    )
    .filter((invoice): invoice is PortalInvoice => Boolean(invoice));
  const documents: PortalPayload["documents"] = [
    ...(jobs.some((job) => job.total > 0)
      ? [
          {
            id: "estimate",
            name: "Move estimate",
            kind: "estimate" as const,
            url: `/api/public/portal/${encodeURIComponent(token)}/documents/estimate`,
          },
        ]
      : []),
    ...(invoices.length
      ? [
          {
            id: "invoice",
            name: "Invoice and balance",
            kind: "invoice" as const,
            url: `/api/public/portal/${encodeURIComponent(token)}/documents/invoice`,
          },
        ]
      : []),
  ];
  return {
    company: ctx.company,
    customer: {
      name: text(ctx.customer.data["name"]),
      email: text(ctx.customer.data["email"]),
      phone: text(ctx.customer.data["phone"]),
    },
    jobs,
    claims: ctx.claims.map(portalClaim),
    invoices,
    documents,
  };
}

async function saveJob(ctx: PortalContext, row: Row, patch: Record<string, unknown>) {
  const next = { ...row.data, ...patch };
  const { error } = await ctx.db
    .from("workspace_records")
    .update({ data: next as never, updated_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("workspace_id", row.workspace_id);
  if (error) throw new PortalError("Could not save this request", 500);
  row.data = next;
}

function jobInPortal(ctx: PortalContext, jobId: number): Row {
  const job = ctx.jobs.find((row) => row.id === jobId);
  if (!job) throw new PortalError("That move is not linked to this portal", 404);
  return job;
}

const requestSchema = z
  .object({
    jobId: z.number().int().positive(),
    kind: z.enum(["date_change", "address"]),
    requestedDate: z.string().trim().max(10).optional(),
    origin: z.string().trim().max(300).optional(),
    destination: z.string().trim().max(300).optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .strict();

async function notifyDispatcher(
  ctx: PortalContext,
  job: Row,
  request: PortalRequest,
): Promise<{ status: string; detail: string }> {
  if (!ctx.company.email)
    return {
      status: "no_office_email",
      detail: "No office email is configured for dispatcher alerts",
    };
  const label = request.kind === "date_change" ? "move date change" : "address update";
  const lines = [
    `Customer ${text(ctx.customer.data["name"]) || text(job.data["customerName"]) || "a customer"} requested a ${label}.`,
    `Move: ${text(job.data["title"]) || `Job #${job.id}`} (${job.data["moveDate"] ?? "no date"})`,
    ...(request.requestedDate ? [`Requested date: ${request.requestedDate}`] : []),
    ...(request.origin ? [`Pickup: ${request.origin}`] : []),
    ...(request.destination ? [`Delivery: ${request.destination}`] : []),
    ...(request.notes ? [`Notes: ${request.notes}`] : []),
    `Open the job: /app/jobs/${job.id}`,
  ];
  try {
    const { sendEmail } = await import("./notifications");
    const delivery = await sendEmail(
      ctx.company.email,
      `Portal request: ${label}`,
      lines.join("\n"),
    );
    return { status: delivery.status, detail: delivery.detail };
  } catch (error) {
    console.error("Portal dispatcher alert failed", error instanceof Error ? error.message : error);
    return { status: "failed", detail: "The request was saved but the dispatcher email failed" };
  }
}

export async function submitPortalRequest(token: string, input: unknown): Promise<PortalRequest> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) throw new PortalError("Please check the request details", 400);
  const body = parsed.data;
  const ctx = await loadContext(token);
  const job = jobInPortal(ctx, body.jobId);
  if (body.kind === "date_change" && !isValidPortalDate(body.requestedDate))
    throw new PortalError("Choose a move date today or later", 400);
  if (body.kind === "address" && !body.origin && !body.destination)
    throw new PortalError("Enter the pickup or delivery address you want to update", 400);
  if (portalRequests(job.data["portalRequests"]).some((entry) => entry.status === "pending"))
    throw new PortalError("You already have a request awaiting review for this move", 409);

  const request: PortalRequest = {
    id: crypto.randomUUID(),
    kind: body.kind,
    status: "pending",
    at: new Date().toISOString(),
    ...(body.requestedDate ? { requestedDate: body.requestedDate } : {}),
    ...(body.origin ? { origin: body.origin } : {}),
    ...(body.destination ? { destination: body.destination } : {}),
    ...(body.notes ? { notes: body.notes } : {}),
  };
  request.notification = await notifyDispatcher(ctx, job, request);
  const customerName = text(ctx.customer.data["name"]) || "Customer";
  const activity = appendJobActivity(job.data["activity"], [
    {
      id: `portal:${request.id}`,
      kind: "customer_request",
      title:
        body.kind === "date_change"
          ? "Customer requested a new date"
          : "Customer updated addresses",
      detail: [
        body.requestedDate ? `Requested ${body.requestedDate}` : "",
        [request.origin, request.destination].filter(Boolean).join(" → "),
        body.notes ?? "",
        `Dispatcher alert: ${request.notification.status}`,
      ]
        .filter(Boolean)
        .join(" · ")
        .slice(0, 400),
      at: request.at,
      by: customerName,
    },
  ]);
  await saveJob(ctx, job, {
    portalRequests: appendPortalRequest(job.data["portalRequests"], request),
    activity,
    portalLastRequestAt: request.at,
  });
  return request;
}

const photosSchema = z
  .object({
    jobId: z.number().int().positive(),
    photos: z
      .array(
        z
          .object({
            name: z.string().trim().max(120).optional(),
            dataUrl: z.string().max(600_000),
          })
          .strict(),
      )
      .min(1)
      .max(6),
  })
  .strict();

export async function submitPortalPhotos(
  token: string,
  input: unknown,
): Promise<{ photos: PortalPhotoMeta[]; rejected: number }> {
  const parsed = photosSchema.safeParse(input);
  if (!parsed.success) throw new PortalError("Attach one to six JPEG, PNG or WebP photos", 400);
  const ctx = await loadContext(token);
  const job = jobInPortal(ctx, parsed.data.jobId);
  const existing = portalPhotos(job.data["customerPhotos"]);
  const room = Math.max(0, MAX_PORTAL_PHOTOS - existing.length);
  if (!room) throw new PortalError("This move already has the maximum number of photos", 409);
  const accepted = parsed.data.photos.slice(0, room);
  const photos = appendPortalPhotos(job.data["customerPhotos"], accepted);
  const saved = photos.length - existing.length;
  if (!saved) throw new PortalError("Those files are not supported photos or are too large", 400);
  const at = new Date().toISOString();
  await saveJob(ctx, job, {
    customerPhotos: photos,
    activity: appendJobActivity(job.data["activity"], [
      {
        id: `portal-photo:${at}`,
        kind: "customer_photo",
        title: "Customer uploaded move photos",
        detail: `${saved} photo${saved === 1 ? "" : "s"} added to the customer portal`,
        at,
        by: text(ctx.customer.data["name"]) || "Customer",
      },
    ]),
  });
  return { photos: photoMeta(photos), rejected: parsed.data.photos.length - saved };
}

export async function submitPortalClaim(token: string, input: unknown): Promise<PortalClaim> {
  const ctx = await loadContext(token);
  const raw = (input ?? {}) as Record<string, unknown>;
  const jobId = Number(raw["jobId"]);
  if (!Number.isInteger(jobId) || jobId <= 0)
    throw new PortalError("Choose a move for this claim", 400);
  jobInPortal(ctx, jobId);
  try {
    const claim = await createPortalClaim(
      ctx.db,
      ctx.job.workspace_id,
      text(ctx.customer.data["name"]) || "Customer",
      {
        jobId,
        type: raw["type"],
        description: raw["description"],
        ...(raw["claimedCents"] === undefined ? {} : { claimedCents: Number(raw["claimedCents"]) }),
      },
    );
    return portalClaim({
      id: claim.id,
      data: claim as unknown as Record<string, unknown>,
      created_at: String(claim["createdAt"] ?? new Date().toISOString()),
    });
  } catch (error) {
    if (error instanceof PortalError) throw error;
    if (error && typeof error === "object" && "status" in error && "message" in error)
      throw new PortalError(String(error.message), Number(error.status) || 400);
    throw error;
  }
}

export async function readPortalPhoto(
  token: string,
  photoId: string,
): Promise<{ bytes: Uint8Array; contentType: string; name: string }> {
  if (!/^[a-zA-Z0-9-]{8,64}$/.test(photoId)) throw new PortalError("Photo not found", 404);
  const ctx = await loadContext(token);
  const photo = ctx.jobs
    .flatMap((row) => portalPhotos(row.data["customerPhotos"]))
    .find((entry) => entry.id === photoId);
  if (!photo) throw new PortalError("Photo not found", 404);
  const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(photo.dataUrl);
  if (!match) throw new PortalError("Photo not found", 404);
  const binary = atob(match[2] as string);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return { bytes, contentType: match[1] as string, name: photo.name };
}
