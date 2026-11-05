import { Ban, CalendarPlus, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import type { CrewMember, Job, Truck } from "@shared/crm";
import { volume, weight } from "@shared/crm";
import type { ModuleProps } from "@shared/expansion";
import { crm } from "@/lib/crm";
import { useI18n } from "@/lib/i18n";
import {
  ErrorNotice,
  LoadingBlock,
  Modal,
  StatusChip,
  useRemote,
} from "@/components/workspace/WorkspaceUI";
import { ops, type Unavailability } from "@/lib/ops-api";
import {
  canAccess,
  dateToday,
  dispatchManagementRoles,
  EmptyRows,
  jobLabel,
  PageHead,
  PermissionNotice,
  SectionTitle,
  shortDate,
  SuccessNotice,
} from "./operations-common";

type OperationsData = {
  blocks: Unavailability[];
  crew: CrewMember[];
  trucks: Truck[];
  jobs: Job[];
};
const loadOperations = async (): Promise<OperationsData> => {
  const [blocks, crew, trucks, jobs] = await Promise.all([
    ops.unavailability(),
    crm.crew(),
    crm.trucks(),
    crm.jobs(),
  ]);
  return { blocks, crew, trucks, jobs };
};
export function OperationsPage({ role }: ModuleProps) {
  const { t } = useI18n();
  if (!canAccess(role, dispatchManagementRoles))
    return (
      <>
        <PageHead
          heading="Operations"
          caption="Resource availability and job-load capacity."
        />
        <PermissionNotice roles={dispatchManagementRoles} />
      </>
    );
  return <OperationsContent />;
}
function OperationsContent() {
  const { t } = useI18n();
  const { data, loading, error, refresh } = useRemote(loadOperations, []);
  const [open, setOpen] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  if (loading) return <LoadingBlock label={t("Loading operations records…")} />;
  if (error || !data)
    return (
      <>
        <PageHead
          heading="Operations"
          caption="Resource availability and job-load capacity."
        />
        <ErrorNotice error={error} retry={() => void refresh()} />
      </>
    );
  const revoke = async (id: number) => {
    setBusy(id);
    try {
      await ops.revokeUnavailability(id);
      await refresh();
      setSuccess(t("Unavailability block revoked."));
    } catch (reason) {
      alert(
        reason instanceof Error ? reason.message : t("Could not revoke block.")
      );
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="ops">
      <PageHead
        heading="Operations"
        caption="Resource blocks and capacity use live crew, fleet, and scheduled-job records."
        actions={
          <>
            <button className="ws-btn" onClick={() => void refresh()}>
              <RefreshCw size={14} />
              {t("Refresh")}
            </button>
            <button
              className="ws-btn primary"
              disabled={!data.crew.length && !data.trucks.length}
              title={
                !data.crew.length && !data.trucks.length
                  ? t("Add a crew member or truck first")
                  : undefined
              }
              onClick={() => setOpen(true)}
            >
              <CalendarPlus size={15} />
              {t("Block resource")}
            </button>
          </>
        }
      />
      <SuccessNotice message={success} />
      <section className="ws-card ws-card-pad">
        <SectionTitle
          title="Resource unavailability"
          detail="Blocks prevent planning resources only after the server accepts the requested date range."
        />
        {data.blocks.length ? (
          <div className="ws-table-wrap">
            <table className="ws-table">
              <thead>
                <tr>
                  <th>{t("Resource")}</th>
                  <th>{t("From")}</th>
                  <th>{t("To")}</th>
                  <th>{t("Reason")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.blocks.map(block => {
                  const name =
                    block.resourceType === "crew"
                      ? data.crew.find(row => row.id === block.resourceId)?.name
                      : data.trucks.find(row => row.id === block.resourceId)
                          ?.name;
                  return (
                    <tr key={block.id}>
                      <td className="ws-table-main">
                        {name || `#${block.resourceId}`}
                        <small>{block.resourceType}</small>
                      </td>
                      <td>{shortDate(block.fromDate)}</td>
                      <td>{shortDate(block.toDate)}</td>
                      <td>{block.reason}</td>
                      <td>
                        <button
                          className="ws-btn danger"
                          disabled={busy === block.id}
                          onClick={() => void revoke(block.id)}
                        >
                          <Ban size={14} />
                          {busy === block.id ? t("Revoking…") : t("Revoke")}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyRows
            title="No resource blocks"
            detail="Create a durable unavailability block for a crew member or truck."
          />
        )}
      </section>
      <CapacityTable jobs={data.jobs} trucks={data.trucks} />
      {open && (
        <UnavailabilityForm
          crew={data.crew}
          trucks={data.trucks}
          onClose={() => setOpen(false)}
          onSaved={async () => {
            await refresh();
            setSuccess(t("Unavailability block saved."));
          }}
        />
      )}
    </div>
  );
}
function CapacityTable({ jobs, trucks }: { jobs: Job[]; trucks: Truck[] }) {
  const { t } = useI18n();
  const rows = useMemo(
    () =>
      jobs
        .filter(job => !/(cancel|complete)/i.test(job.status))
        .map(job => {
          const assigned = trucks.find(truck => truck.id === job.truckId);
          const cuft = volume(job.inventory || []),
            lbs = weight(job.inventory || []);
          return { job, assigned, cuft, lbs };
        }),
    [jobs, trucks]
  );
  return (
    <section className="ws-card ws-card-pad">
      <SectionTitle
        title="Scheduled job capacity"
        detail="Volume and weight are calculated from each job's actual saved inventory; truck limits are not estimated."
      />
      {rows.length ? (
        <div className="ws-table-wrap">
          <table className="ws-table">
            <thead>
              <tr>
                <th>{t("Job")}</th>
                <th>{t("Date")}</th>
                <th>{t("Truck")}</th>
                <th>{t("Inventory volume")}</th>
                <th>{t("Inventory weight")}</th>
                <th>{t("Capacity result")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ job, assigned, cuft, lbs }) => {
                const cuftPct = assigned?.capacityCuft
                  ? Math.round((cuft / assigned.capacityCuft) * 100)
                  : null;
                const lbsPct = assigned?.weightLimit
                  ? Math.round((lbs / assigned.weightLimit) * 100)
                  : null;
                const over = (cuftPct ?? 0) > 100 || (lbsPct ?? 0) > 100;
                return (
                  <tr key={job.id}>
                    <td className="ws-table-main">
                      {jobLabel(job)}
                      <small>{job.status}</small>
                    </td>
                    <td>{shortDate(job.moveDate)}</td>
                    <td>{assigned ? assigned.name : t("Unassigned")}</td>
                    <td>
                      {cuft} {t("cu ft")}
                      {assigned && (
                        <small>
                          {t("Limit")}: {assigned.capacityCuft} {t("cu ft")}
                        </small>
                      )}
                    </td>
                    <td>
                      {lbs} {t("lb")}
                      {assigned && (
                        <small>
                          {t("Limit")}: {assigned.weightLimit} {t("lb")}
                        </small>
                      )}
                    </td>
                    <td>
                      {assigned ? (
                        <StatusChip
                          status={
                            over
                              ? "over capacity"
                              : cuftPct === null && lbsPct === null
                                ? "limits unavailable"
                                : "within limits"
                          }
                        />
                      ) : (
                        <span className="ops-meta">
                          {t("Assign a truck to compare limits.")}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyRows
          title="No active jobs"
          detail="Scheduled jobs with saved inventory will appear here."
        />
      )}
    </section>
  );
}
function UnavailabilityForm({
  crew,
  trucks,
  onClose,
  onSaved,
}: {
  crew: CrewMember[];
  trucks: Truck[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [type, setType] = useState<"crew" | "truck">("crew");
  const [resourceId, setResourceId] = useState(String(crew[0]?.id || ""));
  const [fromDate, setFromDate] = useState(dateToday());
  const [toDate, setToDate] = useState(dateToday());
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const resources = type === "crew" ? crew : trucks;
  const changeType = (next: "crew" | "truck") => {
    setType(next);
    setResourceId(String((next === "crew" ? crew : trucks)[0]?.id || ""));
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resourceId || toDate < fromDate)
      return setError(t("Choose a resource and a valid date range."));
    setSaving(true);
    setError("");
    try {
      await ops.createUnavailability({
        resourceType: type,
        resourceId: Number(resourceId),
        fromDate,
        toDate,
        reason,
      });
      await onSaved();
      onClose();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t("Could not save unavailability.")
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal title="Block resource availability" onClose={onClose}>
      <form className="ws-modal__body ops-form" onSubmit={submit}>
        <div className="ws-form-grid">
          <label className="ws-field">
            <span>{t("Resource type")}</span>
            <select
              className="ws-select"
              value={type}
              onChange={e => changeType(e.target.value as "crew" | "truck")}
            >
              <option value="crew">crew</option>
              <option value="truck">truck</option>
            </select>
          </label>
          <label className="ws-field">
            <span>{t("Resource")}</span>
            <select
              className="ws-select"
              value={resourceId}
              onChange={e => setResourceId(e.target.value)}
            >
              {resources.map(resource => (
                <option key={resource.id} value={resource.id}>
                  {resource.name}
                </option>
              ))}
            </select>
          </label>
          <label className="ws-field">
            <span>{t("From date")}</span>
            <input
              className="ws-input"
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
            />
          </label>
          <label className="ws-field">
            <span>{t("To date")}</span>
            <input
              className="ws-input"
              type="date"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
            />
          </label>
        </div>
        <label className="ws-field">
          <span>{t("Reason")}</span>
          <textarea
            className="ws-textarea"
            required
            value={reason}
            onChange={e => setReason(e.target.value)}
          />
        </label>
        {error && <ErrorNotice error={new Error(error)} />}
        <div className="ops-form-actions">
          <button type="button" className="ws-btn" onClick={onClose}>
            {t("Cancel")}
          </button>
          <button className="ws-btn primary" disabled={saving}>
            {saving ? t("Saving…") : t("Save block")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
