// Bill of lading service. Signing is idempotent per role, generates a pdf-lib document
// and stores its metadata on the job as an attached document.
import type { SupabaseClient } from "@supabase/supabase-js";
import { BOL_LEGAL_TERMS, bolPricing, bolSignatures, bolValuation, type BolDocument, type BolRole, type BolSignature } from "../shared/bol";
import { generateBolPdf } from "../lib/bol-pdf.server";

type JobRow = { id: number; data: Record<string, unknown> };
type Deps = {
  db: SupabaseClient;
  wsId: number;
  userId: string;
  getJob: (id: number) => Promise<JobRow>;
  saveJob: (id: number, patch: Record<string, unknown>) => Promise<unknown>;
};

const text = (value: unknown) => (typeof value === "string" ? value : "");
const isSignature = (value: unknown) => typeof value === "string" && /^data:image\/png;base64,iVBOR/i.test(value) && value.length <= 400_000;

async function companyName(db: SupabaseClient, wsId: number): Promise<string> {
  const { data } = await db.from("workspaces").select("name").eq("id", wsId).maybeSingle();
  return text((data as { name?: unknown } | null)?.name);
}

function documentFor(row: JobRow, name: string): BolDocument {
  const data = { ...row.data, id: row.id, companyName: row.data["companyName"] || name };
  const documents = (row.data["documents"] ?? {}) as Record<string, unknown>;
  const attached = documents["bol"] as { path?: unknown; hash?: unknown; generatedAt?: unknown } | undefined;
  return {
    job: data,
    signatures: bolSignatures(row.data),
    valuation: bolValuation((row.data["inventory"] ?? []) as never),
    pricing: bolPricing(data as never),
    pdf: attached?.path
      ? { path: text(attached.path), hash: text(attached.hash), generatedAt: text(attached.generatedAt) }
      : null,
    terms: BOL_LEGAL_TERMS,
    generatedAt: new Date().toISOString(),
    recordkeepingOnly: false,
  };
}

export async function getBol(deps: Deps, jobId: number): Promise<BolDocument> {
  const row = await deps.getJob(jobId);
  return documentFor(row, await companyName(deps.db, deps.wsId));
}

export async function signBol(
  deps: Deps,
  jobId: number,
  input: { role?: unknown; signature?: unknown; signerName?: unknown },
): Promise<BolDocument> {
  const role: BolRole | null = input.role === "origin" || input.role === "delivery" ? input.role : null;
  if (!role) throw Object.assign(new Error("Choose pickup or delivery sign-off"), { status: 400 });
  if (!isSignature(input.signature)) throw Object.assign(new Error("A valid signature is required"), { status: 400 });
  const signerName = text(input.signerName).trim().slice(0, 120) || "Customer";
  const current = await deps.getJob(jobId);
  const existing = bolSignatures(current.data);
  const signatures = { ...existing, [role]: { signature: input.signature as string, signerName, signedAt: new Date().toISOString(), by: deps.userId } };
  const patch: Record<string, unknown> = {
    bolSignatures: signatures,
    ...(role === "origin" ? { signature: input.signature } : { completedSignature: input.signature, signedOffAt: signatures[role]?.signedAt }),
  };
  const nextRow = { ...current, data: { ...current.data, ...patch } };
  const name = await companyName(deps.db, deps.wsId);
  const doc = documentFor(nextRow, name);
  const pdf = await generateBolPdf(doc);
  const { supabaseAdmin } = await import("../integrations/supabase/client.server");
  const path = `${deps.wsId}/${jobId}/bol-${Date.now()}.pdf`;
  const upload = await supabaseAdmin.storage.from("field-documents").upload(path, pdf, { contentType: "application/pdf", upsert: false });
  if (upload.error) throw new Error("Signature saved, but the signed PDF upload failed. Retry to generate it again.");
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", pdf as unknown as BufferSource)), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const attached = { kind: "bol", path, hash, generatedAt: new Date().toISOString() };
  const documents = { ...((current.data["documents"] ?? {}) as Record<string, unknown>), bol: attached };
  await deps.saveJob(jobId, { ...patch, documents });
  const saved = await deps.getJob(jobId);
  return documentFor(saved, name);
}

export async function streamBolPdf(deps: Deps, jobId: number): Promise<Response> {
  const row = await deps.getJob(jobId);
  const documents = (row.data["documents"] ?? {}) as Record<string, unknown>;
  const attached = documents["bol"] as { path?: unknown } | undefined;
  if (!attached?.path) return Response.json({ error: "Sign the bill of lading first" }, { status: 409 });
  const { supabaseAdmin } = await import("../integrations/supabase/client.server");
  const { data: file, error } = await supabaseAdmin.storage.from("field-documents").download(text(attached.path));
  if (error || !file) return Response.json({ error: "Signed PDF not found" }, { status: 404 });
  return new Response(file, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="BOL-job-${jobId}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
