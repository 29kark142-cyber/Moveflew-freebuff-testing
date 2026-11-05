import { Edit3, MessageSquarePlus, Plus, RefreshCw } from "lucide-react";
import { useState } from "react";
import type { Job } from "@shared/crm";
import type { Claim, ModuleProps } from "@shared/expansion";
import { CLAIM_STATUSES } from "@shared/expansion";
import { crm } from "@/lib/crm";
import { useI18n } from "@/lib/i18n";
import {
  ErrorNotice,
  LoadingBlock,
  Modal,
  StatusChip,
  useRemote,
} from "@/components/workspace/WorkspaceUI";
import { ops, type ClaimEvent } from "@/lib/ops-api";
import {
  canAccess,
  dateToday,
  dollarsToCents,
  EmptyRows,
  jobLabel,
  money,
  officeFinanceRoles,
  PageHead,
  PermissionNotice,
  SectionTitle,
  shortDate,
  SuccessNotice,
} from "./operations-common";

type ClaimsData = { claims: Claim[]; jobs: Job[] };
const loadClaims = async (): Promise<ClaimsData> => {
  const [claims, jobs] = await Promise.all([ops.claims(), crm.jobs()]);
  return { claims, jobs };
};

export function ClaimsPage({ role }: ModuleProps) {
  const { t } = useI18n();
  if (!canAccess(role, officeFinanceRoles))
    return (
      <>
        <PageHead
          heading="Claims"
          caption="Linked job claims, decisions, and staff notes."
        />
        <PermissionNotice roles={officeFinanceRoles} />
      </>
    );
  return <ClaimsContent />;
}
function ClaimsContent() {
  const { t } = useI18n();
  const { data, loading, error, refresh } = useRemote(loadClaims, []);
  const [create, setCreate] = useState(false);
  const [selected, setSelected] = useState<Claim | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const saved = async (message: string) => {
    await refresh();
    setSuccess(message);
  };
  if (loading) return <LoadingBlock label={t("Loading claims…")} />;
  if (error || !data)
    return (
      <>
        <PageHead
          heading="Claims"
          caption="Linked job claims, decisions, and staff notes."
        />
        <ErrorNotice error={error} retry={() => void refresh()} />
      </>
    );
  return (
    <div className="ops">
      <PageHead
        heading="Claims"
        caption="Actual claims are linked to saved jobs and audited by the server."
        actions={
          <>
            <button className="ws-btn" onClick={() => void refresh()}>
              <RefreshCw size={14} />
              {t("Refresh")}
            </button>
            <button
              className="ws-btn primary"
              disabled={!data.jobs.length}
              onClick={() => setCreate(true)}
            >
              <Plus size={15} />
              {t("New claim")}
            </button>
          </>
        }
      />
      <SuccessNotice message={success} />
      <section className="ws-card ws-card-pad">
        <SectionTitle
          title="Claims register"
          detail="A claim status or approved amount does not promise a refund."
        />
        {data.claims.length ? (
          <div className="ws-table-wrap">
            <table className="ws-table">
              <thead>
                <tr>
                  <th>{t("Claim")}</th>
                  <th>{t("Customer")}</th>
                  <th>{t("Claimed")}</th>
                  <th>{t("Approved")}</th>
                  <th>{t("Due")}</th>
                  <th>{t("Status")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.claims.map(claim => (
                  <tr key={claim.id}>
                    <td className="ws-table-main">
                      {claim.type}
                      <small>{claim.description}</small>
                    </td>
                    <td>{claim.customerName}</td>
                    <td className="ops-money">{money(claim.claimedCents)}</td>
                    <td className="ops-money">{money(claim.approvedCents)}</td>
                    <td>{shortDate(claim.dueDate)}</td>
                    <td>
                      <StatusChip status={claim.status} />
                    </td>
                    <td>
                      <div className="ws-row-actions">
                        <button
                          className="ws-icon-btn"
                          title={t("Edit claim")}
                          onClick={() => setSelected(claim)}
                        >
                          <Edit3 size={15} />
                        </button>
                        <button
                          className="ws-btn"
                          onClick={() => setSelected(claim)}
                        >
                          <MessageSquarePlus size={14} />
                          {t("Notes")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyRows
            title="No claims"
            detail="Create a claim against an existing job when one is reported."
          />
        )}
      </section>
      {create && (
        <ClaimCreate
          jobs={data.jobs}
          onClose={() => setCreate(false)}
          onSaved={saved}
        />
      )}{" "}
      {selected && (
        <ClaimDetail
          claim={selected}
          onClose={() => setSelected(null)}
          onSaved={saved}
        />
      )}
    </div>
  );
}
function ClaimCreate({
  jobs,
  onClose,
  onSaved,
}: {
  jobs: Job[];
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const [jobId, setJobId] = useState(String(jobs[0]?.id || ""));
  const [type, setType] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const claimedCents = dollarsToCents(amount);
    if (claimedCents === null || claimedCents < 0)
      return setError(
        t("Enter a valid claimed amount with no more than two decimals.")
      );
    setSaving(true);
    setError("");
    try {
      await ops.createClaim({
        jobId: Number(jobId),
        type,
        description,
        claimedCents,
        dueDate: dueDate || undefined,
      });
      await onSaved("Claim saved.");
      onClose();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t("Could not save claim.")
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal title="New claim" onClose={onClose} wide>
      <form className="ws-modal__body ops-form" onSubmit={submit}>
        <label className="ws-field">
          <span>{t("Linked job")}</span>
          <select
            className="ws-select"
            value={jobId}
            onChange={e => setJobId(e.target.value)}
          >
            {jobs.map(job => (
              <option key={job.id} value={job.id}>
                {jobLabel(job)}
              </option>
            ))}
          </select>
        </label>
        <div className="ws-form-grid">
          <label className="ws-field">
            <span>{t("Claim type")}</span>
            <input
              className="ws-input"
              required
              value={type}
              onChange={e => setType(e.target.value)}
            />
          </label>
          <label className="ws-field">
            <span>{t("Claimed amount (USD)")}</span>
            <input
              className="ws-input"
              inputMode="decimal"
              required
              value={amount}
              onChange={e => setAmount(e.target.value)}
            />
          </label>
          <label className="ws-field">
            <span>{t("Response due date")}</span>
            <input
              className="ws-input"
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
            />
          </label>
        </div>
        <label className="ws-field">
          <span>{t("Description")}</span>
          <textarea
            className="ws-textarea"
            required
            value={description}
            onChange={e => setDescription(e.target.value)}
          />
        </label>
        {error && <ErrorNotice error={new Error(error)} />}
        <div className="ops-form-actions">
          <button type="button" className="ws-btn" onClick={onClose}>
            {t("Cancel")}
          </button>
          <button className="ws-btn primary" disabled={saving}>
            {saving ? t("Saving…") : t("Save claim")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function ClaimDetail({
  claim,
  onClose,
  onSaved,
}: {
  claim: Claim;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const [status, setStatus] = useState(claim.status);
  const [approved, setApproved] = useState(
    (claim.approvedCents / 100).toFixed(2)
  );
  const [resolution, setResolution] = useState(claim.resolution || "");
  const [dueDate, setDueDate] = useState(claim.dueDate || "");
  const [note, setNote] = useState("");
  const [events, setEvents] = useState<ClaimEvent[] | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const loadEvents = async () => {
    try {
      setEvents(await ops.claimEvents(claim.id));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t("Could not load claim notes.")
      );
    }
  };
  const save = async () => {
    const approvedCents = dollarsToCents(approved);
    if (approvedCents === null || approvedCents < 0)
      return setError(
        t("Enter a valid approved amount with no more than two decimals.")
      );
    setSaving(true);
    setError("");
    try {
      await ops.updateClaim(claim.id, {
        status,
        approvedCents,
        resolution,
        dueDate: dueDate || undefined,
      });
      await onSaved("Claim updated.");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t("Could not update claim.")
      );
    } finally {
      setSaving(false);
    }
  };
  const addNote = async () => {
    if (!note.trim()) return;
    setSaving(true);
    setError("");
    try {
      await ops.createClaimEvent(claim.id, note.trim());
      setNote("");
      await loadEvents();
      await onSaved("Claim note saved.");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t("Could not save claim note.")
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal title="Claim detail" onClose={onClose} wide>
      <div className="ws-modal__body ops-form">
        <p className="ops-legal-note">
          {t(
            "Claims are tracked records. Approval and resolution values are not a refund promise."
          )}
        </p>
        <div className="ws-form-grid">
          <label className="ws-field">
            <span>{t("Status")}</span>
            <select
              className="ws-select"
              value={status}
              onChange={e => setStatus(e.target.value)}
            >
              {CLAIM_STATUSES.map(value => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="ws-field">
            <span>{t("Approved amount (USD)")}</span>
            <input
              className="ws-input"
              inputMode="decimal"
              value={approved}
              onChange={e => setApproved(e.target.value)}
            />
          </label>
          <label className="ws-field">
            <span>{t("Due date")}</span>
            <input
              className="ws-input"
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
            />
          </label>
        </div>
        <label className="ws-field">
          <span>{t("Resolution")}</span>
          <textarea
            className="ws-textarea"
            value={resolution}
            onChange={e => setResolution(e.target.value)}
          />
        </label>
        <div className="ops-form-actions">
          <button
            className="ws-btn primary"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? t("Saving…") : t("Save claim changes")}
          </button>
        </div>
        <section>
          <SectionTitle
            title="Staff note timeline"
            detail="Notes are durable claim events."
            action={
              <button className="ws-btn" onClick={() => void loadEvents()}>
                {t("Load notes")}
              </button>
            }
          />
          {events?.length ? (
            <div className="ops-timeline">
              {events.map(event => (
                <div className="ops-timeline__row" key={event.id}>
                  {event.note}
                  <small>{shortDate(event.createdAt)}</small>
                </div>
              ))}
            </div>
          ) : events ? (
            <EmptyRows
              title="No claim notes"
              detail="Add the first internal note below."
            />
          ) : null}
          <div className="ops-inline-form">
            <label className="ws-field">
              <span>{t("Internal note")}</span>
              <input
                className="ws-input"
                value={note}
                onChange={e => setNote(e.target.value)}
              />
            </label>
            <button
              className="ws-btn"
              disabled={saving || !note.trim()}
              onClick={() => void addNote()}
            >
              {t("Add note")}
            </button>
          </div>
        </section>
        {error && <ErrorNotice error={new Error(error)} />}
      </div>
    </Modal>
  );
}
