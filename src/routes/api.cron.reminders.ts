import { createFileRoute } from "@tanstack/react-router";
import { authorizeCronRequest, cronOrigin } from "@/server/cron-auth";
import { emailConfigured, smsConfigured } from "@/server/notifications";

// Unattended pre-move reminder sweep for a platform scheduler. Protected by CRON_SECRET
// rather than a user session; an optional ?workspaceId= limits it to one workspace.

async function runSweep(request: Request): Promise<Response> {
  const denied = await authorizeCronRequest(request, process.env["CRON_SECRET"]);
  if (denied) return denied;
  // Without a provider every reminder would be stored as logged and never sent later.
  // Refuse the run and log what to configure, like the lifecycle notification cron.
  if (!smsConfigured() && !emailConfigured()) {
    console.error(
      "[cron] No messaging provider is configured. Set TWILIO_ACCOUNT_SID/AUTH_TOKEN/FROM_NUMBER or SENDGRID_API_KEY + MESSAGING_FROM_EMAIL before scheduling reminder sweeps.",
    );
    return Response.json(
      { error: "No messaging provider is configured; reminders were not attempted." },
      { status: 503 },
    );
  }

  const started = Date.now();
  try {
    const only = Number(new URL(request.url).searchParams.get("workspaceId"));
    const { runPreMoveReminderSweep } = await import("@/server/reminders");
    const summary = await runPreMoveReminderSweep(
      cronOrigin(request),
      Number.isFinite(only) && only > 0 ? only : 0,
    );
    const { logPlatformEvent } = await import("@/lib/platform-events.server");
    await logPlatformEvent(
      "cron_reminders",
      summary.failed ? "warn" : "info",
      `Pre-move reminder sweep: ${summary.sent} sent, ${summary.failed} failed`,
      summary,
    );
    return Response.json(
      { ok: true, ...summary, durationMs: Date.now() - started },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[cron] pre-move reminder sweep failed", error);
    return Response.json({ error: "Reminder sweep failed" }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/cron/reminders")({
  server: {
    handlers: {
      GET: async ({ request }) => runSweep(request),
      POST: async ({ request }) => runSweep(request),
    },
  },
});
