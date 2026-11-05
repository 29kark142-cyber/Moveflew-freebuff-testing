import WorkerDirectory from "@/components/workspace/WorkerDirectory";
import CrewInvitations from '@/components/workspace/CrewInvitations';
import AppearanceSettings from "@/components/workspace/AppearanceSettings";
import AiCreditsBadge from "@/components/workspace/AiCreditsBadge";
import BrandingSettings from "@/components/workspace/BrandingSettings";
import PendingLeads from "@/components/workspace/PendingLeads";
import JobNotifications from "@/components/workspace/JobNotifications";
import { Button } from "@/components/ui/button";
import DepositSettings from "@/components/workspace/DepositSettings";
import TravelSettings from "@/components/workspace/TravelSettings";
import IntegrationsHub from "@/components/workspace/IntegrationsHub";
import { planRoute } from "@/lib/travel.functions";
import { FUEL_FEE_NAME, fuelCharge, travelCharge } from "@/lib/travel-rules";
import ProposalPublisher from "@/components/workspace/ProposalPublisher";
import TestBookingButton from '@/components/workspace/TestBookingButton';
import TextWorker from "@/components/workspace/TextWorker";
import { eligibleRevenue } from "@shared/revenue";
import { allConflicts, conflictsFor, CREW_ROLES, crewRoleOf, needsDispatch, type CrewRole, type ScheduledJob } from "@shared/dispatch";
import DeleteJobButton from "@/components/workspace/DeleteJobButton";
import { DemoJobButton, ClearDemoButton, isDemoJob, localToday } from "@/components/workspace/BetaTools";
import {
  BarChart3,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Copy,
  CreditCard,
  ExternalLink,
  FilePlus2,
  GripVertical,
  ImagePlus,
  Mail,
  MapPinned,
  PackagePlus,
  Pencil,
  Phone,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Truck,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  CrewMember,
  Customer,
  Fee,
  InventoryEntry,
  Job,
  Pricing,
  Truck as TruckType,
  WorkspaceRole,
} from "@shared/crm";
import { calculateQuote, INVENTORY, money, volume, weight } from "@shared/crm";
import { crm, getWorkspaceId, type Member } from "@/lib/crm";
import { getLocale, moverCount, useI18n } from "@/lib/i18n";
import { engage } from "@/lib/engage-api";
import { catalogChoices, inventoryText } from "@shared/inventory-catalog";
import SignaturePad from "@/components/workspace/SignaturePad";
import { IndividualClock } from "@/components/workspace/IndividualClock";
import JobCoreActions from "../core/JobCoreActions";
import FieldChecklist from "@/components/workspace/FieldChecklist";
import {
  EmptyState,
  ErrorNotice,
  formatDate,
  LoadingBlock,
  Modal,
  StatusChip,
  toLocalDateInput,
  useRemote,
} from "@/components/workspace/WorkspaceUI";

type PageProps = {
  role: WorkspaceRole;
  navigate: (path: string) => void;
  path: string;
};
const canManage = (role: WorkspaceRole) =>
  ["admin", "office_admin", "dispatcher"].includes(role);
const canOffice = (role: WorkspaceRole) =>
  ["admin", "office_admin"].includes(role);
const today = () => new Date().toISOString().slice(0, 10);
const isWeekendDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const day = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3])
  ).getDay();
  return day === 0 || day === 6;
};
const title = (job: Job) => job.title || job.customerName || `Job #${job.id}`;
const eventValue = (
  event: React.ChangeEvent<
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  >
) => event.target.value;

function PageHead({
  heading,
  caption,
  actions,
}: {
  heading: string;
  caption: string;
  actions?: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="ws-page-head">
      <div>
        <h1>{t(heading)}</h1>
        <p>{t(caption)}</p>
      </div>
      {actions && <div className="ws-actions">{actions}</div>}
    </div>
  );
}

export function DashboardPage({ role, navigate }: PageProps) {
  const { t } = useI18n();
  const { data, loading, error, refresh } = useRemote(
    () => crm.dashboard(),
    []
  );
  if (loading)
    return <LoadingBlock label={t("Loading your live workspace…")} />;
  if (error || !data)
    return (
      <>
        <PageHead
          heading="Overview"
          caption="Your operational pulse, from workspace records."
        />
        <ErrorNotice error={error} retry={() => void refresh()} />
      </>
    );
  const customerById = new Map(
    data.customers.map(customer => [customer.id, customer])
  );
  const projected = data.jobs.filter(job =>
    eligibleRevenue(job, customerById.get(job.customerId))
  );
  const scheduled = projected.filter(
    job => !/complete|cancel/i.test(job.status)
  );
  const outstanding = projected
    .filter(job => !/paid/i.test(job.invoiceStatus))
    .reduce((sum, job) => sum + (job.finalTotal ?? job.total ?? 0), 0);
  const upcoming = [...scheduled]
    .filter(job => job.moveDate >= today())
    .sort((a, b) =>
      `${a.moveDate}${a.startHour}`.localeCompare(`${b.moveDate}${b.startHour}`)
    )
    .slice(0, 5);
  const trend = Object.values(
    projected.reduce<Record<string, { label: string; amount: number }>>(
      (rows, job) => {
        const key = job.moveDate?.slice(0, 7) || "Unscheduled";
        rows[key] ??= {
          label:
            key === "Unscheduled"
              ? t("Unscheduled")
              : formatDate(`${key}-01`, { month: "short" }),
          amount: 0,
        };
        rows[key].amount += job.finalTotal ?? job.total ?? 0;
        return rows;
      },
      {}
    )
  ).slice(-6);
  return (
    <>
      <PageHead
        heading="Overview"
        caption="Live activity from your selected workspace."
        actions={
          <>
            <AiCreditsBadge />
            <button className="ws-btn" onClick={() => navigate("/app/leads")}>
              {t("View leads")}
            </button>
            {role !== "crew" && (
              <button
                className="ws-btn primary"
                onClick={() => navigate("/app/estimates/new")}
              >
                <FilePlus2 size={15} />
                {t(" New estimate")}
              </button>
            )}
          </>
        }
      />
      <div className="ws-stat-grid">
        <Stat
          label={t("Open opportunities")}
          number={String(
            data.customers.filter(
              c => !/won|closed|inactive|lost|draft|cancel|declined/i.test(c.status)
            ).length
          )}
          hint={t("Customer records needing attention")}
          icon={<UsersRound size={17} />}
        />
        <Stat
          label={t("Scheduled moves")}
          number={String(scheduled.length)}
          hint={t("Across all upcoming dates")}
          icon={<CalendarClock size={17} />}
        />
        <Stat
          label={t("Estimated revenue")}
          number={money(
            projected
              .filter(job => job.status === "estimate")
              .reduce((sum, job) => sum + (job.total || 0), 0)
          )}
          hint={t("From saved estimate totals")}
          icon={<BarChart3 size={17} />}
        />
        <Stat
          label={t("Open invoice value")}
          number={money(outstanding)}
          hint={t("Based on invoice status")}
          icon={<CreditCard size={17} />}
        />
      </div>
      <div className="ws-grid">
        <section className="ws-card ws-card-pad">
          <div className="ws-card-title">
            <div>
              <h2>{t("Revenue from saved jobs")}</h2>
              <p>{t("Totals reflect estimates and completed invoices.")}</p>
            </div>
          </div>
          {trend.length ? (
            <div style={{ height: 245 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend} margin={{ left: -18, right: 6, top: 6 }}>
                  <XAxis dataKey="label" axisLine={false} tickLine={false} />
                  <YAxis
                    tickFormatter={value =>
                      `$${Math.round(Number(value) / 1000)}k`
                    }
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(value: number) => money(value)}
                    cursor={{ fill: "#f2f7fb" }}
                  />
                  <Bar dataKey="amount" fill="#0877eb" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              title={t("No revenue history yet")}
              detail="Saved estimates and jobs will appear here as they are created."
            />
          )}
        </section>
        <section className="ws-card ws-card-pad">
          <div className="ws-card-title">
            <div>
              <h2>{t("Upcoming moves")}</h2>
              <p>{t("Scheduled records only.")}</p>
            </div>
            <span style={{ display: "inline-flex", gap: 8, flexWrap: "wrap" }}>
              {upcoming.some(isDemoJob) && <ClearDemoButton role={role} onCleared={() => void refresh()} />}
              <button className="ws-btn" onClick={() => navigate("/app/jobs")}>
                {t("All jobs")}
              </button>
            </span>
          </div>
          {upcoming.length ? (
            <div className="ws-list">
              {upcoming.map(job => (
                <button
                  className="ws-list-row ws-list-button"
                  key={job.id}
                  onClick={() => navigate(`/app/jobs/${job.id}`)}
                >
                  <span className="ws-dot"></span>
                  <span className="ws-list-row__primary">
                    <b>{title(job)}</b>
                    <small>
                      {formatDate(job.moveDate)} · {hour(job.startHour)}
                    </small>
                  </span>
                  <StatusChip status={job.status} />
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              title={t("No upcoming moves")}
              detail="Scheduled estimates will show here when their dates are saved."
              action={<DemoJobButton role={role} onLoaded={() => void refresh()} />}
            />
          )}
        </section>
      </div>
      <div className="ws-grid">
        <section className="ws-card ws-card-pad">
          <div className="ws-card-title">
            <div>
              <h2>{t("Follow-ups")}</h2>
              <p>{t("Due dates from your reminder queue.")}</p>
            </div>
            <button className="ws-btn" onClick={() => navigate("/app/leads")}>
              {t("Manage")}
            </button>
          </div>
          {data.reminders.filter(r => !r.completed).slice(0, 5).length ? (
            <div className="ws-list">
              {data.reminders
                .filter(r => !r.completed)
                .slice(0, 5)
                .map(reminder => (
                  <div className="ws-list-row" key={reminder.id}>
                    <span className="ws-dot warning"></span>
                    <span className="ws-list-row__primary">
                      <b>{reminder.title}</b>
                      <small>
                        {t("Due")}{" "}
                        {formatDate(reminder.dueAt, {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </small>
                    </span>
                  </div>
                ))}
            </div>
          ) : (
            <EmptyState
              title={t("Nothing due")}
              detail="Create a lead reminder to keep your next follow-up visible."
            />
          )}
        </section>
        <section className="ws-card ws-card-pad">
          <div className="ws-card-title">
            <div>
              <h2>{t("Dispatch readiness")}</h2>
              <p>{t("Fleet and crew available in this workspace.")}</p>
            </div>
          </div>
          <div className="ws-list">
            <div className="ws-list-row">
              <span className="ws-dot success"></span>
              <span className="ws-list-row__primary">
                <b>
                  {t("{count} fleet vehicles", { count: data.trucks.length })}
                </b>
                <small>{t("Saved fleet records")}</small>
              </span>
            </div>
            <div className="ws-list-row">
              <span className="ws-dot success"></span>
              <span className="ws-list-row__primary">
                <b>{moverCount(data.crew.length)}</b>
                <small>{t("Saved people records")}</small>
              </span>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
function Stat({
  label,
  number,
  hint,
  icon,
}: {
  label: string;
  number: string;
  hint: string;
  icon: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <section className="ws-card ws-stat">
      <span className="ws-stat__icon">{icon}</span>
      <div className="ws-stat__label">{t(label)}</div>
      <div className="ws-stat__number">{number}</div>
      <div className="ws-stat__hint">{t(hint)}</div>
    </section>
  );
}

const blankLead = {
  name: "",
  email: "",
  phone: "",
  source: "Referral",
  score: 50,
  status: "lead",
  notes: "",
};
export function LeadsPage({ role }: PageProps) {
  const { t } = useI18n();
  const { data, loading, error, refresh } = useRemote(
    () => Promise.all([crm.customers(), crm.reminders()]),
    []
  );
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [editing, setEditing] = useState<Customer | null | "new">(null);
  const [reminderFor, setReminderFor] = useState<Customer | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  if (loading)
    return <LoadingBlock label={t("Loading leads and reminders…")} />;
  if (error || !data)
    return (
      <>
        <PageHead
          heading="Leads"
          caption="Customer records and follow-up commitments."
        />
        <ErrorNotice error={error} retry={() => void refresh()} />
      </>
    );
  const [customers, reminders] = data;
  const matches = customers.filter(
    customer =>
      (status === "all" || customer.status === status) &&
      `${customer.name} ${customer.email} ${customer.phone}`
        .toLowerCase()
        .includes(search.toLowerCase())
  );
  const saveCustomer = async (form: typeof blankLead) => {
    setSaving(true);
    setActionError("");
    try {
      if (editing === "new") await crm.createCustomer(form);
      else if (editing) await crm.updateCustomer(editing.id, form);
      setEditing(null);
      await refresh();
    } catch (reason) {
      setActionError(
        reason instanceof Error ? reason.message : "Could not save this lead."
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <PageHead
        heading="Leads"
        caption={t("{count} saved customer records in this workspace.", {
          count: customers.length,
        })}
        actions={
          role !== "crew" ? (
            <button
              className="ws-btn primary"
              onClick={() => {
                setActionError("");
                setEditing("new");
              }}
            >
              <Plus size={15} />
              {t(" Add lead")}
            </button>
          ) : undefined
        }
      />
      <div className="ws-toolbar">
        <div className="ws-toolbar__filters">
          <div className="ws-search">
            <Search size={15} />
            <input
              className="ws-input search"
              value={search}
              onChange={event => setSearch(eventValue(event))}
              placeholder={t("Search name, email, phone")}
            />
          </div>
          <select
            className="ws-select"
            value={status}
            onChange={event => setStatus(eventValue(event))}
          >
            <option value="all">{t("All stages")}</option>
            {[...new Set(customers.map(c => c.status))].map(value => (
              <option key={value} value={value}>
                {t(value.replace(/_/g, " "))}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="ws-card-pad ws-card">
        <div className="ws-table-wrap">
          <table className="ws-table">
            <thead>
              <tr>
                <th>{t("Customer")}</th>
                <th>{t("Stage")}</th>
                <th>{t("Source")}</th>
                <th>{t("Score")}</th>
                <th>{t("Next reminder")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {matches.map(customer => {
                const next = reminders
                  .filter(
                    reminder =>
                      reminder.customerId === customer.id && !reminder.completed
                  )
                  .sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
                return (
                  <tr key={customer.id}>
                    <td>
                      <span className="ws-table-main">{customer.name}</span>
                      <small>
                        {customer.email ||
                          customer.phone ||
                          t("No contact details")}
                      </small>
                    </td>
                    <td>
                      <StatusChip status={customer.status} />
                    </td>
                    <td>{customer.source || "—"}</td>
                    <td>{customer.score}</td>
                    <td>
                      {next ? (
                        <>
                          <span>{formatDate(next.dueAt)}</span>
                          <small>{next.title}</small>
                        </>
                      ) : (
                        <small>{t("No open reminder")}</small>
                      )}
                    </td>
                    <td>
                      <div className="ws-row-actions">
                        {role !== "crew" && (
                          <button
                            className="ws-icon-btn"
                            title={t("Add reminder")}
                            aria-label={t("Add reminder")}
                            onClick={() => setReminderFor(customer)}
                          >
                            <CalendarClock size={16} />
                          </button>
                        )}{" "}
                        {role !== "crew" && (
                          <button
                            className="ws-icon-btn"
                            title={t("Edit lead")}
                            aria-label={t("Edit lead")}
                            onClick={() => {
                              setActionError("");
                              setEditing(customer);
                            }}
                          >
                            <Pencil size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!matches.length && (
          <EmptyState
            title={t("No matching leads")}
            detail={
              customers.length
                ? "Adjust the search or stage filter to see saved customer records."
                : "Start with a lead to build your pipeline and reminders."
            }
            action={
              role !== "crew" ? (
                <button
                  className="ws-btn primary"
                  onClick={() => setEditing("new")}
                >
                  {t("Add first lead")}
                </button>
              ) : undefined
            }
          />
        )}
      </div>
      {editing && (
        <LeadModal
          initial={editing === "new" ? blankLead : editing}
          title={editing === "new" ? t("Add lead") : t("Edit lead")}
          saving={saving}
          error={actionError}
          onClose={() => setEditing(null)}
          onSave={saveCustomer}
        />
      )}{" "}
      {reminderFor && (
        <ReminderModal
          customer={reminderFor}
          onClose={() => setReminderFor(null)}
          onSaved={async () => {
            setReminderFor(null);
            await refresh();
          }}
        />
      )}
    </>
  );
}
function LeadModal({
  initial,
  title: modalTitle,
  saving,
  error,
  onClose,
  onSave,
}: {
  initial: typeof blankLead;
  title: string;
  saving: boolean;
  error: string;
  onClose: () => void;
  onSave: (form: typeof blankLead) => void;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState(initial);
  const set = (key: keyof typeof form, value: string | number) =>
    setForm(current => ({ ...current, [key]: value }));
  return (
    <Modal title={modalTitle} onClose={onClose}>
      <form
        onSubmit={event => {
          event.preventDefault();
          onSave(form);
        }}
      >
        <div className="ws-modal__body">
          <div className="ws-form-grid">
            <Field label={t("Full name")}>
              <input
                required
                className="ws-input"
                value={form.name}
                onChange={event => set("name", eventValue(event))}
              />
            </Field>
            <Field label={t("Phone")}>
              <input
                className="ws-input"
                value={form.phone}
                onChange={event => set("phone", eventValue(event))}
              />
            </Field>
            <Field label={t("Email")}>
              <input
                type="email"
                className="ws-input"
                value={form.email}
                onChange={event => set("email", eventValue(event))}
              />
            </Field>
            <Field label={t("Source")}>
              <input
                className="ws-input"
                value={form.source}
                onChange={event => set("source", eventValue(event))}
              />
            </Field>
            <Field label={t("Stage")}>
              <select
                className="ws-select"
                value={form.status}
                onChange={event => set("status", eventValue(event))}
              >
                {["lead", "qualified", "estimate_sent", "won", "lost"].map(
                  value => (
                    <option key={value} value={value}>
                      {t(value.replace("_", " "))}
                    </option>
                  )
                )}
              </select>
            </Field>
            <Field label={t("Fit score")}>
              <input
                className="ws-input"
                min="0"
                max="100"
                type="number"
                value={form.score}
                onChange={event => set("score", Number(eventValue(event)))}
              />
            </Field>
            <Field full label={t("Notes")}>
              <textarea
                className="ws-textarea"
                value={form.notes}
                onChange={event => set("notes", eventValue(event))}
              />
            </Field>
          </div>
          {error && <div className="ws-error">{t(error)}</div>}
        </div>
        <div className="ws-modal__foot">
          <button type="button" className="ws-btn" onClick={onClose}>
            {t("Cancel")}
          </button>
          <button disabled={saving} className="ws-btn primary">
            {saving ? t("Saving…") : t("Save lead")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function ReminderModal({
  customer,
  onClose,
  onSaved,
}: {
  customer: Customer;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [title, setTitle] = useState(
    t("Follow up with {customer}", { customer: customer.name })
  );
  const [dueAt, setDueAt] = useState(`${today()}T09:00`);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <Modal title={t("Add follow-up reminder")} onClose={onClose}>
      <form
        onSubmit={async event => {
          event.preventDefault();
          setSaving(true);
          try {
            await crm.createReminder({
              customerId: customer.id,
              title,
              dueAt: new Date(dueAt).toISOString(),
            });
            await onSaved();
          } catch (reason) {
            setError(
              reason instanceof Error
                ? reason.message
                : "Could not save reminder."
            );
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="ws-modal__body">
          <div className="ws-form-grid">
            <Field label={t("Reminder")}>
              <input
                className="ws-input"
                required
                value={title}
                onChange={event => setTitle(eventValue(event))}
              />
            </Field>
            <Field label={t("Due date & time")}>
              <input
                className="ws-input"
                type="datetime-local"
                required
                value={dueAt}
                onChange={event => setDueAt(eventValue(event))}
              />
            </Field>
          </div>
          {error && <div className="ws-error">{t(error)}</div>}
        </div>
        <div className="ws-modal__foot">
          <button type="button" className="ws-btn" onClick={onClose}>
            {t("Cancel")}
          </button>
          <button className="ws-btn primary" disabled={saving}>
            {saving ? t("Saving…") : t("Save reminder")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function EstimatesPage({ role, navigate }: PageProps) {
  const { t } = useI18n();
  const {
    data: jobs,
    loading,
    error,
    refresh,
  } = useRemote(() => crm.jobs(), []);
  const { data: customers } = useRemote(() => crm.customers(), []);
  if (loading) return <LoadingBlock label={t("Loading estimates…")} />;
  if (error || !jobs)
    return (
      <>
        <PageHead
          heading="Estimates"
          caption="Saved proposals and pricing records."
        />
        <ErrorNotice error={error} retry={() => void refresh()} />
      </>
    );
  // Website widget and webhook submissions land as customers with status "new";
  // surface them here so an estimator can turn one into a quote.
  const pendingLeads = (customers ?? [])
    .filter(customer => /new|lead/i.test(customer.status))
    .filter(customer => /website|widget|webhook|public api|form/i.test(customer.source))
    .slice(0, 8);
  const estimates = jobs.filter(
    job => !/complete|in_progress/i.test(job.status)
  );
  return (
    <>
      <PageHead
        heading="Estimates"
        caption="Build transparent quotes and share real proposal links."
        actions={
          <>
            <AiCreditsBadge />
            <button
              className="ws-btn primary"
              onClick={() => navigate("/app/estimates/new")}
            >
              <Plus size={15} />
              {t(" New estimate")}
            </button>
          </>
        }
      />
      <PendingLeads
        leads={pendingLeads}
        onStart={id => {
          sessionStorage.setItem("nwcrewcrm.estimate-lead", String(id));
          navigate("/app/estimates/new");
        }}
      />
      <section className="ws-card ws-card-pad">
        <div className="ws-table-wrap">
          <table className="ws-table">
            <thead>
              <tr>
                <th>{t("Estimate")}</th>
                <th>{t("Move date")}</th>
                <th>{t("Mode")}</th>
                <th>{t("Total")}</th>
                <th>{t("Proposal")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {estimates.map(job => (
                <tr key={job.id}>
                  <td>
                    <span className="ws-table-main">{title(job)}</span>
                    <small>{job.customerName}</small>
                  </td>
                  <td>{formatDate(job.moveDate)}</td>
                  <td>
                    {job.pricingMode === "long_distance"
                      ? t("Long distance")
                      : t("Hourly")}
                  </td>
                  <td className="ws-table-main">{money(job.total)}</td>
                  <td>
                    <StatusChip status={job.signature ? "signed" : "ready"} />
                  </td>
                  <td>
                    <button
                      className="ws-btn"
                      onClick={() => navigate(`/app/jobs/${job.id}`)}
                    >
                      {t("Open")}
                    </button>
                    <DeleteJobButton
                      jobId={job.id}
                      role={role}
                      estimate
                      onDeleted={async () => {
                        await refresh();
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!estimates.length && (
          <EmptyState
            title={t("No saved estimates")}
            detail="Create an estimate to calculate an itemized moving quote and proposal link."
            action={
              <button
                className="ws-btn primary"
                onClick={() => navigate("/app/estimates/new")}
              >
                {t("Create estimate")}
              </button>
            }
          />
        )}
      </section>
    </>
  );
}

import {
  HEAVY_ITEM_PRESETS,
  isSurchargeFeeName,
  parseSurchargeSettings,
  surchargeFeeEntries,
  surchargeLines,
  type SurchargeSettings,
} from "@shared/surcharges";

type QuoteForm = {
  name: string;
  email: string;
  phone: string;
  title: string;
  date: string;
  startHour: number;
  origin: string;
  destination: string;
  moveSize: string;
  mode: "hourly" | "long_distance";
  crewSize: number;
  estimatedHours: number;
  hourlyRate: number;
  weightRate: number;
  mileRate: number;
  travelFee: number;
  distanceMiles: number;
  travelMinutes: number;
  fees: Fee[];
  inventory: InventoryEntry[];
  packingHours: number;
  materialQuantities: Record<string, number>;
  /** Live tariff settings for this quote; estimators can override any of them. */
  surcharges: SurchargeSettings;
  stairsFlights: number;
  carryDistanceFt: number;
  notes: string;
};
function freshQuote(pricing: Pricing): QuoteForm {
  return {
    name: "",
    email: "",
    phone: "",
    title: "",
    date: today(),
    startHour: 9,
    origin: "",
    destination: "",
    moveSize: "Apartment",
    mode: "hourly",
    crewSize: 2,
    estimatedHours: 3,
    hourlyRate: pricing.rates[1] ?? pricing.rates[0] ?? 130,
    weightRate: pricing.weightRate,
    mileRate: pricing.mileRate,
    travelFee: 0,
    distanceMiles: 0,
    travelMinutes: 0,
    fees: [],
    inventory: [],
    packingHours: 0,
    materialQuantities: {},
    surcharges: parseSurchargeSettings(pricing.surcharges),
    stairsFlights: 0,
    carryDistanceFt: 0,
    notes: "",
  };
}
function SurchargeNumber({ label, value, step = 1, onChange }: { label: string; value: number; step?: number; onChange: (value: number) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {label}
      <input
        className="ws-input"
        style={{ width: 90 }}
        type="number"
        min="0"
        step={step}
        value={value}
        onChange={event => onChange(Math.max(0, Number(eventValue(event))))}
      />
    </label>
  );
}

function SurchargeToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function EstimateWizardPage({ navigate, path }: PageProps) {
  // /app/estimates/:id reopens a saved quote in the same builder instead of creating a new one.
  const editId = Number(path?.match(/^\/app\/estimates\/(\d+)/)?.[1] ?? 0);
  const { t } = useI18n();
  const { data: pricing, loading, error } = useRemote(() => crm.pricing(), []);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<QuoteForm | null>(null);
  const [distanceError, setDistanceError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [inventorySearch, setInventorySearch] = useState("");
  const catalog = useRemote(() => engage.catalog(), []);
  // One-click conversion from the pipeline: prefill this estimate from the chosen lead.
  const [leadId, setLeadId] = useState<number | null>(null);
  useEffect(() => {
    if (!pricing) return;
    const id = Number(sessionStorage.getItem("nwcrewcrm.estimate-lead"));
    sessionStorage.removeItem("nwcrewcrm.estimate-lead");
    if (!id) return;
    void crm.customers().then(list => {
      const lead = list.find(c => c.id === id) as (Customer & Record<string, unknown>) | undefined;
      if (!lead) return;
      const text = (k: string) => (typeof lead[k] === "string" ? (lead[k] as string) : "");
      const date = /^\d{4}-\d{2}-\d{2}$/.test(text("moveDate")) ? text("moveDate") : today();
      setLeadId(lead.id);
      setForm(current => ({
        ...(current || freshQuote(pricing)),
        name: lead.name, email: lead.email, phone: lead.phone,
        origin: text("origin"), destination: text("destination"), date,
        title: `${lead.name} move`, notes: text("message") || lead.notes || "",
      }));
    }).catch(() => undefined);
  }, [pricing]);
  const existing = useRemote(() => (editId ? crm.job(editId) : Promise.resolve(null)), [editId]);
  // Prefill the builder from the saved quote once; later edits stay untouched.
  useEffect(() => {
    if (!pricing || !editId || !existing.data) return;
    const job = existing.data as Job & Record<string, unknown>;
    const text = (key: string) => (typeof job[key] === "string" ? (job[key] as string) : "");
    const numeric = (key: string, fallback: number) => {
      const value = job[key];
      return typeof value === "number" && Number.isFinite(value) ? value : fallback;
    };
    const savedInventory = Array.isArray(job.inventory) ? (job.inventory as InventoryEntry[]) : [];
    const savedFees = Array.isArray(job.fees)
      ? (job.fees as Fee[]).filter(fee => !isSurchargeFeeName(fee.name))
      : [];
    setForm(
      current =>
        current ?? {
          ...freshQuote(pricing),
          name: text("customerName"),
          email: text("customerEmail"),
          phone: text("customerPhone"),
          title: text("title") || `${text("customerName")} move`,
          date: /^\d{4}-\d{2}-\d{2}/.test(text("moveDate"))
            ? text("moveDate").slice(0, 10)
            : today(),
          startHour: numeric("startHour", 9),
          origin: text("origin"),
          destination: text("destination"),
          moveSize: text("moveSize") || text("size") || "Apartment",
          mode: text("pricingMode") === "long_distance" ? "long_distance" : "hourly",
          crewSize: numeric("crewSize", 2),
          hourlyRate: numeric("hourlyRate", pricing.rates[1] ?? 130),
          estimatedHours: numeric("estimatedHours", numeric("duration", 3)),
          weightRate: numeric("weightRate", pricing.weightRate),
          mileRate: numeric("mileRate", pricing.mileRate),
          travelFee: numeric("travelFee", 0),
          distanceMiles: numeric("distanceMiles", numeric("distance", 0)),
          travelMinutes: numeric("travelMinutes", 0),
          fees: savedFees,
          inventory: savedInventory,
          surcharges: parseSurchargeSettings(job.surcharges),
          stairsFlights: numeric("stairsFlights", 0),
          carryDistanceFt: numeric("carryDistanceFt", 0),
          notes: text("notes"),
        }
    );
  }, [editId, existing.data, pricing]);
  if (loading || catalog.loading || (editId > 0 && existing.loading))
    return <LoadingBlock label={t("Loading approved pricing…")} />;
  // The inventory catalog is optional; a missing catalog must not block quoting.
  if (error || !pricing)
    return (
      <>
        <PageHead
          heading="New estimate"
          caption="Create a customer-ready, saved quote."
        />
        <ErrorNotice error={error} />
      </>
    );
  const inventoryChoices = catalogChoices(catalog.data || []);
  const quote = form || freshQuote(pricing);
  const patch = (changes: Partial<QuoteForm>) =>
    setForm(current => ({ ...(current || freshQuote(pricing)), ...changes }));
  const configuredFees: Fee[] = [
    ...((pricing.truckFee ?? 0) > 0 ? [{ name: 'Truck fee', amount: pricing.truckFee ?? 0 }] : []),
    ...(quote.packingHours > 0
      ? [
          {
            name: `Packing labor (${quote.packingHours}h)`,
            amount: quote.packingHours * pricing.packingRate,
          },
        ]
      : []),
    ...pricing.materials.flatMap((material, index) => {
      const quantity = Math.max(
        0,
        quote.materialQuantities[String(index)] || 0
      );
      return quantity
        ? [
            {
              name: `Materials: ${material.name} × ${quantity}`,
              amount: material.price * quantity,
            },
          ]
        : [];
    }),
  ];
  // Access difficulty and heavy items are priced by the shared tariff engine and
  // stored as fee lines, so the saved total and this preview can never disagree.
  const surchargeLineItems = surchargeLines({
    settings: quote.surcharges,
    access: {
      stairsFlights: quote.stairsFlights,
      carryDistanceFt: quote.carryDistanceFt,
    },
    hours: Math.max(pricing.minimumHours, quote.estimatedHours),
    heavyItems: quote.inventory
      .filter(item => item.heavy && item.quantity > 0)
      .map(item => ({ name: item.name, quantity: item.quantity, fee: item.heavyFee })),
  });
  const quoteFees = [
    ...quote.fees,
    ...configuredFees,
    ...surchargeFeeEntries(surchargeLineItems),
  ];
  const baseTotal = calculateQuote(
    {
      pricingMode: quote.mode,
      hourlyRate: quote.hourlyRate,
      estimatedHours: quote.estimatedHours,
      distanceMiles: quote.distanceMiles,
      travelFee: quote.travelFee,
      weightRate: quote.weightRate,
      mileRate: quote.mileRate,
      inventory: quote.inventory,
      fees: quoteFees,
    },
    pricing.minimumHours
  );
  // The server applies this configured adjustment after calculating the rounded
  // base quote. Keep the preview intentionally in lockstep with pricing.ts.
  const weekendAdjustment = isWeekendDate(quote.date)
    ? baseTotal * (pricing.weekendPercent / 100)
    : 0;
  const total = Math.round((baseTotal + weekendAdjustment) * 100) / 100;
  const locate = async () => {
    setDistanceError("");
    try {
      const result = await planRoute({ data: { workspaceId: Number(getWorkspaceId()), pickup: quote.origin, dropoff: quote.destination } });
      if ("error" in result) throw new Error(result.error);
      const { route, settings } = result;
      const otherFees = quote.fees.filter(fee => fee.name !== FUEL_FEE_NAME);
      const priorFuel = quote.fees.find(fee => fee.name === FUEL_FEE_NAME)?.amount || 0;
      const travelFee = travelCharge(settings, route, quote.hourlyRate);
      const fuel = fuelCharge(settings, route, Math.max(0, baseTotal - priorFuel - quote.travelFee + travelFee));
      patch({
        distanceMiles: route.move.miles,
        travelMinutes: route.toPickup.minutes + route.move.minutes + route.returnToBase.minutes,
        travelFee,
        fees: fuel > 0 ? [...otherFees, { name: FUEL_FEE_NAME, amount: fuel }] : otherFees,
      });
    } catch (reason) {
      setDistanceError(
        reason instanceof Error
          ? reason.message
          : "Route lookup failed. Correct the exact addresses and try again."
      );
    }
  };
  const changeQuantity = (
    item: Omit<InventoryEntry, "quantity">,
    direction: number
  ) => {
    const current = quote.inventory.find(entry => entry.key === item.key);
    const next = Math.max(0, (current?.quantity || 0) + direction);
    patch({
      inventory: next
        ? [
            ...quote.inventory.filter(entry => entry.key !== item.key),
            { ...item, quantity: next },
          ]
        : quote.inventory.filter(entry => entry.key !== item.key),
    });
  };
  const save = async () => {
    setSaving(true);
    setSaveError("");
    try {
      // Access difficulty, heavy item fees and the resolved settings travel with the
      // quote so the server can re-price and audit the surcharges later.
      const surchargeSnapshot = surchargeLineItems.map(line => ({
        key: line.key,
        name: line.name,
        amount: line.amount,
        detail: line.detail,
      }));
      const jobFields = {
        title: quote.title || `${quote.name} move`,
        date: quote.date,
        moveDate: quote.date,
        startHour: quote.startHour,
        duration: quote.estimatedHours,
        origin: quote.origin,
        destination: quote.destination,
        size: quote.moveSize,
        moveSize: quote.moveSize,
        status: "estimate",
        mode: quote.mode,
        pricingMode: quote.mode,
        crewSize: quote.crewSize,
        hourlyRate: quote.hourlyRate,
        estimatedHours: quote.estimatedHours,
        distance: quote.distanceMiles,
        distanceMiles: quote.distanceMiles,
        travelMinutes: quote.travelMinutes,
        travelFee: quote.travelFee,
        weightRate: quote.weightRate,
        mileRate: quote.mileRate,
        inventory: quote.inventory,
        fees: quoteFees,
        surcharges: quote.surcharges,
        stairsFlights: quote.stairsFlights,
        carryDistanceFt: quote.carryDistanceFt,
        surchargeLines: surchargeSnapshot,
        // The API persists address-specific notes; this wizard's single move
        // note is intentionally stored with the pickup rather than discarded.
        originNotes: quote.notes,
        notes: quote.notes,
      };
      const job = editId
        ? await crm.updateJob(editId, jobFields)
        : await crm.createJob({
            ...(leadId
              ? { customerId: leadId }
              : { customer: { name: quote.name, email: quote.email, phone: quote.phone, source: "Estimate" } }),
            ...jobFields,
          });
      if (leadId && !editId) await crm.updateCustomer(leadId, { status: "estimate" }).catch(() => undefined);
      navigate(editId ? "/app/estimates" : `/app/jobs/${job.id}`);
    } catch (reason) {
      setSaveError(
        reason instanceof Error
          ? reason.message
          : "Could not save this estimate."
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <PageHead
        heading={editId ? "Edit estimate" : "New estimate"}
        caption="Customer, route, inventory, and pricing in one saved proposal."
        actions={
          <button className="ws-btn" onClick={() => navigate("/app/estimates")}>
            {t("Cancel")}
          </button>
        }
      />
      <section className="ws-card ws-card-pad">
        <div className="ws-wizard-steps">
          {[0, 1, 2, 3].map(index => (
            <span className={index <= step ? "active" : ""} key={index} />
          ))}
        </div>
        <div className="ws-wizard-label">
          {t("Step {step} of 4 · {name}", {
            step: step + 1,
            name: t(
              [
                "Customer & move",
                "Exact route",
                "Household inventory",
                "Pricing & proposal",
              ][step]
            ),
          })}
        </div>
        {step === 0 && (
          <div className="ws-form-grid three">
            <Field label={t("Customer name")}>
              <input
                className="ws-input"
                required
                value={quote.name}
                onChange={event => patch({ name: eventValue(event) })}
              />
            </Field>
            <Field label={t("Email")}>
              <input
                className="ws-input"
                type="email"
                value={quote.email}
                onChange={event => patch({ email: eventValue(event) })}
              />
            </Field>
            <Field label={t("Phone")}>
              <input
                className="ws-input"
                value={quote.phone}
                onChange={event => patch({ phone: eventValue(event) })}
              />
            </Field>
            <Field label={t("Move title")}>
              <input
                className="ws-input"
                placeholder={t("e.g. River North apartment move")}
                value={quote.title}
                onChange={event => patch({ title: eventValue(event) })}
              />
            </Field>
            <Field label={t("Move date")}>
              <input
                className="ws-input"
                type="date"
                value={quote.date}
                onChange={event => patch({ date: eventValue(event) })}
              />
            </Field>
            <Field label={t("Move size")}>
              <select
                className="ws-select"
                value={quote.moveSize}
                onChange={event => patch({ moveSize: eventValue(event) })}
              >
                {[
                  "Studio",
                  "Apartment",
                  "2 bedroom",
                  "3 bedroom",
                  "House",
                  "Office",
                ].map(value => (
                  <option key={value} value={value}>
                    {t(value)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
        {step === 1 && (
          <div>
            <div className="ws-form-grid">
              <Field label={t("Origin address & ZIP")}>
                <input
                  className="ws-input"
                  placeholder={t("Street, city, state ZIP")}
                  value={quote.origin}
                  onChange={event => patch({ origin: eventValue(event) })}
                />
              </Field>
              <Field label={t("Destination address & ZIP")}>
                <input
                  className="ws-input"
                  placeholder={t("Street, city, state ZIP")}
                  value={quote.destination}
                  onChange={event => patch({ destination: eventValue(event) })}
                />
              </Field>
            </div>
            <div className="ws-actions" style={{ marginTop: 14 }}>
              <button
                className="ws-btn primary"
                type="button"
                disabled={!quote.origin || !quote.destination}
                onClick={() => void locate()}
              >
                <MapPinned size={15} />
                {t(" Get exact route")}
              </button>
              {quote.distanceMiles > 0 && (
                <span className="ws-chip green">
                  {t("{miles} mi · {minutes} min", {
                    miles: quote.distanceMiles.toFixed(1),
                    minutes: quote.travelMinutes,
                  })}
                </span>
              )}
            </div>
            {distanceError && (
              <div className="ws-error" style={{ marginTop: 12 }}>
                <CircleAlert size={15} />
                {t(distanceError)}
              </div>
            )}
            <p className="ws-helper">
              {t(
                "Route distance and travel time are only added from the Maps service; no estimate is substituted if the lookup fails."
              )}
            </p>
          </div>
        )}
        {step === 2 && (
          <div>
            <div className="ws-toolbar">
              <div className="ws-search">
                <Search size={15} />
                <input
                  className="ws-input search"
                  value={inventorySearch}
                  onChange={event => setInventorySearch(eventValue(event))}
                  placeholder={t("Find household items")}
                />
              </div>
              <span className="ws-chip blue">
                {t("{volume} cu ft · {weight} lb", {
                  volume: volume(quote.inventory),
                  weight: weight(quote.inventory),
                })}
              </span>
            </div>
            <div className="ws-inventory">
              {inventoryChoices
                .filter(item =>
                  `${item.name} ${item.room} ${inventoryText(item, "name", t)} ${inventoryText(item, "room", t)}`
                    .toLowerCase()
                    .includes(inventorySearch.toLowerCase())
                )
                .map(item => {
                  const quantity =
                    quote.inventory.find(entry => entry.key === item.key)
                      ?.quantity || 0;
                  return (
                    <div className="ws-inventory-card" key={item.key}>
                      <b>{inventoryText(item, "name", t)}</b>
                      <small>
                        {t("{room} · {volume} cu ft · {weight} lb", {
                          room: inventoryText(item, "room", t),
                          volume: item.cuft,
                          weight: item.weight,
                        })}
                      </small>
                      <div className="ws-quantity">
                        <button
                          type="button"
                          onClick={() => changeQuantity(item, -1)}
                          aria-label={t("Remove {item}", {
                            item: inventoryText(item, "name", t),
                          })}
                        >
                          −
                        </button>
                        <output>{quantity}</output>
                        <button
                          type="button"
                          onClick={() => changeQuantity(item, 1)}
                          aria-label={t("Add {item}", {
                            item: inventoryText(item, "name", t),
                          })}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
        {step === 3 && (
          <div className="ws-grid" style={{ marginTop: 0 }}>
            <div className="ws-form-grid">
              <Field label={t("Pricing method")}>
                <select
                  className="ws-select"
                  value={quote.mode}
                  onChange={event =>
                    patch({ mode: eventValue(event) as QuoteForm["mode"] })
                  }
                >
                  <option value="hourly">{t("Hourly local move")}</option>
                  <option value="long_distance">
                    {t("Long distance (weight + miles)")}
                  </option>
                </select>
              </Field>
              <Field label={t("Crew size")}>
                <select
                  className="ws-select"
                  value={quote.crewSize}
                  onChange={event => {
                    const crewSize = Number(eventValue(event));
                    patch({
                      crewSize,
                      hourlyRate:
                        pricing.rates[Math.max(0, crewSize - 1)] ??
                        quote.hourlyRate,
                    });
                  }}
                >
                  {[1, 2, 3, 4, 5, 6].map(value => (
                    <option value={value} key={value}>
                      {moverCount(value)}
                    </option>
                  ))}
                </select>
              </Field>
              {quote.mode === "hourly" ? (
                <>
                  <Field label={t("Hourly rate")}>
                    <input
                      className="ws-input"
                      type="number"
                      min="0"
                      value={quote.hourlyRate}
                      onChange={event =>
                        patch({ hourlyRate: Number(eventValue(event)) })
                      }
                    />
                  </Field>
                  <Field label={t("Estimated labor hours")}>
                    <input
                      className="ws-input"
                      type="number"
                      min="0"
                      step=".25"
                      value={quote.estimatedHours}
                      onChange={event =>
                        patch({ estimatedHours: Number(eventValue(event)) })
                      }
                    />
                  </Field>
                </>
              ) : (
                <>
                  <Field label={t("Weight rate / lb")}>
                    <input
                      className="ws-input"
                      type="number"
                      min="0"
                      step=".01"
                      value={quote.weightRate}
                      onChange={event =>
                        patch({ weightRate: Number(eventValue(event)) })
                      }
                    />
                  </Field>
                  <Field label={t("Mileage rate")}>
                    <input
                      className="ws-input"
                      type="number"
                      min="0"
                      step=".01"
                      value={quote.mileRate}
                      onChange={event =>
                        patch({ mileRate: Number(eventValue(event)) })
                      }
                    />
                  </Field>
                </>
              )}
              <Field label={t("Route travel fee")}>
                <input
                  className="ws-input"
                  type="number"
                  min="0"
                  value={quote.travelFee}
                  onChange={event =>
                    patch({ travelFee: Number(eventValue(event)) })
                  }
                />
              </Field>
              <Field label={t("Packing labor hours")}>
                <input
                  className="ws-input"
                  type="number"
                  min="0"
                  step=".25"
                  value={quote.packingHours}
                  onChange={event =>
                    patch({
                      packingHours: Math.max(0, Number(eventValue(event))),
                    })
                  }
                />
                <small className="ws-helper">
                  {t("{rate} per hour from workspace pricing", {
                    rate: money(pricing.packingRate),
                  })}
                </small>
              </Field>
              <Field label={t("Accessorial name")}>
                <input
                  className="ws-input"
                  placeholder={t("e.g. long carry")}
                  onBlur={event => {
                    const name = eventValue(event).trim();
                    if (name) {
                      patch({ fees: [...quote.fees, { name, amount: 0 }] });
                      event.currentTarget.value = "";
                    }
                  }}
                />
              </Field>
              {quote.fees.map((fee, index) => (
                <div className="ws-field full" key={`${fee.name}-${index}`}>
                  <label>{fee.name}</label>
                  <div className="ws-inline">
                    <input
                      className="ws-input"
                      type="number"
                      value={fee.amount}
                      onChange={event =>
                        patch({
                          fees: quote.fees.map((entry, i) =>
                            i === index
                              ? { ...entry, amount: Number(eventValue(event)) }
                              : entry
                          ),
                        })
                      }
                    />
                    <button
                      className="ws-icon-btn"
                      onClick={() =>
                        patch({
                          fees: quote.fees.filter((_, i) => i !== index),
                        })
                      }
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              ))}
              <Field full label={t("Packing materials")}>
                <div className="ws-material-options">
                  {pricing.materials.length ? (
                    pricing.materials.map((material, index) => {
                      const quantity =
                        quote.materialQuantities[String(index)] || 0;
                      return (
                        <label key={`${material.name}-${index}`}>
                          <span>
                            <b>{material.name}</b>
                            <small>
                              {t("{price} each", {
                                price: money(material.price),
                              })}
                            </small>
                          </span>
                          <input
                            className="ws-input"
                            type="number"
                            min="0"
                            step="1"
                            value={quantity}
                            onChange={event =>
                              patch({
                                materialQuantities: {
                                  ...quote.materialQuantities,
                                  [index]: Math.max(
                                    0,
                                    Number(eventValue(event))
                                  ),
                                },
                              })
                            }
                            aria-label={t("{material} quantity", {
                              material: material.name,
                            })}
                          />
                        </label>
                      );
                    })
                  ) : (
                    <span className="ws-helper">
                      {t("No priced materials are configured.")}
                    </span>
                  )}
                </div>
              </Field>
              <div className="ws-field full">
                <span>{t("Access, stairs & heavy items")}</span>
                <div style={{ display: "grid", gap: 10 }}>
                  <div className="ws-inline" style={{ flexWrap: "wrap", gap: 12 }}>
                    <SurchargeToggle label={t("Stair surcharge")} checked={quote.surcharges.stairEnabled}
                      onChange={value => patch({ surcharges: { ...quote.surcharges, stairEnabled: value } })} />
                    <SurchargeNumber label={t("Flights")} value={quote.stairsFlights}
                      onChange={value => patch({ stairsFlights: value })} />
                    <SurchargeNumber label={t("$ / flight / hr")} value={quote.surcharges.stairFeePerFlightPerHour}
                      onChange={value => patch({ surcharges: { ...quote.surcharges, stairFeePerFlightPerHour: value } })} />
                    <SurchargeNumber label={t("Included flights")} value={quote.surcharges.stairFreeFlights}
                      onChange={value => patch({ surcharges: { ...quote.surcharges, stairFreeFlights: value } })} />
                  </div>
                  <div className="ws-inline" style={{ flexWrap: "wrap", gap: 12 }}>
                    <SurchargeToggle label={t("Long carry surcharge")} checked={quote.surcharges.carryEnabled}
                      onChange={value => patch({ surcharges: { ...quote.surcharges, carryEnabled: value } })} />
                    <SurchargeNumber label={t("Carry distance (ft)")} step={5} value={quote.carryDistanceFt}
                      onChange={value => patch({ carryDistanceFt: value })} />
                    <SurchargeNumber label={t("Free distance (ft)")} step={5} value={quote.surcharges.carryThresholdFt}
                      onChange={value => patch({ surcharges: { ...quote.surcharges, carryThresholdFt: value } })} />
                    <SurchargeNumber label={t("$ / 25 ft")} value={quote.surcharges.carryFeePer25Ft}
                      onChange={value => patch({ surcharges: { ...quote.surcharges, carryFeePer25Ft: value } })} />
                  </div>
                  <div className="ws-inline" style={{ flexWrap: "wrap", gap: 12 }}>
                    <SurchargeToggle label={t("Heavy item fees")} checked={quote.surcharges.heavyEnabled}
                      onChange={value => patch({ surcharges: { ...quote.surcharges, heavyEnabled: value } })} />
                    <SurchargeNumber label={t("Default fee")} step={10} value={quote.surcharges.heavyDefaultFee}
                      onChange={value => patch({ surcharges: { ...quote.surcharges, heavyDefaultFee: value } })} />
                    <select
                      className="ws-select"
                      style={{ maxWidth: 200 }}
                      defaultValue=""
                      aria-label={t("Tag a heavy item")}
                      onChange={event => {
                        const name = eventValue(event);
                        if (!name) return;
                        patch({
                          inventory: [
                            ...quote.inventory,
                            {
                              key: `heavy-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${quote.inventory.length}`,
                              name,
                              room: "Heavy item",
                              cuft: 0,
                              weight: 0,
                              quantity: 1,
                              heavy: true,
                            },
                          ],
                        });
                        event.currentTarget.value = "";
                      }}
                    >
                      <option value="">{t("Tag a heavy item…")}</option>
                      {HEAVY_ITEM_PRESETS.map(name => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  </div>
                  {quote.inventory.length > 0 && (
                    <div style={{ display: "grid", gap: 6 }}>
                      <small className="ws-helper">
                        {t("Tick any stored item to charge the heavy item fee; set a custom fee per item.")}
                      </small>
                      {quote.inventory.map(item => (
                        <div key={item.key} className="ws-inline" style={{ flexWrap: "wrap", gap: 10 }}>
                          <SurchargeToggle
                            label={`${item.name}${item.quantity > 1 ? ` × ${item.quantity}` : ""}`}
                            checked={Boolean(item.heavy)}
                            onChange={value =>
                              patch({
                                inventory: quote.inventory.map(entry =>
                                  entry.key === item.key ? { ...entry, heavy: value } : entry
                                ),
                              })
                            }
                          />
                          {item.heavy && (
                            <SurchargeNumber
                              label={t("Fee")}
                              step={10}
                              value={item.heavyFee ?? quote.surcharges.heavyDefaultFee}
                              onChange={value =>
                                patch({
                                  inventory: quote.inventory.map(entry =>
                                    entry.key === item.key ? { ...entry, heavyFee: value } : entry
                                  ),
                                })
                              }
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {surchargeLineItems.length > 0 && (
                    <div className="ws-quote-lines">
                      {surchargeLineItems.map(line => (
                        <div key={line.key}>
                          <span>{line.name}<br /><small className="ws-helper">{line.detail}</small></span>
                          <strong>{money(line.amount)}</strong>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <Field full label={t("Pickup / move notes")}>
                <textarea
                  className="ws-textarea"
                  value={quote.notes}
                  onChange={event => patch({ notes: eventValue(event) })}
                />
              </Field>
            </div>
            <aside className="ws-card ws-card-pad">
              <div className="ws-card-title">
                <div>
                  <h2>{t("Proposal preview")}</h2>
                  <p>{t("Computed from the values above.")}</p>
                </div>
              </div>
              <div className="ws-quote-lines">
                <div>
                  <span>
                    {quote.mode === "hourly"
                      ? t("{rate}/hr × {hours} h", {
                          rate: money(quote.hourlyRate),
                          hours: Math.max(
                            pricing.minimumHours,
                            quote.estimatedHours
                          ),
                        })
                      : t("{weight} lb + {miles} mi", {
                          weight: weight(quote.inventory),
                          miles: quote.distanceMiles,
                        })}
                  </span>
                  <strong>
                    {quote.mode === "hourly"
                      ? money(
                          quote.hourlyRate *
                            Math.max(pricing.minimumHours, quote.estimatedHours)
                        )
                      : money(
                          weight(quote.inventory) * quote.weightRate +
                            quote.distanceMiles * quote.mileRate
                        )}
                  </strong>
                </div>
                {quote.travelFee > 0 && (
                  <div>
                    <span>{t("Route travel fee")}</span>
                    <strong>{money(quote.travelFee)}</strong>
                  </div>
                )}
                {quoteFees.map(fee => (
                  <div key={fee.name}>
                    <span>{fee.name}</span>
                    <strong>{money(fee.amount)}</strong>
                  </div>
                ))}
                {weekendAdjustment > 0 && (
                  <div>
                    <span>
                      {t("Weekend adjustment ({percent}%)", {
                        percent: pricing.weekendPercent,
                      })}
                    </span>
                    <strong>{money(weekendAdjustment)}</strong>
                  </div>
                )}
              </div>
              <div className="ws-quote-total">
                <span>
                  <small>{t("Estimated total")}</small>
                  <br />
                  {t("Shareable proposal is created on save")}
                </span>
                <b>{money(total)}</b>
              </div>
            </aside>
          </div>
        )}
        {saveError && (
          <div className="ws-error" style={{ marginTop: 14 }}>
            {t(saveError)}
          </div>
        )}
        <div
          className="ws-modal__foot"
          style={{ padding: "18px 0 0", marginTop: 18 }}
        >
          {step > 0 && (
            <button className="ws-btn" onClick={() => setStep(step - 1)}>
              <ChevronLeft size={15} />
              {t(" Back")}
            </button>
          )}
          {step < 3 ? (
            <button
              className="ws-btn primary"
              disabled={
                (step === 0 && !quote.name) ||
                (step === 1 && (!quote.origin || !quote.destination))
              }
              onClick={() => setStep(step + 1)}
            >
              {t("Continue ")}
              <ChevronRight size={15} />
            </button>
          ) : (
            <button
              className="ws-btn primary"
              disabled={saving}
              onClick={() => void save()}
            >
              <Send size={15} />
              {saving
                ? t("Saving…")
                : editId
                  ? t("Save changes")
                  : t("Save & create proposal")}
            </button>
          )}
        </div>
      </section>
    </>
  );
}

export function JobsPage({ role, navigate }: PageProps) {
  const { t } = useI18n();
  const {
    data: jobs,
    loading,
    error,
    refresh,
  } = useRemote(() => crm.jobs(), []);
  const [filter, setFilter] = useState("all");
  if (loading) return <LoadingBlock label={t("Loading job records…")} />;
  if (error || !jobs)
    return (
      <>
        <PageHead
          heading="Jobs"
          caption="Moves, assignments, and field status."
        />
        <ErrorNotice error={error} retry={() => void refresh()} />
      </>
    );
  const list = jobs.filter(job => filter === "all" || job.status === filter);
  return (
    <>
      <PageHead
        heading="Jobs"
        caption="Every saved estimate and operating move."
        actions={
          <button
            className="ws-btn primary"
            onClick={() => navigate("/app/estimates/new")}
          >
            <Plus size={15} />
            {t(" New job")}
          </button>
        }
      />
      <div className="ws-toolbar">
        <div className="ws-toolbar__filters">
          <select
            className="ws-select"
            value={filter}
            onChange={event => setFilter(eventValue(event))}
          >
            <option value="all">{t("All statuses")}</option>
            {[...new Set(jobs.map(job => job.status))].map(value => (
              <option key={value} value={value}>
                {t(value)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <section className="ws-card ws-card-pad">
        <div className="ws-table-wrap">
          <table className="ws-table">
            <thead>
              <tr>
                <th>{t("Move")}</th>
                <th>{t("Date & time")}</th>
                <th>{t("Route")}</th>
                <th>{t("Status")}</th>
                <th>{t("Amount")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map(job => (
                <tr key={job.id}>
                  <td>
                    <span className="ws-table-main">{title(job)}</span>
                    <small>{job.customerName}</small>
                  </td>
                  <td>
                    {formatDate(job.moveDate)}
                    <small>
                      {t("{time} · {hours} h", {
                        time: hour(job.startHour),
                        hours: job.duration,
                      })}
                    </small>
                  </td>
                  <td>
                    <span>{shortAddress(job.origin)}</span>
                    <small>
                      {t("to")} {shortAddress(job.destination)}
                    </small>
                  </td>
                  <td>
                    <StatusChip status={job.status} />
                  </td>
                  <td>{money(job.finalTotal ?? job.total)}</td>
                  <td>
                    <button
                      className="ws-btn"
                      onClick={() => navigate(`/app/jobs/${job.id}`)}
                    >
                      {t("Open")}
                    </button>
                    <DeleteJobButton
                      jobId={job.id}
                      role={role}
                      onDeleted={async () => {
                        await refresh();
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!list.length && (
          <EmptyState
            title={t("No jobs in this view")}
            detail="Saved estimates appear here. Create a new estimate to start a move record."
            action={
              <button
                className="ws-btn primary"
                onClick={() => navigate("/app/estimates/new")}
              >
                {t("New estimate")}
              </button>
            }
          />
        )}
      </section>
    </>
  );
}

export function JobDetailPage({ role, navigate, path }: PageProps) {
  const { t } = useI18n();
  const id = Number(path.split("/").pop());
  const {
    data: job,
    loading,
    error,
    refresh,
  } = useRemote(() => crm.job(id), [id]);
  const assets = useRemote(() => Promise.all([crm.trucks(), crm.crew()]), [id]);
  const [status, setStatus] = useState("");
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  if (loading) return <LoadingBlock label={t("Loading job details…")} />;
  if (error || !job)
    return (
      <>
        <PageHead heading="Job" caption="Move detail and assignment." />
        <ErrorNotice error={error} retry={() => void refresh()} />
      </>
    );
  const assignAllowed = canManage(role);
  const proposalUrl = `${window.location.origin}/proposal/${job.proposalToken}`;
  const localizedJobMessage = (text: string) => {
    switch (text) {
      case "Status saved.":
        return t("Status saved.");
      case "Proposal link copied.":
        return t("Proposal link copied.");
      case "Copy the proposal URL from your browser address bar.":
        return t("Copy the proposal URL from your browser address bar.");
      default:
        return t(text);
    }
  };
  const saveStatus = async () => {
    try {
      await crm.updateJob(job.id, { status });
      setMessage("Status saved.");
      await refresh();
    } catch (reason) {
      setMessage(
        reason instanceof Error ? reason.message : "Could not update status."
      );
    }
  };
  return (
    <>
      <PageHead
        heading={title(job)}
        caption={`${job.customerName} · Job #${job.id}`}
        actions={
          <>
            <button className="ws-btn" onClick={() => navigate("/app/jobs")}>
              {t("Back to jobs")}
            </button>
            <DeleteJobButton
              jobId={job.id}
              role={role}
              onDeleted={() => navigate("/app/jobs")}
            />
            {job.status === 'estimate' && <TestBookingButton jobId={job.id} role={role} onBooked={() => refresh()} />}
            <button
              className="ws-btn"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(proposalUrl);
                  setCopyMessage("Proposal link copied.");
                } catch {
                  setCopyMessage(
                    "Copy the proposal URL from your browser address bar."
                  );
                }
              }}
            >
              <Copy size={15} />
              {t(" Share proposal")}
            </button>
            {assignAllowed && (
              <button
                className="ws-btn primary"
                onClick={() => setAssignmentOpen(true)}
              >
                <Truck size={15} />
                {t(" Assign dispatch")}
              </button>
            )}
          </>
        }
      />
      {copyMessage && (
        <div className="ws-alert">{localizedJobMessage(copyMessage)}</div>
      )}
      <JobCoreActions jobId={job.id} role={role} navigate={navigate} />
      <JobNotifications jobId={job.id} role={role} />
      {(job as unknown as { testApproval?: unknown }).testApproval ? <div className="ws-alert" role="status"><b>Approved / Booked for testing</b> · No deposit collected; preview admin approval.</div> : null}
      {["admin", "office_admin", "estimator"].includes(role) && job.status === "estimate" && <ProposalPublisher jobId={job.id} onPublished={() => void refresh()} />}
      {(() => {
        const paid = job as unknown as { depositPaidCents?: number; depositPaidAt?: string; depositMode?: string };
        if (!paid.depositPaidCents) return null;
        const test = paid.depositMode === "test";
        return (
          <div className="ws-alert" role="status">
            <b>{test ? t("Test deposit received") : t("Deposit received")}:</b>{" "}
            {money(paid.depositPaidCents / 100)}
            {paid.depositPaidAt ? ` · ${new Date(paid.depositPaidAt).toLocaleString()}` : ""}
            {test && job.status === "estimate" ? ` · ${t("test payments on the live site don't book the job")}` : ""}
          </div>
        );
      })()}
      {message && (
        <div className={message === "Status saved." ? "ws-alert" : "ws-error"}>
          {localizedJobMessage(message)}
        </div>
      )}
      <div className="ws-grid">
        <section className="ws-card ws-card-pad">
          <div className="ws-card-title">
            <div>
              <h2>{t("Move plan")}</h2>
              <p>{t("Saved route, scope, and operating status.")}</p>
            </div>
            <StatusChip status={job.status} />
          </div>
          <div className="ws-detail-grid">
            <Detail
              label={t("Move date")}
              value={`${formatDate(job.moveDate)} · ${hour(job.startHour)}`}
            />
            <Detail label={t("Customer")} value={job.customerName} />
            <Detail label={t("Origin")} value={job.origin} />
            <Detail label={t("Destination")} value={job.destination} />
            <Detail
              label={t("Crew")}
              value={t("{crew} · {hours} estimate hours", {
                crew: moverCount(job.crewSize),
                hours: job.estimatedHours,
              })}
            />
            <Detail
              label={t("Route")}
              value={
                job.distanceMiles
                  ? t("{miles} miles · {minutes} min", {
                      miles: job.distanceMiles,
                      minutes: job.travelMinutes,
                    })
                  : t("Not routed")
              }
            />
          </div>
          {assignAllowed && !job.completedSignature && (
            <div className="ws-inline" style={{ marginTop: 16 }}>
              <select
                className="ws-select"
                value={status || job.status}
                onChange={event => setStatus(eventValue(event))}
              >
                {["draft", "estimate", "booked", "cancelled"].map(value => (
                  <option key={value} value={value}>
                    {t(value)}
                  </option>
                ))}
              </select>
              <button className="ws-btn" onClick={() => void saveStatus()}>
                {t("Save status")}
              </button>
              <span className="ws-helper">
                {t(
                  "Complete moves in Field after walkthroughs, clock-out, and customer signature."
                )}
              </span>
            </div>
          )}
        </section>
        <aside className="ws-card ws-card-pad">
          <div className="ws-card-title">
            <div>
              <h2>{t("Estimate")}</h2>
              <p>
                {job.pricingMode === "hourly"
                  ? t("Hourly move")
                  : t("Long-distance move")}
              </p>
            </div>
          </div>
          <div className="ws-quote-lines">
            <div>
              <span>{t("Base service")}</span>
              <strong>
                {money(
                  job.pricingMode === "hourly"
                    ? job.hourlyRate * Math.max(2.5, job.estimatedHours)
                    : weight(job.inventory) * job.weightRate +
                        job.distanceMiles * job.mileRate
                )}
              </strong>
            </div>
            {job.travelFee > 0 && (
              <div>
                <span>{t("Travel fee")}</span>
                <strong>{money(job.travelFee)}</strong>
              </div>
            )}
            {job.fees.map(fee => (
              <div key={fee.name}>
                <span>{fee.name}</span>
                <strong>{money(fee.amount)}</strong>
              </div>
            ))}
            {Math.abs(job.total - calculateQuote(job)) >= 0.01 && (
              <div>
                <span>{t("Saved pricing adjustment")}</span>
                <strong>{money(job.total - calculateQuote(job))}</strong>
              </div>
            )}
          </div>
          <div className="ws-quote-total">
            <span>
              <small>{t("Estimated total")}</small>
              <br />
              {t("Final invoice is shown in the field sheet and Invoices.")}
            </span>
            <b>{money(job.total)}</b>
          </div>
        </aside>
      </div>
      <div className="ws-grid">
        <section className="ws-card ws-card-pad">
          <div className="ws-card-title">
            <div>
              <h2>{t("Assignment")}</h2>
              <p>{t("Server-validated truck and crew allocation.")}</p>
            </div>
          </div>
          <div className="ws-list">
            <div className="ws-list-row">
              <span className="ws-dot"></span>
              <span className="ws-list-row__primary">
                <b>
                  {job.truckId
                    ? t("Truck #{id}", { id: job.truckId })
                    : t("No truck assigned")}
                </b>
                <small>
                  {job.crewIds.length
                    ? t("{crew} assigned", {
                        crew: moverCount(job.crewIds.length),
                      })
                    : t("No crew assigned")}
                </small>
              </span>
            </div>
            {(assets.data?.[1] || [])
              .filter(member => job.crewIds.includes(member.id))
              .map(member => (
                <div className="ws-list-row" key={member.id}>
                  <span className="ws-list-row__primary">
                    <b>{member.name}</b>
                    <small>{member.phone || "—"}</small>
                  </span>
                  <TextWorker phone={member.phone} compact />
                </div>
              ))}
          </div>
        </section>
        <section className="ws-card ws-card-pad">
          <div className="ws-card-title">
            <div>
              <h2>{t("Proposal")}</h2>
              <p>{t("Public token access is limited to this estimate.")}</p>
            </div>
          </div>
          <ProposalLinkStatus token={job.proposalToken} url={proposalUrl} status={job.status} />
          <p className="ws-helper">
            {(job as unknown as { testApproval?: unknown }).testApproval
              ? 'Approved for testing; customer signature not recorded.'
              : job.signature
              ? t("Customer e-signature received.")
              : t("Awaiting customer signature.")}
          </p>
        </section>
      </div>
      {assignmentOpen && (
        <AssignmentModal
          job={job}
          trucks={assets.data?.[0] || []}
          crew={assets.data?.[1] || []}
          onClose={() => setAssignmentOpen(false)}
          onSaved={async () => {
            setAssignmentOpen(false);
            await refresh();
          }}
        />
      )}
    </>
  );
}

function AssignmentModal({
  job,
  trucks,
  crew,
  jobs = [],
  onClose,
  onSaved,
}: {
  job: Job;
  trucks: TruckType[];
  crew: CrewMember[];
  jobs?: Job[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [truckId, setTruckId] = useState(String(job.truckId || ""));
  const [crewIds, setCrewIds] = useState<number[]>(job.crewIds);
  const [date, setDate] = useState(toLocalDateInput(job.moveDate));
  const [startHour, setStartHour] = useState(job.startHour);
  const [duration, setDuration] = useState(job.duration);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  // Live overlap preview; the server re-checks before saving.
  const clashes = conflictsFor(
    { id: job.id, moveDate: date, startHour, duration, status: job.status, truckId: truckId ? Number(truckId) : null, crewIds },
    jobs as unknown as ScheduledJob[]
  );
  const nameOf = (c: (typeof clashes)[number]) =>
    c.resource === "truck"
      ? trucks.find(x => x.id === c.resourceId)?.name ?? t("Truck")
      : crew.find(x => x.id === c.resourceId)?.name ?? t("Crew member");
  const toggle = (id: number) =>
    setCrewIds(ids =>
      ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id]
    );
  return (
    <Modal title={t("Assign truck & crew")} onClose={onClose}>
      <form
        onSubmit={async event => {
          event.preventDefault();
          setSaving(true);
          setError("");
          try {
            await crm.assignJob(job.id, {
              truckId: truckId ? Number(truckId) : null,
              crewIds,
              startHour,
              moveDate: date,
              duration,
            });
            await onSaved();
          } catch (reason) {
            setError(
              reason instanceof Error
                ? reason.message
                : "Assignment could not be saved."
            );
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="ws-modal__body">
          <div className="ws-alert">
            <ShieldCheck size={15} />{" "}
            {t(
              "Driver eligibility, skills, and schedule conflicts are checked on the server before an assignment saves."
            )}
          </div>
          {clashes.length > 0 && (
            <div className="ws-error" role="alert" style={{ marginTop: 10 }}>
              <CircleAlert size={16} />
              <span>
                {t("Schedule conflict")}:{" "}
                {clashes.map(c => `${nameOf(c)} → #${c.otherJobId}`).join(", ")}
              </span>
            </div>
          )}
          <div className="ws-form-grid" style={{ marginTop: 14 }}>
            <Field label={t("Truck")}>
              <select
                className="ws-select"
                value={truckId}
                onChange={event => setTruckId(eventValue(event))}
              >
                <option value="">{t("No truck selected")}</option>
                {trucks.filter(x => x.status !== "inactive" || x.id === job.truckId).map(truck => (
                  <option value={truck.id} key={truck.id}>
                    {truck.name} · {truck.plate}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("Move date")}>
              <input
                className="ws-input"
                type="date"
                value={date}
                onChange={event => setDate(eventValue(event))}
              />
            </Field>
            <Field label={t("Start hour")}>
              <input
                className="ws-input"
                type="number"
                min="0"
                max="23"
                value={startHour}
                onChange={event => setStartHour(Number(eventValue(event)))}
              />
            </Field>
            <Field label={t("Duration (hours)")}>
              <input
                className="ws-input"
                type="number"
                min=".5"
                step=".5"
                value={duration}
                onChange={event => setDuration(Number(eventValue(event)))}
              />
            </Field>
            <Field full label={t("Crew")}>
              <div className="ws-check-list">
                {crew.filter(p => p.status !== "inactive" || crewIds.includes(p.id)).map(person => (
                  <label key={person.id}>
                    <input
                      type="checkbox"
                      checked={crewIds.includes(person.id)}
                      onChange={() => toggle(person.id)}
                    />
                    <span>
                      <b>{person.name}</b>
                      <small>
                        {t("{role} · Skill {level}", {
                          role: t(CREW_ROLES.find(r => r.value === crewRoleOf(person))!.label),
                          level: person.skillLevel,
                        })}
                      </small>
                    </span>
                  </label>
                ))}
                {!crew.length && (
                  <small>{t("No crew records have been added yet.")}</small>
                )}
              </div>
            </Field>
          </div>
          {error && <div className="ws-error">{t(error)}</div>}
        </div>
        <div className="ws-modal__foot">
          <button type="button" className="ws-btn" onClick={onClose}>
            {t("Cancel")}
          </button>
          <button className="ws-btn primary" disabled={saving || clashes.length > 0}>
            {saving ? t("Checking…") : t("Save assignment")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

type DispatchDropTarget =
  | {
      resource: "truck";
      truckId: number | null;
      startHour: number;
      moveDate?: string;
    }
  | {
      resource: "crew";
      crewId: number;
      startHour: number;
      moveDate?: string;
    }
  | { resource: "calendar"; moveDate: string };

type DispatchResourceRow = {
  key: string;
  resource: "unassigned" | "truck" | "crew";
  id: number | null;
  name: string;
  caption: string;
};

export function DispatchPage({ role, navigate }: PageProps) {
  const { t } = useI18n();
  const { data, loading, error, refresh } = useRemote(
    () => Promise.all([crm.jobs(), crm.trucks(), crm.crew()]),
    []
  );
  const [view, setView] = useState<"day" | "week" | "month">("day");
  const [date, setDate] = useState(today());
  const [conflict, setConflict] = useState("");
  const [assigning, setAssigning] = useState<Job | null>(null);
  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const timer = window.setInterval(refreshWhenVisible, 10_000);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);
  if (loading) return <LoadingBlock label={t("Loading dispatch board…")} />;
  if (error || !data)
    return (
      <>
        <PageHead
          heading="Dispatch"
          caption="Live scheduling and resource validation."
        />
        <ErrorNotice error={error} retry={() => void refresh()} />
      </>
    );
  if (!canManage(role))
    return (
      <>
        <PageHead
          heading="Dispatch"
          caption="Live scheduling and resource validation."
        />
        <div className="ws-alert">
          <ShieldCheck size={16} />{" "}
          {t(
            "Your role can view assigned job information but cannot dispatch assets."
          )}
        </div>
      </>
    );
  const [jobs, trucks, crew] = data;
  const dayJobs = jobs.filter(job => toLocalDateInput(job.moveDate) === date);
  const demoBanner = !jobs.length ? (
    <EmptyState
      title={t("No moves to dispatch yet")}
      detail="Load a sample truck, two crew members and a booked move for today to try the board."
      action={<DemoJobButton role={role} onLoaded={() => { setDate(localToday()); void refresh(); }} />}
    />
  ) : jobs.some(isDemoJob) ? (
    <div style={{ display: "flex", justifyContent: "flex-end" }}><ClearDemoButton role={role} onCleared={() => void refresh()} /></div>
  ) : null;
  const drop = async (event: React.DragEvent, target: DispatchDropTarget) => {
    event.preventDefault();
    const jobId = Number(event.dataTransfer.getData("application/nwcrew-job"));
    const job = jobs.find(item => item.id === jobId);
    if (!job) return;
    const crewIds =
      target.resource === "crew"
        ? [...new Set([...job.crewIds, target.crewId])]
        : job.crewIds;
    setConflict("");
    try {
      await crm.assignJob(job.id, {
        // Calendar drops relocate only; a truck row is the explicit action that
        // changes the vehicle. A crew row adds that person without removing the
        // rest of the assignment, leaving driver/overlap checks to the server.
        truckId: target.resource === "truck" ? target.truckId : job.truckId,
        crewIds,
        startHour:
          target.resource === "calendar" ? job.startHour : target.startHour,
        moveDate:
          target.resource === "calendar"
            ? target.moveDate
            : target.moveDate || date,
        duration: job.duration,
      });
      await refresh();
    } catch (reason) {
      setConflict(
        reason instanceof Error
          ? reason.message
          : "The move conflicts with an existing assignment."
      );
    }
  };
  const changeDate = (increment: number) => {
    const current = new Date(`${date}T12:00:00`);
    if (view === "month") {
      current.setDate(1);
      current.setMonth(current.getMonth() + increment);
    } else {
      current.setDate(current.getDate() + increment);
    }
    setDate(current.toISOString().slice(0, 10));
  };
  const days = calendarDays(view, date);
  // Booked moves still missing a truck or crew, so new bookings never hide on a future date.
  const ready = jobs
    .filter(job => needsDispatch(job))
    .sort((a, b) => a.moveDate.localeCompare(b.moveDate));
  const boardConflicts = allConflicts(jobs as unknown as ScheduledJob[]);
  const jobName = (id: number) => { const j = jobs.find(x => x.id === id); return j ? title(j) : `#${id}`; };
  const resourceName = (c: (typeof boardConflicts)[number]) =>
    c.resource === "truck"
      ? trucks.find(x => x.id === c.resourceId)?.name ?? t("Truck")
      : crew.find(x => x.id === c.resourceId)?.name ?? t("Crew member");
  return (
    <>
      {assigning && (
        <AssignmentModal
          job={assigning}
          trucks={trucks}
          crew={crew}
          jobs={jobs}
          onClose={() => setAssigning(null)}
          onSaved={async () => { setAssigning(null); await refresh(); }}
        />
      )}
      <PageHead
        heading="Dispatch"
        caption="Drop on a truck to change vehicles, or on a crew row to add that person. Server validation is final."
        actions={
          <button className="ws-btn" onClick={() => navigate("/app/jobs")}>
            {t("Open jobs")}
          </button>
        }
      />
      {demoBanner}
      {ready.length > 0 && (
        <section className="ws-card ws-card-pad" style={{ marginBottom: 16 }} aria-label={t("Ready to dispatch")}>
          <div className="ws-card-title"><div><h2>{t("Ready to dispatch")}</h2><p>{t("Booked moves that still need a truck or crew.")}</p></div></div>
          <div style={{ display: "grid", gap: 8 }}>
            {ready.map(job => (
              <div key={job.id} className="ws-inline" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
                <span><b>{title(job)}</b> · {formatDate(job.moveDate)} · {hour(job.startHour)}<small style={{ display: "block" }}>{!job.truckId ? t("Needs a truck") : ""}{!job.truckId && job.crewIds.length < Math.max(1, job.crewSize || 1) ? " · " : ""}{job.crewIds.length < Math.max(1, job.crewSize || 1) ? t("Crew {have}/{need}", { have: job.crewIds.length, need: Math.max(1, job.crewSize || 1) }) : ""}</small></span>
                <span className="ws-inline">
                  <button className="ws-btn" onClick={() => { setView("day"); setDate(toLocalDateInput(job.moveDate)); }}>{t("Show on calendar")}</button>
                  <button className="ws-btn primary" onClick={() => setAssigning(job)}>{t("Assign truck & crew")}</button>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
      {boardConflicts.length > 0 && (
        <div className="ws-error" role="alert" style={{ marginBottom: 12, alignItems: "flex-start" }}>
          <CircleAlert size={16} />
          <span>
            <b>{t("Schedule conflicts on the board")}</b>
            {boardConflicts.map((c, i) => (
              <small key={i} style={{ display: "block" }}>
                {resourceName(c)}: {jobName(c.jobId)} ↔ {jobName(c.otherJobId)}{" "}
                <button className="ws-btn" style={{ padding: "2px 8px", marginLeft: 6 }} onClick={() => { const j = jobs.find(x => x.id === c.jobId); if (j) setAssigning(j); }}>{t("Fix")}</button>
              </small>
            ))}
          </span>
        </div>
      )}
      {conflict && (
        <div className="ws-error">
          <CircleAlert size={16} />
          <span>{t(conflict)}</span>
          <button onClick={() => setConflict("")} className="ws-icon-btn">
            <X size={16} />
          </button>
        </div>
      )}
      <section className="ws-card ws-card-pad">
        <div className="ws-toolbar">
          <div className="ws-tabs" style={{ margin: 0 }}>
            {(["day", "week", "month"] as const).map(value => (
              <button
                className={view === value ? "active" : ""}
                key={value}
                onClick={() => setView(value)}
              >
                {value === "day"
                  ? t("Daily")
                  : value === "week"
                    ? t("Weekly")
                    : t("Monthly")}
              </button>
            ))}
          </div>
          <div className="ws-actions">
            <button
              className="ws-btn"
              onClick={() =>
                changeDate(view === "month" ? -1 : view === "week" ? -7 : -1)
              }
              aria-label={t("Previous calendar period")}
            >
              <ChevronLeft size={15} />
            </button>
            <input
              className="ws-input"
              type="date"
              value={date}
              onChange={event => setDate(eventValue(event))}
            />
            <button
              className="ws-btn"
              onClick={() =>
                changeDate(view === "month" ? 1 : view === "week" ? 7 : 1)
              }
              aria-label={t("Next calendar period")}
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
        {view === "day" ? (
          <DispatchHourGrid
            jobs={dayJobs}
            trucks={trucks}
            crew={crew}
            onDrop={drop}
          />
        ) : (
          <DispatchCalendar
            jobs={jobs}
            days={days}
            currentMonth={date.slice(0, 7)}
            onDrop={drop}
          />
        )}
      </section>
    </>
  );
}

function calendarDays(view: "day" | "week" | "month", value: string) {
  const selected = new Date(`${value}T12:00:00`);
  if (view === "day") return [value];
  const start = new Date(selected);
  if (view === "week") {
    start.setDate(start.getDate() - start.getDay());
    return Array.from({ length: 7 }, (_, index) => dateAfter(start, index));
  }
  start.setDate(1);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(selected.getFullYear(), selected.getMonth() + 1, 0, 12);
  end.setDate(end.getDate() + (6 - end.getDay()));
  const count = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  return Array.from({ length: count }, (_, index) => dateAfter(start, index));
}

function dateAfter(start: Date, offset: number) {
  const next = new Date(start);
  next.setDate(next.getDate() + offset);
  return next.toISOString().slice(0, 10);
}

function DispatchHourGrid({
  jobs,
  trucks,
  crew,
  onDrop,
}: {
  jobs: Job[];
  trucks: TruckType[];
  crew: CrewMember[];
  onDrop: (event: React.DragEvent, target: DispatchDropTarget) => Promise<void>;
}) {
  const { t } = useI18n();
  const rows: DispatchResourceRow[] = [
    {
      key: "unassigned",
      resource: "unassigned",
      id: null,
      name: t("Unassigned truck"),
      caption: t("Drop to remove a truck"),
    },
    ...trucks.map(truck => ({
      key: `truck-${truck.id}`,
      resource: "truck" as const,
      id: truck.id,
      name: truck.name,
      caption: truck.plate || t("Truck resource"),
    })),
    ...crew.map(person => ({
      key: `crew-${person.id}`,
      resource: "crew" as const,
      id: person.id,
      name: person.name,
      caption: t("{role} · Skill {level}", {
        role: t(person.isDriver ? "Driver" : "Loader"),
        level: person.skillLevel,
      }),
    })),
  ];
  const hours = Array.from({ length: 24 }, (_, index) => index);
  const quarters = Array.from({ length: 96 }, (_, index) => index / 4);
  const placement = (job: Job) => {
    const start = Math.max(1, Math.min(96, Math.round(job.startHour * 4) + 1));
    const span = Math.max(1, Math.min(97 - start, Math.ceil(job.duration * 4)));
    return { gridColumn: `${start}/span ${span}` };
  };
  return (
    <div
      className="ws-dispatch"
      style={
        {
          "--dispatch-rows": rows.length,
          "--dispatch-cols": quarters.length,
        } as React.CSSProperties
      }
    >
      <div className="ws-dispatch__left">
        <div className="ws-dispatch__label">
          <strong>{t("Truck / crew resource")}</strong>
        </div>
        {rows.map(row => (
          <div className="ws-dispatch__label" key={row.key}>
            <span>
              <strong>{row.name}</strong>
              <br />
              {row.caption}
            </span>
          </div>
        ))}
      </div>
      <div className="ws-dispatch__grid">
        {hours.map(hourValue => (
          <div
            className="ws-dispatch__hour"
            key={hourValue}
            style={{ gridColumn: `${hourValue * 4 + 1}/span 4`, gridRow: 1 }}
          >
            {hour(hourValue)}
          </div>
        ))}
        {rows.flatMap((row, rowIndex) =>
          quarters.map(startHour => {
            const target: DispatchDropTarget =
              row.resource === "crew"
                ? { resource: "crew", crewId: row.id!, startHour }
                : {
                    resource: "truck",
                    truckId: row.resource === "truck" ? row.id : null,
                    startHour,
                  };
            return (
              <div
                className="ws-dispatch__slot"
                key={`${row.key}-${startHour}`}
                style={{
                  gridColumn: Math.round(startHour * 4) + 1,
                  gridRow: rowIndex + 2,
                }}
                onDragOver={event => event.preventDefault()}
                onDrop={event => void onDrop(event, target)}
              />
            );
          })
        )}
        {rows.flatMap((row, rowIndex) => {
          const rowJobs =
            row.resource === "crew"
              ? jobs.filter(job => job.crewIds.includes(row.id!))
              : jobs.filter(job =>
                  row.resource === "truck"
                    ? job.truckId === row.id
                    : job.truckId === null
                );
          return rowJobs.map(job => (
            <JobCard
              key={`${row.key}-${job.id}`}
              job={job}
              style={{ ...placement(job), gridRow: rowIndex + 2 }}
            />
          ));
        })}
      </div>
      <div className="ws-dispatch-crew-note">
        <UsersRound size={15} />
        {crew.length
          ? t(
              "Crew rows show every assigned move. Drop on a crew row to add that person; server overlap and driver-skill rules remain authoritative."
            )
          : t("Add crew before assigning people to a move.")}
      </div>
    </div>
  );
}

function DispatchCalendar({
  jobs,
  days,
  currentMonth,
  onDrop,
}: {
  jobs: Job[];
  days: string[];
  currentMonth: string;
  onDrop: (event: React.DragEvent, target: DispatchDropTarget) => Promise<void>;
}) {
  const { t } = useI18n();
  return (
    <div
      className={`ws-calendar ws-calendar-${days.length === 7 ? "week" : "month"}`}
    >
      {days.map(day => (
        <div
          className={`ws-calendar-day ${day.slice(0, 7) !== currentMonth ? "is-outside-month" : ""}`}
          key={day}
          onDragOver={event => event.preventDefault()}
          onDrop={event =>
            void onDrop(event, { resource: "calendar", moveDate: day })
          }
        >
          <b>
            {formatDate(day, {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </b>
          {jobs
            .filter(job => toLocalDateInput(job.moveDate) === day)
            .map(job => (
              <JobCard key={job.id} job={job} />
            ))}
        </div>
      ))}
    </div>
  );
}
function JobCard({ job, style }: { job: Job; style?: React.CSSProperties }) {
  const { t } = useI18n();
  return (
    <button
      className="ws-dispatch-job"
      draggable
      onDragStart={event => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("application/nwcrew-job", String(job.id));
      }}
      style={style}
    >
      <GripVertical size={11} />
      <b>{title(job)}</b>
      <small>
        {t("{time} · {hours} h", {
          time: hour(job.startHour),
          hours: job.duration,
        })}
      </small>
    </button>
  );
}

export function FleetPage({ role, navigate }: PageProps) {
  const { t } = useI18n();
  const { data, loading, error, refresh } = useRemote(
    () => Promise.all([crm.trucks(), crm.crew(), crm.members()]),
    []
  );
  const [tab, setTab] = useState<"fleet" | "crew">("fleet");
  const [truck, setTruck] = useState<TruckType | "new" | null>(null);
  const [person, setPerson] = useState<CrewMember | "new" | null>(null);
  if (loading) return <LoadingBlock label={t("Loading fleet and crew…")} />;
  if (error || !data)
    return (
      <>
        <PageHead
          heading="Fleet & crew"
          caption="Equipment capacity and skilled people."
        />
        <ErrorNotice error={error} retry={() => void refresh()} />
      </>
    );
  const [trucks, crew, members] = data;
  const memberByUserId = new Map(
    members.map(member => [member.userId, member])
  );
  const allowed = canManage(role);
  const addAction = allowed ? (
    <button
      className="ws-btn primary"
      onClick={() => (tab === "fleet" ? setTruck("new") : setPerson("new"))}
    >
      <Plus size={15} /> {t(tab === "fleet" ? "Add truck" : "Add crew member")}
    </button>
  ) : undefined;
  return (
    <>
      <PageHead
        heading="Fleet & crew"
        caption="Dispatch resources saved for this workspace."
        actions={addAction}
      />
      <div className="ws-tabs">
        <button
          className={tab === "fleet" ? "active" : ""}
          onClick={() => setTab("fleet")}
        >
          {t("Fleet ({count})", { count: trucks.length })}
        </button>
        <button
          className={tab === "crew" ? "active" : ""}
          onClick={() => setTab("crew")}
        >
          {t("Crew ({count})", { count: crew.length })}
        </button>
      </div>
      {tab === "fleet" ? (
        <section className="ws-card ws-card-pad">
          <div className="ws-table-wrap">
            <table className="ws-table">
              <thead>
                <tr>
                  <th>{t("Vehicle")}</th>
                  <th>{t("Plate")}</th>
                  <th>{t("Capacity")}</th>
                  <th>{t("Dimensions")}</th>
                  <th>{t("Status")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {trucks.map(vehicle => (
                  <tr key={vehicle.id}>
                    <td className="ws-table-main">{vehicle.name}</td>
                    <td>{vehicle.plate}</td>
                    <td>
                      {t("{count} cu ft", {
                        count: vehicle.capacityCuft.toLocaleString(getLocale()),
                      })}
                      <small>
                        {t("{count} lb limit", {
                          count:
                            vehicle.weightLimit.toLocaleString(getLocale()),
                        })}
                      </small>
                    </td>
                    <td>{vehicle.dimensions || "—"}</td>
                    <td>
                      <StatusChip status={vehicle.status} />
                    </td>
                    <td>
                      {allowed && (
                        <button
                          className="ws-icon-btn"
                          onClick={() => setTruck(vehicle)}
                        >
                          <Pencil size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!trucks.length && (
            <EmptyState
              title={t("No fleet records")}
              detail="Add vehicle capacity and dimensions before dispatching a move."
              action={
                allowed ? (
                  <button
                    className="ws-btn primary"
                    onClick={() => setTruck("new")}
                  >
                    {t("Add truck")}
                  </button>
                ) : undefined
              }
            />
          )}
        </section>
      ) : (
        <>
          <WorkerDirectory role={role} navigate={navigate} />
          <section className="ws-card ws-card-pad">
            <div className="ws-table-wrap">
              <table className="ws-table">
                <thead>
                  <tr>
                    <th>{t("Team member")}</th>
                    <th>{t("Role & skills")}</th>
                    <th>{t("Rate")}</th>
                    <th>{t("Linked user")}</th>
                    <th>{t("Status")}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {crew.map(member => (
                    <tr key={member.id}>
                      <td>
                        <span className="ws-table-main">{member.name}</span>
                        <small>
                          {member.email ||
                            member.phone ||
                            t("No contact recorded")}
                        </small>
                      </td>
                      <td>
                        {t(CREW_ROLES.find(r => r.value === crewRoleOf(member))!.label)}
                        <small>
                          {t("Skill level {level}", {
                            level: member.skillLevel,
                          })}
                        </small>
                      </td>
                      <td>
                        {t("{rate}/hr", { rate: money(member.hourlyRate) })}
                      </td>
                      <td>
                        {member.userId
                          ? memberByUserId.get(member.userId)?.email ||
                            t("User #{id}", { id: member.userId })
                          : t("Not linked")}
                      </td>
                      <td>
                        <StatusChip status={member.status} />
                      </td>
                      <td>
                        {allowed && (
                          <button
                            className="ws-icon-btn"
                            onClick={() => setPerson(member)}
                          >
                            <Pencil size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!crew.length && (
              <EmptyState
                title={t("No crew records")}
                detail="Add drivers and movers with skills before assigning them to jobs."
                action={
                  allowed ? (
                    <button
                      className="ws-btn primary"
                      onClick={() => setPerson("new")}
                    >
                      {t("Add crew member")}
                    </button>
                  ) : undefined
                }
              />
            )}
          </section>
        </>
      )}
      {truck && (
        <TruckModal
          initial={truck}
          onClose={() => setTruck(null)}
          onSaved={async () => {
            setTruck(null);
            await refresh();
          }}
        />
      )}{" "}
      {person && (
        <CrewModal
          initial={person}
          members={members}
          onClose={() => setPerson(null)}
          onSaved={async () => {
            setPerson(null);
            await refresh();
          }}
        />
      )}
    </>
  );
}
function TruckModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: TruckType | "new";
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState(
    initial === "new"
      ? {
          name: "",
          plate: "",
          capacityCuft: 0,
          weightLimit: 0,
          dimensions: "",
          status: "active",
        }
      : initial
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (key: keyof typeof form, value: string | number) =>
    setForm(current => ({ ...current, [key]: value }));
  return (
    <Modal
      title={initial === "new" ? t("Add truck") : t("Edit truck")}
      onClose={onClose}
    >
      <form
        onSubmit={async e => {
          e.preventDefault();
          setSaving(true);
          try {
            if (initial === "new") await crm.createTruck(form);
            else await crm.updateTruck(initial.id, form);
            await onSaved();
          } catch (reason) {
            setError(
              reason instanceof Error ? reason.message : "Could not save truck."
            );
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="ws-modal__body">
          <div className="ws-form-grid">
            <Field label={t("Truck name")}>
              <input
                required
                className="ws-input"
                value={form.name}
                onChange={e => set("name", eventValue(e))}
              />
            </Field>
            <Field label={t("Plate")}>
              <input
                className="ws-input"
                value={form.plate}
                onChange={e => set("plate", eventValue(e))}
              />
            </Field>
            <Field label={t("Capacity (cu ft)")}>
              <input
                required
                type="number"
                min="0"
                className="ws-input"
                value={form.capacityCuft}
                onChange={e => set("capacityCuft", Number(eventValue(e)))}
              />
            </Field>
            <Field label={t("Weight limit (lb)")}>
              <input
                required
                type="number"
                min="0"
                className="ws-input"
                value={form.weightLimit}
                onChange={e => set("weightLimit", Number(eventValue(e)))}
              />
            </Field>
            <Field label={t("Dimensions")}>
              <input
                className="ws-input"
                placeholder={t("L × W × H")}
                value={form.dimensions}
                onChange={e => set("dimensions", eventValue(e))}
              />
            </Field>
            <Field label={t("Status")}>
              <select
                className="ws-select"
                value={form.status}
                onChange={e => set("status", eventValue(e))}
              >
                <option value="active">{t("active")}</option>
                <option value="maintenance">{t("maintenance")}</option>
                <option value="inactive">{t("inactive")}</option>
              </select>
            </Field>
          </div>
          {error && <div className="ws-error">{t(error)}</div>}
        </div>
        <div className="ws-modal__foot">
          <button type="button" className="ws-btn" onClick={onClose}>
            {t("Cancel")}
          </button>
          <button className="ws-btn primary" disabled={saving}>
            {saving ? t("Saving…") : t("Save truck")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function CrewModal({
  initial,
  members,
  onClose,
  onSaved,
}: {
  initial: CrewMember | "new";
  members: Member[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState(
    initial === "new"
      ? {
          userId: null as number | null,
          crewRole: "helper" as CrewRole,
          name: "",
          email: "",
          phone: "",
          isDriver: false,
          skillLevel: 1,
          hourlyRate: 0,
          status: "active",
        }
      : initial
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (
    key: keyof typeof form,
    value: string | number | boolean | null
  ) => setForm(current => ({ ...current, [key]: value }));
  return (
    <Modal
      title={initial === "new" ? t("Add crew member") : t("Edit crew member")}
      onClose={onClose}
    >
      <form
        onSubmit={async e => {
          e.preventDefault();
          setSaving(true);
          try {
            if (initial === "new") await crm.createCrew(form);
            else await crm.updateCrew(initial.id, form);
            await onSaved();
          } catch (reason) {
            setError(
              reason instanceof Error
                ? reason.message
                : "Could not save crew member."
            );
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="ws-modal__body">
          <div className="ws-form-grid">
            <Field label={t("Name")}>
              <input
                required
                className="ws-input"
                value={form.name}
                onChange={e => set("name", eventValue(e))}
              />
            </Field>
            <Field label={t("Email")}>
              <input
                className="ws-input"
                type="email"
                value={form.email}
                onChange={e => set("email", eventValue(e))}
              />
            </Field>
            <Field label={t("Phone")}>
              <input
                className="ws-input"
                value={form.phone}
                onChange={e => set("phone", eventValue(e))}
              />
            </Field>
            <Field label={t("Linked signed-in team member")}>
              <select
                className="ws-select"
                value={form.userId ?? ""}
                onChange={e => {
                  const linked = members.find(
                    member => member.userId === Number(eventValue(e))
                  );
                  setForm(current => ({
                    ...current,
                    userId: linked?.userId ?? null,
                    name: linked && !current.name ? linked.name : current.name,
                    email:
                      linked && !current.email ? linked.email : current.email,
                  }));
                }}
              >
                <option value="">{t("Unlinked field profile")}</option>
                {members.map(member => (
                  <option value={member.userId} key={member.id}>
                    {member.name} · {member.email} (
                    {t(member.role.replace("_", " "))})
                  </option>
                ))}
              </select>
              <small className="ws-helper">
                {t(
                  "Link a signed-in member for their own assigned jobs to appear in Field crew."
                )}
              </small>
            </Field>
            <Field label={t("Skill level")}>
              <input
                required
                className="ws-input"
                type="number"
                min="1"
                max="5"
                value={form.skillLevel}
                onChange={e => set("skillLevel", Number(eventValue(e)))}
              />
            </Field>
            <Field label={t("Hourly rate")}>
              <input
                required
                className="ws-input"
                type="number"
                min="0"
                value={form.hourlyRate}
                onChange={e => set("hourlyRate", Number(eventValue(e)))}
              />
            </Field>
            <Field label={t("Primary role")}>
              <select
                className="ws-select"
                value={crewRoleOf(form)}
                onChange={e => {
                  const value = eventValue(e) as CrewRole;
                  setForm(current => ({ ...current, crewRole: value, isDriver: value === "driver" }));
                }}
              >
                {CREW_ROLES.map(r => (
                  <option key={r.value} value={r.value}>{t(r.label)}</option>
                ))}
              </select>
            </Field>
            <Field label={t("Status")}>
              <select
                className="ws-select"
                value={form.status}
                onChange={e => set("status", eventValue(e))}
              >
                <option value="active">{t("active")}</option>
                <option value="inactive">{t("inactive")}</option>
              </select>
            </Field>
          </div>
          {error && <div className="ws-error">{t(error)}</div>}
        </div>
        <div className="ws-modal__foot">
          <button type="button" className="ws-btn" onClick={onClose}>
            {t("Cancel")}
          </button>
          <button className="ws-btn primary" disabled={saving}>
            {saving ? t("Saving…") : t("Save crew member")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function FieldPage({ role, navigate }: PageProps) {
  const { t } = useI18n();
  const {
    data: jobs,
    loading,
    error,
    refresh,
  } = useRemote(() => crm.jobs(), []);
  const [selected, setSelected] = useState<number | null>(() => {
    const value = Number(
      new URLSearchParams(window.location.search).get("job")
    );
    return Number.isInteger(value) && value > 0 ? value : null;
  });
  if (loading)
    return <LoadingBlock label={t("Loading assigned job sheets…")} />;
  if (error || !jobs)
    return (
      <>
        <PageHead
          heading="Field crew"
          caption="Move sheets, time capture, damage documentation, and completion."
        />
        <ErrorNotice error={error} retry={() => void refresh()} />
      </>
    );
  const job = jobs.find(item => item.id === selected) || jobs[0];
  return (
    <>
      <PageHead
        heading="Field crew"
        caption={
          role === "crew"
            ? t("Only jobs assigned to your linked crew record are shown.")
            : t("Use the same field workflow your crew sees on move day.")
        }
        actions={
          <button className="ws-btn" onClick={() => navigate("/app/jobs")}>
            {t("All jobs")}
          </button>
        }
      />
      <FieldChecklist />
      {!job ? (
        <EmptyState
          title={t("No assigned move sheets")}
          detail="Assigned job records will become available here for field execution."
        />
      ) : (
        <>
          <div className="ws-field-selector">
            {jobs.map(item => (
              <button
                className={item.id === job.id ? "active" : ""}
                onClick={() => setSelected(item.id)}
                key={item.id}
              >
                {formatDate(item.moveDate, { month: "short", day: "numeric" })}
                <b>{title(item)}</b>
              </button>
            ))}
          </div>
          <FieldJobSheet
            key={`${job.id}:${job.clockIn || ""}:${job.clockOut || ""}`}
            job={job}
            onChanged={refresh}
          />
        </>
      )}
    </>
  );
}
function FieldJobSheet({
  job,
  onChanged,
}: {
  job: Job;
  onChanged: () => Promise<unknown>;
}) {
  const { t } = useI18n();
  const {
    data: damage,
    loading,
    error,
    refresh,
  } = useRemote(() => crm.damage(job.id), [job.id]);
  const [note, setNote] = useState("");
  const [phase, setPhase] = useState<"pre" | "post">("pre");
  const [file, setFile] = useState<string | undefined>();
  const [signature, setSignature] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    tone: "success" | "error" | "pending";
    text: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [pollingPayment, setPollingPayment] = useState(false);
  const returnState = new URLSearchParams(window.location.search).get(
    "checkout"
  );
  const hasPreWalkthrough = Boolean(damage?.some(item => item.phase === "pre"));
  const hasPostWalkthrough = Boolean(
    damage?.some(item => item.phase === "post")
  );
  const invoicePaid = job.invoiceStatus.trim().toLowerCase() === "paid";
  const canCheckout = Boolean(
    job.clockOut && !invoicePaid && job.finalTotal !== null
  );
  const localizedNotice = (text: string) => {
    switch (text) {
      case "Checkout returned. Checking the saved payment record; this return is not proof of payment.":
        return t(
          "Checkout returned. Checking the saved payment record; this return is not proof of payment."
        );
      case "Checkout was cancelled. No payment has been confirmed.":
        return t("Checkout was cancelled. No payment has been confirmed.");
      case "Clock in before saving the post-move walkthrough.":
        return t("Clock in before saving the post-move walkthrough.");
      case "Walkthrough note saved.":
        return t("Walkthrough note saved.");
      case "Could not save walkthrough note.":
        return t("Could not save walkthrough note.");
      case "Save the pre-move walkthrough before clocking in.":
        return t("Save the pre-move walkthrough before clocking in.");
      case "Save the post-move walkthrough before clocking out.":
        return t("Save the post-move walkthrough before clocking out.");
      case "Clock-in saved. Complete the post-move walkthrough before clocking out.":
        return t(
          "Clock-in saved. Complete the post-move walkthrough before clocking out."
        );
      case "Clock-out saved; the server calculated the final invoice.":
        return t("Clock-out saved; the server calculated the final invoice.");
      case "Could not update time.":
        return t("Could not update time.");
      case "Customer completion signature saved.":
        return t("Customer completion signature saved.");
      case "Could not complete move.":
        return t("Could not complete move.");
      case "Stripe TEST checkout opened in a new tab. Payment remains pending until a saved payment record is updated.":
        return t(
          "Stripe TEST checkout opened in a new tab. Payment remains pending until a saved payment record is updated."
        );
      case "Could not start Stripe test checkout.":
        return t("Could not start Stripe test checkout.");
      default:
        return t(text);
    }
  };

  useEffect(() => {
    if (!returnState) return;
    setPollingPayment(true);
    setNotice({
      tone: "pending",
      text:
        returnState === "success"
          ? "Checkout returned. Checking the saved payment record; this return is not proof of payment."
          : "Checkout was cancelled. No payment has been confirmed.",
    });
    let attempts = 0;
    void onChanged();
    const timer = window.setInterval(() => {
      attempts += 1;
      void onChanged();
      if (attempts >= 6) {
        window.clearInterval(timer);
        setPollingPayment(false);
      }
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [job.id, returnState]);

  const submitDamage = async (savedNote = note) => {
    if (!savedNote.trim()) return;
    if (phase === "post" && !job.clockIn) {
      setNotice({
        tone: "error",
        text: "Clock in before saving the post-move walkthrough.",
      });
      return;
    }
    setBusy(true);
    try {
      await crm.createDamage(job.id, {
        phase,
        note: savedNote.trim(),
        photoData: file,
      });
      setNote("");
      setFile(undefined);
      await refresh();
      if (phase === "pre") setPhase("post");
      setNotice({ tone: "success", text: "Walkthrough note saved." });
    } catch (reason) {
      setNotice({
        tone: "error",
        text:
          reason instanceof Error
            ? reason.message
            : "Could not save walkthrough note.",
      });
    } finally {
      setBusy(false);
    }
  };
  const clock = async (action: "in" | "out") => {
    const walkthroughComplete =
      action === "in" ? hasPreWalkthrough : hasPostWalkthrough;
    if (!walkthroughComplete) {
      setNotice({
        tone: "error",
        text:
          action === "in"
            ? "Save the pre-move walkthrough before clocking in."
            : "Save the post-move walkthrough before clocking out.",
      });
      return;
    }
    setBusy(true);
    try {
      await crm.clock(job.id, action);
      await onChanged();
      setNotice({
        tone: "success",
        text:
          action === "in"
            ? "Clock-in saved. Complete the post-move walkthrough before clocking out."
            : "Clock-out saved; the server calculated the final invoice.",
      });
    } catch (reason) {
      setNotice({
        tone: "error",
        text:
          reason instanceof Error ? reason.message : "Could not update time.",
      });
    } finally {
      setBusy(false);
    }
  };
  const complete = async () => {
    if (!signature) return;
    setBusy(true);
    try {
      await crm.complete(job.id, signature);
      await onChanged();
      setNotice({
        tone: "success",
        text: "Customer completion signature saved.",
      });
    } catch (reason) {
      setNotice({
        tone: "error",
        text:
          reason instanceof Error ? reason.message : "Could not complete move.",
      });
    } finally {
      setBusy(false);
    }
  };
  const checkout = async () => {
    if (!canCheckout) return;
    setBusy(true);
    try {
      const result = await crm.checkout(job.id, window.location.origin);
      window.open(result.url, "_blank", "noopener,noreferrer");
      setPollingPayment(true);
      setNotice({
        tone: "pending",
        text: "Stripe TEST checkout opened in a new tab. Payment remains pending until a saved payment record is updated.",
      });
      window.setTimeout(() => void onChanged(), 5_000);
    } catch (reason) {
      setNotice({
        tone: "error",
        text:
          reason instanceof Error
            ? reason.message
            : "Could not start Stripe test checkout.",
      });
    } finally {
      setBusy(false);
    }
  };
  const workflow = [
    { label: t("Pre-move walkthrough"), complete: hasPreWalkthrough },
    { label: t("Clock in"), complete: Boolean(job.clockIn) },
    { label: t("Post-move walkthrough"), complete: hasPostWalkthrough },
    { label: t("Clock out"), complete: Boolean(job.clockOut) },
    {
      label: t("Customer completion"),
      complete: Boolean(job.completedSignature),
    },
  ];
  return (
    <div className="ws-field-job">
      <IndividualClock jobId={job.id} />
      <section className="ws-card ws-card-pad">
        <div className="ws-mobile-job-head">
          <div>
            <h2>{title(job)}</h2>
            <p>
              {job.customerName} · {formatDate(job.moveDate)} ·{" "}
              {hour(job.startHour)}
            </p>
          </div>
          <StatusChip status={job.status} />
        </div>
        <div className="ws-detail-grid">
          <Detail label={t("Pickup")} value={job.origin} />
          <Detail label={t("Delivery")} value={job.destination} />
          <Detail
            label={t("Scheduled service window")}
            value={t("{start}–{end} · {hours} h", {
              start: hour(job.startHour),
              end: hour(job.startHour + job.duration),
              hours: job.duration,
            })}
          />
          <Detail
            label={t("Customer")}
            value={`${job.customerName}${job.customerPhone ? ` · ${job.customerPhone}` : ""}`}
          />
          <Detail label={t("Pickup access notes")} value={job.originNotes} />
          <Detail
            label={t("Delivery access notes")}
            value={job.destinationNotes}
          />
        </div>
        <div className="ws-actions" style={{ marginTop: 15 }}>
          {job.customerPhone && (
            <a className="ws-btn" href={`tel:${job.customerPhone}`}>
              <Phone size={15} />
              {t(" Call customer")}
            </a>
          )}
          {job.customerEmail && (
            <a className="ws-btn" href={`mailto:${job.customerEmail}`}>
              <Mail size={15} />
              {t(" Email customer")}
            </a>
          )}
          {!job.customerPhone && !job.customerEmail && (
            <span className="ws-helper">
              {t("No customer call or email contact is saved.")}
            </span>
          )}
        </div>
        <ol className="ws-workflow" aria-label={t("Move-day workflow")}>
          {workflow.map((step, index) => (
            <li className={step.complete ? "complete" : ""} key={step.label}>
              <span>{step.complete ? <Check size={13} /> : index + 1}</span>
              {t(step.label)}
            </li>
          ))}
        </ol>
        <div className="ws-actions" style={{ marginTop: 15 }}>
          {!job.clockIn ? (
            <button
              disabled={busy || !hasPreWalkthrough}
              className="ws-btn primary"
              onClick={() => void clock("in")}
            >
              <Clock3 size={15} />
              {t(" Clock in")}
            </button>
          ) : !job.clockOut ? (
            <button
              disabled={busy || !hasPostWalkthrough}
              className="ws-btn primary"
              onClick={() => void clock("out")}
            >
              <Clock3 size={15} />
              {t(" Clock out")}
            </button>
          ) : (
            <span className="ws-chip green">
              {t("Actual hours {hours}", {
                hours: job.actualHours ?? t("calculated"),
              })}
            </span>
          )}{" "}
          {!job.clockIn && !hasPreWalkthrough && (
            <span className="ws-helper">
              {t("Pre-move walkthrough required first.")}
            </span>
          )}
          {job.clockIn && !job.clockOut && !hasPostWalkthrough && (
            <span className="ws-helper">
              {t("Post-move walkthrough required before clock-out.")}
            </span>
          )}
          {job.clockIn && (
            <span className="ws-helper">
              {t("In:")}{" "}
              {formatDate(job.clockIn, { hour: "numeric", minute: "2-digit" })}
            </span>
          )}
        </div>
      </section>
      {notice && (
        <div
          className={notice.tone === "error" ? "ws-error" : "ws-alert"}
          style={{ marginTop: 12 }}
        >
          {localizedNotice(notice.text)}
        </div>
      )}
      <section className="ws-card ws-card-pad" style={{ marginTop: 12 }}>
        <div className="ws-card-title">
          <div>
            <h2>{t("Walkthrough & damage notes")}</h2>
            <p>
              {t(
                "Document pre-move or post-move conditions with optional photo proof."
              )}
            </p>
          </div>
        </div>
        <div className="ws-form-grid">
          <Field label={t("Walkthrough phase")}>
            <select
              className="ws-select"
              value={phase}
              onChange={e => setPhase(eventValue(e) as "pre" | "post")}
            >
              <option value="pre">{t("Pre-move")}</option>
              <option value="post">{t("Post-move")}</option>
            </select>
          </Field>
          <Field label={t("Damage or condition note")}>
            <textarea
              className="ws-textarea"
              value={note}
              onChange={e => setNote(eventValue(e))}
              placeholder={
                phase === "pre"
                  ? t("Describe pre-existing condition clearly")
                  : t("Describe post-move condition clearly")
              }
            />
          </Field>
          <Field full label={t("Optional photo")}>
            <input
              className="ws-input"
              type="file"
              accept="image/*"
              onChange={event => {
                const item = event.target.files?.[0];
                if (!item) {
                  setFile(undefined);
                  return;
                }
                const reader = new FileReader();
                reader.onload = () =>
                  setFile(
                    typeof reader.result === "string"
                      ? reader.result
                      : undefined
                  );
                reader.readAsDataURL(item);
              }}
            />
          </Field>
        </div>
        <div className="ws-actions" style={{ marginTop: 12 }}>
          <button
            disabled={busy || !note.trim()}
            className="ws-btn"
            onClick={() => void submitDamage()}
          >
            <ImagePlus size={15} />
            {t(" Save walkthrough note")}
          </button>
          <button
            disabled={busy || (phase === "post" && !job.clockIn)}
            className="ws-btn"
            onClick={() =>
              void submitDamage(
                phase === "pre"
                  ? "No pre-existing damage observed"
                  : "No post-move damage observed"
              )
            }
          >
            <Check size={15} />
            {t(" No damage observed — confirm walkthrough")}
          </button>
        </div>
        {loading ? (
          <LoadingBlock label={t("Loading saved walkthrough notes…")} />
        ) : error ? (
          <ErrorNotice error={error} />
        ) : damage?.length ? (
          <div className="ws-list" style={{ marginTop: 16 }}>
            {damage.map(item => (
              <div className="ws-list-row" key={item.id}>
                <span
                  className={`ws-dot ${item.phase === "post" ? "warning" : ""}`}
                />
                <span className="ws-list-row__primary">
                  <b>
                    {t("{phase} note", {
                      phase: t(item.phase === "pre" ? "Pre-move" : "Post-move"),
                    })}
                  </b>
                  <small>
                    {item.note} ·{" "}
                    {formatDate(item.createdAt, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </small>
                </span>
                {item.photoUrl && (
                  <a
                    className="ws-damage-photo"
                    href={item.photoUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={t("Open {phase} walkthrough photo", {
                      phase: t(item.phase === "pre" ? "Pre-move" : "Post-move"),
                    })}
                  >
                    <img
                      src={item.photoUrl}
                      alt={t("{phase} walkthrough", {
                        phase: t(
                          item.phase === "pre" ? "Pre-move" : "Post-move"
                        ),
                      })}
                    />
                    <span>{t("View photo")}</span>
                  </a>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="ws-helper">{t("No walkthrough notes saved yet.")}</p>
        )}
      </section>
      <section className="ws-card ws-card-pad" style={{ marginTop: 12 }}>
        <div className="ws-card-title">
          <div>
            <h2>{t("Final invoice & customer completion")}</h2>
            <p>
              {t(
                "Available after clock-out. The server calculates final billing; Stripe updates payment only through the saved payment record."
              )}
            </p>
          </div>
        </div>
        {job.clockOut ? (
          <>
            <div className="ws-invoice-summary">
              <div>
                <small>{t("Final total")}</small>
                <b>{money(job.finalTotal ?? job.total)}</b>
              </div>
              <div>
                <small>{t("Recorded labor hours")}</small>
                <b>{job.actualHours ?? "—"}</b>
              </div>
              <div>
                <small>
                  {job.pricingMode === "hourly"
                    ? t("Labor rate")
                    : t("Distance rates")}
                </small>
                <b>
                  {job.pricingMode === "hourly"
                    ? t("{rate}/hr", { rate: money(job.hourlyRate) })
                    : t("{weight}/lb · {mile}/mi", {
                        weight: money(job.weightRate),
                        mile: money(job.mileRate),
                      })}
                </b>
              </div>
              <div>
                <small>{t("Fees")}</small>
                <b>
                  {money(
                    job.travelFee +
                      job.fees.reduce((sum, fee) => sum + fee.amount, 0)
                  )}
                </b>
              </div>
              <div>
                <small>{t("Invoice status")}</small>
                <StatusChip status={job.invoiceStatus || "unpaid"} />
              </div>
            </div>
            <div className="ws-actions" style={{ marginTop: 13 }}>
              <span className="ws-chip orange">{t("Stripe TEST")}</span>
              {invoicePaid ? (
                <span className="ws-chip green">{t("Payment recorded")}</span>
              ) : (
                <button
                  disabled={busy || !canCheckout}
                  className="ws-btn primary"
                  onClick={() => void checkout()}
                >
                  <CreditCard size={15} />
                  {t(" Open Stripe checkout")}
                </button>
              )}
              {pollingPayment && !invoicePaid && (
                <span className="ws-helper">
                  {t("Checking saved payment status every 5 seconds.")}
                </span>
              )}
            </div>
          </>
        ) : (
          <div className="ws-alert">
            <Clock3 size={16} />
            {t(
              " Clock out after the post-move walkthrough to calculate the final invoice and unlock checkout."
            )}
          </div>
        )}
        <div className="ws-field-completion">
          {job.completedSignature ? (
            <div className="ws-alert">
              <Check size={16} />
              {t(" Customer completion signature is saved for this job.")}
            </div>
          ) : job.clockOut ? (
            <>
              <SignaturePad
                onChange={setSignature}
                label={t("Customer signature")}
              />
              <div className="ws-actions" style={{ marginTop: 12 }}>
                <button
                  disabled={busy || !signature}
                  className="ws-btn primary"
                  onClick={() => void complete()}
                >
                  <Check size={15} />
                  {t(" Save completion")}
                </button>
              </div>
            </>
          ) : (
            <div className="ws-alert">
              <Clock3 size={16} />
              {t(
                " Clock out when the move is finished to calculate final billing, then collect the customer signature."
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export function InvoicesPage({ navigate }: PageProps) {
  const { t } = useI18n();
  const { data, loading, error, refresh } = useRemote(
    () => Promise.all([crm.jobs(), crm.payments()]),
    []
  );
  const [message, setMessage] = useState<{
    tone: "error" | "pending";
    text: string;
  } | null>(null);
  const [openingJobId, setOpeningJobId] = useState<number | null>(null);
  const [polling, setPolling] = useState(false);
  const returnState = new URLSearchParams(window.location.search).get(
    "checkout"
  );
  useEffect(() => {
    if (!returnState && !polling) return;
    let attempts = 0;
    void refresh();
    const timer = window.setInterval(() => {
      attempts += 1;
      void refresh();
      if (attempts >= 6) {
        window.clearInterval(timer);
        setPolling(false);
      }
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [returnState, polling]);
  if (loading)
    return (
      <LoadingBlock label={t("Loading invoices and saved payment history…")} />
    );
  if (error || !data)
    return (
      <>
        <PageHead
          heading="Invoices"
          caption="Final invoices and saved payment records."
        />
        <ErrorNotice error={error} retry={() => void refresh()} />
      </>
    );
  const [jobs, payments] = data;
  const localizedInvoiceMessage = (text: string) => {
    switch (text) {
      case "Stripe TEST checkout opened in a new tab. Checking the saved payment record; opening checkout is not payment confirmation.":
        return t(
          "Stripe TEST checkout opened in a new tab. Checking the saved payment record; opening checkout is not payment confirmation."
        );
      case "Could not start Stripe test checkout.":
        return t("Could not start Stripe test checkout.");
      default:
        return t(text);
    }
  };
  const makeCheckout = async (job: Job) => {
    if (!job.clockOut || job.invoiceStatus.trim().toLowerCase() === "paid")
      return;
    setOpeningJobId(job.id);
    try {
      const result = await crm.checkout(job.id, window.location.origin);
      window.open(result.url, "_blank", "noopener,noreferrer");
      setPolling(true);
      setMessage({
        tone: "pending",
        text: "Stripe TEST checkout opened in a new tab. Checking the saved payment record; opening checkout is not payment confirmation.",
      });
    } catch (reason) {
      setMessage({
        tone: "error",
        text:
          reason instanceof Error
            ? reason.message
            : "Could not start Stripe test checkout.",
      });
    } finally {
      setOpeningJobId(null);
    }
  };
  return (
    <>
      <PageHead
        heading="Invoices"
        caption="Payment history is shown from durable server records."
      />
      {returnState && (
        <div className="ws-alert">
          <CircleAlert size={15} />{" "}
          {t(
            "Checkout return received. Checking the saved payment record every 5 seconds; a return URL does not mean payment succeeded."
          )}
        </div>
      )}
      {message && (
        <div className={message.tone === "error" ? "ws-error" : "ws-alert"}>
          {localizedInvoiceMessage(message.text)}
        </div>
      )}
      <section className="ws-card ws-card-pad">
        <div className="ws-table-wrap">
          <table className="ws-table">
            <thead>
              <tr>
                <th>{t("Invoice")}</th>
                <th>{t("Customer")}</th>
                <th>{t("Amount")}</th>
                <th>{t("Status")}</th>
                <th>{t("Saved payment")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {jobs.map(job => {
                const match = payments.find(
                  payment => Number(payment.jobId) === job.id
                );
                const paid =
                  job.invoiceStatus.trim().toLowerCase() === "paid" ||
                  String(match?.status || "")
                    .trim()
                    .toLowerCase() === "paid";
                const finalInvoiceReady = Boolean(
                  job.clockOut && job.finalTotal !== null
                );
                return (
                  <tr key={job.id}>
                    <td>
                      <span className="ws-table-main">#{job.id}</span>
                      <small>{formatDate(job.moveDate)}</small>
                    </td>
                    <td>{job.customerName}</td>
                    <td>{money(job.finalTotal ?? job.total)}</td>
                    <td>
                      <StatusChip
                        status={
                          job.invoiceStatus ||
                          String(match?.status || "not invoiced")
                        }
                      />
                    </td>
                    <td>
                      {match ? (
                        <small>
                          {t(String(match.status || "Recorded"))} ·{" "}
                          {match.createdAt
                            ? formatDate(String(match.createdAt))
                            : t("saved payment")}
                        </small>
                      ) : (
                        <small>{t("No payment record")}</small>
                      )}
                    </td>
                    <td>
                      <div className="ws-row-actions">
                        <button
                          className="ws-btn"
                          onClick={() => navigate(`/app/jobs/${job.id}`)}
                        >
                          {t("View")}
                        </button>
                        <button
                          className="ws-btn primary"
                          disabled={
                            paid ||
                            !finalInvoiceReady ||
                            openingJobId === job.id
                          }
                          title={
                            paid
                              ? t("Payment is already recorded")
                              : !finalInvoiceReady
                                ? t(
                                    "Clock out to calculate the final invoice first"
                                  )
                                : t("Open Stripe test checkout")
                          }
                          onClick={() => void makeCheckout(job)}
                        >
                          {paid
                            ? t("Paid")
                            : openingJobId === job.id
                              ? t("Opening…")
                              : t("Checkout")}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!jobs.length && (
          <EmptyState
            title={t("No invoices yet")}
            detail="Saved jobs will appear here when an estimate or final invoice is available."
          />
        )}
      </section>
    </>
  );
}

export function SettingsPage({ role, navigate, integrationsTab, workspaceId = Number(getWorkspaceId()), appearanceWritable = true }: PageProps & { integrationsTab?: boolean; workspaceId?: number; appearanceWritable?: boolean }) {
  const { t } = useI18n();
  const [tab, setTabState] = useState<"pricing" | "team" | "sequences" | "integrations" | "appearance" | "branding">(integrationsTab ? "integrations" : "pricing");
  const setTab = (next: "pricing" | "team" | "sequences" | "integrations" | "appearance" | "branding") => {
    setTabState(next);
    navigate(next === "integrations" ? "/app/settings/integrations" : "/app/settings");
  };
  const allowed = canOffice(role) || (role === "dispatcher" && tab === "team");
  return (
    <>
      <PageHead
        heading="Settings"
        caption={t(
          "Your role: {role}. Server permissions remain authoritative.",
          { role: t(role.replace("_", " ")) }
        )}
      />
      <div className="ws-tabs">
        <Button variant="ghost" className={tab === "appearance" ? "active" : ""} onClick={() => setTab("appearance")}>Appearance</Button>
        <button
          className={tab === "branding" ? "active" : ""}
          onClick={() => setTab("branding")}
        >
          {t("White-label")}
        </button>
        <button
          className={tab === "pricing" ? "active" : ""}
          onClick={() => setTab("pricing")}
        >
          {t("Pricing")}
        </button>
        <button
          className={tab === "team" ? "active" : ""}
          onClick={() => setTab("team")}
        >
          {t("Membership")}
        </button>
        <button
          className={tab === "sequences" ? "active" : ""}
          onClick={() => setTab("sequences")}
        >
          {t("Sequences")}
        </button>
        <button
          className={tab === "integrations" ? "active" : ""}
          onClick={() => setTab("integrations")}
        >
          {t("Website integrations")}
        </button>
        <button onClick={() => navigate("/app/settings/billing")}>{t("Billing")}</button>
      </div>
      {!allowed ? (
        <div className="ws-alert">
          <ShieldCheck size={16} />{" "}
          {t(
            "Pricing and sequence settings are available to Admin and Office Admin. Dispatchers can use the Membership tab as a read-only crew directory."
          )}
        </div>
      ) : tab === "appearance" ? (
        <AppearanceSettings role={role} workspaceId={workspaceId} writable={appearanceWritable} />
      ) : tab === "branding" ? (
        <BrandingSettings role={role} workspaceId={workspaceId} writable={appearanceWritable} />
      ) : tab === "pricing" ? (
        <><DepositSettings admin={role === "admin"} /><TravelSettings admin={role === "admin"} /><PricingSettings /></>
      ) : tab === "team" ? (
        <MembershipSettings role={role} />
      ) : tab === "integrations" ? (
        <IntegrationsHub admin={role === "admin"} />
      ) : (
        <SequenceSettings />
      )}
    </>
  );
}
function PricingSettings() {
  const { t } = useI18n();
  const {
    data: pricing,
    loading,
    error,
    refresh,
  } = useRemote(() => crm.pricing(), []);
  const [form, setForm] = useState<Pricing | null>(null);
  const [message, setMessage] = useState("");
  if (loading) return <LoadingBlock label={t("Loading pricing…")} />;
  if (error || !pricing)
    return <ErrorNotice error={error} retry={() => void refresh()} />;
  const value = form || pricing;
  const save = async () => {
    try {
      await crm.updatePricing(value);
      setForm(null);
      setMessage("Pricing settings saved.");
      await refresh();
    } catch (reason) {
      setMessage(
        reason instanceof Error ? reason.message : "Could not save pricing."
      );
    }
  };
  const patch = (change: Partial<Pricing>) =>
    setForm(current => ({ ...(current || pricing), ...change }));
  return (
    <section className="ws-settings-section ws-card ws-card-pad">
      <div className="ws-card-title">
        <div>
          <h2>{t("Rates & materials")}</h2>
          <p>
            {t(
              "Editable workspace configuration; this is not a published tariff."
            )}
          </p>
        </div>
      </div>
      <div className="ws-form-grid three">
        {value.rates.map((rate, index) => (
          <Field
            key={index}
            label={
              index === 0
                ? t("{crew} (no truck)", { crew: moverCount(index + 1) })
                : moverCount(index + 1)
            }
          >
            <input
              className="ws-input"
              type="number"
              min="0"
              value={rate}
              onChange={e =>
                patch({
                  rates: value.rates.map((amount, i) =>
                    i === index ? Number(eventValue(e)) : amount
                  ),
                })
              }
            />
          </Field>
        ))}
        <Field label={t("Minimum hours")}>
          <input
            className="ws-input"
            type="number"
            min="0"
            step=".5"
            value={value.minimumHours}
            onChange={e => patch({ minimumHours: Number(eventValue(e)) })}
          />
        </Field>
        <Field label={t("Packing hourly rate")}>
          <input
            className="ws-input"
            type="number"
            min="0"
            value={value.packingRate}
            onChange={e => patch({ packingRate: Number(eventValue(e)) })}
          />
        </Field>
        <Field label={t("Weekend markup %")}>
          <input
            className="ws-input"
            type="number"
            min="0"
            value={value.weekendPercent}
            onChange={e => patch({ weekendPercent: Number(eventValue(e)) })}
          />
        </Field>
        <Field label={t("Travel per mile")}>
          <input
            className="ws-input"
            type="number"
            min="0"
            step=".01"
            value={value.travelPerMile}
            onChange={e => patch({ travelPerMile: Number(eventValue(e)) })}
          />
        </Field>
        <Field label={t("Weight rate")}>
          <input
            className="ws-input"
            type="number"
            min="0"
            step=".01"
            value={value.weightRate}
            onChange={e => patch({ weightRate: Number(eventValue(e)) })}
          />
        </Field>
        <Field label={t("Mile rate")}>
          <input
            className="ws-input"
            type="number"
            min="0"
            step=".01"
            value={value.mileRate}
            onChange={e => patch({ mileRate: Number(eventValue(e)) })}
          />
        </Field>
      </div>
      <div className="ws-card-title" style={{ marginTop: 19 }}>
        <div>
          <h2>{t("Material matrix")}</h2>
        </div>
      </div>
      {value.materials.map((material, index) => (
        <div
          className="ws-inline"
          key={`${material.name}-${index}`}
          style={{ marginBottom: 7 }}
        >
          <input
            className="ws-input"
            value={material.name}
            onChange={e =>
              patch({
                materials: value.materials.map((m, i) =>
                  i === index ? { ...m, name: eventValue(e) } : m
                ),
              })
            }
          />
          <input
            className="ws-input"
            type="number"
            min="0"
            step=".01"
            value={material.price}
            onChange={e =>
              patch({
                materials: value.materials.map((m, i) =>
                  i === index ? { ...m, price: Number(eventValue(e)) } : m
                ),
              })
            }
          />
        </div>
      ))}
      {message && (
        <div
          className={message.includes("saved") ? "ws-alert" : "ws-error"}
          style={{ marginTop: 12 }}
        >
          {t(message)}
        </div>
      )}
      <div className="ws-actions" style={{ marginTop: 16 }}>
        <button className="ws-btn primary" onClick={() => void save()}>
          {t("Save pricing")}
        </button>
      </div>
    </section>
  );
}
function MembershipSettings({ role }: { role: WorkspaceRole }) {
  const { t } = useI18n();
  const {
    data: members,
    loading,
    error,
    refresh,
  } = useRemote(() => crm.members(), []);
  const [message, setMessage] = useState("");
  if (loading) return <LoadingBlock label={t("Loading membership…")} />;
  if (error || !members)
    return <ErrorNotice error={error} retry={() => void refresh()} />;
  return (
    <section className="ws-settings-section">
      <section className="ws-card ws-card-pad">
        <div className="ws-card-title">
          <div>
            <h2>{t("Workspace membership")}</h2>
            <p>
              {t(
                "People must have signed in before their email can be linked."
              )}
            </p>
          </div>
        </div>
        <div className="ws-table-wrap">
          <table className="ws-table">
            <thead>
              <tr>
                <th>{t("Member")}</th>
                <th>{t("Role")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {members.map(member => (
                <tr key={member.id}>
                  <td>
                    <span className="ws-table-main">{member.name}</span>
                    <small>{member.email}</small>
                  </td>
                  <td>
                    <select
                      className="ws-select"
                      disabled={role !== "admin"}
                      value={member.role}
                      onChange={async e => {
                        try {
                          await crm.updateMember(
                            member.id,
                            eventValue(e) as WorkspaceRole
                          );
                          await refresh();
                        } catch (reason) {
                          setMessage(
                            reason instanceof Error
                              ? reason.message
                              : "Could not update role."
                          );
                        }
                      }}
                    >
                      {roleOptions.map(value => (
                        <option value={value} key={value}>
                          {t(value.replace("_", " "))}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {member.role === "admin" && <StatusChip status="admin" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <CrewInvitations role={role} onAccepted={() => void refresh()} />
      {message && (
        <div
          className={message.includes("saved") ? "ws-alert" : "ws-error"}
          style={{ marginTop: 12 }}
        >
          {t(message)}
        </div>
      )}
    </section>
  );
}
const roleOptions: WorkspaceRole[] = [
  "admin",
  "office_admin",
  "estimator",
  "dispatcher",
  "crew",
];
function SequenceSettings() {
  const { t } = useI18n();
  const {
    data: sequences,
    loading,
    error,
    refresh,
  } = useRemote(() => crm.sequences(), []);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: "",
    trigger: "lead_created",
    channel: "email" as "email" | "sms",
    delayHours: 24,
    condition: "",
    template: "",
    enabled: true,
  });
  const [message, setMessage] = useState("");
  if (loading) return <LoadingBlock label={t("Loading saved sequences…")} />;
  if (error || !sequences)
    return <ErrorNotice error={error} retry={() => void refresh()} />;
  const save = async () => {
    try {
      if (editingId) await crm.updateSequence(editingId, form);
      else await crm.createSequence(form);
      setAdding(false);
      setEditingId(null);
      setMessage(
        `Sequence configuration ${editingId ? "updated" : "saved"}. Delivery remains not connected.`
      );
      await refresh();
    } catch (reason) {
      setMessage(
        reason instanceof Error ? reason.message : "Could not save sequence."
      );
    }
  };
  const startNew = () => {
    setEditingId(null);
    setForm({
      name: "",
      trigger: "lead_created",
      channel: "email",
      delayHours: 24,
      condition: "",
      template: "",
      enabled: true,
    });
    setAdding(true);
  };
  const startEdit = (sequence: (typeof sequences)[number]) => {
    setEditingId(sequence.id);
    setForm({
      name: sequence.name,
      trigger: sequence.trigger,
      channel: sequence.channel,
      delayHours: sequence.delayHours,
      condition: sequence.condition,
      template: sequence.template,
      enabled: sequence.enabled,
    });
    setAdding(true);
  };
  const toggleEnabled = async (sequence: (typeof sequences)[number]) => {
    try {
      await crm.updateSequence(sequence.id, { enabled: !sequence.enabled });
      setMessage(`Sequence ${sequence.enabled ? "paused" : "enabled"}.`);
      await refresh();
    } catch (reason) {
      setMessage(
        reason instanceof Error ? reason.message : "Could not update sequence."
      );
    }
  };
  const closeModal = () => {
    setAdding(false);
    setEditingId(null);
  };
  return (
    <section className="ws-settings-section">
      <div className="ws-alert">
        <CircleAlert size={16} />
        <span>
          <b>{t("Delivery not connected.")}</b>{" "}
          {t(
            "Sequences are durable configuration only. No email or SMS is sent from this workspace without a configured provider and consent."
          )}
        </span>
      </div>
      <div className="ws-card ws-card-pad" style={{ marginTop: 15 }}>
        <div className="ws-card-title">
          <div>
            <h2>{t("Conditional sequences")}</h2>
            <p>
              {t("Saved timing and templates, with delivery visibly inactive.")}
            </p>
          </div>
          <button className="ws-btn primary" onClick={startNew}>
            <Plus size={14} />
            {t(" New sequence")}
          </button>
        </div>
        {sequences.length ? (
          <div className="ws-list">
            {sequences.map(sequence => (
              <div className="ws-list-row" key={sequence.id}>
                <span className="ws-dot warning" />
                <span className="ws-list-row__primary">
                  <b>{sequence.name}</b>
                  <small>
                    {sequence.channel.toUpperCase()} · {sequence.trigger} ·
                    {t("after {hours} h", { hours: sequence.delayHours })} ·{" "}
                    {sequence.condition || t("No saved condition")}
                  </small>
                </span>
                <StatusChip
                  status={sequence.deliveryStatus || "not connected"}
                />
                <StatusChip status={sequence.enabled ? "enabled" : "paused"} />
                <div className="ws-row-actions">
                  <button
                    className="ws-btn"
                    onClick={() => startEdit(sequence)}
                  >
                    <Pencil size={14} />
                    {t(" Edit")}
                  </button>
                  <button
                    className="ws-btn"
                    onClick={() => void toggleEnabled(sequence)}
                  >
                    {sequence.enabled ? "Disable" : "Enable"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title={t("No sequences configured")}
            detail={t(
              "Add a conditional email or SMS template. It will remain delivery-not-connected until a provider is set up."
            )}
          />
        )}
      </div>
      {message && (
        <div className="ws-alert" style={{ marginTop: 12 }}>
          {t(message)}
        </div>
      )}
      {adding && (
        <Modal
          title={editingId ? t("Edit sequence") : t("New sequence")}
          onClose={closeModal}
        >
          <div className="ws-modal__body">
            <div className="ws-form-grid">
              <Field label={t("Sequence name")}>
                <input
                  className="ws-input"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: eventValue(e) })}
                />
              </Field>
              <Field label={t("Channel")}>
                <select
                  className="ws-select"
                  value={form.channel}
                  onChange={e =>
                    setForm({
                      ...form,
                      channel: eventValue(e) as "email" | "sms",
                    })
                  }
                >
                  <option value="email">{t("Email")}</option>
                  <option value="sms">{t("SMS")}</option>
                </select>
              </Field>
              <Field label={t("Trigger")}>
                <input
                  className="ws-input"
                  value={form.trigger}
                  onChange={e => setForm({ ...form, trigger: eventValue(e) })}
                />
              </Field>
              <Field label={t("Delay hours")}>
                <input
                  className="ws-input"
                  type="number"
                  min="0"
                  value={form.delayHours}
                  onChange={e =>
                    setForm({ ...form, delayHours: Number(eventValue(e)) })
                  }
                />
              </Field>
              <Field full label={t("Condition")}>
                <input
                  className="ws-input"
                  placeholder={t("e.g. status is estimate_sent")}
                  value={form.condition}
                  onChange={e => setForm({ ...form, condition: eventValue(e) })}
                />
              </Field>
              <Field full label={t("Template")}>
                <textarea
                  className="ws-textarea"
                  value={form.template}
                  onChange={e => setForm({ ...form, template: eventValue(e) })}
                />
              </Field>
              <label className="ws-checkbox full">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={event =>
                    setForm({ ...form, enabled: event.currentTarget.checked })
                  }
                />
                <span>
                  {t("Enabled configuration (delivery remains disconnected)")}
                </span>
              </label>
            </div>
          </div>
          <div className="ws-modal__foot">
            <button className="ws-btn" onClick={closeModal}>
              {t("Cancel")}
            </button>
            <button
              className="ws-btn primary"
              disabled={!form.name}
              onClick={() => void save()}
            >
              {editingId ? t("Save changes") : t("Save configuration")}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}

function Field({
  label,
  children,
  full = false,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  const { t } = useI18n();
  return (
    <label className={`ws-field ${full ? "full" : ""}`}>
      <span>{t(label)}</span>
      {children}
    </label>
  );
}
function Detail({ label, value }: { label: string; value: string }) {
  const { t } = useI18n();
  return (
    <div className="ws-detail">
      <small>{t(label)}</small>
      <span>{value || "—"}</span>
    </div>
  );
}
function hour(value: number) {
  const minutesInDay = 24 * 60;
  const totalMinutes =
    ((Math.round(value * 60) % minutesInDay) + minutesInDay) % minutesInDay;
  return new Intl.DateTimeFormat(getLocale(), {
    hour: "numeric",
    minute: "2-digit",
  }).format(
    new Date(2026, 0, 1, Math.floor(totalMinutes / 60), totalMinutes % 60)
  );
}
function shortAddress(value: string) {
  return value ? value.split(",").slice(0, 2).join(",") : "—";
}

function ProposalLinkStatus({ token, url, status }: { token?: string; url: string; status: string }) {
  const { t } = useI18n();
  const [live, setLive] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    if (!token || !/^[a-f0-9]{32}$/.test(token)) { setLive(false); return; }
    import("@/lib/proposals.functions")
      .then(m => m.readProposal({ data: { token } }))
      .then(() => { if (active) setLive(true); })
      .catch(() => { if (active) setLive(false); });
    return () => { active = false; };
  }, [token]);
  if (live === null) return <p className="ws-helper">{t("Checking proposal link…")}</p>;
  if (!live)
    return (
      <p className="ws-helper">
        {status === "estimate"
          ? t("No customer proposal yet. Use \"Create proposal link\" above to make one.")
          : t("No customer proposal for this job. Set the status to estimate to create one.")}
      </p>
    );
  return (
    <a className="ws-link" href={url} target="_blank" rel="noreferrer">
      {t("Open shareable proposal")} <ExternalLink size={14} />
    </a>
  );
}
