import { ExternalLink, Plus, Save, Send } from "lucide-react";
import { useState } from "react";
import type { Campaign, ModuleProps } from "@shared/expansion";
import { marketingRates } from "@shared/marketing";
import { crm } from "@/lib/crm";
import { useI18n } from "@/lib/i18n";
import { EmptyState, Modal, useRemote } from "@/components/workspace/WorkspaceUI";
import { engage } from "@/lib/engage-api";
import {
  PageFailure,
  PageHead,
  PageLoading,
  PermissionNotice,
  canSales,
  cents,
  monthBounds,
} from "./EngagementUI";

const today = () => new Date().toISOString().slice(0, 10);
type CampaignForm = Omit<Campaign, "id">;
const emptyCampaign = (): CampaignForm => ({
  name: "",
  source: "",
  startDate: today(),
  endDate: today(),
  spendCents: 0,
  notes: "",
});

export function MarketingPage({ role, navigate }: ModuleProps) {
  const { t } = useI18n();
  const bounds = monthBounds(new Date().toISOString().slice(0, 7));
  const { data, loading, error, refresh } = useRemote(
    () => Promise.all([engage.marketing(), crm.sequences(), engage.reports(bounds.from, bounds.to)]),
    [],
  );
  const [editor, setEditor] = useState<Campaign | "new" | null>(null);
  const [campaignId, setCampaignId] = useState("");
  const [notice, setNotice] = useState("");
  const [running, setRunning] = useState(false);
  const allowed = canSales(role);
  if (loading) return <PageLoading label="Loading re-engagement triggers and campaign records…" />;
  if (error || !data)
    return (
      <PageFailure
        heading="Marketing"
        caption="Re-engagement triggers, delivery tracking and campaign records."
        error={error}
        retry={() => void refresh()}
      />
    );
  const [marketing, sequences, report] = data;
  const campaigns = marketing.campaigns;
  const selectedCampaign = campaigns.find(campaign => campaign.id === Number(campaignId));
  const runFollowups = async () => {
    setRunning(true);
    setNotice("");
    try {
      const result = (await engage.runFollowups(selectedCampaign?.id ?? null)) as {
        created?: number;
        sent?: number;
        blocked?: number;
        failed?: number;
      };
      setNotice(
        `Evaluated ${marketing.triggers.length} trigger${marketing.triggers.length === 1 ? "" : "s"}${selectedCampaign ? ` for ${selectedCampaign.name}` : ""}: ${result.created ?? 0} recorded, ${result.sent ?? 0} accepted by a provider, ${result.blocked ?? 0} blocked and ${result.failed ?? 0} failed.`,
      );
      await refresh();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Could not run re-engagement.");
    } finally {
      setRunning(false);
    }
  };
  return (
    <>
      <PageHead
        heading="Marketing"
        caption="Automated follow-ups for expired quotes, unconfirmed estimates and move anniversaries, with provider-backed open, click and booking tracking."
        actions={
          <>
            {campaigns.length > 0 && (
              <select
                className="ws-select"
                aria-label={t("Campaign attribution")}
                title={t("Attribute this run's tracked sends and bookings to a campaign")}
                value={campaignId}
                disabled={!allowed || running}
                onChange={event => setCampaignId(event.target.value)}
              >
                <option value="">{t("No campaign attribution")}</option>
                {campaigns.map(campaign => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </option>
                ))}
              </select>
            )}
            <button className="ws-btn" disabled={!allowed || running} onClick={() => void runFollowups()}>
              <Send size={15} /> {t(running ? "Running…" : "Run re-engagement")}
            </button>
            {allowed && (
              <button className="ws-btn primary" onClick={() => setEditor("new")}>
                <Plus size={15} /> {t("Add campaign")}
              </button>
            )}
          </>
        }
      />
      {!allowed && <PermissionNotice />}
      {notice && <div className={notice.includes("blocked") || notice.includes("failed") ? "ws-alert" : "eg-success"}>{t(notice)}</div>}
      <div className="ws-stat-grid">
        <Metric label={t("Eligible triggers")} value={String(marketing.triggers.length)} hint={t("Not yet sent for this customer and rule")} />
        <Metric label={t("Open rate")} value={`${marketing.rates.openRate}%`} hint={`${marketing.rates.opened}/${marketing.rates.sent} accepted sends`} />
        <Metric label={t("Click rate")} value={`${marketing.rates.clickRate}%`} hint={`${marketing.rates.clicked} tracked link clicks`} />
        <Metric label={t("Converted")} value={`${marketing.rates.conversionRate}%`} hint={`${marketing.rates.converted} bookings after a touch`} />
      </div>
      <section className="ws-card ws-card-pad">
        <div className="ws-card-title">
          <div>
            <h2>{t("Re-engagement queue")}</h2>
            <p>
              {t("Expired quotes, three-day-old unconfirmed estimates and moves from this week one year ago. Prior sends are deduplicated.")}
            </p>
          </div>
          <span className="eg-muted">
            {marketing.providers.email ? t("Email connected") : t("Email not configured")} ·{" "}
            {marketing.providers.sms ? t("SMS connected") : t("SMS not configured")}
          </span>
        </div>
        <div className="ws-table-wrap">
          <table className="ws-table">
            <thead>
              <tr>
                <th>{t("Customer")}</th>
                <th>{t("Trigger")}</th>
                <th>{t("Reason")}</th>
                <th>{t("Channel")}</th>
                <th>{t("Job")}</th>
              </tr>
            </thead>
            <tbody>
              {marketing.triggers.map(trigger => (
                <tr key={trigger.key}>
                  <td className="ws-table-main">{trigger.customerName}</td>
                  <td>{trigger.kind.replace(/_/g, " ")}</td>
                  <td>{trigger.reason}</td>
                  <td>{trigger.channel}</td>
                  <td>{trigger.jobId ? `#${trigger.jobId}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!marketing.triggers.length && (
          <EmptyState
            title={t("No eligible follow-ups")}
            detail={t("Saved expired quotes, stale estimates and anniversaries will appear here. Already-sent rules stay hidden.")}
          />
        )}
      </section>
      <section className="ws-card ws-card-pad">
        <div className="ws-card-title">
          <div>
            <h2>{t("Campaign log")}</h2>
            <p>{t("Campaign spend is stored in integer cents. Choose a campaign before a run to attribute that run's tracked sends and bookings to it.")}</p>
          </div>
        </div>
        <div className="ws-table-wrap">
          <table className="ws-table">
            <thead>
              <tr>
                <th>{t("Campaign")}</th>
                <th>{t("Source")}</th>
                <th>{t("Period")}</th>
                <th>{t("Spend")}</th>
                <th>{t("Sent")}</th>
                <th>{t("Open")}</th>
                <th>{t("Click")}</th>
                <th>{t("Booked")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {campaigns.map(campaign => {
                const rates = marketingRates(
                  marketing.touches.filter(touch => touch.campaignId === campaign.id),
                );
                return (
                  <tr key={campaign.id}>
                    <td className="ws-table-main">{campaign.name}</td>
                    <td>{campaign.source}</td>
                    <td>{campaign.startDate} — {campaign.endDate}</td>
                    <td>{cents(campaign.spendCents)}</td>
                    <td>{rates.sent}</td>
                    <td>{rates.openRate}%</td>
                    <td>{rates.clickRate}%</td>
                    <td>{rates.converted}</td>
                    <td>
                      {allowed && (
                        <button className="ws-btn" onClick={() => setEditor(campaign)}>
                          {t("Edit")}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!campaigns.length && (
          <EmptyState
            title={t("No saved campaigns")}
            detail={t("Add a campaign to log its source, active period and actual spend.")}
            action={
              allowed ? (
                <button className="ws-btn primary" onClick={() => setEditor("new")}>
                  <Plus size={14} /> {t("Add campaign")}
                </button>
              ) : undefined
            }
          />
        )}
      </section>
      <div className="ws-grid eg-marketing-grid">
        <section className="ws-card ws-card-pad">
          <div className="ws-card-title">
            <div>
              <h2>{t("Current source metrics")}</h2>
              <p>{t("Current-month saved lead and campaign data; not imported ad-network reporting.")}</p>
            </div>
          </div>
          <div className="ws-table-wrap">
            <table className="ws-table">
              <thead>
                <tr>
                  <th>{t("Source")}</th>
                  <th>{t("Leads")}</th>
                  <th>{t("Booked")}</th>
                  <th>{t("Spend")}</th>
                </tr>
              </thead>
              <tbody>
                {report.sources.map(row => (
                  <tr key={row.source}>
                    <td>{row.source || "—"}</td>
                    <td>{row.leads}</td>
                    <td>{row.booked}</td>
                    <td>{cents(row.spendCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!report.sources.length && <p className="eg-muted">{t("No source metrics have been returned for the current month.")}</p>}
        </section>
        <section className="ws-card ws-card-pad">
          <div className="ws-card-title">
            <div>
              <h2>{t("Follow-up sequences")}</h2>
              <p>{t("Sequence editing stays in workspace settings. Scheduled messages are only claimed once a provider accepts them.")}</p>
            </div>
          </div>
          <div className="eg-sequence-list">
            {sequences.map(sequence => (
              <div key={sequence.id}>
                <b>{sequence.name}</b>
                <small>
                  {sequence.channel} · {sequence.trigger} · {sequence.enabled ? sequence.deliveryStatus : t("disabled")}
                </small>
              </div>
            ))}
          </div>
          {!sequences.length && <p className="eg-muted">{t("No saved sequences are configured.")}</p>}
          <button className="ws-btn" onClick={() => navigate("/app/settings")}>
            <ExternalLink size={14} /> {t("Open sequence editor in Settings")}
          </button>
        </section>
      </div>
      {editor && (
        <CampaignEditor
          campaign={editor === "new" ? null : editor}
          onClose={() => setEditor(null)}
          onSaved={async () => {
            setEditor(null);
            await refresh();
          }}
        />
      )}
    </>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="ws-card ws-card-pad">
      <span className="eg-muted">{label}</span>
      <strong style={{ display: "block", fontSize: 24, marginTop: 6 }}>{value}</strong>
      <small className="eg-muted">{hint}</small>
    </div>
  );
}

function CampaignEditor({
  campaign,
  onClose,
  onSaved,
}: {
  campaign: Campaign | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState<CampaignForm>(
    campaign
      ? {
          name: campaign.name,
          source: campaign.source,
          startDate: campaign.startDate,
          endDate: campaign.endDate,
          spendCents: campaign.spendCents,
          notes: campaign.notes,
        }
      : emptyCampaign(),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const change = (key: keyof typeof form, value: string | number) =>
    setForm(current => ({ ...current, [key]: value }));
  return (
    <Modal title={campaign ? "Edit campaign" : "Add campaign"} onClose={onClose}>
      <form
        onSubmit={async event => {
          event.preventDefault();
          setSaving(true);
          setError("");
          try {
            if (campaign) await engage.updateCampaign(campaign.id, form);
            else await engage.createCampaign(form);
            await onSaved();
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Could not save campaign.");
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="ws-modal__body">
          <div className="ws-form-grid">
            <label>
              {t("Campaign name")}
              <input className="ws-input" required value={form.name} onChange={event => change("name", event.target.value)} />
            </label>
            <label>
              {t("Source")}
              <input className="ws-input" required value={form.source} onChange={event => change("source", event.target.value)} />
            </label>
            <label>
              {t("Start date")}
              <input className="ws-input" required type="date" value={form.startDate} onChange={event => change("startDate", event.target.value)} />
            </label>
            <label>
              {t("End date")}
              <input className="ws-input" required type="date" value={form.endDate} onChange={event => change("endDate", event.target.value)} />
            </label>
            <label>
              {t("Spend (cents)")}
              <input className="ws-input" required type="number" min="0" step="1" value={form.spendCents} onChange={event => change("spendCents", Number(event.target.value))} />
              <small>{t("Integer cents only. Example: 12500 equals $125.00.")}</small>
            </label>
            <label className="ws-form-full">
              {t("Notes")}
              <textarea className="ws-textarea" value={form.notes} onChange={event => change("notes", event.target.value)} />
            </label>
          </div>
          {error && <div className="ws-error">{t(error)}</div>}
        </div>
        <footer className="ws-modal__foot">
          <button type="button" className="ws-btn" onClick={onClose}>
            {t("Cancel")}
          </button>
          <button className="ws-btn primary" disabled={saving}>
            <Save size={14} /> {t(saving ? "Saving…" : "Save campaign")}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

export default MarketingPage;
