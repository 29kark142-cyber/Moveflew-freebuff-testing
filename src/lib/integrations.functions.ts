import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type IntegrationKey = {
  id: string; kind: "api" | "widget" | "webhook"; label: string; keyPrefix: string;
  publicKey: string | null; lastUsedAt: string | null; revokedAt: string | null; createdAt: string;
};
const ws = z.object({ workspaceId: z.number().int().positive() });

async function requireAdmin(supabase: any, workspaceId: number) {
  const { data } = await supabase.rpc("workspace_role", { _ws: workspaceId });
  if (data !== "admin") throw new Error("Only workspace admins can manage integrations");
}
function randomHex(bytes: number) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), v => v.toString(16).padStart(2, "0")).join("");
}
async function sha256(value: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(d), v => v.toString(16).padStart(2, "0")).join("");
}

export const listIntegrationKeys = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => ws.parse(v))
  .handler(async ({ data, context }): Promise<IntegrationKey[]> => {
    await requireAdmin(context.supabase, data.workspaceId);
    const { data: rows, error } = await context.supabase.from("workspace_integration_keys")
      .select("id,kind,label,key_prefix,public_key,last_used_at,revoked_at,created_at")
      .eq("workspace_id", data.workspaceId).order("created_at", { ascending: false });
    if (error) throw new Error("Could not load integrations");
    return rows.map(r => ({ id: r.id, kind: r.kind as IntegrationKey["kind"], label: r.label, keyPrefix: r.key_prefix, publicKey: r.public_key, lastUsedAt: r.last_used_at, revokedAt: r.revoked_at, createdAt: r.created_at }));
  });

/** API keys are returned once; widget keys and webhook tokens stay visible to admins. */
export const createIntegrationKey = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => ws.extend({ kind: z.enum(["api", "widget", "webhook"]), label: z.string().trim().max(80) }).parse(v))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, data.workspaceId);
    const secret = data.kind === "api" ? `nw_pub_${randomHex(24)}` : data.kind === "widget" ? `pk_${randomHex(16)}` : `wh_${randomHex(20)}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("workspace_integration_keys").insert({
      workspace_id: data.workspaceId, kind: data.kind, label: data.label, key_hash: await sha256(secret),
      key_prefix: secret.slice(0, 10), public_key: data.kind === "api" ? null : secret, created_by: context.userId,
    });
    if (error) throw new Error("Could not create the key");
    return { secret };
  });

export const revokeIntegrationKey = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => ws.extend({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, data.workspaceId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("workspace_integration_keys").update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id).eq("workspace_id", data.workspaceId).is("revoked_at", null);
    if (error) throw new Error("Could not revoke the key");
    return { revoked: true };
  });
