// Public marketing tracking. Tokens are opaque and every update is limited to
// the one touch row, so an open/click cannot mutate a campaign or another tenant.
import type { SupabaseClient } from "@supabase/supabase-js";

type Row = { id: number; data: Record<string, unknown>; workspace_id: number };

async function admin() {
  const { supabaseAdmin } = await import("../integrations/supabase/client.server");
  return supabaseAdmin;
}

async function findTouch(token: string): Promise<Row | null> {
  if (!/^[a-f0-9]{48}$/.test(token)) return null;
  const db = await admin();
  const { data, error } = await db
    .from("workspace_records")
    .select("id,data,workspace_id")
    .eq("kind", "marketing_touch")
    .contains("data", { token })
    .maybeSingle();
  if (error || !data) return null;
  return data as Row;
}

async function patch(db: SupabaseClient, row: Row, data: Record<string, unknown>) {
  await db
    .from("workspace_records")
    .update({ data, updated_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("workspace_id", row.workspace_id);
}

export async function trackMarketingOpen(token: string): Promise<void> {
  const row = await findTouch(token);
  if (!row || row.data["openedAt"]) return;
  const db = await admin();
  await patch(db, row, { ...row.data, openedAt: new Date().toISOString() });
}

export async function trackMarketingClick(token: string): Promise<string | null> {
  const row = await findTouch(token);
  if (!row) return null;
  const db = await admin();
  const at = new Date().toISOString();
  await patch(db, row, {
    ...row.data,
    openedAt: row.data["openedAt"] ?? at,
    clickedAt: row.data["clickedAt"] ?? at,
  });
  const destination = String(row.data["destination"] ?? "");
  return /^https?:\/\//i.test(destination) ? destination : null;
}
