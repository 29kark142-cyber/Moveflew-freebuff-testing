import { useEffect, useState } from "react";
import { CalendarRange, Plus, Printer, Save } from "lucide-react";
import { crm, crmFetch } from "@/lib/crm";
import { useI18n } from "@/lib/i18n";
import {
  EmptyState,
  ErrorNotice,
  LoadingBlock,
  formatDate,
} from "@/components/workspace/WorkspaceUI";
import type { CrewMember, Job, Truck as TruckRecord } from "@shared/crm";
import type { ModuleProps } from "@shared/expansion";
import type { TripPlan } from "@shared/trips";
import "@/trips.css";
const today = () => new Date().toISOString().slice(0, 10);
const fresh = () => ({
  id: 0,
  name: "",
  fromDate: today(),
  toDate: today(),
  status: "planned",
  notes: "",
  jobIds: [] as number[],
  truckIds: [] as number[],
  driverIds: [] as number[],
  acknowledgeConflicts: false,
});
const write = (method: string, body: unknown) => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
export default function TripPlanning({ role }: ModuleProps) {
  const { t } = useI18n();
  const [trips, setTrips] = useState<TripPlan[]>([]),
    [jobs, setJobs] = useState<Job[]>([]),
    [trucks, setTrucks] = useState<TruckRecord[]>([]),
    [crew, setCrew] = useState<CrewMember[]>([]);
  const [form, setForm] = useState(fresh),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [error, setError] = useState<unknown>(null),
    [message, setMessage] = useState(""),
    [printing, setPrinting] = useState<number | null>(null);
  const allowed = ["admin", "office_admin", "dispatcher"].includes(role);
  const refresh = async () => {
    setError(null);
    try {
      const [plans, moves, fleet, staff] = await Promise.all([
        crmFetch<TripPlan[]>("/ops/trips"),
        crm.jobs(),
        crm.trucks(),
        crm.crew(),
      ]);
      setTrips(plans);
      setJobs(moves);
      setTrucks(fleet);
      setCrew(staff);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (allowed) void refresh();
    else setLoading(false);
  }, [allowed]);
  useEffect(() => {
    const after = () => setPrinting(null);
    window.addEventListener("afterprint", after);
    return () => window.removeEventListener("afterprint", after);
  }, []);
  const patch = (value: Partial<ReturnType<typeof fresh>>) =>
    setForm(current => ({ ...current, ...value }));
  const toggle = (field: "jobIds" | "truckIds" | "driverIds", id: number) =>
    patch({
      [field]: form[field].includes(id)
        ? form[field].filter(value => value !== id)
        : [...form[field], id],
    });
  const warning = (value: string) =>
    value.startsWith("Truck overlaps trip: ")
      ? t("Truck overlaps trip: {name}", {
          name: value.slice("Truck overlaps trip: ".length),
        })
      : value.startsWith("Driver overlaps trip: ")
        ? t("Driver overlaps trip: {name}", {
            name: value.slice("Driver overlaps trip: ".length),
          })
        : t(value);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage("");
    try {
      await crmFetch<TripPlan>(
        `/ops/trips${form.id ? `/${form.id}` : ""}`,
        write(form.id ? "PATCH" : "POST", form)
      );
      setForm(fresh());
      setMessage("Trip saved.");
      await refresh();
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  };
  if (!allowed)
    return (
      <div className="ws-alert">
        {t("Trip planning is available to dispatch and office administrators.")}
      </div>
    );
  if (loading)
    return <LoadingBlock label={t("Loading trips and resources…")} />;
  return (
    <>
      <div className="ws-page-head">
        <div>
          <h1>{t("Trip planning")}</h1>
          <p>
            {t(
              "Group booked moves into a multi-day trip, link trucks and drivers, and review overlapping commitments."
            )}
          </p>
        </div>
      </div>
      <div className="ws-alert trip-notice">
        {t(
          "Trip plans do not reschedule their jobs. Resource conflicts are warnings that require explicit acknowledgment; regular dispatch still enforces job-level assignment rules."
        )}
      </div>
      {error && <ErrorNotice error={error} retry={() => void refresh()} />}
      {message && <div className="ws-success">{t(message)}</div>}
      <div className="trip-layout">
        <section className="ws-card trip-editor">
          <div className="ws-card-title">
            <h2>{form.id ? t("Edit trip") : t("Plan a trip")}</h2>
            {form.id > 0 && (
              <button className="ws-btn" onClick={() => setForm(fresh())}>
                <Plus size={14} />
                {t("New trip")}
              </button>
            )}
          </div>
          <form onSubmit={event => void submit(event)} className="trip-form">
            <label>
              {t("Trip name")}
              <input
                className="ws-input"
                required
                maxLength={180}
                value={form.name}
                onChange={event => patch({ name: event.target.value })}
              />
            </label>
            <div className="trip-form-pair">
              <label>
                {t("From date")}
                <input
                  className="ws-input"
                  type="date"
                  required
                  value={form.fromDate}
                  onChange={event => patch({ fromDate: event.target.value })}
                />
              </label>
              <label>
                {t("To date")}
                <input
                  className="ws-input"
                  type="date"
                  required
                  min={form.fromDate}
                  value={form.toDate}
                  onChange={event => patch({ toDate: event.target.value })}
                />
              </label>
            </div>
            <label>
              {t("Status")}
              <select
                className="ws-input"
                value={form.status}
                onChange={event => patch({ status: event.target.value })}
              >
                <option value="planned">{t("Planned")}</option>
                <option value="dispatched">{t("Dispatched")}</option>
                <option value="completed">{t("Completed")}</option>
                <option value="cancelled">{t("Cancelled")}</option>
              </select>
            </label>
            <fieldset>
              <legend>{t("Booked jobs")}</legend>
              <div className="trip-options">
                {jobs
                  .filter(job =>
                    ["booked", "in_progress", "completed"].includes(job.status)
                  )
                  .map(job => (
                    <label key={job.id}>
                      <input
                        type="checkbox"
                        checked={form.jobIds.includes(job.id)}
                        onChange={() => toggle("jobIds", job.id)}
                      />
                      <span>
                        <b>
                          #{job.id} · {job.title}
                        </b>
                        <small>
                          {formatDate(job.moveDate)} · {job.customerName}
                        </small>
                      </span>
                    </label>
                  ))}
                {!jobs.some(job =>
                  ["booked", "in_progress", "completed"].includes(job.status)
                ) && (
                  <p className="ws-helper">
                    {t("Book a job first, then add it to a trip.")}
                  </p>
                )}
              </div>
            </fieldset>
            <fieldset>
              <legend>{t("Trucks")}</legend>
              <div className="trip-options">
                {trucks.map(truck => (
                  <label key={truck.id}>
                    <input
                      type="checkbox"
                      checked={form.truckIds.includes(truck.id)}
                      onChange={() => toggle("truckIds", truck.id)}
                    />
                    <span>
                      <b>{truck.name}</b>
                      <small>
                        {truck.capacityCuft} {t("cu ft")} · {t(truck.status)}
                      </small>
                    </span>
                  </label>
                ))}
                {trucks.length === 0 && (
                  <p className="ws-helper">
                    {t("Add trucks in Fleet & crew to link trip resources.")}
                  </p>
                )}
              </div>
            </fieldset>
            <fieldset>
              <legend>{t("Eligible drivers")}</legend>
              <div className="trip-options">
                {crew
                  .filter(member => member.isDriver)
                  .map(member => (
                    <label key={member.id}>
                      <input
                        type="checkbox"
                        checked={form.driverIds.includes(member.id)}
                        onChange={() => toggle("driverIds", member.id)}
                      />
                      <span>
                        <b>{member.name}</b>
                        <small>
                          {member.phone} · {t(member.status)}
                        </small>
                      </span>
                    </label>
                  ))}
                {!crew.some(member => member.isDriver) && (
                  <p className="ws-helper">
                    {t(
                      "Mark eligible crew members as drivers in Fleet & crew."
                    )}
                  </p>
                )}
              </div>
            </fieldset>
            <label>
              {t("Trip notes")}
              <textarea
                className="ws-input"
                rows={3}
                maxLength={5000}
                value={form.notes}
                onChange={event => patch({ notes: event.target.value })}
              />
            </label>
            <label className="trip-ack">
              <input
                type="checkbox"
                checked={form.acknowledgeConflicts}
                onChange={event =>
                  patch({ acknowledgeConflicts: event.target.checked })
                }
              />
              <span>
                {t(
                  "I have reviewed overlapping trip commitments and explicitly approve any resource conflict."
                )}
              </span>
            </label>
            <button className="ws-btn primary" disabled={saving}>
              <Save size={15} />
              {saving ? t("Saving…") : t("Save trip")}
            </button>
          </form>
        </section>
        <section className="trip-list">
          <div className="ws-card-title trip-list-head">
            <div>
              <h2>{t("Planned trips")}</h2>
              <p>{t("{count} trip records", { count: trips.length })}</p>
            </div>
            <CalendarRange size={21} />
          </div>
          {trips.length === 0 && (
            <EmptyState
              title="No trips yet"
              detail="Create a named trip, then link booked jobs, trucks, and drivers."
            />
          )}
          {trips.map(trip => (
            <article
              key={trip.id}
              className={`ws-card trip-record ${printing !== null && printing !== trip.id ? "trip-record--hide-print" : ""}`}
            >
              <div className="ws-card-title">
                <div>
                  <span className="ws-eyebrow">
                    {t("Trip summary")} #{trip.id}
                  </span>
                  <h2>{trip.name}</h2>
                  <p>
                    {formatDate(trip.fromDate)} – {formatDate(trip.toDate)}
                  </p>
                </div>
                <span className="ws-status">{t(trip.status)}</span>
              </div>
              <dl className="trip-resource-summary">
                <div>
                  <dt>{t("Trucks")}</dt>
                  <dd>
                    {trip.truckIds
                      .map(
                        id =>
                          trucks.find(truck => truck.id === id)?.name ??
                          `#${id}`
                      )
                      .join(", ") || t("Not assigned")}
                  </dd>
                </div>
                <div>
                  <dt>{t("Drivers")}</dt>
                  <dd>
                    {trip.driverIds
                      .map(
                        id =>
                          crew.find(member => member.id === id)?.name ??
                          `#${id}`
                      )
                      .join(", ") || t("Not assigned")}
                  </dd>
                </div>
              </dl>
              {trip.warnings.map((item, index) => (
                <div key={index} className="ws-alert trip-warning">
                  {warning(item)}
                </div>
              ))}
              {trip.jobIds.map(id => {
                const job = jobs.find(item => item.id === id);
                return (
                  <div key={id} className="trip-job">
                    <b>
                      #{id} {job?.title}
                    </b>
                    {job && (
                      <>
                        <span>
                          {formatDate(job.moveDate)} · {job.customerName}
                        </span>
                        <p>
                          {job.origin} → {job.destination}
                        </p>
                      </>
                    )}
                  </div>
                );
              })}
              {trip.notes && <p className="trip-notes">{trip.notes}</p>}
              <div className="trip-actions">
                <button
                  className="ws-btn"
                  onClick={() =>
                    setForm({ ...trip, acknowledgeConflicts: false })
                  }
                >
                  {t("Edit trip")}
                </button>
                <button
                  className="ws-btn"
                  onClick={() => {
                    setPrinting(trip.id);
                    setTimeout(() => window.print(), 0);
                  }}
                >
                  <Printer size={14} />
                  {t("Print trip summary")}
                </button>
              </div>
            </article>
          ))}
        </section>
      </div>
    </>
  );
}
