// Public, unauthenticated review page API. The opaque review token is the
// credential; no customer id, contact details or other workspace records leak.
import { reviewOutcome } from "../shared/reviews";
import { sendEmail } from "./notifications";

type Row = { id: number; data: Record<string, unknown>; workspace_id: number };

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

async function admin() {
  const { supabaseAdmin } = await import("../integrations/supabase/client.server");
  return supabaseAdmin;
}

async function findReview(token: string): Promise<Row | null> {
  if (!/^[a-f0-9]{48}$/.test(token)) return null;
  const db = await admin();
  const { data, error } = await db
    .from("workspace_records")
    .select("id,data,workspace_id")
    .eq("kind", "review_request")
    .contains("data", { token })
    .maybeSingle();
  if (error || !data) return null;
  return data as Row;
}

async function companyFor(wsId: number) {
  const db = await admin();
  const { data } = await db
    .from("workspaces")
    .select("name,office_email")
    .eq("id", wsId)
    .maybeSingle();
  return {
    name: text((data as { name?: unknown } | null)?.name) || "Your moving company",
    officeEmail: text((data as { office_email?: unknown } | null)?.office_email),
  };
}

function publicShape(row: Row, companyName: string) {
  const data = row.data;
  const rating = typeof data["rating"] === "number" ? data["rating"] : null;
  const outcome = reviewOutcome(rating, data["googleReviewUrl"]);
  return {
    company: { name: companyName },
    status: text(data["status"]),
    rating,
    feedback: text(data["feedback"]),
    redirectUrl: outcome.redirectUrl,
    escalated: data["escalated"] === true,
    message: outcome.message,
  };
}

export async function readPublicReview(token: string) {
  const row = await findReview(token);
  if (!row) return null;
  const company = await companyFor(row.workspace_id);
  return publicShape(row, company.name);
}

export async function submitPublicReview(
  token: string,
  input: { rating?: unknown; feedback?: unknown },
) {
  const row = await findReview(token);
  if (!row) return null;
  const rating = Number(input.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5)
    throw new Error("Choose a rating from 1 to 5");
  const feedback = typeof input.feedback === "string" ? input.feedback.trim().slice(0, 2000) : "";
  if (["submitted", "open", "resolved"].includes(text(row.data["status"])))
    return readPublicReview(token);
  const outcome = reviewOutcome(rating, row.data["googleReviewUrl"]);
  const next = {
    ...row.data,
    rating,
    feedback,
    status: rating === 5 ? "submitted" : "open",
    escalated: outcome.escalated,
    escalationStatus: outcome.escalated ? "open" : null,
    submittedAt: new Date().toISOString(),
  };
  const db = await admin();
  const { error } = await db
    .from("workspace_records")
    .update({ data: next as never, updated_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("workspace_id", row.workspace_id);
  if (error) throw new Error("Could not save your feedback");

  if (outcome.escalated) {
    const company = await companyFor(row.workspace_id);
    if (company.officeEmail) {
      await sendEmail(
        company.officeEmail,
        `Low review escalation: ${rating}/5`,
        `${text(row.data["customerName"]) || "A customer"} rated a completed move ${rating}/5.\n\n${feedback || "No written feedback."}\n\nOpen /app/reviews to follow up.`,
      );
    }
  }
  return publicShape({ ...row, data: next }, (await companyFor(row.workspace_id)).name);
}
