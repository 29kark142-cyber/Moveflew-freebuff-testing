import {
  Mail,
  MessageSquareText,
  Phone,
  Plus,
  Save,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ModuleProps } from "@shared/expansion";
import { crm } from "@/lib/crm";
import { useI18n } from "@/lib/i18n";
import { EmptyState, useRemote } from "@/components/workspace/WorkspaceUI";
import { engage, type CustomerPreferences } from "@/lib/engage-api";
import {
  PageFailure,
  PageHead,
  PageLoading,
  PermissionNotice,
  StatusChip,
  canSales,
  formatDate,
} from "./EngagementUI";

const defaultPreferences: CustomerPreferences = {
  emailConsent: false,
  smsConsent: false,
  optedOut: false,
  tags: [],
  assignedUserId: null,
  utm: {},
};

export function CommunicationsPage({ role }: ModuleProps) {
  const { t } = useI18n();
  const { data, loading, error, refresh } = useRemote(
    () => Promise.all([crm.customers(), crm.jobs(), engage.communications()]),
    []
  );
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [channel, setChannel] = useState("all");
  const [direction, setDirection] = useState("all");
  const [draft, setDraft] = useState({
    channel: "note" as "note" | "call" | "email" | "sms",
    direction: "inbound" as "inbound" | "outbound",
    body: "",
    jobId: "",
  });
  const [preferences, setPreferences] =
    useState<CustomerPreferences>(defaultPreferences);
  const [prefLoading, setPrefLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const allowed = canSales(role);
  const customers = data?.[0] || [];
  const jobs = data?.[1] || [];
  const communications = data?.[2] || [];
  const selected =
    customers.find(customer => customer.id === customerId) || null;

  useEffect(() => {
    if (!customerId) {
      setPreferences(defaultPreferences);
      return;
    }
    let active = true;
    setPrefLoading(true);
    setNotice("");
    void engage
      .preferences(customerId)
      .then(value => {
        if (active)
          setPreferences({
            ...defaultPreferences,
            ...value,
            utm: value.utm || {},
          });
      })
      .catch(
        reason =>
          active &&
          setNotice(
            reason instanceof Error
              ? reason.message
              : "Could not load contact preferences."
          )
      )
      .finally(() => active && setPrefLoading(false));
    return () => {
      active = false;
    };
  }, [customerId]);

  const shown = useMemo(
    () =>
      communications
        .filter(row => !customerId || row.customerId === customerId)
        .filter(row => channel === "all" || row.channel === channel)
        .filter(row => direction === "all" || row.direction === direction)
        .sort((a, b) => `${b.createdAt}`.localeCompare(`${a.createdAt}`)),
    [communications, customerId, channel, direction]
  );

  if (loading) return <PageLoading label="Loading communication records…" />;
  if (error || !data)
    return (
      <PageFailure
        heading="Communications"
        caption="Chronological records from this workspace."
        error={error}
        retry={() => void refresh()}
      />
    );

  const savePreferences = async () => {
    if (!customerId || !allowed) return;
    setSaving(true);
    setNotice("");
    try {
      await engage.updatePreferences(customerId, preferences);
      setNotice("Contact preferences saved.");
    } catch (reason) {
      setNotice(
        reason instanceof Error
          ? reason.message
          : "Could not save contact preferences."
      );
    } finally {
      setSaving(false);
    }
  };
  const record = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!customerId || !allowed) return;
    setSaving(true);
    setNotice("");
    try {
      const row = await engage.createCommunication({
        customerId,
        jobId: draft.jobId ? Number(draft.jobId) : undefined,
        channel: draft.channel,
        direction: draft.direction,
        body: draft.body,
      });
      setDraft(current => ({ ...current, body: "" }));
      setNotice(
        row.status === "blocked_not_connected"
          ? "Draft recorded as blocked: no connected delivery provider was used."
          : "Communication record saved."
      );
      await refresh();
    } catch (reason) {
      setNotice(
        reason instanceof Error
          ? reason.message
          : "Could not save this communication record."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHead
        heading="Communications"
        caption="Record customer conversations; no email or SMS is sent without a connected provider and consent."
      />
      {!allowed && <PermissionNotice />}
      {notice && (
        <div
          className={/saved|recorded/.test(notice) ? "eg-success" : "ws-error"}
        >
          {t(notice)}
        </div>
      )}
      <div className="eg-communications-grid">
        <aside className="ws-card ws-card-pad eg-directory">
          <h2>{t("Customer directory")}</h2>
          <label>
            {t("Select a saved customer")}
            <select
              className="ws-select"
              value={customerId || ""}
              onChange={event =>
                setCustomerId(
                  event.target.value ? Number(event.target.value) : null
                )
              }
            >
              <option value="">{t("All customer records")}</option>
              {customers.map(customer => (
                <option key={customer.id} value={customer.id}>
                  {customer.name} —{" "}
                  {customer.email || customer.phone || t("No contact details")}
                </option>
              ))}
            </select>
          </label>
          {selected && (
            <div className="eg-customer-summary">
              <UserCard
                name={selected.name}
                detail={
                  selected.email || selected.phone || t("No contact details")
                }
              />
              <StatusChip status={selected.status} />
            </div>
          )}
          {selected && (
            <section className="eg-consent-box">
              <h3>{t("Consent and preferences")}</h3>
              {prefLoading ? (
                <p>{t("Loading preferences…")}</p>
              ) : (
                <>
                  <label className="ws-checkbox">
                    <input
                      type="checkbox"
                      checked={preferences.emailConsent}
                      disabled={!allowed}
                      onChange={event =>
                        setPreferences(value => ({
                          ...value,
                          emailConsent: event.target.checked,
                        }))
                      }
                    />
                    {t("Email consent")}
                  </label>
                  <label className="ws-checkbox">
                    <input
                      type="checkbox"
                      checked={preferences.smsConsent}
                      disabled={!allowed}
                      onChange={event =>
                        setPreferences(value => ({
                          ...value,
                          smsConsent: event.target.checked,
                        }))
                      }
                    />
                    {t("SMS consent")}
                  </label>
                  <label className="ws-checkbox">
                    <input
                      type="checkbox"
                      checked={preferences.optedOut}
                      disabled={!allowed}
                      onChange={event =>
                        setPreferences(value => ({
                          ...value,
                          optedOut: event.target.checked,
                        }))
                      }
                    />
                    {t("Opted out of contact")}
                  </label>
                  <button
                    className="ws-btn"
                    disabled={!allowed || saving}
                    onClick={() => void savePreferences()}
                  >
                    <Save size={14} />
                    {t("Save preferences")}
                  </button>
                </>
              )}
            </section>
          )}
        </aside>
        <section className="eg-activity">
          <div className="ws-card ws-card-pad">
            <div className="ws-card-title">
              <div>
                <h2>{t("Activity")}</h2>
                <p>{t("Newest saved event first.")}</p>
              </div>
              <div className="eg-event-filters">
                <select
                  className="ws-select"
                  value={channel}
                  onChange={event => setChannel(event.target.value)}
                >
                  <option value="all">{t("All channels")}</option>
                  {["note", "call", "email", "sms"].map(value => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
                <select
                  className="ws-select"
                  value={direction}
                  onChange={event => setDirection(event.target.value)}
                >
                  <option value="all">{t("All directions")}</option>
                  {["inbound", "outbound"].map(value => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="eg-timeline">
              {shown.map(row => (
                <article className="eg-event" key={row.id}>
                  <div className="eg-event__icon">
                    {row.channel === "call" ? (
                      <Phone size={15} />
                    ) : row.channel === "note" ? (
                      <MessageSquareText size={15} />
                    ) : (
                      <Mail size={15} />
                    )}
                  </div>
                  <div>
                    <div className="eg-event__head">
                      <b>{row.customerName}</b>
                      <span>
                        {row.channel} · {row.direction}
                      </span>
                      <StatusChip status={row.status} />
                    </div>
                    <p>{row.body}</p>
                    <small>
                      {formatDate(row.createdAt, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </small>
                  </div>
                </article>
              ))}
            </div>
            {!shown.length && (
              <EmptyState
                title="No saved communication records"
                detail="Choose a customer and add a manual note, call, or inbound message."
              />
            )}
          </div>
          <form className="ws-card ws-card-pad eg-compose" onSubmit={record}>
            <div className="ws-card-title">
              <div>
                <h2>{t("Record communication")}</h2>
                <p>
                  {t(
                    "Calls and notes are manual logs. Outbound email/SMS remains a blocked draft until a provider is connected."
                  )}
                </p>
              </div>
              <Plus size={18} />
            </div>
            {!selected ? (
              <p className="eg-muted">
                {t("Select one saved customer before recording an event.")}
              </p>
            ) : (
              <div className="ws-form-grid three">
                <label>
                  {t("Channel")}
                  <select
                    className="ws-select"
                    value={draft.channel}
                    disabled={!allowed}
                    onChange={event =>
                      setDraft(value => ({
                        ...value,
                        channel: event.target.value as typeof draft.channel,
                      }))
                    }
                  >
                    {["note", "call", "email", "sms"].map(value => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("Direction")}
                  <select
                    className="ws-select"
                    value={draft.direction}
                    disabled={!allowed}
                    onChange={event =>
                      setDraft(value => ({
                        ...value,
                        direction: event.target.value as typeof draft.direction,
                      }))
                    }
                  >
                    {["inbound", "outbound"].map(value => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("Related job (optional)")}
                  <select
                    className="ws-select"
                    value={draft.jobId}
                    disabled={!allowed}
                    onChange={event =>
                      setDraft(value => ({
                        ...value,
                        jobId: event.target.value,
                      }))
                    }
                  >
                    <option value="">{t("No related job")}</option>
                    {jobs
                      .filter(job => job.customerId === selected.id)
                      .map(job => (
                        <option key={job.id} value={job.id}>
                          {job.title || `Job #${job.id}`}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="ws-form-full">
                  {t("Record")}
                  <textarea
                    className="ws-textarea"
                    required
                    disabled={!allowed}
                    value={draft.body}
                    onChange={event =>
                      setDraft(value => ({
                        ...value,
                        body: event.target.value,
                      }))
                    }
                  />
                </label>
                {draft.direction === "outbound" &&
                  ["email", "sms"].includes(draft.channel) && (
                    <p className="ws-form-full eg-blocked">
                      <strong>{t("Blocked draft")}</strong> —{" "}
                      {t(
                        "Saving this does not send a message. It is recorded as blocked until a real provider and recipient consent are available."
                      )}
                    </p>
                  )}
                <div className="ws-form-full">
                  <button
                    className="ws-btn primary"
                    disabled={!allowed || saving}
                  >
                    {t(
                      draft.direction === "outbound" &&
                        ["email", "sms"].includes(draft.channel)
                        ? "Save blocked draft"
                        : "Save manual record"
                    )}
                  </button>
                </div>
              </div>
            )}
          </form>
        </section>
      </div>
    </>
  );
}

function UserCard({ name, detail }: { name: string; detail: string }) {
  return (
    <div className="eg-user-card">
      <span>
        <UserRound size={16} />
      </span>
      <div>
        <b>{name}</b>
        <small>{detail}</small>
      </div>
    </div>
  );
}

export default CommunicationsPage;
