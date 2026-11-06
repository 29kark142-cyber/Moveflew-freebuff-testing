// Claims register. Decisions are office-only; a payout is written once as a real expense on
// the job so Financial Analytics and the Job Sheet see the same cost.
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  CLAIM_STATUSES,
  claimStatusLabel,
  normalizeClaimStatus,
  type ClaimStatus,
} from "../shared/claims";
import { appendJobActivity } from "../shared/job-activity";

type Row = { id: number; data: Record<string, unknown>; created_at: string };
type JobRow = { id: number; data: Record<string, unknown> };

export class ClaimError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ClaimError";
  }
}

const OFFICE_ROLES = new Set(["admin", "office_admin"]);
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const cents = (value: unknown) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.max(0, Math.min(100_000_000, Math.round(amount))) : 0;
};

const requestOffice = (role: string | null) => {
  if (!OFFICE_ROLES.has(role ?? ""))
    throw new ClaimError("Only admins and office admins can manage claims", 403);
};

const toClaim = (row: Row, wsId: number) => ({
  ...row.data,
  id: row.id,
  tenantId: wsId,
  createdAt: row.created_at,
});

async function claimRow(db: SupabaseClient, wsId: number, id: number): Promise<Row> {
  const { data, error } = await db
    .from("workspace_records")
    .select("id,data,created_at")
    .eq("id", id)
    .eq("workspace_id", wsId)
    .eq("kind", "claim")
    .maybeSingle();
  if (error) throw new ClaimError("Could not load this claim", 503);
  if (!data) throw new ClaimError("Claim not found", 404);
  return data as Row;
}

async function jobRow(db: SupabaseClient, wsId: number, id: number): Promise<JobRow> {
  const { data, error } = await db
    .from("workspace_records")
    .select("id,data")
    .eq("id", id)
    .eq("workspace_id", wsId)
    .eq("kind", "job")
    .maybeSingle();
  if (error) throw new ClaimError("Could not load the linked job", 503);
  if (!data) throw new ClaimError("That job is not in this workspace", 404);
  return data as JobRow;
}

async function appendJobEvent(
  db: SupabaseClient,
  wsId: number,
  job: JobRow,
  event: { id: string; kind: "claim_opened" | "claim_payout" | "claim_submitted"; title: string; detail: string; at: string; by: string },
) {
  const { error } = await db
    .from("workspace_records")
    .update({
      data: { ...job.data, activity: appendJobActivity(job.data["activity"], [event]) } as never,
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id)
    .eq("workspace_id", wsId);
  if (error) throw new ClaimError("The claim was saved but its job timeline could not be updated", 500);
}

export async function listClaims(db: SupabaseClient, wsId: number) {
  const { data, error } = await db
    .from("workspace_records")
    .select("id,data,created_at")
    .eq("workspace_id", wsId)
    .eq("kind", "claim")
    .order("id", { ascending: false })
    .limit(500);
  if (error) throw new ClaimError("Could not load claims", 503);
  return ((data ?? []) as Row[]).map((row) => toClaim(row, wsId));
}

const createSchema = z
  .object({
    jobId: z.number().int().positive(),
    type: z.enum(["damage", "missing", "other"]),
    description: z.string().trim().min(5).max(2000),
    claimedCents: z.number().int().min(0).max(100_000_000),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .strict();

export async function createClaim(
  db: SupabaseClient,
  wsId: number,
  role: string | null,
  actor: string,
  input: unknown,
) {
  requestOffice(role);
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) throw new ClaimError("Check the claim type, description and amount", 400);
  const job = await jobRow(db, wsId, parsed.data.jobId);
  const at = new Date().toISOString();
  const { data, error } = await db
    .from("workspace_records")
    .insert({
      workspace_id: wsId,
      kind: "claim",
      data: {
        jobId: job.id,
        customerId: Number(job.data["customerId"]) || null,
        customerName: text(job.data["customerName"]) || "Customer",
        type: parsed.data.type,
        status: "pending",
        description: parsed.data.description,
        claimedCents: parsed.data.claimedCents,
        approvedCents: 0,
        payoutCents: 0,
        payoutExpenseId: null,
        dueDate: parsed.data.dueDate ?? null,
        resolution: "",
        submittedVia: "office",
      } as never,
    })
    .select("id,data,created_at")
    .single();
  if (error || !data) throw new ClaimError("Could not save this claim", 500);
  await appendJobEvent(db, wsId, job, {
    id: `claim:${data.id}:opened`,
    kind: "claim_opened",
    title: "Customer claim opened",
    detail: `${parsed.data.type} · ${parsed.data.description}`.slice(0, 400),
    at,
    by: actor,
  });
  return toClaim(data as Row, wsId);
}

/** Customer-submitted claim from the public portal; no office role is available there. */
export async function createPortalClaim(
  db: SupabaseClient,
  wsId: number,
  actor: string,
  input: unknown,
) {
  const parsed = createSchema
    .omit({ dueDate: true })
    .extend({ claimedCents: z.number().int().min(0).max(100_000_000).default(0) })
    .safeParse(input);
  if (!parsed.success) throw new ClaimError("Describe the damage or missing item", 400);
  const job = await jobRow(db, wsId, parsed.data.jobId);
  const { count } = await db
    .from("workspace_records")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", wsId)
    .eq("kind", "claim")
    .filter("data->>jobId", "eq", String(job.id));
  if ((count ?? 0) >= 5)
    throw new ClaimError("This move already has the maximum number of claims", 409);
  const at = new Date().toISOString();
  const { data, error } = await db
    .from("workspace_records")
    .insert({
      workspace_id: wsId,
      kind: "claim",
      data: {
        jobId: job.id,
        customerId: Number(job.data["customerId"]) || null,
        customerName: text(job.data["customerName"]) || actor || "Customer",
        type: parsed.data.type,
        status: "pending",
        description: parsed.data.description,
        claimedCents: parsed.data.claimedCents,
        approvedCents: 0,
        payoutCents: 0,
        payoutExpenseId: null,
        dueDate: null,
        resolution: "",
        submittedVia: "portal",
      } as never,
    })
    .select("id,data,created_at")
    .single();
  if (error || !data) throw new ClaimError("Could not submit this claim", 500);
  await appendJobEvent(db, wsId, job, {
    id: `claim:${data.id}:submitted`,
    kind: "claim_submitted",
    title: "Customer submitted a claim",
    detail: `${parsed.data.type} · ${parsed.data.description}`.slice(0, 400),
    at,
    by: actor || "Customer",
  });
  return toClaim(data as Row, wsId);
}

const updateSchema = z
  .object({
    status: z.enum(CLAIM_STATUSES),
    approvedCents: z.number().int().min(0).max(100_000_000),
    resolution: z.string().trim().max(2000),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  })
  .strict();

export async function updateClaim(
  db: SupabaseClient,
  wsId: number,
  role: string | null,
  actor: string,
  id: number,
  input: unknown,
) {
  requestOffice(role);
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) throw new ClaimError("Check the claim status and approved amount", 400);
  const claim = await claimRow(db, wsId, id);
  const data = claim.data;
  const nextStatus = normalizeClaimStatus(parsed.data.status);
  const approved = cents(parsed.data.approvedCents);
  if ((nextStatus === "approved" || nextStatus === "payout_issued") && approved <= 0)
    throw new ClaimError("Enter the approved amount before approving or paying this claim", 400);
  if (approved > cents(data["claimedCents"]))
    throw new ClaimError("The approved amount cannot exceed the claimed amount", 400);
  const alreadyPaid = Number(data["payoutExpenseId"]) > 0;
  if (nextStatus === "payout_issued" && alreadyPaid)
    throw new ClaimError("A payout has already been logged for this claim", 409);

  const job = await jobRow(db, wsId, Number(data["jobId"]));
  const at = new Date().toISOString();
  let payoutExpenseId: number | null = alreadyPaid ? Number(data["payoutExpenseId"]) : null;
  let payoutCents = Number(data["payoutCents"]) || 0;

  if (nextStatus === "payout_issued") {
    const { data: expense, error } = await db
      .from("workspace_records")
      .insert({
        workspace_id: wsId,
        kind: "expense",
        data: {
          jobId: job.id,
          category: "Claim payout",
          amountCents: approved,
          incurredDate: at.slice(0, 10),
          vendor: text(data["customerName"]) || "Customer",
          notes: `Claim #${id} payout`,
        } as never,
      })
      .select("id")
      .single();
    if (error || !expense) throw new ClaimError("Could not log the payout expense", 500);
    payoutExpenseId = expense.id;
    payoutCents = approved;
  }

  const next = {
    ...data,
    status: nextStatus,
    approvedCents: nextStatus === "rejected" ? 0 : approved,
    resolution: parsed.data.resolution,
    dueDate: parsed.data.dueDate === undefined ? (data["dueDate"] ?? null) : parsed.data.dueDate,
    payoutExpenseId,
    payoutCents,
  };
  const { data: saved, error } = await db
    .from("workspace_records")
    .update({ data: next as never, updated_at: at })
    .eq("id", id)
    .eq("workspace_id", wsId)
    .eq("kind", "claim")
    .select("id,data,created_at")
    .single();
  if (error || !saved) throw new ClaimError("Could not save this claim", 500);

  await db.from("workspace_records").insert({
    workspace_id: wsId,
    kind: "claim_event",
    data: {
      claimId: id,
      note: `Status: ${claimStatusLabel(data["status"])} → ${claimStatusLabel(nextStatus)}${
        nextStatus === "payout_issued" ? " · payout expense logged" : ""
      }`,
      actor,
    } as never,
  });
  if (nextStatus === "payout_issued") {
    await appendJobEvent(db, wsId, job, {
      id: `claim:${id}:payout`,
      kind: "claim_payout",
      title: "Claim payout issued",
      detail: `$${(approved / 100).toFixed(2)} · Claim #${id}`,
      at,
      by: actor,
    });
  }
  return toClaim(saved as Row, wsId);
}

export async function claimEvents(db: SupabaseClient, wsId: number, claimId: number) {
  const { data, error } = await db
    .from("workspace_records")
    .select("id,data,created_at")
    .eq("workspace_id", wsId)
    .eq("kind", "claim_event")
    .filter("data->>claimId", "eq", String(claimId))
    .order("id", { ascending: false })
    .limit(200);
  if (error) throw new ClaimError("Could not load claim notes", 503);
  return ((data ?? []) as Row[]).map((row) => ({
    id: row.id,
    claimId,
    note: text(row.data["note"]),
    createdAt: row.created_at,
  }));
}

export async function addClaimEvent(
  db: SupabaseClient,
  wsId: number,
  role: string | null,
  actor: string,
  claimId: number,
  input: unknown,
) {
  requestOffice(role);
  const parsed = z.object({ note: z.string().trim().min(1).max(1000) }).strict().safeParse(input);
  if (!parsed.success) throw new ClaimError("Write a short claim note", 400);
  await claimRow(db, wsId, claimId);
  const { data, error } = await db
    .from("workspace_records")
    .insert({ workspace_id: wsId, kind: "claim_event", data: { claimId, note: parsed.data.note, actor } as never })
    .select("id,data,created_at")
    .single();
  if (error || !data) throw new ClaimError("Could not save this note", 500);
  return { id: data.id, claimId, note: parsed.data.note, createdAt: data.created_at };
}

export type PortalClaimRecord = {
  id: number;
  jobId: number;
  type: string;
  status: string;
  description: string;
  claimedCents: number;
  approvedCents: number;
  payoutCents: number;
  resolution: string;
  at: string;
};

export function portalClaim(row: Row): PortalClaimRecord {
  return {
    id: row.id,
    jobId: Number(row.data["jobId"]),
    type: text(row.data["type"]),
    status: normalizeClaimStatus(row.data["status"]),
    description: text(row.data["description"]).slice(0, 2000),
    claimedCents: cents(row.data["claimedCents"]),
    approvedCents: cents(row.data["approvedCents"]),
    payoutCents: cents(row.data["payoutCents"]),
    resolution: text(row.data["resolution"]).slice(0, 2000),
    at: row.created_at,
  };
}
