import { Building2, GitBranch, Plus, Save } from "lucide-react";
import { useState } from "react";
import type { Branch } from "@shared/branches";
import type { ModuleProps } from "@shared/expansion";
import { crm, setBranchId } from "@/lib/crm";
import { useI18n } from "@/lib/i18n";
import { EmptyState, Modal, useRemote } from "@/components/workspace/WorkspaceUI";
import { PageFailure, PageHead, PageLoading, PermissionNotice } from "./engagement/EngagementUI";

const money = (cents: number) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(cents / 100);

type BranchForm = Omit<Branch, "id">;

const emptyBranch = (): BranchForm => ({
  name: "",
  code: "",
  address: "",
  phone: "",
  manager: "",
  status: "active",
});

export default function BranchesPage({ role, navigate }: ModuleProps) {
  const { t } = useI18n();
  const { data, loading, error, refresh } = useRemote(
    () => Promise.all([crm.branches(), crm.branchPerformance()]),
    [],
  );
  const [editing, setEditing] = useState<Branch | "new" | null>(null);
  const allowed = role === "admin" || role === "office_admin";

  if (loading) return <PageLoading label="Loading branch performance…" />;
  if (error || !data)
    return (
      <PageFailure
        heading="Branches"
        caption="Office locations and aggregated enterprise performance."
        error={error}
        retry={() => void refresh()}
      />
    );
  const [branches, performance] = data;

  return (
    <>
      <PageHead
        heading="Branches"
        caption="Compare office locations. The top-nav branch selector scopes jobs, schedules, trucks, expenses and reminders."
        actions={
          allowed ? (
            <button className="ws-btn primary" onClick={() => setEditing("new")}>
              <Plus size={15} /> {t("Add branch")}
            </button>
          ) : undefined
        }
      />
      {!allowed && <PermissionNotice />}
      <div className="ws-stat-grid">
        <BranchStat label={t("Active branches")} value={String(branches.filter(branch => branch.status === "active").length)} />
        <BranchStat label={t("All jobs")} value={String(performance.totals.jobs)} />
        <BranchStat label={t("Revenue")} value={money(performance.totals.revenueCents)} />
        <BranchStat label={t("Net contribution")} value={money(performance.totals.netCents)} />
      </div>
      <section className="ws-card ws-card-pad">
        <div className="ws-card-title">
          <div>
            <h2>{t("Enterprise roll-up")}</h2>
            <p>{t("Aggregated from saved jobs and expenses across every branch, regardless of the selected context.")}</p>
          </div>
          <GitBranch size={18} />
        </div>
        <div className="ws-table-wrap">
          <table className="ws-table">
            <thead>
              <tr>
                <th>{t("Branch")}</th>
                <th>{t("Code")}</th>
                <th>{t("Manager")}</th>
                <th>{t("Jobs")}</th>
                <th>{t("Completed")}</th>
                <th>{t("Revenue")}</th>
                <th>{t("Expenses")}</th>
                <th>{t("Net")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {performance.branches.map(branch => (
                <tr key={branch.branchId}>
                  <td className="ws-table-main">
                    <Building2 size={14} /> {branch.name}
                  </td>
                  <td>{branch.code || "—"}</td>
                  <td>{branches.find(item => item.id === branch.branchId)?.manager || "—"}</td>
                  <td>{branch.jobs}</td>
                  <td>{branch.completedJobs}</td>
                  <td>{money(branch.revenueCents)}</td>
                  <td>{money(branch.expensesCents)}</td>
                  <td>{money(branch.netCents)}</td>
                  <td>
                    <button
                      className="ws-btn"
                      onClick={() => {
                        setBranchId(branch.branchId);
                        navigate("/app/dashboard");
                        window.location.reload();
                      }}
                    >
                      {t("Use branch")}
                    </button>
                    {allowed && (
                      <button
                        className="ws-btn"
                        onClick={() => setEditing(branches.find(item => item.id === branch.branchId) ?? null)}
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
        {!branches.length && (
          <EmptyState
            title="No branches configured"
            detail="Add an office location, then assign jobs, trucks and expenses while that branch is selected."
            action={
              allowed ? (
                <button className="ws-btn primary" onClick={() => setEditing("new")}>
                  {t("Add branch")}
                </button>
              ) : undefined
            }
          />
        )}
      </section>
      {editing && (
        <BranchEditor
          branch={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await refresh();
          }}
        />
      )}
    </>
  );
}

function BranchStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="ws-card ws-card-pad">
      <span className="eg-muted">{label}</span>
      <strong style={{ display: "block", fontSize: 24, marginTop: 6 }}>{value}</strong>
    </div>
  );
}

function BranchEditor({
  branch,
  onClose,
  onSaved,
}: {
  branch: Branch | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState<BranchForm>(
    branch
      ? {
          name: branch.name,
          code: branch.code,
          address: branch.address,
          phone: branch.phone,
          manager: branch.manager,
          status: branch.status,
        }
      : emptyBranch(),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const change = (key: keyof BranchForm, value: string) =>
    setForm(current => ({ ...current, [key]: value }));
  return (
    <Modal title={branch ? "Edit branch" : "Add branch"} onClose={onClose}>
      <form
        onSubmit={async event => {
          event.preventDefault();
          setSaving(true);
          setError("");
          try {
            if (branch) await crm.updateBranch(branch.id, form);
            else await crm.createBranch(form);
            await onSaved();
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Could not save the branch.");
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="ws-modal__body">
          <div className="ws-form-grid">
            <label>
              {t("Branch name")}
              <input className="ws-input" required value={form.name} onChange={event => change("name", event.target.value)} />
            </label>
            <label>
              {t("Branch code")}
              <input className="ws-input" maxLength={20} value={form.code} onChange={event => change("code", event.target.value)} />
            </label>
            <label>
              {t("Manager")}
              <input className="ws-input" value={form.manager} onChange={event => change("manager", event.target.value)} />
            </label>
            <label>
              {t("Phone")}
              <input className="ws-input" value={form.phone} onChange={event => change("phone", event.target.value)} />
            </label>
            <label className="ws-form-full">
              {t("Address")}
              <input className="ws-input" value={form.address} onChange={event => change("address", event.target.value)} />
            </label>
            <label>
              {t("Status")}
              <select className="ws-select" value={form.status} onChange={event => change("status", event.target.value)}>
                <option value="active">{t("Active")}</option>
                <option value="inactive">{t("Inactive")}</option>
              </select>
            </label>
          </div>
          {error && <div className="ws-error">{t(error)}</div>}
        </div>
        <footer className="ws-modal__foot">
          <button type="button" className="ws-btn" onClick={onClose}>
            {t("Cancel")}
          </button>
          <button className="ws-btn primary" disabled={saving || !form.name.trim()}>
            <Save size={14} /> {t(saving ? "Saving…" : "Save branch")}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
