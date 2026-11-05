import { createFileRoute } from "@tanstack/react-router";
import { emailConfigured, smsConfigured, sweepDueNotifications } from "@/server/notifications";

// Unattended notification sweep for a platform scheduler (cron, Cloud Scheduler,
// GitHub Actions). Protected by CRON_SECRET rather than a user session.

const encoder = new TextEncoder();

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

async function authorized(request: Request, secret: string): Promise<boolean> {
  const provided = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!provided) return false;
  const [given, expected] = await Promise.all([digest(provided), digest(secret)]);
  let difference = given.length ^ expected.length;
  for (let index = 0; index < Math.min(given.length, expected.length); index += 1) {
    difference |= (given[index] ?? 0) ^ (expected[index] ?? 0);
  }
  return difference === 0;
}

async function runSweep(request: Request): Promise<Response> {
  const secret = process.env["CRON_SECRET"];
  if (!secret) {
    console.error(
      "[cron] CRON_SECRET is not set. Add it to the production environment before scheduling /api/cron/notifications.",
    );
    return Response.json(
      { error: "Cron is not configured. Set CRON_SECRET in the server environment." },
      { status: 503 },
    );
  }
  if (!(await authorized(request, secret))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Without a provider every due message would be recorded as blocked, which would
  // stop a later sweep from sending it. Refuse the run and log what to configure.
  if (!smsConfigured() && !emailConfigured()) {
    console.error(
      "[cron] No messaging provider is configured. Set TWILIO_ACCOUNT_SID/AUTH_TOKEN/FROM_NUMBER or SENDGRID_API_KEY + MESSAGING_FROM_EMAIL before scheduling sweeps.",
    );
    return Response.json(
      { error: "No messaging provider is configured; notifications were not attempted." },
      { status: 503 },
    );
  }

  const started = Date.now();
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const origin = (
      process.env["PUBLIC_SITE_URL"] ||
      process.env["APP_URL"] ||
      new URL(request.url).origin
    ).replace(/\/+$/, "");
    const only = Number(new URL(request.url).searchParams.get("workspaceId"));
    const query = supabaseAdmin.from("workspaces").select("id,name").limit(1000);
    const { data: workspaces, error } =
      Number.isFinite(only) && only > 0 ? await query.eq("id", only) : await query;
    if (error) throw new Error(error.message);

    let attempted = 0;
    let sent = 0;
    let blocked = 0;
    let failed = 0;
    let skipped = 0;
    let jobsScanned = 0;

    for (const workspace of workspaces ?? []) {
      const { data: rows, error: jobsError } = await supabaseAdmin
        .from("workspace_records")
        .select("id,data")
        .eq("workspace_id", workspace.id)
        .eq("kind", "job")
        .limit(1000);
      if (jobsError) {
        failed += 1;
        console.error(`[cron] workspace ${workspace.id}: ${jobsError.message}`);
        continue;
      }
      const jobs = (rows ?? []) as Array<{ id: number; data: Record<string, unknown> }>;
      jobsScanned += jobs.length;
      if (!jobs.length) continue;

      try {
        const result = await sweepDueNotifications(
          {
            db: supabaseAdmin,
            wsId: workspace.id,
            userId: "system:cron",
            origin,
            // Server-owned save; the service role bypasses RLS for an unattended sweep.
            save: async (jobId: number, patch: Record<string, unknown>) => {
              const job = jobs.find((item) => item.id === jobId);
              const next = { ...(job?.data ?? {}), ...patch };
              const { error: saveError } = await supabaseAdmin
                .from("workspace_records")
                .update({ data: next as never, updated_at: new Date().toISOString() })
                .eq("id", jobId)
                .eq("workspace_id", workspace.id);
              if (saveError) throw new Error(saveError.message);
              if (job) job.data = next;
            },
          },
          jobs,
        );
        attempted += result.attempted;
        for (const item of result.results) {
          if (item.sent) sent += 1;
          else if (item.entry?.status === "blocked_not_configured") blocked += 1;
          else if (item.entry?.status === "failed") failed += 1;
          else skipped += 1;
        }
      } catch (error) {
        failed += 1;
        console.error(`[cron] workspace ${workspace.id} sweep failed`, error);
      }
    }

    const summary = {
      ok: true,
      workspaces: workspaces?.length ?? 0,
      jobs: jobsScanned,
      attempted,
      sent,
      blocked,
      failed,
      skipped,
      durationMs: Date.now() - started,
    };
    const { logPlatformEvent } = await import("@/lib/platform-events.server");
    await logPlatformEvent(
      "cron_notifications",
      failed ? "warn" : "info",
      `Notification sweep: ${sent} sent, ${blocked} blocked, ${failed} failed`,
      summary,
    );
    return Response.json(summary, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[cron] notification sweep failed", error);
    return Response.json({ error: "Notification sweep failed" }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/cron/notifications")({
  server: {
    handlers: {
      GET: async ({ request }) => runSweep(request),
      POST: async ({ request }) => runSweep(request),
    },
  },
});
