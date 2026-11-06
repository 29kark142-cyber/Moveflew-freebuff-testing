// Move-day endpoints for the crew phone screen. Database row security already limits crew
// members to jobs they are assigned to; these handlers add role and order checks on top.
import { z } from "zod";
import type { Ctx, Row } from "./crm-api";
import { acceptedTime, billableHours, fieldStatus, finalBill, isPhase, nextPhase, type Timeline } from "../shared/field";
import { PRE_MOVE_STATEMENT } from "../shared/damage";
import { TRACKING_TOKEN_RE, newTrackingToken, jobReference } from "../shared/tracking";
import { MAX_TIP_CENTS, splitTip, type TipRecord } from "../shared/tipping";
import { companyReviewUrl, saveCompanyReviewUrl } from "./notifications";
import { isPreviewHost } from "../lib/payment-mode";
import { documentSchema, operationSchema, type FieldDocuments, type FieldSnapshot } from '../shared/field-documents';
import { finalizeFieldSnapshot, prepareFieldPdf, streamFieldPdf } from './field-documents';
import { appendJobActivity, jobActivity } from '../shared/job-activity';
import { checklistProgress, completedPhases, isChecklistItem, milestoneUnlocked, normalizeChecklist, MOVE_CHECKLIST_PHASES } from '../shared/move-checklist';

type Rec = Record<string, unknown> & { id: number };
type Helpers = {
  list: (ctx: Ctx, kind: string) => Promise<unknown[]>;
  getOne: (ctx: Ctx, kind: string, id: number) => Promise<Row>;
  update: (ctx: Ctx, kind: string, id: number, body: unknown) => Promise<unknown>;
  saveData: (ctx: Ctx, id: number, patch: Record<string, unknown>) => Promise<Rec>;
  requireWs: (ctx: Ctx) => number;
  fail: (status: number, message: string) => never;
  toRecord: (r: Row, ws: number) => Rec;
};

const OFFICE = ["admin", "office_admin", "dispatcher"];
const ACTIVE = (s: unknown) => !["cancelled", "declined", "lead", "estimate"].includes(String(s ?? ""));

async function me(ctx: Ctx, h: Helpers) {
  const crew = (await h.list(ctx, "crew")) as Rec[];
  return crew.find(c => c["userId"] === ctx.userId) ?? null;
}

function view(job: Rec) {
  const t = (job["timeline"] ?? {}) as Timeline;
  const hours = Number(job["billableHours"]) || billableHours(t);
  return {
    ...job,
    fieldStatus: fieldStatus(t),
    nextPhase: nextPhase(t),
    bill: finalBill(job, hours),
    // Move-day checklist state and the activity timeline are stored on the job record itself.
    moveChecklist: normalizeChecklist(job["moveChecklist"]),
    activity: jobActivity(job["activity"]),
  };
}

async function loadJob(ctx: Ctx, h: Helpers, id: number) {
  const row = await h.getOne(ctx, "job", id); // 404 when row security hides it
  return h.toRecord(row, h.requireWs(ctx));
}

export async function fieldRoute(ctx: Ctx, method: string, parts: string[], body: () => Promise<unknown>, h: Helpers) {
  h.requireWs(ctx);
  if (!ctx.role || ctx.role === "estimator") return h.fail(403, "Field job sheets are for dispatch and assigned crew");
  const office = OFFICE.includes(ctx.role);
  const [head, idRaw, sub] = parts;
  // Company settings the field app needs: office email for signed-PDF delivery and the
  // Google review link used by the post-move review offer.
  if (head === "settings") {
    if (method === "POST") {
      if (!["admin", "office_admin"].includes(ctx.role ?? "")) h.fail(403, "Only admins can change company settings");
      const b = z.object({
        officeEmail: z.string().trim().max(200).optional(),
        googleReviewUrl: z.string().trim().max(500).optional(),
      }).parse(await body());
      if (b.officeEmail !== undefined) {
        if (b.officeEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.officeEmail)) h.fail(400, "Enter a valid office email");
        const { error } = await ctx.db.from("workspaces").update({ office_email: b.officeEmail || null }).eq("id", Number(ctx.wsId));
        if (error) h.fail(403, "Could not save office email");
      }
      if (b.googleReviewUrl !== undefined) {
        if (b.googleReviewUrl && !/^https:\/\/\S+$/i.test(b.googleReviewUrl)) h.fail(400, "Enter the full https:// Google review link");
        try {
          await saveCompanyReviewUrl(ctx.db, Number(ctx.wsId), b.googleReviewUrl, ctx.userId);
        } catch (error) {
          h.fail(403, error instanceof Error ? error.message : "Could not save the Google review link");
        }
      }
      return { saved: true };
    }
    const { data } = await ctx.db.from("workspaces").select("office_email,name,company_phone").eq("id", Number(ctx.wsId)).single();
    return {
      officeEmail: data?.office_email || "",
      companyName: data?.name || "",
      phone: data?.company_phone || "",
      googleReviewUrl: await companyReviewUrl(ctx.db, Number(ctx.wsId)),
    };
  }

  if (head === "jobs" && !idRaw && method === "GET") {
    const date = ctx.q?.get("date") ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return h.fail(400, "Choose a day");
    const self = await me(ctx, h);
    const jobs = ((await h.list(ctx, "job")) as Rec[])
      .filter(j => String(j["moveDate"] ?? "").slice(0, 10) === date && ACTIVE(j["status"]))
      .filter(j => office || (self && Array.isArray(j["crewIds"]) && (j["crewIds"] as unknown[]).includes(self.id)))
      .sort((a, b) => Number(a["startHour"] ?? 0) - Number(b["startHour"] ?? 0));
    return { me: self ? { id: self.id, name: self["name"], crewRole: self["crewRole"] ?? (self["isDriver"] ? "driver" : "helper") } : null, jobs: jobs.map(view) };
  }

  const id = Number(idRaw);
  if (head !== "jobs" || !Number.isInteger(id) || id <= 0) return h.fail(404, "Not found");
  const job = await loadJob(ctx, h, id);
  if(!office) { const self=await me(ctx,h);if(!self || !Array.isArray(job['crewIds']) || !(job['crewIds'] as unknown[]).includes(self.id))h.fail(403,'This job is not assigned to you'); }
  const t = { ...((job["timeline"] ?? {}) as Timeline) };

  if (!sub && method === "GET") return view(job);
  if(sub==='documents' && method==='POST') {
    if(job['completedSignature'])h.fail(409,'Signed documents are locked');
    const b=z.object({document:documentSchema,operationId:operationSchema}).parse(await body());
    const docs=(job['fieldDocuments'] || {}) as FieldDocuments;
    if(docs[b.document.kind]?.signature===b.document.signature && b.document.signature)return view(job);
    if(docs[b.document.kind]?.signature)h.fail(409,'This signed document is locked');
    const doc={...b.document,...(b.document.signature?{signedAt:new Date().toISOString(),by:ctx.userId}:{})};
    return view(await h.saveData(ctx,id,{fieldDocuments:{...docs,[doc.kind]:doc}}));
  }
  if(sub==='pdf' && method==='GET') {
    if(!job['fieldDocumentId'])h.fail(404,'Sign off this job to create the PDF');
    return prepareFieldPdf(ctx,String(job['fieldDocumentId']));
  }
  if(sub==='pdf-file' && method==='GET') {
    if(!job['fieldDocumentId'])h.fail(404,'Sign off this job to create the PDF');
    return streamFieldPdf(ctx,String(job['fieldDocumentId']));
  }

  if (sub === "phase" && method === "POST") {
    const self = await me(ctx, h);
    const lead = self && ["crew_lead", "driver"].includes(String(self["crewRole"] ?? (self["isDriver"] ? "driver" : "")));
    if (!office && !lead) h.fail(403, "Only the crew lead or driver can change the job stage");
    const b = z.object({ phase: z.string(), at: z.string().optional() }).parse(await body());
    if (!isPhase(b.phase)) h.fail(400, "Unknown stage");
    if (t[b.phase as keyof Timeline]) return view(job); // repeated tap (e.g. offline replay) is harmless
    if (nextPhase(t) !== b.phase) h.fail(409, "Finish the earlier stage first");
    const prev = Object.values(t).map(v => Date.parse(String(v))).filter(Number.isFinite);
    let at = acceptedTime(b.at);
    if (prev.length && Date.parse(at) < Math.max(...prev)) at = new Date(Math.max(...prev)).toISOString();
    t[b.phase as keyof Timeline] = at;
    const patch: Record<string, unknown> = { timeline: t };
    if (b.phase === "start_travel") patch["status"] = "in_progress";
    if (b.phase === "arrive_pickup") patch["clockIn"] = at;
    if (b.phase === "complete") {
      const hours = billableHours(t);
      const bill = finalBill(job, hours);
      Object.assign(patch, { clockOut: at, status: "completed", billableHours: hours, actualHours: hours, finalBill: bill, finalTotal: bill.labor + bill.travel + bill.fees });
    }
    return view(await h.saveData(ctx, id, patch));
  }

  // Structured move-day checklist. Items are ticked one at a time so an offline replay can be
  // merged item by item, and the crew member is taken from the session, never from the phone.
  if (sub === "checklist" && method === "POST") {
    if (job["completedSignature"]) h.fail(409, "The job is signed off, so the checklist is locked");
    const b = z
      .object({
        item: z.string().max(80),
        done: z.boolean(),
        at: z.string().optional(),
        operationId: operationSchema,
      })
      .parse(await body());
    if (!isChecklistItem(b.item)) h.fail(400, "Unknown checklist item");
    const self = await me(ctx, h);
    const before = normalizeChecklist(job["moveChecklist"]);
    const at = acceptedTime(b.at);
    const byName = String(self?.["name"] ?? ctx.role ?? "Office");
    const after = {
      ...before,
      items: {
        ...before.items,
        [b.item]: { done: b.done, at: b.done ? at : null, crewId: self?.id ?? null, byName },
      },
    };
    const wasComplete = completedPhases(before);
    // A phase that just became complete is appended to the job activity timeline once.
    const events = completedPhases(after)
      .filter((key) => !wasComplete.includes(key))
      .map((key) => {
        const phase = MOVE_CHECKLIST_PHASES.find((entry) => entry.key === key);
        const progress = checklistProgress(after);
        return {
          id: `checklist-phase:${key}`,
          kind: "phase_completed" as const,
          title: "Phase Completed",
          detail: `${phase?.label ?? key} · ${progress.done}/${progress.total} items`,
          at,
          by: byName,
        };
      });
    const patch: Record<string, unknown> = { moveChecklist: after, moveChecklistUpdatedAt: at };
    if (events.length) patch["activity"] = appendJobActivity(job["activity"], events);
    return view(await h.saveData(ctx, id, patch));
  }

  // Customer and crew lead sign the origin and the final destination completion together.
  if (sub === "milestone-signoff" && method === "POST") {
    const png = z
      .string()
      .regex(/^data:image\/png;base64,iVBOR/)
      .min(100)
      .max(400_000);
    const b = z
      .object({
        milestone: z.enum(["origin", "final"]),
        customerSignature: png,
        crewSignature: png,
        crewName: z.string().trim().max(120).default(""),
        geo: z
          .object({
            lat: z.number().min(-90).max(90),
            lng: z.number().min(-180).max(180),
            accuracy: z.number().nonnegative().max(100_000).optional(),
          })
          .nullish(),
        operationId: operationSchema,
      })
      .parse(await body());
    const state = normalizeChecklist(job["moveChecklist"]);
    if (state.signoffs[b.milestone]) return view(job); // offline replay of an accepted signature
    if (!milestoneUnlocked(state, b.milestone))
      h.fail(409, "Finish this milestone's checklist before signing");
    const self = await me(ctx, h);
    const signedAt = new Date().toISOString();
    const crewName = b.crewName || String(self?.["name"] ?? "");
    const next = {
      ...state,
      signoffs: {
        ...state.signoffs,
        [b.milestone]: {
          customerSignature: b.customerSignature,
          crewSignature: b.crewSignature,
          signedAt,
          crewName,
          geo: b.geo ?? null,
          byUserId: ctx.userId,
        },
      },
    };
    const progress = checklistProgress(next);
    const event = {
      id: `milestone:${b.milestone}`,
      kind: b.milestone === "final" ? ("final_signoff" as const) : ("origin_signoff" as const),
      title: b.milestone === "final" ? "Final Sign-off Received" : "Origin Sign-off Received",
      detail: `${progress.done}/${progress.total} checklist items complete`,
      at: signedAt,
      by: crewName || ctx.userId,
    };
    return view(
      await h.saveData(ctx, id, {
        moveChecklist: next,
        moveChecklistUpdatedAt: signedAt,
        activity: appendJobActivity(job["activity"], [event]),
      }),
    );
  }

  // QR box scans at pickup and delivery, stored on the job for reconciliation.
  if (sub === "scans" && method === "POST") {
    const input = z
      .object({
        code: z.string().trim().min(3).max(40),
        phase: z.enum(["origin", "destination"]),
        operationId: z.string().trim().max(80).optional(),
        note: z.string().trim().max(200).optional(),
      })
      .parse(await body());
    const { inventoryLabels, inventoryScans, withInventoryScan } = await import(
      "../shared/inventory-scan"
    );
    const labels = inventoryLabels(job as unknown as { id: number; inventory?: unknown });
    const match = labels.find((label) => label.code === input.code.toUpperCase());
    if (!match) h.fail(400, "This label is not part of this job's inventory");
    const existing = inventoryScans(job["inventoryScans"]);
    const already = existing.some(
      (scan) => scan.code === match.code && scan.phase === input.phase,
    );
    const self = await me(ctx, h);
    const by = String(self?.["name"] ?? ctx.email ?? "Crew");
    const at = new Date().toISOString();
    const scans = withInventoryScan(existing, {
      code: match.code,
      phase: input.phase,
      at,
      by,
      ...(input.operationId ? { operationId: input.operationId } : {}),
      ...(input.note ? { note: input.note } : {}),
    });
    const patch: Record<string, unknown> = { inventoryScans: scans };
    if (!already) {
      const { appendJobActivity } = await import("../shared/job-activity");
      patch["activity"] = appendJobActivity(job["activity"], [
        {
          id: `box:${match.code}:${input.phase}`,
          kind: "inventory_scanned",
          title: input.phase === "origin" ? "Box Loaded on Truck" : "Box Unloaded at Destination",
          detail: `${match.name} · ${match.code}`,
          at,
          by,
        },
      ]);
    }
    return view(await h.saveData(ctx, id, patch));
  }

  // Crew lead milestone updates with device GPS, mirrored into the customer tracker.
  if (sub === "checkin" && method === "POST") {
    const self = await me(ctx, h);
    const lead =
      self &&
      ["crew_lead", "driver"].includes(
        String(self["crewRole"] ?? (self["isDriver"] ? "driver" : "")),
      );
    if (!office && !lead) h.fail(403, "Only the crew lead or driver can check in");
    const { CheckinError, recordDriverCheckin } = await import("./tracking");
    try {
      const result = await recordDriverCheckin({
        job,
        payload: await body(),
        crew: self ? { id: self.id, name: String(self["name"] ?? "") } : null,
        by: String(self?.["name"] ?? ctx.email ?? "Crew"),
        save: (patch) => h.saveData(ctx, id, patch),
      });
      return view(result.job);
    } catch (error) {
      if (error instanceof CheckinError) h.fail(error.status, error.message);
      throw error;
    }
  }

  if (sub === "photos") {
    if (method === "GET") {
      const all = (await h.list(ctx, "damage")) as Rec[];
      return all.filter(d => d["jobId"] === id).map(d => ({
        id: d.id,
        phase: d["phase"],
        note: d["note"],
        photoUrl: d["photoUrl"],
        room: d["room"] ?? "",
        item: d["item"] ?? "",
        description: d["description"] ?? d["note"] ?? "",
        createdAt: d["createdAt"],
      }));
    }
    if (method === "POST") {
      const b = z.object({
        photoData: z.string().regex(/^data:image\/(jpeg|png|webp);base64,/).max(700_000),
        note: z.string().trim().max(500).default(""),
        // Pre-move inspection metadata: which room and item the damage belongs to.
        room: z.string().trim().max(80).default(""),
        item: z.string().trim().max(120).default(""),
        description: z.string().trim().max(500).default(""),
        phase: z.enum(["pre", "post"]).default("pre"),
        operationId:operationSchema,
      }).parse(await body());
      if(job['completedSignature'])h.fail(409,'Inspection photos are locked after sign-off');
      const {supabaseAdmin}=await import('../integrations/supabase/client.server');
      const {data:prior}=await supabaseAdmin.from('field_operation_receipts').select('result').eq('operation_id',b.operationId).eq('workspace_id',Number(ctx.wsId)).eq('job_id',id).maybeSingle();
      if(prior)return prior.result;
      // Stable operation IDs make offline photo retries idempotent, including response loss.
      const {data:existing}=await ctx.db.from('workspace_records').select('id').eq('workspace_id',Number(ctx.wsId)).eq('kind','damage').contains('data',{jobId:id,operationId:b.operationId}).maybeSingle();
      if(existing)return {id:existing.id};
      const { data: row, error } = await ctx.db.from("workspace_records")
        .insert({ workspace_id: h.requireWs(ctx), kind: "damage", data: { jobId: id, phase: b.phase, note: b.description || b.note, room: b.room, item: b.item, description: b.description, photoUrl: b.photoData, by: ctx.userId,operationId:b.operationId } as never })
        .select("id,data,created_at").single();
      if (error) h.fail(403, error.message);
      await supabaseAdmin.from('field_operation_receipts').upsert({operation_id:b.operationId,workspace_id:Number(ctx.wsId),job_id:id,kind:'photo',result:{id:(row as Row).id}},{onConflict:'operation_id'});
      return { id: (row as Row).id };
    }
  }

  // Customer acknowledgment of pre-existing damage. Must happen before loading starts,
  // otherwise the record could no longer distinguish pre-existing from crew-caused damage.
  if (sub === "pre-move" && method === "POST") {
    if (job["completedSignature"]) h.fail(409, "Inspection records are locked after sign-off");
    if (t.start_loading) h.fail(409, "Loading has already started, so a pre-move inspection can no longer be signed");
    const b = z.object({
      signature: z.string().regex(/^data:image\/png;base64,iVBOR/).min(100).max(400_000),
      acknowledge: z.literal(true),
      operationId: operationSchema,
    }).parse(await body());
    const { supabaseAdmin } = await import('../integrations/supabase/client.server');
    const { data: prior } = await supabaseAdmin.from('field_operation_receipts').select('result')
      .eq('operation_id', b.operationId).eq('workspace_id', Number(ctx.wsId)).eq('job_id', id).maybeSingle();
    if (prior) return view(job); // offline replay of an accepted signature is harmless
    const prePhotos = ((await h.list(ctx, 'damage')) as Rec[]).filter(p => p['jobId'] === id && p['phase'] === 'pre');
    // Store photo metadata only: the image itself already lives on the damage record,
    // so duplicating base64 payloads here would bloat the job document.
    const photos = prePhotos.map(p => ({
      id: p.id,
      room: String(p['room'] || ''),
      item: String(p['item'] || ''),
      description: String(p['description'] || p['note'] || ''),
    }));
    const record = {
      signature: b.signature,
      signedAt: new Date().toISOString(),
      by: ctx.userId,
      photoCount: photos.length,
      rooms: [...new Set(photos.map(p => p.room).filter(Boolean))],
      photos,
      statement: PRE_MOVE_STATEMENT,
    };
    const saved = await h.saveData(ctx, id, { preMoveInspection: record });
    await supabaseAdmin.from('field_operation_receipts').upsert(
      { operation_id: b.operationId, workspace_id: Number(ctx.wsId), job_id: id, kind: 'pre-move', result: { signedAt: record.signedAt } },
      { onConflict: 'operation_id' },
    );
    return view(saved);
  }

  // Mints (or returns) the opaque customer tracking token for this job.
  if (sub === "tracking" && method === "POST") {
    let token = String(job["trackingToken"] || "");
    if (!TRACKING_TOKEN_RE.test(token)) {
      token = newTrackingToken();
      await h.saveData(ctx, id, { trackingToken: token, trackingTokenCreatedAt: new Date().toISOString() });
    }
    const base = (ctx.origin || "").replace(/\/+$/, "");
    return { token, url: `${base}/move/${token}`, reference: jobReference(id) };
  }

  if (sub === "signoff" && method === "POST") {
    if (!t.complete) h.fail(409, "Complete the job before the customer signs off");
    const b = z.object({ signature: z.string().regex(/^data:image\/png;base64,iVBOR/).min(100).max(400_000),operationId:operationSchema }).parse(await body());
    const {data:company}=await ctx.db.from('workspaces').select('name,office_email,company_phone').eq('id',Number(ctx.wsId)).single();
    const photos=((await h.list(ctx,'damage')) as Rec[]).filter(p=>p['jobId']===id).map(p=>({note:String(p['note']||''),phase:String(p['phase']||''),photoUrl:String(p['photoUrl']||'')}));
    const snapshot:FieldSnapshot={company:{name:company?.name || '',officeEmail:company?.office_email || '',phone:company?.company_phone || ''},job:view(job),documents:(job['fieldDocuments'] || {}) as FieldDocuments,photos,signature:b.signature,signedAt:new Date().toISOString(),by:ctx.userId};
    if(!snapshot.documents.bol?.signature)snapshot.documents={...snapshot.documents,bol:{kind:'bol',notes:snapshot.documents.bol?.notes || '',items:snapshot.documents.bol?.items || [],signature:b.signature,signedAt:snapshot.signedAt,by:ctx.userId}};
    const pdf = await finalizeFieldSnapshot(ctx, id, b.operationId, snapshot);
    const signed = await loadJob(ctx, h, id);
    // The customer signature is the job's final milestone, so it joins the activity timeline.
    const logged = await h.saveData(ctx, id, {
      activity: appendJobActivity(signed["activity"], [
        {
          id: "signoff:bol",
          kind: "final_signoff" as const,
          title: "Final Sign-off Received",
          detail: "Customer signed the Bill of Lading",
          at: snapshot.signedAt,
          by: ctx.userId,
        },
      ]),
    });
    return { ...view(logged), fieldPdf: pdf };
  }

  // 1-click crew tip captured right after the customer signs the eBOL: the amount joins the
  // final bill and is split across the crew actually assigned to this job.
  if (sub === "tip" && method === "POST") {
    if (!job["completedSignature"]) h.fail(409, "The customer signs the eBOL before a tip can be recorded");
    if (job["finalPayment"]) h.fail(409, "The final bill was already settled, so the tip can no longer change it");
    const b = z.object({ cents: z.number().int().min(0).max(MAX_TIP_CENTS), operationId: operationSchema }).parse(await body());
    const { supabaseAdmin } = await import("../integrations/supabase/client.server");
    const { data: prior } = await supabaseAdmin.from("field_operation_receipts").select("result")
      .eq("operation_id", b.operationId).eq("workspace_id", Number(ctx.wsId)).eq("job_id", id).maybeSingle();
    if (prior) return view(job); // offline replay of an accepted tip is harmless
    const assigned = new Set(Array.isArray(job["crewIds"]) ? (job["crewIds"] as unknown[]).map(Number) : []);
    const crew = ((await h.list(ctx, "crew")) as Rec[]).filter(c => assigned.has(c.id));
    const tip: TipRecord = {
      cents: b.cents,
      method: b.cents > 0 ? "card" : "none",
      at: new Date().toISOString(),
      by: ctx.userId,
      allocation: splitTip(b.cents, crew.map(c => ({ id: c.id, name: String(c["name"] || `Crew #${c.id}`) }))),
    };
    const hours = Number(job["billableHours"]) || billableHours(t);
    const bill = finalBill({ ...job, tipCents: b.cents }, hours);
    const saved = await h.saveData(ctx, id, { tip, tipCents: b.cents, billableHours: hours, finalBill: bill, finalTotal: bill.subtotal });
    await supabaseAdmin.from("field_operation_receipts").upsert(
      { operation_id: b.operationId, workspace_id: Number(ctx.wsId), job_id: id, kind: "tip", result: { cents: b.cents } },
      { onConflict: "operation_id" },
    );
    return view(saved);
  }

  // Google review offer shown after the tip step. The first request wins so the field app
  // never repeats the prompt for the same job.
  if (sub === "review" && method === "POST") {
    if (!job["completedSignature"]) h.fail(409, "The customer signs the eBOL before a review is requested");
    const url = await companyReviewUrl(ctx.db, Number(ctx.wsId));
    if (!url) h.fail(409, "Add your Google review link in company settings first");
    const requestedAt = typeof job["reviewRequestedAt"] === "string" ? job["reviewRequestedAt"] : "";
    if (requestedAt) return { url, requestedAt, alreadyRequested: true };
    const at = new Date().toISOString();
    await h.saveData(ctx, id, { reviewRequestedAt: at, reviewUrl: url });
    return { url, requestedAt: at, alreadyRequested: false };
  }

  if (sub === "pay-offline" && method === "POST") {
    if (!t.complete) h.fail(409, "Complete the job first");
    if (job["finalPayment"]) h.fail(409, "The final payment is already recorded");
    const b = z.object({ method: z.enum(["cash", "check"]), reference: z.string().trim().max(80).default("") }).parse(await body());
    const due = view(job).bill.due;
    return view(await h.saveData(ctx, id, {
      finalPayment: { method: b.method, reference: b.reference, amountCents: Math.round(due * 100), at: new Date().toISOString(), by: ctx.userId },
      invoiceStatus: "paid",
    }));
  }

  if (sub === "checkout" && method === "POST") {
    if (!t.complete) h.fail(409, "Complete the job first");
    if (job["finalPayment"]) h.fail(409, "The final payment is already recorded");
    const cents = Math.round(view(job).bill.due * 100);
    if (cents < 50) h.fail(400, "Nothing left to collect by card");
    const env = isPreviewHost(new URL(ctx.origin ?? "http://localhost").hostname) ? "sandbox" : "live";
    const { createStripeClient, getStripeErrorMessage } = await import("../lib/stripe.server");
    try {
      const stripe = createStripeClient(env);
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        success_url: `${ctx.origin}/payment-complete`,
        line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: cents, product_data: { name: `Moving services · job #${id}` } } }],
        metadata: { jobId: String(id), workspaceId: String(ctx.wsId), kind: "final_balance" },
      });
      await h.saveData(ctx, id, { finalCheckout: { sessionId: session.id, url: session.url, env, amountCents: cents, createdAt: new Date().toISOString() } });
      return { url: session.url, env, amountCents: cents };
    } catch (e) {
      return h.fail(502, getStripeErrorMessage(e));
    }
  }

  // Confirms card payment by asking Stripe directly, so a paid status can never come from the phone.
  if (sub === "checkout-status" && method === "POST") {
    const fc = job["finalCheckout"] as { sessionId?: string; env?: "sandbox" | "live"; amountCents?: number } | undefined;
    if (job["finalPayment"]) return view(job);
    if (!fc?.sessionId || !fc.env) return view(job);
    const { createStripeClient } = await import("../lib/stripe.server");
    const s = await createStripeClient(fc.env).checkout.sessions.retrieve(fc.sessionId);
    if (s.payment_status === "paid" && s.amount_total === fc.amountCents && s.metadata?.["jobId"] === String(id)) {
      return view(await h.saveData(ctx, id, {
        finalPayment: { method: "card", mode: s.livemode ? "live" : "test", amountCents: s.amount_total, sessionId: s.id, at: new Date().toISOString() },
        invoiceStatus: "paid",
      }));
    }
    return view(job);
  }

  return h.fail(404, "Not found");
}
