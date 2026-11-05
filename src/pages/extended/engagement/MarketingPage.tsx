import { CalendarClock, ExternalLink, Plus, Save } from "lucide-react";
import { useState } from "react";
import type { Campaign, ModuleProps } from "@shared/expansion";
import { crm } from "@/lib/crm";
import { useI18n } from "@/lib/i18n";
import {
  EmptyState,
  Modal,
  useRemote,
} from "@/components/workspace/WorkspaceUI";
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
    () =>
      Promise.all([
        engage.campaigns(),
        crm.sequences(),
        engage.reports(bounds.from, bounds.to),
      ]),
    []
  );
  const [editor, setEditor] = useState<Campaign | "new" | null>(null);
  const [notice, setNotice] = useState("");
  const [running, setRunning] = useState(false);
  const allowed = canSales(role);
  if (loading)
    return <PageLoading label="Loading saved campaign and source records…" />;
  if (error || !data)
    return (
      <PageFailure
        heading="Marketing"
        caption="Campaign records and source metrics from this workspace."
        error={error}
        retry={() => void refresh()}
      />
    );
  const [campaigns, sequences, report] = data;
  const runFollowups = async () => {
    setRunning(true);
    setNotice("");
    try {
      await engage.runFollowups();
      setNotice(
        "Eligible follow-up rules were evaluated. Delivery remains blocked unless a real provider is connected."
      );
    } catch (reason) {
      setNotice(
        reason instanceof Error
          ? reason.message
          : "Could not run follow-up rules."
      );
    } finally {
      setRunning(false);
    }
  };
  return (
    <>
      <PageHead
        heading="Marketing"
        caption="Record campaign source, dates, and spend. Metrics below are calculated from saved workspace data."
        actions={
          <>
            <button
              className="ws-btn"
              disabled={!allowed || running}
              onClick={() => void runFollowups()}
            >
              <CalendarClock size={15} />
              {t(running ? "Running…" : "Run eligible follow-ups")}
            </button>
            {allowed && (
              <button
                className="ws-btn primary"
                onClick={() => setEditor("new")}
              >
                <Plus size={15} />
                {t("Add campaign")}
              </button>
            )}
          </>
        }
      />
      {!allowed && <PermissionNotice />}
      {notice && (
        <div
          className={notice.includes("evaluated") ? "eg-success" : "ws-error"}
        >
          {t(notice)}
        </div>
      )}
      <section className="ws-card ws-card-pad">
        <div className="ws-card-title">
          <div>
            <h2>{t("Campaign log")}</h2>
            <p>
              {t(
                "Spend is stored as integer cents; no ad-platform or email delivery is implied."
              )}
            </p>
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
                <th>{t("Notes")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map(campaign => (
                <tr key={campaign.id}>
                  <td className="ws-table-main">{campaign.name}</td>
                  <td>{campaign.source}</td>
                  <td>
                    {campaign.startDate} — {campaign.endDate}
                  </td>
                  <td>{cents(campaign.spendCents)}</td>
                  <td>{campaign.notes || "—"}</td>
                  <td>
                    {allowed && (
                      <button
                        className="ws-btn"
                        onClick={() => setEditor(campaign)}
                      >
                        {t("Edit")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!campaigns.length && (
          <EmptyState
            title="No saved campaigns"
            detail="Add a campaign to log the source, active period, and actual spend."
            action={
              allowed ? (
                <button
                  className="ws-btn primary"
                  onClick={() => setEditor("new")}
                >
                  {t("Add campaign")}
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
              <p>
                {t(
                  "Current-month saved lead and campaign data; not imported ad-network reporting."
                )}
              </p>
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
          {!report.sources.length && (
            <p className="eg-muted">
              {t("No source metrics have been returned for the current month.")}
            </p>
          )}
        </section>
        <section className="ws-card ws-card-pad">
          <div className="ws-card-title">
            <div>
              <h2>{t("Follow-up sequences")}</h2>
              <p>
                {t(
                  "Sequence editing stays in workspace settings. No outgoing email or SMS is claimed as sent here."
                )}
              </p>
            </div>
          </div>
          <div className="eg-sequence-list">
            {sequences.map(sequence => (
              <div key={sequence.id}>
                <b>{sequence.name}</b>
                <small>
                  {sequence.channel} · {sequence.trigger} ·{" "}
                  {sequence.enabled ? sequence.deliveryStatus : t("disabled")}
                </small>
              </div>
            ))}
          </div>
          {!sequences.length && (
            <p className="eg-muted">
              {t("No saved sequences are configured.")}
            </p>
          )}
          <button className="ws-btn" onClick={() => navigate("/app/settings")}>
            <ExternalLink size={14} />
            {t("Open sequence editor in Settings")}
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
      : emptyCampaign()
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const change = (key: keyof typeof form, value: string | number) =>
    setForm(current => ({ ...current, [key]: value }));
  return (
    <Modal
      title={campaign ? "Edit campaign" : "Add campaign"}
      onClose={onClose}
    >
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
            setError(
              reason instanceof Error
                ? reason.message
                : "Could not save campaign."
            );
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="ws-modal__body">
          <div className="ws-form-grid">
            <label>
              {t("Campaign name")}
              <input
                className="ws-input"
                required
                value={form.name}
                onChange={event => change("name", event.target.value)}
              />
            </label>
            <label>
              {t("Source")}
              <input
                className="ws-input"
                required
                value={form.source}
                onChange={event => change("source", event.target.value)}
              />
            </label>
            <label>
              {t("Start date")}
              <input
                className="ws-input"
                required
                type="date"
                value={form.startDate}
                onChange={event => change("startDate", event.target.value)}
              />
            </label>
            <label>
              {t("End date")}
              <input
                className="ws-input"
                required
                type="date"
                value={form.endDate}
                onChange={event => change("endDate", event.target.value)}
              />
            </label>
            <label>
              {t("Spend (cents)")}
              <input
                className="ws-input"
                required
                type="number"
                min="0"
                step="1"
                value={form.spendCents}
                onChange={event =>
                  change("spendCents", Number(event.target.value))
                }
              />
              <small>
                {t("Integer cents only. Example: 12500 equals $125.00.")}
              </small>
            </label>
            <label className="ws-form-full">
              {t("Notes")}
              <textarea
                className="ws-textarea"
                value={form.notes}
                onChange={event => change("notes", event.target.value)}
              />
            </label>
          </div>
          {error && <div className="ws-error">{t(error)}</div>}
        </div>
        <footer className="ws-modal__foot">
          <button type="button" className="ws-btn" onClick={onClose}>
            {t("Cancel")}
          </button>
          <button className="ws-btn primary" disabled={saving}>
            <Save size={14} />
            {t(saving ? "Saving…" : "Save campaign")}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

export default MarketingPage;
