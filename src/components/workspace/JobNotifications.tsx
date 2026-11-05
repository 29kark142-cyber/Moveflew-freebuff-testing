import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, CircleAlert, Clock, Loader2, MessageSquare, Send, X } from "lucide-react";
import { crmFetch } from "@/lib/crm";

type Entry = {
  kind: string;
  channel: string;
  status: string;
  at: string;
  by: string;
  detail: string;
};

type Trigger = {
  kind: string;
  label: string;
  when: string;
  due: boolean;
  dueAt: string | null;
  sentAt: string | null;
  last: Entry | null;
  preview: { sms: string; emailSubject: string; email: string };
};

type Panel = {
  reference: string;
  reviewUrl: string;
  trackingUrl: string;
  providers: { sms: boolean; email: boolean };
  triggers: Trigger[];
  log: Entry[];
};

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";

const tone = (trigger: Trigger) => {
  if (trigger.sentAt) return { chip: "green", label: "Sent" };
  if (trigger.last?.status === "blocked_not_configured")
    return { chip: "orange", label: "Blocked" };
  if (trigger.last?.status === "failed") return { chip: "red", label: "Failed" };
  if (trigger.due) return { chip: "orange", label: "Due now" };
  return { chip: "", label: "Scheduled" };
};

/**
 * Office view of the three automated customer messages. Previews are generated from the
 * same templates the server sends, and nothing is marked sent unless a provider accepted it.
 */
export default function JobNotifications({ jobId, role }: { jobId: number; role: string }) {
  const [panel, setPanel] = useState<Panel | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [reviewUrl, setReviewUrl] = useState("");
  const [savingUrl, setSavingUrl] = useState(false);
  const canEdit = ["admin", "office_admin"].includes(role);

  const load = useCallback(async () => {
    try {
      const next = await crmFetch<Panel>(`/jobs/${jobId}/notifications`);
      setPanel(next);
      setReviewUrl((current) => current || next.reviewUrl);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load message triggers.");
    }
  }, [jobId]);

  useEffect(() => {
    void load();
  }, [load]);

  const send = async (kind: string, force: boolean) => {
    setBusy(kind);
    try {
      const result = await crmFetch<{ sent: boolean; entry: Entry | null; panel: Panel }>(
        `/jobs/${jobId}/notifications`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, force }),
        },
      );
      setPanel(result.panel);
      if (result.sent) toast.success("Message accepted by the provider");
      else toast.error(result.entry?.detail ?? "The message was not sent");
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not send the message");
    } finally {
      setBusy("");
    }
  };

  const sendDue = async () => {
    setBusy("sweep");
    try {
      const result = await crmFetch<{ attempted: number; sent: number }>("/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      toast(
        result.attempted
          ? `${result.attempted} trigger(s) evaluated · ${result.sent} accepted`
          : "No messages are due right now",
      );
      await load();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not run the triggers");
    } finally {
      setBusy("");
    }
  };

  const saveUrl = async () => {
    setSavingUrl(true);
    try {
      await crmFetch(`/field/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ googleReviewUrl: reviewUrl.trim() }),
      });
      toast.success("Google review link saved");
      await load();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not save the review link");
    } finally {
      setSavingUrl(false);
    }
  };

  return (
    <section className="ws-card ws-card-pad">
      <div className="ws-card-title">
        <div>
          <h2>Customer messages</h2>
          <p>Automated pre-move, move-day and post-move triggers for this job.</p>
        </div>
        <button className="ws-btn" onClick={() => setOpen(true)} type="button">
          <MessageSquare size={15} /> Preview messages
        </button>
      </div>

      {error && (
        <div className="ws-error">
          <CircleAlert size={16} /> {error}
        </div>
      )}

      {!error && !panel && <p className="ws-helper">Loading triggers…</p>}

      {panel && (
        <div className="ws-list">
          {panel.triggers.map((trigger) => {
            const state = tone(trigger);
            return (
              <div className="ws-list-row" key={trigger.kind}>
                <span className="ws-list-row__primary">
                  <b>{trigger.label}</b>
                  <small>
                    {state.label}
                    {trigger.sentAt
                      ? ` · ${when(trigger.sentAt)}`
                      : trigger.dueAt
                        ? ` · ${when(trigger.dueAt)}`
                        : ""}
                  </small>
                </span>
                <span className={`ws-chip ${state.chip}`}>{state.label}</span>
              </div>
            );
          })}
        </div>
      )}

      {panel && !panel.providers.sms && !panel.providers.email && (
        <p className="ws-helper">
          No SMS or email provider is connected. Triggers are recorded on the job and shown here;
          nothing is sent to the customer.
        </p>
      )}

      {open && panel && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/40"
          role="dialog"
          aria-modal="true"
          aria-label="Customer message previews"
        >
          <aside className="h-full w-full max-w-md overflow-y-auto bg-background p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Customer messages</h2>
                <p className="text-sm text-muted-foreground">
                  {panel.reference} ·{" "}
                  {panel.providers.sms
                    ? "SMS via Twilio"
                    : panel.providers.email
                      ? "Email via SendGrid"
                      : "No provider connected"}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close previews"
                className="ws-btn"
                onClick={() => setOpen(false)}
              >
                <X size={15} />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {panel.triggers.map((trigger) => {
                const state = tone(trigger);
                return (
                  <div key={trigger.kind} className="space-y-2 rounded-xl border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <b className="text-sm text-foreground">{trigger.label}</b>
                      <span className={`ws-chip ${state.chip}`}>{state.label}</span>
                    </div>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock size={12} /> {trigger.when}
                      {trigger.dueAt ? ` · ${when(trigger.dueAt)}` : ""}
                    </p>
                    <pre className="whitespace-pre-wrap break-words rounded-lg bg-muted p-2 text-xs text-foreground">
                      {trigger.preview.sms}
                    </pre>
                    <p className="text-xs text-muted-foreground">
                      Email subject: {trigger.preview.emailSubject}
                    </p>
                    {trigger.last && (
                      <p className="text-xs text-muted-foreground">
                        Last attempt {when(trigger.last.at)} · {trigger.last.status} ·{" "}
                        {trigger.last.detail}
                      </p>
                    )}
                    <button
                      type="button"
                      className="ws-btn primary"
                      disabled={busy === trigger.kind}
                      onClick={() => void send(trigger.kind, Boolean(trigger.sentAt))}
                    >
                      {busy === trigger.kind ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Send size={14} />
                      )}
                      {trigger.sentAt ? "Resend" : "Send now"}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 space-y-2 rounded-xl border border-border p-3">
              <b className="text-sm text-foreground">Google review link</b>
              <p className="text-xs text-muted-foreground">
                Used by the post-move review follow-up and the crew tipping screen.
              </p>
              <input
                className="ws-input"
                value={reviewUrl}
                onChange={(event) => setReviewUrl(event.target.value)}
                placeholder="https://g.page/r/…/review"
                aria-label="Google review link"
                disabled={!canEdit}
              />
              {canEdit ? (
                <button
                  type="button"
                  className="ws-btn"
                  disabled={savingUrl}
                  onClick={() => void saveUrl()}
                >
                  {savingUrl ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={14} />
                  )}{" "}
                  Save link
                </button>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Only admins can change the company review link.
                </p>
              )}
            </div>

            {panel.log.length > 0 && (
              <div className="mt-5 space-y-1">
                <b className="text-sm text-foreground">Recent attempts</b>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {panel.log.slice(0, 6).map((entry, index) => (
                    <li key={`${entry.at}-${index}`}>
                      {when(entry.at)} · {entry.kind} · {entry.channel} · {entry.status}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                className="ws-btn"
                disabled={busy === "sweep"}
                onClick={() => void sendDue()}
              >
                {busy === "sweep" ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Clock size={14} />
                )}{" "}
                Run due triggers
              </button>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
