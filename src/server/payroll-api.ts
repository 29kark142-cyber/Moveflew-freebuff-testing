// Office payroll register. Overtime and tip splits use the shared rules; an approved
// timecard is the only source of payable minutes.
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  netMinutes,
  payrollPayCents,
  splitOvertime,
  tipAllocationIssue,
  tipAllocations,
} from "../shared/payroll";

type Row = { id: number; data: Record<string, unknown>; created_at: string };
type CrewRow = { id: number; data: Record<string, unknown> };
type JobRow = { id: number; data: Record<string, unknown> };

export class PayrollError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "PayrollError";
  }
}

const OFFICE = new Set(["admin", "office_admin"]);
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const requireOffice = (role: string | null) => {
  if (!OFFICE.has(role ?? ""))
    throw new PayrollError("Only admins and office admins can manage payroll", 403);
};

async function crewRow(db: SupabaseClient, wsId: number, id: number): Promise<CrewRow> {
  const { data, error } = await db
    .from("workspace_records")
    .select("id,data")
    .eq("id", id)
    .eq("workspace_id", wsId)
    .eq("kind", "crew")
    .maybeSingle();
  if (error) throw new PayrollError("Could not load the crew member", 503);
  if (!data) throw new PayrollError("That crew member is not in this workspace", 404);
  return data as CrewRow;
}

async function jobRow(db: SupabaseClient, wsId: number, id: number): Promise<JobRow> {
  const { data, error } = await db
    .from("workspace_records")
    .select("id,data")
    .eq("id", id)
    .eq("workspace_id", wsId)
    .eq("kind", "job")
    .maybeSingle();
  if (error) throw new PayrollError("Could not load the linked job", 503);
  if (!data) throw new PayrollError("That job is not in this workspace", 404);
  return data as JobRow;
}

export async function listTimecards(db: SupabaseClient, wsId: number) {
  const { data, error } = await db
    .from("workspace_records")
    .select("id,data,created_at")
    .eq("workspace_id", wsId)
    .eq("kind", "timecard")
    .order("id", { ascending: false })
    .limit(1000);
  if (error) throw new PayrollError("Could not load timecards", 503);
  return ((data ?? []) as Row[]).map((row) => ({ ...row.data, id: row.id, tenantId: wsId }));
}

const timecardSchema = z
  .object({
    crewMemberId: z.number().int().positive(),
    jobId: z.number().int().positive().nullable(),
    workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    minutes: z.number().int().min(0).max(1440),
    breakMinutes: z.number().int().min(0).max(1440),
    rateCents: z.number().int().min(0).max(100_000),
    approved: z.boolean(),
    notes: z.string().trim().max(500),
  })
  .strict()
  .refine((value) => value.breakMinutes <= value.minutes, {
    message: "Break minutes cannot exceed worked minutes",
  });

async function timecardData(
  db: SupabaseClient,
  wsId: number,
  role: string | null,
  input: unknown,
): Promise<Record<string, unknown>> {
  const parsed = timecardSchema.safeParse(input);
  if (!parsed.success) throw new PayrollError("Check the crew, minutes, break and rate", 400);
  const crew = await crewRow(db, wsId, parsed.data.crewMemberId);
  if (parsed.data.jobId) await jobRow(db, wsId, parsed.data.jobId);
  return {
    crewMemberId: crew.id,
    crewName: text(crew.data["name"]) || `Crew #${crew.id}`,
    jobId: parsed.data.jobId,
    workDate: parsed.data.workDate,
    minutes: parsed.data.minutes,
    breakMinutes: parsed.data.breakMinutes,
    rateCents: parsed.data.rateCents,
    approved: role === "admin" ? parsed.data.approved : false,
    notes: parsed.data.notes,
  };
}

export async function createTimecard(
  db: SupabaseClient,
  wsId: number,
  role: string | null,
  input: unknown,
) {
  requireOffice(role);
  const data = await timecardData(db, wsId, role, input);
  const { data: saved, error } = await db
    .from("workspace_records")
    .insert({ workspace_id: wsId, kind: "timecard", data: data as never })
    .select("id,data,created_at")
    .single();
  if (error || !saved) throw new PayrollError("Could not save this timecard", 500);
  return { ...saved.data, id: saved.id, tenantId: wsId };
}

export async function updateTimecard(
  db: SupabaseClient,
  wsId: number,
  role: string | null,
  id: number,
  input: unknown,
) {
  requireOffice(role);
  const { data: current, error } = await db
    .from("workspace_records")
    .select("id,data")
    .eq("id", id)
    .eq("workspace_id", wsId)
    .eq("kind", "timecard")
    .maybeSingle();
  if (error) throw new PayrollError("Could not load this timecard", 503);
  if (!current) throw new PayrollError("Timecard not found", 404);
  if (Number(current.data?.["payoutId"]) > 0)
    throw new PayrollError("This timecard was already paid and cannot be edited", 409);
  const data = await timecardData(db, wsId, role, input);
  const { data: saved, error: saveError } = await db
    .from("workspace_records")
    .update({
      data: {
        ...current.data,
        ...data,
        approved:
          role === "admin" ? Boolean(data["approved"]) : Boolean(current.data?.["approved"]),
      } as never,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("workspace_id", wsId)
    .select("id,data,created_at")
    .single();
  if (saveError || !saved) throw new PayrollError("Could not save this timecard", 500);
  return { ...saved.data, id: saved.id, tenantId: wsId };
}

const date = (value: string | null) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null);

export async function payrollReport(
  db: SupabaseClient,
  wsId: number,
  fromRaw: string | null,
  toRaw: string | null,
) {
  const from = date(fromRaw);
  const to = date(toRaw);
  if (!from || !to || to < from) throw new PayrollError("Choose a valid payroll period", 400);
  const [{ data: timecards, error }, { data: tips }, { data: crewRows }] = await Promise.all([
    db
      .from("workspace_records")
      .select("id,data")
      .eq("workspace_id", wsId)
      .eq("kind", "timecard")
      .gte("data->>workDate", from)
      .lte("data->>workDate", to)
      .limit(2000),
    db
      .from("workspace_records")
      .select("id,data,created_at")
      .eq("workspace_id", wsId)
      .eq("kind", "tip")
      .gte("created_at", `${from}T00:00:00.000Z`)
      .lte("created_at", `${to}T23:59:59.999Z`)
      .limit(1000),
    db
      .from("workspace_records")
      .select("id,data")
      .eq("workspace_id", wsId)
      .eq("kind", "crew")
      .limit(500),
  ]);
  if (error) throw new PayrollError("Could not load payroll records", 503);

  const crew = new Map<number, Record<string, unknown>>();
  for (const row of (crewRows ?? []) as CrewRow[]) crew.set(row.id, row.data);
  const minutes = new Map<number, number>();
  const rates = new Map<number, number>();
  for (const row of (timecards ?? []) as Array<{ data: Record<string, unknown> }>) {
    if (row.data["approved"] !== true) continue;
    const crewId = Number(row.data["crewMemberId"]);
    if (!crewId) continue;
    minutes.set(
      crewId,
      (minutes.get(crewId) ?? 0) + netMinutes(row.data["minutes"], row.data["breakMinutes"]),
    );
    const rate = Math.round(Number(row.data["rateCents"]) || 0);
    if (rate > 0) rates.set(crewId, rate);
  }
  const tipCents = new Map<number, number>();
  for (const row of (tips ?? []) as Array<{ data: Record<string, unknown> }>) {
    for (const allocation of tipAllocations(row.data["allocations"])) {
      tipCents.set(
        allocation.crewMemberId,
        (tipCents.get(allocation.crewMemberId) ?? 0) + allocation.amountCents,
      );
    }
  }

  const rows = [...minutes.keys()]
    .sort((a, b) =>
      (text(crew.get(a)?.["name"]) || "").localeCompare(text(crew.get(b)?.["name"]) || ""),
    )
    .map((crewMemberId) => {
      const member = crew.get(crewMemberId) ?? {};
      const totalMinutes = minutes.get(crewMemberId) ?? 0;
      const { regularMinutes, overtimeMinutes } = splitOvertime(totalMinutes);
      const rateCents =
        rates.get(crewMemberId) ?? Math.round((Number(member["hourlyRate"]) || 0) * 100);
      const { regularPayCents, overtimePayCents } = payrollPayCents(
        regularMinutes,
        overtimeMinutes,
        rateCents,
      );
      const tip = tipCents.get(crewMemberId) ?? 0;
      return {
        crewMemberId,
        name: text(member["name"]) || `Crew #${crewMemberId}`,
        regularMinutes,
        overtimeMinutes,
        rateCents,
        regularPayCents,
        overtimePayCents,
        tipCents: tip,
        totalCents: regularPayCents + overtimePayCents + tip,
      };
    });
  return {
    rows,
    totalCents: rows.reduce((sum, row) => sum + row.totalCents, 0),
    disclaimer:
      "Review totals only; no tax withholding, disbursement, or employment classification determination is made here.",
  };
}

export async function listTips(db: SupabaseClient, wsId: number) {
  const { data, error } = await db
    .from("workspace_records")
    .select("id,data,created_at")
    .eq("workspace_id", wsId)
    .eq("kind", "tip")
    .order("id", { ascending: false })
    .limit(500);
  if (error) throw new PayrollError("Could not load tips", 503);
  return ((data ?? []) as Row[]).map((row) => ({
    ...row.data,
    id: row.id,
    tenantId: wsId,
    allocations: tipAllocations(row.data["allocations"]),
  }));
}

const tipSchema = z
  .object({
    jobId: z.number().int().positive(),
    amountCents: z.number().int().min(1).max(10_000_000),
    method: z.string().trim().min(1).max(40),
    allocations: z
      .array(
        z.object({
          crewMemberId: z.number().int().positive(),
          amountCents: z.number().int().min(0).max(10_000_000),
        }),
      )
      .min(1)
      .max(30),
  })
  .strict();

export async function createTip(
  db: SupabaseClient,
  wsId: number,
  role: string | null,
  input: unknown,
) {
  requireOffice(role);
  const parsed = tipSchema.safeParse(input);
  if (!parsed.success) throw new PayrollError("Check the tip amount, job and crew split", 400);
  const job = await jobRow(db, wsId, parsed.data.jobId);
  const assigned = Array.isArray(job.data["crewIds"])
    ? (job.data["crewIds"] as unknown[]).map(Number).filter(Boolean)
    : [];
  const issue = tipAllocationIssue(parsed.data.amountCents, parsed.data.allocations, assigned);
  if (issue) throw new PayrollError(issue, 400);
  const { data: saved, error } = await db
    .from("workspace_records")
    .insert({
      workspace_id: wsId,
      kind: "tip",
      data: {
        jobId: job.id,
        amountCents: parsed.data.amountCents,
        method: parsed.data.method,
        allocations: parsed.data.allocations,
      } as never,
    })
    .select("id,data,created_at")
    .single();
  if (error || !saved) throw new PayrollError("Could not save this tip", 500);
  return {
    ...saved.data,
    id: saved.id,
    tenantId: wsId,
    allocations: tipAllocations(saved.data?.["allocations"]),
  };
}
