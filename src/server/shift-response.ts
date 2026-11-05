// Crew shift confirmations: mint a `shf_` token per crew member when dispatch sends shift
// notifications, serve the public shift page, and record accept/decline answers on the job.
import type { SupabaseClient } from "@supabase/supabase-js";
import { appendJobActivity } from "../shared/job-activity";
import {
  CREW_ASSIGNMENT_EMAIL_BODY,
  CREW_ASSIGNMENT_EMAIL_SUBJECT,
  CREW_ASSIGNMENT_SMS,
  dayLabel,
  renderCrewNotice,
  timeLabel,
} from "../shared/schedule";
import {
  DECLINE_REASONS,
  declineReasonLabel,
  isDeclineReason,
  newCrewShift,
  shiftForToken,
  shiftJobId,
  shiftLink,
  shiftResponseActivity,
  shiftRoleLabel,
  withShiftResponse,
  type CrewShift,
  type ShiftStatus,
} from "../shared/shift";
import { jobReference } from "../shared/tracking";
import { deliverEmail, deliverSms } from "./quote-dispatch";

export class ShiftPortalError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ShiftPortalError";
  }
}

type Row = { id: number; workspace_id: number; data: Record<string, unknown> };
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

async function adminClient(): Promise<SupabaseClient> {
  try {
    const { supabaseAdmin } = await import("../integrations/supabase/client.server");
    return supabaseAdmin;
  } catch {
    throw new ShiftPortalError("The shift page is temporarily unavailable", 503);
  }
}

/** The job id in the token narrows the lookup; the random half is what authorizes it. */
async function loadShift(
  token: string,
): Promise<{ db: SupabaseClient; row: Row; shift: CrewShift }> {
  const jobId = shiftJobId(token);
  if (!jobId) throw new ShiftPortalError("This shift link is unavailable or has expired", 404);
  const db = await adminClient();
  const { data, error } = await db
    .from("workspace_records")
    .select("id,workspace_id,data")
    .eq("kind", "job")
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw new ShiftPortalError("The shift page is temporarily unavailable", 503);
  if (!data) throw new ShiftPortalError("This shift link is unavailable or has expired", 404);
  const row = data as Row;
  const shift = shiftForToken(row.data["crewShifts"], token);
  if (!shift) throw new ShiftPortalError("This shift link is unavailable or has expired", 404);
  return { db, row, shift };
}

async function savePatch(db: SupabaseClient, row: Row, patch: Record<string, unknown>) {
  const next = { ...row.data, ...patch };
  const { error } = await db
    .from("workspace_records")
    .update({ data: next as never, updated_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("workspace_id", row.workspace_id);
  if (error) throw new ShiftPortalError("Could not save your answer. Please try again.", 500);
  row.data = next;
}

async function workspaceOf(db: SupabaseClient, wsId: number) {
  const { data } = await db
    .from("workspaces")
    .select("name,company_phone,office_email")
    .eq("id", wsId)
    .maybeSingle();
  return {
    name: text(data?.name) || "Your moving company",
    phone: text(data?.company_phone),
    email: text(data?.office_email),
  };
}

/** Crew member rows for a job, scoped to its workspace. */
async function crewOf(db: SupabaseClient, wsId: number, ids: readonly number[]) {
  if (!ids.length)
    return [] as {
      id: number;
      name: string;
      phone: string;
      email: string;
      role: string;
      isDriver: boolean;
    }[];
  const { data } = await db
    .from("workspace_records")
    .select("id,data")
    .eq("workspace_id", wsId)
    .eq("kind", "crew")
    .in("id", ids as number[]);
  return (data ?? []).map((entry) => {
    const row = entry as { id: number; data: Record<string, unknown> };
    return {
      id: row.id,
      name: text(row.data["name"]),
      phone: text(row.data["phone"]),
      email: text(row.data["email"]),
      role: shiftRoleLabel(row.data["crewRole"], row.data["isDriver"] === true),
      isDriver: row.data["isDriver"] === true,
    };
  });
}

export type PublicShift = {
  status: ShiftStatus;
  crewName: string;
  role: string;
  reference: string;
  moveDate: string;
  startHour: number;
  duration: number;
  origin: string;
  destination: string;
  truck: string;
  crewLead: { name: string; phone: string; email: string };
  company: { name: string; phone: string; email: string };
  respondedAt: string | null;
  declinedReason: string | null;
  note: string;
  reasons: { value: string; label: string }[];
};

/** Only what the crew member needs to answer the shift: no customer pricing or notes. */
export async function shiftPortal(token: string): Promise<PublicShift> {
  const { db, row, shift } = await loadShift(token);
  const data = row.data;
  const crewIds = Array.isArray(data["crewIds"])
    ? (data["crewIds"] as unknown[]).filter((id): id is number => typeof id === "number")
    : [];
  const [company, crewRows] = await Promise.all([
    workspaceOf(db, row.workspace_id),
    crewOf(db, row.workspace_id, crewIds),
  ]);
  const lead =
    crewRows.find((member) => member.role === "Crew lead") ??
    crewRows.find((member) => member.isDriver) ??
    crewRows[0];

  let truck = "";
  const truckId = typeof data["truckId"] === "number" ? data["truckId"] : null;
  if (truckId) {
    const { data: truckRow } = await db
      .from("workspace_records")
      .select("data")
      .eq("workspace_id", row.workspace_id)
      .eq("kind", "truck")
      .eq("id", truckId)
      .maybeSingle();
    const truckData = (truckRow as { data?: Record<string, unknown> } | null)?.data ?? {};
    truck = [text(truckData["name"]), text(truckData["plate"])].filter(Boolean).join(" · ");
  }

  return {
    status: shift.status,
    crewName: shift.name,
    role: shift.role || shiftRoleLabel(undefined, false),
    reference: jobReference(row.id),
    moveDate: text(data["moveDate"]).slice(0, 10),
    startHour: num(data["startHour"]),
    duration: num(data["duration"]),
    origin: text(data["origin"]),
    destination: text(data["destination"]),
    truck,
    crewLead: { name: lead?.name ?? "", phone: lead?.phone ?? "", email: lead?.email ?? "" },
    company,
    respondedAt: shift.respondedAt ?? null,
    declinedReason: shift.reason ? declineReasonLabel(shift.reason) : null,
    note: shift.note ?? "",
    reasons: DECLINE_REASONS.map((reason) => ({ value: reason.value, label: reason.label })),
  };
}

export type ShiftRespondInput = {
  token: string;
  response: "accept" | "decline";
  reason?: string;
  note?: string;
  ip?: string;
  userAgent?: string;
};

export type ShiftRespondResult = {
  responded: boolean;
  alreadyResponded: boolean;
  status: ShiftStatus;
  respondedAt: string | null;
  reason: string | null;
};

/** Records one answer exactly once; a repeat returns the saved answer instead of duplicating. */
export async function respondToShift(input: ShiftRespondInput): Promise<ShiftRespondResult> {
  if (input.response !== "accept" && input.response !== "decline")
    throw new ShiftPortalError("Choose whether you can work this shift", 400);
  const reason = input.response === "decline" ? input.reason : undefined;
  if (input.response === "decline" && !isDeclineReason(reason))
    throw new ShiftPortalError("Select a reason for declining this shift", 400);

  const { db, row, shift } = await loadShift(input.token);
  if (shift.status !== "pending")
    return {
      responded: false,
      alreadyResponded: true,
      status: shift.status,
      respondedAt: shift.respondedAt ?? null,
      reason: shift.reason ?? null,
    };

  const at = new Date().toISOString();
  const status = input.response === "accept" ? "confirmed" : "declined";
  const note = text(input.note).slice(0, 300);
  await savePatch(db, row, {
    crewShifts: withShiftResponse(row.data["crewShifts"], input.token, {
      status,
      at,
      ...(isDeclineReason(reason) ? { reason } : {}),
      ...(note ? { note } : {}),
    }),
    activity: appendJobActivity(row.data["activity"], [
      shiftResponseActivity({
        token: input.token,
        status,
        name: shift.name,
        moveDate: text(row.data["moveDate"]).slice(0, 10),
        startHour: num(row.data["startHour"]),
        ...(isDeclineReason(reason) ? { reason } : {}),
        at,
        by: shift.name || "Crew",
      }),
    ]),
  });

  return {
    responded: true,
    alreadyResponded: false,
    status,
    respondedAt: at,
    reason: isDeclineReason(reason) ? declineReasonLabel(reason) : null,
  };
}

export type ShiftDelivery = {
  crewId: number;
  name: string;
  channel: "sms" | "email" | "none";
  status: string;
  detail: string;
};

export type ShiftInviteResult = {
  shifts: CrewShift[];
  results: ShiftDelivery[];
  notified: number;
  logged: number;
};

/**
 * One dispatch path for crew shift messages: mints a fresh token per assigned crew member,
 * sends the confirmation link, and returns the pending state stored on the job.
 */
export async function sendCrewShiftInvites(input: {
  jobId: number;
  data: Record<string, unknown>;
  crew: Record<string, unknown>[];
  crewIds: readonly number[];
  companyName: string;
  origin: string;
}): Promise<ShiftInviteResult> {
  const at = new Date().toISOString();
  const reference = jobReference(input.jobId);
  const moveDate = text(input.data["moveDate"]).slice(0, 10);
  const startHour = num(input.data["startHour"]);
  const results: ShiftDelivery[] = [];
  const shifts: CrewShift[] = [];

  for (const crewId of input.crewIds) {
    const member = input.crew.find((entry) => entry["id"] === crewId);
    if (!member) continue;
    const name = text(member["name"]) || `Crew #${crewId}`;
    const role = shiftRoleLabel(member["crewRole"], member["isDriver"] === true);
    const shift = newCrewShift({ jobId: input.jobId, crewId, name, role, at });
    shifts.push(shift);
    const context = {
      name,
      reference,
      moveDate: dayLabel(moveDate, { weekday: "short", month: "short", day: "numeric" }),
      time: timeLabel(startHour),
      origin: text(input.data["origin"]) || "pickup address",
      destination: text(input.data["destination"]) || "drop-off address",
      crewSize: String(Math.max(1, num(input.data["crewSize"]) || input.crewIds.length)),
      companyName: input.companyName || "your moving company",
      link: shiftLink(input.origin, shift.token),
    };
    const phone = text(member["phone"]);
    const email = text(member["email"]);
    let delivered = false;
    if (phone) {
      const result = await deliverSms(phone, renderCrewNotice(CREW_ASSIGNMENT_SMS, context));
      results.push({
        crewId,
        name,
        channel: "sms",
        status: String(result.status),
        detail: String(result.detail),
      });
      delivered = true;
    }
    if (email && EMAIL_RE.test(email)) {
      const result = await deliverEmail(
        email,
        renderCrewNotice(CREW_ASSIGNMENT_EMAIL_SUBJECT, context),
        renderCrewNotice(CREW_ASSIGNMENT_EMAIL_BODY, context),
      );
      results.push({
        crewId,
        name,
        channel: "email",
        status: String(result.status),
        detail: String(result.detail),
      });
      delivered = true;
    }
    if (!delivered)
      results.push({
        crewId,
        name,
        channel: "none",
        status: "skipped",
        detail: "No mobile number or email is saved for this crew member",
      });
  }

  return {
    shifts,
    results,
    notified: results.filter((entry) => entry.status === "accepted").length,
    logged: results.filter((entry) => entry.status === "logged").length,
  };
}
