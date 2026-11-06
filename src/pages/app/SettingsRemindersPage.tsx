import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  BellRing,
  CircleAlert,
  Clock,
  Loader2,
  Mail,
  MessageSquare,
  RotateCcw,
  Save,
  Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionLoader } from "@/components/loaders/MoveFlewLoader";
import { crm } from "@/lib/crm";
import {
  DEFAULT_REMINDER_SETTINGS,
  PRE_MOVE_REMINDERS,
  REMINDER_LEAD_HOURS_LIMITS,
  REMINDER_PLACEHOLDERS,
  reminderTemplate,
  renderReminder,
  type PreMoveReminderKind,
  type ReminderContext,
  type ReminderSettings,
  type ReminderTierSettings,
} from "@shared/reminders";

type TierKey = "first" | "second";
type TemplateField = "smsTemplate" | "emailSubject" | "emailBody";

const TIERS: Array<{
  key: TierKey;
  kind: PreMoveReminderKind;
  title: string;
  hint: string;
}> = [
  {
    key: "first",
    kind: "pre_move_24h",
    title: "First pre-move reminder",
    hint: "Sent with the arrival window, crew lead and move-day prep checklist.",
  },
  {
    key: "second",
    kind: "pre_move_2h",
    title: "Second pre-move reminder",
    hint: "Sent with the driver ETA, assigned truck and live tracking link.",
  },
];

/** Illustrative record for the live preview; never a real customer. */
const SAMPLE: ReminderContext = {
  customerName: "Jane Doe",
  companyName: "MoveFlew Moving",
  companyPhone: "(555) 010-1000",
  reference: "#M-1042",
  date: "Friday, May 3",
  window: "8:00 AM – 9:00 AM",
  crewLead: "Dana Ruiz · (555) 010-2030",
  origin: "1 Main St",
  destination: "9 Oak Ave",
  truck: "Truck 2 · ABC-123",
  prepUrl: "https://app.example.com/move/trk_demo",
  trackingUrl: "https://app.example.com/move/trk_demo",
};

const fieldClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60";

/**
 * Workspace-managed pre-move reminder rules: lead time, on/off per tier, per-channel
 * switches and customer-facing copy. Saved on the workspace settings record, so the cron
 * sweep and the job-sheet panel read the same values.
 */
export default function SettingsRemindersPage({ role }: { role: string }) {
  const [settings, setSettings] = useState<ReminderSettings>(DEFAULT_REMINDER_SETTINGS);
  const [canEdit, setCanEdit] = useState(false);
  const [providers, setProviders] = useState({ sms: false, email: false });
  const [active, setActive] = useState<{ tier: TierKey; field: TemplateField } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let live = true;
    crm
      .reminderSettings()
      .then((data) => {
        if (!live) return;
        setSettings(data.settings);
        setCanEdit(data.canEdit);
        setProviders(data.providers);
        setError("");
      })
      .catch((reason) => {
        if (live)
          setError(reason instanceof Error ? reason.message : "Could not load reminder settings.");
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);

  const patch = (tier: TierKey, change: Partial<ReminderTierSettings>) =>
    setSettings((current) => ({ ...current, [tier]: { ...current[tier], ...change } }));

  const insert = (token: string) => {
    if (!active || !canEdit) return;
    setSettings((current) => {
      const value = current[active.tier][active.field];
      const spacer = value && !/\s$/.test(value) ? " " : "";
      return {
        ...current,
        [active.tier]: {
          ...current[active.tier],
          [active.field]: `${value}${spacer}${token}`,
        },
      };
    });
  };

  const save = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await crm.saveReminderSettings(settings);
      setSettings(result.settings);
      setCanEdit(result.canEdit);
      setProviders(result.providers);
      setMessage("Pre-move reminder settings saved.");
      toast.success("Pre-move reminder settings saved");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not save pre-move reminder settings.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <SectionLoader label="Loading pre-move reminder settings…" />;
  }

  return (
    <section className="ws-settings-section space-y-5">
      <div className="ws-card ws-card-pad">
        <div className="ws-card-title">
          <div>
            <h2>Pre-Move Reminders</h2>
            <p>
              Automated customer messages before pickup, sent for booked and deposit-paid moves.
              Changes apply to the next sweep and to every job sheet.
            </p>
          </div>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <BellRing size={14} />{" "}
            {providers.sms || providers.email ? "Providers ready" : "Log only"}
          </span>
        </div>
        {error && (
          <div className="ws-error">
            <CircleAlert size={16} /> {error}
          </div>
        )}
        {!canEdit && (
          <p className="ws-helper">
            Only workspace admins can change reminder settings. The current schedule is shown
            read-only.
          </p>
        )}
        <p className="ws-helper">
          {providers.sms && providers.email
            ? "SMS via Twilio and email via SendGrid are connected."
            : providers.sms
              ? "SMS via Twilio is connected; email attempts are logged until SendGrid is configured."
              : providers.email
                ? "Email via SendGrid is connected; SMS attempts are logged until Twilio is configured."
                : "No SMS or email provider is connected yet, so automated sends are logged on the job instead of reaching the customer."}
        </p>
      </div>

      {TIERS.map((tier) => {
        const value = settings[tier.key];
        const effective = reminderTemplate(tier.kind, settings);
        const defaults = PRE_MOVE_REMINDERS[tier.kind];
        const overridden = Boolean(
          value.smsTemplate.trim() || value.emailSubject.trim() || value.emailBody.trim(),
        );
        return (
          <div className="ws-card ws-card-pad space-y-3" key={tier.key}>
            <div className="ws-card-title">
              <div>
                <h3>{tier.title}</h3>
                <p>{tier.hint}</p>
              </div>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={value.enabled}
                  disabled={!canEdit}
                  onChange={(event) => patch(tier.key, { enabled: event.target.checked })}
                />
                {value.enabled ? "Automatic sends on" : "Turned off"}
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={`${tier.key}-lead-hours`}>Send this many hours before pickup</Label>
                <Input
                  id={`${tier.key}-lead-hours`}
                  type="number"
                  min={REMINDER_LEAD_HOURS_LIMITS.min}
                  max={REMINDER_LEAD_HOURS_LIMITS.max}
                  step={0.5}
                  disabled={!canEdit}
                  value={String(value.leadHours)}
                  onChange={(event) =>
                    patch(tier.key, { leadHours: Number(event.target.value) || 0 })
                  }
                />
                <p className="ws-helper">
                  {REMINDER_LEAD_HOURS_LIMITS.min}–{REMINDER_LEAD_HOURS_LIMITS.max} hours, in
                  half-hour steps. The second reminder must be closer to pickup than the first.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Channels</Label>
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={value.sms}
                    disabled={!canEdit}
                    onChange={(event) => patch(tier.key, { sms: event.target.checked })}
                  />
                  <Smartphone size={14} /> SMS
                </label>
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={value.email}
                    disabled={!canEdit}
                    onChange={(event) => patch(tier.key, { email: event.target.checked })}
                  />
                  <Mail size={14} /> Email
                </label>
                {!value.sms && !value.email && (
                  <p className="ws-helper">
                    Both channels are off, so this reminder will not be sent at all.
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor={`${tier.key}-sms`}>SMS template</Label>
              <textarea
                id={`${tier.key}-sms`}
                className={fieldClass}
                rows={3}
                maxLength={2000}
                disabled={!canEdit}
                placeholder={defaults.sms}
                value={value.smsTemplate}
                onFocus={() => setActive({ tier: tier.key, field: "smsTemplate" })}
                onChange={(event) => patch(tier.key, { smsTemplate: event.target.value })}
              />
              <p className="ws-helper">
                Leave empty to use the default copy shown as the placeholder.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={`${tier.key}-subject`}>Email subject override</Label>
                <Input
                  id={`${tier.key}-subject`}
                  maxLength={200}
                  disabled={!canEdit}
                  placeholder={defaults.emailSubject}
                  value={value.emailSubject}
                  onFocus={() => setActive({ tier: tier.key, field: "emailSubject" })}
                  onChange={(event) => patch(tier.key, { emailSubject: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${tier.key}-email`}>Email body override</Label>
                <textarea
                  id={`${tier.key}-email`}
                  className={fieldClass}
                  rows={4}
                  maxLength={8000}
                  disabled={!canEdit}
                  placeholder={defaults.emailBody}
                  value={value.emailBody}
                  onFocus={() => setActive({ tier: tier.key, field: "emailBody" })}
                  onChange={(event) => patch(tier.key, { emailBody: event.target.value })}
                />
              </div>
            </div>

            <div className="rounded-xl border border-border p-3">
              <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <MessageSquare size={12} /> Preview · SMS
              </p>
              <pre className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-muted p-2 text-xs text-foreground">
                {renderReminder(effective.sms, SAMPLE)}
              </pre>
              <p className="mt-2 text-xs text-muted-foreground">
                Subject: {renderReminder(effective.emailSubject, SAMPLE)}
              </p>
            </div>

            {canEdit && overridden && (
              <Button
                variant="outline"
                onClick={() =>
                  patch(tier.key, { smsTemplate: "", emailSubject: "", emailBody: "" })
                }
              >
                <RotateCcw size={14} /> Restore default copy
              </Button>
            )}
          </div>
        );
      })}

      <div className="ws-card ws-card-pad space-y-3">
        <h3>Available placeholders</h3>
        <p className="ws-helper">
          Click a template field, then a placeholder to append it. Unknown placeholders are removed
          when the message is rendered.
        </p>
        <div className="flex flex-wrap gap-2">
          {REMINDER_PLACEHOLDERS.map((placeholder) => (
            <button
              type="button"
              key={placeholder.token}
              className="ws-btn"
              disabled={!canEdit || !active}
              onClick={() => insert(placeholder.token)}
              title={placeholder.label}
            >
              {placeholder.token}
            </button>
          ))}
        </div>
        <p className="ws-helper">
          <Clock size={12} className="inline" /> Dispatch times are recalculated from the pickup
          time on each job, so changing a lead time moves every future reminder.
        </p>
      </div>

      {canEdit && (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void save()} disabled={busy}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save
            reminder settings
          </Button>
          {message && <p className="text-sm text-muted-foreground">{message}</p>}
        </div>
      )}
    </section>
  );
}
