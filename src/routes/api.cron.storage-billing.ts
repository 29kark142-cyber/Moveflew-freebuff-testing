import { createFileRoute } from "@tanstack/react-router";
import { authorizeCronRequest, cronOrigin } from "@/server/cron-auth";
import { emailConfigured } from "@/server/notifications";

// Unattended monthly storage billing. A platform scheduler calls this with CRON_SECRET;
// each workspace's current invoices are generated idempotently and emailed once.
async function runBilling(request: Request): Promise<Response> {
  const denied = await authorizeCronRequest(request, process.env["CRON_SECRET"]);
  if (denied) return denied;
  if (!emailConfigured()) {
    console.error(
      "[cron] Storage billing needs SENDGRID_API_KEY + MESSAGING_FROM_EMAIL; invoices were not generated.",
    );
    return Response.json(
      { error: "Email delivery is not configured; storage billing was not attempted." },
      { status: 503 },
    );
  }

  const started = Date.now();
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runStorageBilling } = await import("@/server/storage-billing-api");
    const { data: workspaces, error } = await supabaseAdmin
      .from("workspaces")
      .select("id,name")
      .limit(1000);
    if (error) throw new Error(error.message);
    let created = 0;
    let emailed = 0;
    let blocked = 0;
    let failed = 0;
    const errors: string[] = [];
    for (const workspace of workspaces ?? []) {
      const id = Number((workspace as { id?: unknown }).id);
      if (!Number.isInteger(id) || id <= 0) continue;
      try {
        const result = await runStorageBilling(supabaseAdmin, id, cronOrigin(request));
        created += result.created.length;
        emailed += result.emailed;
        blocked += result.blocked;
        failed += result.failed;
      } catch (reason) {
        console.error(`[cron] storage billing workspace ${id}:`, reason);
        errors.push(`workspace ${id}`);
      }
    }
    const summary = { workspaces: workspaces?.length ?? 0, created, emailed, blocked, failed, errors };
    const { logPlatformEvent } = await import("@/lib/platform-events.server");
    await logPlatformEvent(
      "cron_storage_billing",
      failed || errors.length ? "warn" : "info",
      `Storage billing: ${created} invoices created, ${emailed} emailed`,
      summary,
    );
    return Response.json(
      { ok: true, ...summary, durationMs: Date.now() - started },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[cron] storage billing failed", error);
    return Response.json({ error: "Storage billing failed" }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/cron/storage-billing")({
  server: {
    handlers: {
      GET: async ({ request }) => runBilling(request),
      POST: async ({ request }) => runBilling(request),
    },
  },
});
