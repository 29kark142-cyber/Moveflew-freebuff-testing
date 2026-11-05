import { Filter, GripVertical, Plus, Search, UserRound } from "lucide-react";
import { useMemo, useState } from "react";
import type { Customer } from "@shared/crm";
import { PIPELINE_STAGES, type ModuleProps } from "@shared/expansion";
import { crm } from "@/lib/crm";
import { useI18n } from "@/lib/i18n";
import {
  EmptyState,
  Modal,
  useRemote,
} from "@/components/workspace/WorkspaceUI";
import {
  PageFailure,
  PageHead,
  PageLoading,
  PermissionNotice,
  StatusChip,
  canSales,
} from "./EngagementUI";

type LeadForm = Pick<
  Customer,
  "name" | "email" | "phone" | "source" | "score" | "status" | "notes"
>;
const newLead: LeadForm = {
  name: "",
  email: "",
  phone: "",
  source: "",
  score: 0,
  status: "lead",
  notes: "",
};

export function PipelinePage({ role, navigate }: ModuleProps) {
  const { t } = useI18n();
  const { data, loading, error, refresh, setData } = useRemote(
    () => Promise.all([crm.customers(), crm.members()]),
    []
  );
  const [search, setSearch] = useState("");
  const [scoreFloor, setScoreFloor] = useState("");
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [editor, setEditor] = useState<Customer | "new" | null>(null);
  const [actionError, setActionError] = useState("");
  const allowed = canSales(role);

  // Website intake stores brand-new leads as "new"; show them in the first stage.
  const customers = (data?.[0] || []).map(c =>
    (PIPELINE_STAGES as readonly string[]).includes(c.status) ? c : { ...c, status: "lead" }
  );
  const visible = useMemo(
    () =>
      customers.filter(customer => {
        const text =
          `${customer.name} ${customer.email} ${customer.phone} ${customer.source}`.toLowerCase();
        return (
          text.includes(search.toLowerCase()) &&
          (!scoreFloor || Number(customer.score || 0) >= Number(scoreFloor))
        );
      }),
    [customers, search, scoreFloor]
  );
  const stages = [...PIPELINE_STAGES];
  const move = async (customer: Customer, status: string) => {
    if (!allowed || customer.status === status) return;
    setActionError("");
    try {
      const saved = await crm.updateCustomer(customer.id, { status });
      setData(current =>
        current
          ? [
              current[0].map(row => (row.id === customer.id ? saved : row)),
              current[1],
            ]
          : current
      );
    } catch (reason) {
      setActionError(
        reason instanceof Error
          ? reason.message
          : "Could not update this lead stage."
      );
    }
  };

  if (loading) return <PageLoading label="Loading saved pipeline records…" />;
  if (error || !data)
    return (
      <PageFailure
        heading="Pipeline"
        caption="Customer stages from this workspace."
        error={error}
        retry={() => void refresh()}
      />
    );

  return (
    <>
      <PageHead
        heading="Pipeline"
        caption="Move saved customer records through your actual sales stages."
        actions={
          allowed ? (
            <button className="ws-btn primary" onClick={() => setEditor("new")}>
              <Plus size={15} /> {t("Add lead")}
            </button>
          ) : undefined
        }
      />
      {!allowed && <PermissionNotice />}
      {actionError && <div className="ws-error">{t(actionError)}</div>}
      <div className="ws-toolbar eg-toolbar">
        <label className="ws-search">
          <Search size={15} />
          <input
            className="ws-input search"
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder={t("Search saved leads")}
          />
        </label>
        <label className="eg-inline-label">
          <Filter size={14} /> {t("Minimum score")}
          <input
            className="ws-input eg-score-filter"
            type="number"
            min="0"
            max="100"
            value={scoreFloor}
            onChange={event => setScoreFloor(event.target.value)}
          />
        </label>
      </div>
      <div className="eg-pipeline" aria-label={t("Sales pipeline")}>
        {stages.map(stage => {
          const rows = visible.filter(customer => customer.status === stage);
          return (
            <section
              key={stage}
              className="eg-stage"
              aria-label={stage}
              onDragOver={event => allowed && event.preventDefault()}
              onDrop={event => {
                event.preventDefault();
                const found = customers.find(
                  customer => customer.id === draggedId
                );
                if (found) void move(found, stage);
                setDraggedId(null);
              }}
            >
              <header className="eg-stage__head">
                <StatusChip status={stage} />
                <b>{rows.length}</b>
              </header>
              <div className="eg-stage__cards">
                {rows.map(customer => (
                  <article
                    key={customer.id}
                    className="eg-lead-card"
                    draggable={allowed}
                    onDragStart={() => setDraggedId(customer.id)}
                    onDragEnd={() => setDraggedId(null)}
                  >
                    <div className="eg-lead-card__head">
                      <GripVertical size={15} aria-hidden="true" />
                      <button
                        className="eg-card-name"
                        onClick={() => setEditor(customer)}
                      >
                        {customer.name}
                      </button>
                    </div>
                    <small>
                      {customer.email ||
                        customer.phone ||
                        t("No contact details")}
                    </small>
                    <div className="eg-lead-card__meta">
                      <span>{customer.source || t("No source")}</span>
                      <b>
                        {t("Score")} {customer.score}
                      </b>
                    </div>
                    {allowed && (
                      <button
                        className="ws-btn"
                        style={{ width: "100%", justifyContent: "center" }}
                        onClick={() => {
                          sessionStorage.setItem("nwcrewcrm.estimate-lead", String(customer.id));
                          navigate("/app/estimates/new");
                        }}
                      >
                        {t("Create estimate")}
                      </button>
                    )}
                    <label className="eg-card-move">
                      <span className="sr-only">
                        {t("Move stage for {name}", { name: customer.name })}
                      </span>
                      <select
                        value={customer.status}
                        disabled={!allowed}
                        onChange={event =>
                          void move(customer, event.target.value)
                        }
                      >
                        {stages.map(value => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </label>
                  </article>
                ))}
                {!rows.length && (
                  <p className="eg-stage__empty">
                    {t("No saved leads in this stage.")}
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>
      {!visible.length && (
        <EmptyState
          title="No matching saved leads"
          detail="Adjust the search or score filter to view customer records."
          action={
            allowed ? (
              <button
                className="ws-btn primary"
                onClick={() => setEditor("new")}
              >
                {t("Add lead")}
              </button>
            ) : undefined
          }
        />
      )}
      {editor && (
        <LeadEditor
          customer={editor === "new" ? null : editor}
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

function LeadEditor({
  customer,
  onClose,
  onSaved,
}: {
  customer: Customer | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState<LeadForm>(
    customer
      ? {
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          source: customer.source,
          score: customer.score,
          status: customer.status,
          notes: customer.notes,
        }
      : newLead
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const field = (key: keyof LeadForm, value: string | number) =>
    setForm(current => ({ ...current, [key]: value }));
  return (
    <Modal
      title={customer ? "Lead details" : "Add lead"}
      onClose={onClose}
      wide
    >
      <form
        onSubmit={async event => {
          event.preventDefault();
          setSaving(true);
          setError("");
          try {
            if (customer) await crm.updateCustomer(customer.id, form);
            else await crm.createCustomer(form);
            await onSaved();
          } catch (reason) {
            setError(
              reason instanceof Error
                ? reason.message
                : "Could not save this lead."
            );
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="ws-modal__body">
          <div className="ws-form-grid three">
            <label>
              {t("Full name")}
              <input
                className="ws-input"
                required
                value={form.name}
                onChange={event => field("name", event.target.value)}
              />
            </label>
            <label>
              {t("Email")}
              <input
                className="ws-input"
                type="email"
                value={form.email}
                onChange={event => field("email", event.target.value)}
              />
            </label>
            <label>
              {t("Phone")}
              <input
                className="ws-input"
                value={form.phone}
                onChange={event => field("phone", event.target.value)}
              />
            </label>
            <label>
              {t("Source")}
              <input
                className="ws-input"
                list="engagement-sources"
                value={form.source}
                onChange={event => field("source", event.target.value)}
              />
            </label>
            <datalist id="engagement-sources">
              <option value="Referral" />
              <option value="Website" />
              <option value="Google" />
              <option value="Social" />
              <option value="Other" />
            </datalist>
            <label>
              {t("Fit score")}
              <input
                className="ws-input"
                type="number"
                min="0"
                max="100"
                value={form.score}
                onChange={event => field("score", Number(event.target.value))}
              />
            </label>
            <label>
              {t("Stage")}
              <select
                className="ws-select"
                value={form.status}
                onChange={event => field("status", event.target.value)}
              >
                {PIPELINE_STAGES.map(stage => (
                  <option value={stage} key={stage}>
                    {stage}
                  </option>
                ))}
              </select>
            </label>
            <label className="ws-form-full">
              {t("Notes")}
              <textarea
                className="ws-textarea"
                value={form.notes}
                onChange={event => field("notes", event.target.value)}
              />
            </label>
          </div>

          {error && <div className="ws-error">{t(error)}</div>}
        </div>
        <footer className="ws-modal__foot">
          <button className="ws-btn" type="button" onClick={onClose}>
            {t("Cancel")}
          </button>
          <button className="ws-btn primary" disabled={saving}>
            {t(saving ? "Saving…" : "Save lead")}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

export default PipelinePage;
