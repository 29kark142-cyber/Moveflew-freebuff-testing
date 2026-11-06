import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  BellRing,
  CircleAlert,
  Clock,
  Loader2,
  Mail,
  MessageSquare,
  Send,
  Smartphone,
  Truck,
  X,
} from "lucide-react";
import { crmFetch } from "@/lib/crm";

type Attempt = { channel: string; target: string; status: string; detail: string };
type StoredReminder = {
  kind: string;
  at: string;
  by: string;
  sentAt: string | null;
  window: string;
  attempts: Attempt[];
};
type Reminder = {
  kind: string;
  label: string;
  when: string;
  dueAt: string | null;
  sentAt: string | null;
  status: string;
  window: string;
  scheduleLabel: string;
  last: StoredReminder | null;
  preview: { sms: string; emailSubject: string; email: string };
};
type Panel = {
  reference: string;
  pickupAt: string | null;
  window: string;
  customer: { name: string; phone: string; email: string };
  recipient: string;
  providers: { sms: boolean; email: boolean };
  active: boolean;
  reminders: Reminder[];
};

const DISPATCH_ROLES = ["admin", "office_admin", "dispatcher"];

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";

const chipFor = (reminder: Reminder) => {
  if (reminder.sentAt) return { tone: "green", label: "Sent" };
  if (reminder.last?.attempts.some((entry) => entry.status === "failed"))
    return { tone: "red", label: "Failed" };
  if (reminder.last) return { tone: "orange", label: "Logged" };
  if (reminder.status === "due") return { tone: "orange", label: "Due now" };
  if (reminder.status === "past") return { tone: "", label: "Pickup passed" };
  return { tone: "", label: "Scheduled" };
};

/**
 * Job-sheet pre-move reminders: when the 24h and 2h customer messages dispatch, what they
 * say, and a confirmed manual send/resend. Nothing is marked sent unless a provider
 * accepted it, so a log-only attempt is labelled Logged.
 */
export default function ReminderConfigModal({
  jobId,
  role,
  onSent,
}: {
  jobId: number;
  role: string;
  onSent?: () => void;
}) {
  const [panel, setPanel] = useState<Panel | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Reminder | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [sending, setSending] = useState(false);
  const canSend = DISPATCH_ROLES.includes(role);

  const load = useCallback(async () => {
    try {
      setPanel(await crmFetch<Panel>(`/jobs/${jobId}/reminders`));
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load pre-move reminders.");
    }
  }, [jobId]);

  useEffect(() => {
    void load();
  }, [load]);

  const open = (reminder: Reminder) => {
    setSelected(reminder);
    setConfirmed(false);
  };

  const send = async () => {
    if (!selected) return;
    setSending(true);
    try {
      const result = await crmFetch<{ sent: boolean; record: StoredReminder | null; panel: Panel }>(
        `/jobs/${jobId}/reminders`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: selected.kind, force: Boolean(selected.sentAt) }),
        },
      );
      setPanel(result.panel);
      if (result.sent) toast.success(`${selected.label} accepted by the provider`);
      else toast.error(result.record?.attempts[0]?.detail ?? "The reminder was not sent");
      setSelected(null);
      setConfirmed(false);
      onSent?.();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not send the reminder");
    } finally {
      setSending(false);
    }
  };

  const providerOff = panel && !panel.providers.sms && !panel.providers.email;

  return (
    <section className="ws-card ws-card-pad">
      <div className="ws-card-title">
        <div>
          <h2>Pre-Move Reminders</h2>
          <p>Automated 24-hour and 2-hour customer reminders before pickup.</p>
        </div>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <BellRing size={14} /> {panel?.window ?? "—"}
        </span>
      </div>

      {error && (
        <div className="ws-error">
          <CircleAlert size={16} /> {error}
        </div>
      )}
      {!error && !panel && <p className="ws-helper">Loading reminder schedule…</p>}

      {panel && (
        <>
          {!panel.active && (
            <p className="ws-helper">
              Reminders run automatically for booked and deposit-paid moves. This job is not at that
              stage yet.
            </p>
          )}
          <div className="ws-list">
            {panel.reminders.map((reminder) => {
              const chip = chipFor(reminder);
              return (
                <div className="ws-list-row" key={reminder.kind}>
                  <span className="ws-list-row__primary">
                    <b>{reminder.label}</b>
                    <small>
                      {reminder.sentAt
                        ? `Sent ${when(reminder.sentAt)} · arrival window ${reminder.window}`
                        : reminder.status === "past"
                          ? "Pickup time has passed"
                          : `Scheduled for ${reminder.scheduleLabel || "—"} · arrival window ${reminder.window}`}
                    </small>
                    {reminder.last && !reminder.sentAt && (
                      <small>
                        Last attempt {when(reminder.last.at)} ·{" "}
                        {reminder.last.attempts
                          .map((entry) => `${entry.channel} ${entry.status}`)
                          .join(", ")}
                      </small>
                    )}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={`ws-chip ${chip.tone}`}>{chip.label}</span>
                    {canSend && (
                      <button
                        type="button"
                        className="ws-btn"
                        onClick={() => open(reminder)}
                        disabled={!panel.recipient}
                      >
                        {reminder.sentAt ? "Resend" : "Send now"}
                      </button>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="ws-helper">
            Recipient: {panel.recipient || "no customer phone or email on file"} ·{" "}
            {panel.providers.sms
              ? "SMS via Twilio"
              : panel.providers.email
                ? "Email via SendGrid"
                : "no provider connected"}
          </p>
          {providerOff && (
            <p className="ws-helper">
              No SMS or email provider is connected. A manual send is logged on the job and shown
              here; nothing reaches the customer until SendGrid or Twilio keys are set.
            </p>
          )}
        </>
      )}

      {selected && panel && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`${selected.label} preview`}
        >
          <div className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-background p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-foreground">{selected.label}</h2>
                <p className="text-sm text-muted-foreground">{selected.when}</p>
              </div>
              <button
                type="button"
                className="ws-btn"
                aria-label="Close reminder preview"
                onClick={() => setSelected(null)}
              >
                <X size={15} />
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-border p-3">
              <b className="text-sm text-foreground">Recipient</b>
              <p className="text-sm text-foreground">
                {panel.customer.name || "Customer"} · {selected.window}
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {panel.customer.phone && (
                  <span className="flex items-center gap-1">
                    <Smartphone size={12} /> {panel.customer.phone}
                  </span>
                )}
                {panel.customer.email && (
                  <span className="flex items-center gap-1">
                    <Mail size={12} /> {panel.customer.email}
                  </span>
                )}
                {!panel.customer.phone && !panel.customer.email && (
                  <span>No phone or email saved for this customer.</span>
                )}
              </p>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <MessageSquare size={12} /> SMS preview
                </p>
                <pre className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-muted p-2 text-xs text-foreground">
                  {selected.preview.sms}
                </pre>
              </div>
              <div>
                <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Mail size={12} /> Email preview
                </p>
                <p className="mt-1 text-xs text-foreground">
                  Subject: {selected.preview.emailSubject}
                </p>
                <pre className="mt-1 max-h-52 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-2 text-xs text-foreground">
                  {selected.preview.email}
                </pre>
              </div>
              {selected.kind === "pre_move_2h" && (
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Truck size={12} /> Live tracking link: {panel.reference} delivery page
                </p>
              )}
            </div>

            <label className="mt-4 flex items-start gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              <span>
                Send this reminder to {panel.recipient || "the saved customer contact"} now
                {selected.sentAt ? " (resend)" : ""}.
              </span>
            </label>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="ws-btn primary"
                disabled={sending || !confirmed || !panel.recipient}
                onClick={() => void send()}
              >
                {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                {selected.sentAt ? "Resend reminder" : "Send reminder"}
              </button>
              <button
                type="button"
                className="ws-btn"
                disabled={sending}
                onClick={() => setSelected(null)}
              >
                <Clock size={15} /> Keep schedule
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
