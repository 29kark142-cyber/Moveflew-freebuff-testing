/** Best-effort system health log for the platform admin dashboard; never throws. */
export async function logPlatformEvent(source: string, level: "info" | "warn" | "error", message: string, meta: Record<string, unknown> = {}, workspaceId: number | null = null) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("platform_events").insert({ source, level, message: message.slice(0, 300), meta: meta as never, workspace_id: workspaceId });
  } catch (e) {
    console.error("platform event log failed", e);
  }
}
