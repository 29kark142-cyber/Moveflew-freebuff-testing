import { useEffect, useMemo, useState } from "react";
import type { DragEvent } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock,
  Loader2,
  Search,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  ErrorNotice,
  LoadingBlock,
  Modal,
  StatusChip,
  useRemote,
} from "@/components/workspace/WorkspaceUI";
import { crm } from "@/lib/crm";
import { useI18n } from "@/lib/i18n";
import type { Job, WorkspaceRole } from "@shared/crm";
import { allConflicts, conflictsFor, type ScheduledJob } from "@shared/dispatch";
import type { ReplacementCandidate } from "@shared/crew-replacement";
import { jobActivity } from "@shared/job-activity";
import {
  crewShifts,
  declineReasonLabel,
  jobCrewShifts,
  shiftCounts,
  shiftStatusLabel,
} from "@shared/shift";
import {
  ACTIVE_SCHEDULE_STATUSES,
  DEFAULT_SCHEDULE_FILTERS,
  addDays,
  dayLabel,
  filterScheduleJobs,
  hourFromInput,
  isToday,
  jobsByDay,
  monthDays,
  monthLabel,
  sameMonth,
  scheduleTone,
  snapQuarter,
  timeInputValue,
  timeLabel,
  truckCapacityConflict,
  weekDays,
  type ScheduleFilters,
  type ScheduleView,
} from "@shared/schedule";
import "./schedule.css";

const DRAG_TYPE = "application/x-moveflew-schedule-job";
const hoursLabel = (value: number) =>
  `${Number.isInteger(value) ? value : Number(value.toFixed(1))}h`;
const VIEWS: ScheduleView[] = ["month", "week", "day"];
const STATUS_OPTIONS = [
  { value: "active", label: "Booked & deposit paid" },
  ...ACTIVE_SCHEDULE_STATUSES.map((status) => ({ value: status, label: status })),
  { value: "quote_sent", label: "quote_sent" },
  { value: "in_progress", label: "in_progress" },
  { value: "completed", label: "completed" },
  { value: "all", label: "All statuses" },
];

type Draft = {
  jobId: number;
  truckId: number | null;
  crewIds: number[];
  moveDate: string;
  startHour: number;
  duration: number;
  notifyCrew: boolean;
};

const draftFor = (job: Job): Draft => ({
  jobId: job.id,
  truckId: job.truckId ?? null,
  crewIds: [...(job.crewIds ?? [])],
  moveDate: job.moveDate?.slice(0, 10) || new Date().toISOString().slice(0, 10),
  startHour: Number(job.startHour) || 8,
  duration: Number(job.duration) || 4,
  notifyCrew: false,
});

const scheduled = (job: Job): ScheduledJob => ({
  id: job.id,
  moveDate: job.moveDate,
  startHour: job.startHour,
  duration: job.duration,
  status: job.status,
  truckId: job.truckId ?? null,
  crewIds: job.crewIds ?? [],
});

/**
 * Dispatcher schedule: month/week/day calendar of booked moves with crew and truck filters,
 * drag-to-reschedule, a quick-edit modal, and server-enforced capacity/overlap checks.
 */
export default function SchedulePage({
  role,
  navigate,
}: {
  role: WorkspaceRole;
  navigate: (path: string) => void;
}) {
  const { tx } = useI18n();
  const { data, loading, error, refresh } = useRemote(
    () => Promise.all([crm.jobs(), crm.trucks(), crm.crew()]),
    [],
  );
  const [view, setView] = useState<ScheduleView>("month");
  const [anchor, setAnchor] = useState(() => new Date().toISOString().slice(0, 10));
  const [filters, setFilters] = useState<ScheduleFilters>(DEFAULT_SCHEDULE_FILTERS);
  const [editing, setEditing] = useState<Job | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [replacementFor, setReplacementFor] = useState<{
    job: Job;
    replaceCrewId: number | null;
  } | null>(null);
  const [replacement, setReplacement] = useState<{
    loading: boolean;
    error: string;
    panel: Awaited<ReturnType<typeof crm.findReplacements>> | null;
  } | null>(null);
  const [swapping, setSwapping] = useState<number | null>(null);

  const jobs = useMemo(() => data?.[0] ?? [], [data]);
  const trucks = useMemo(() => data?.[1] ?? [], [data]);
  const crew = useMemo(() => data?.[2] ?? [], [data]);
  const canDispatch = ["admin", "office_admin", "dispatcher"].includes(role);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    const timer = window.setInterval(refreshWhenVisible, 30_000);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refresh]);

  const crewName = (id: number) => crew.find((member) => member.id === id)?.name ?? `Crew #${id}`;
  const truckName = (id: number | null) =>
    id ? (trucks.find((truck) => truck.id === id)?.name ?? `Truck #${id}`) : "";

  const visible = useMemo(() => filterScheduleJobs(jobs, filters), [jobs, filters]);
  const byDay = useMemo(() => jobsByDay(visible), [visible]);
  const conflicts = useMemo(() => allConflicts(visible.map(scheduled)), [visible]);
  const declinedJobs = useMemo(
    () =>
      visible.filter((job) => shiftCounts(jobCrewShifts(job.crewShifts, job.crewIds)).declined > 0),
    [visible],
  );
  const editingDeclined = useMemo(
    () =>
      editing
        ? crewShifts(editing.crewShifts).filter(
            (entry) =>
              entry.status === "declined" && (editing.crewIds ?? []).includes(entry.crewId),
          )
        : [],
    [editing],
  );

  const openEdit = (job: Job, overrides: Partial<Draft> = {}) => {
    setEditing(job);
    setDraft({ ...draftFor(job), ...overrides });
    setFormError("");
  };
  const closeEdit = () => {
    setEditing(null);
    setDraft(null);
    setFormError("");
  };

  /** Opens the replacement drawer and ranks crew against the job's current schedule. */
  const openReplacement = async (job: Job, replaceCrewId: number | null = null) => {
    setReplacementFor({ job, replaceCrewId });
    setReplacement({ loading: true, error: "", panel: null });
    try {
      const panel = await crm.findReplacements(job.id);
      setReplacement({ loading: false, error: "", panel });
    } catch (reason) {
      setReplacement({
        loading: false,
        error:
          reason instanceof Error
            ? reason.message
            : tx("Could not load replacement crew.", "Не удалось загрузить замену."),
        panel: null,
      });
    }
  };
  const closeReplacement = () => {
    setReplacementFor(null);
    setReplacement(null);
    setSwapping(null);
  };

  /** One click: swap the declined member, mint a fresh token and notify the replacement. */
  const swapCandidate = async (candidate: ReplacementCandidate) => {
    if (!replacementFor || !canDispatch) return;
    setSwapping(candidate.crewId);
    try {
      const saved = await crm.assignReplacement(replacementFor.job.id, {
        crewId: candidate.crewId,
        replaceCrewId: replacementFor.replaceCrewId,
      });
      const info = saved.replacement;
      const notified = info?.notified ?? 0;
      toast.success(
        info?.replaced
          ? tx(
              `${info.candidate.name} replacing ${info.replaced.name} · shift ${
                notified > 0 ? "notification sent" : "message logged"
              }`,
              `${info.candidate.name} заменяет ${info.replaced.name} · ${
                notified > 0 ? "уведомление отправлено" : "сообщение записано"
              }`,
            )
          : tx("Replacement assigned.", "Замена назначена."),
      );
      if (editing && editing.id === saved.id) {
        setEditing(saved);
        setDraft((current) => (current ? { ...current, crewIds: saved.crewIds ?? [] } : current));
      }
      closeReplacement();
      await refresh();
    } catch (reason) {
      setReplacement((current) => ({
        loading: false,
        error:
          reason instanceof Error
            ? reason.message
            : tx("Could not assign the replacement.", "Не удалось назначить замену."),
        panel: current?.panel ?? null,
      }));
    } finally {
      setSwapping(null);
    }
  };

  const roleText = (role: string) =>
    role === "Driver"
      ? tx("Driver", "Водитель")
      : role === "Crew lead"
        ? tx("Crew lead", "Бригадир")
        : tx("Helper", "Грузчик");
  const chipText = (chip: string) =>
    chip === "Free all day"
      ? tx("Free all day", "Свободен весь день")
      : chip.startsWith("Free ")
        ? tx(chip, chip.replace("Free ", "Свободен "))
        : chip;
  const badgeText = (badge: string) =>
    badge === "Driving permission"
      ? tx("Driving permission", "Водительские права")
      : badge === "Crew lead"
        ? tx("Crew lead", "Бригадир")
        : badge.startsWith("Skill ")
          ? tx(badge, badge.replace("Skill ", "Навык "))
          : badge;

  const dragStart = (event: DragEvent, job: Job) => {
    event.dataTransfer.setData(DRAG_TYPE, String(job.id));
    event.dataTransfer.effectAllowed = "move";
  };
  const dropOn = (event: DragEvent, jobId: number | null, overrides: Partial<Draft>) => {
    event.preventDefault();
    if (!canDispatch) return;
    const id = jobId ?? Number(event.dataTransfer.getData(DRAG_TYPE));
    const job = jobs.find((entry) => entry.id === id);
    if (job) openEdit(job, overrides);
  };

  const shift = (direction: number) => {
    if (view === "month") {
      const [year, month] = anchor.slice(0, 7).split("-").map(Number);
      const next = new Date(Date.UTC(year, (month || 1) - 1 + direction, 1));
      setAnchor(next.toISOString().slice(0, 10));
      return;
    }
    setAnchor(addDays(anchor, direction * (view === "week" ? 7 : 1)));
  };

  const warnings = useMemo(() => {
    if (!draft || !editing) return { overlaps: [] as string[], capacity: null as string | null };
    const others = jobs.filter((job) => job.id !== draft.jobId).map(scheduled);
    const candidate: ScheduledJob = {
      id: draft.jobId,
      moveDate: draft.moveDate,
      startHour: draft.startHour,
      duration: draft.duration,
      status: editing.status,
      truckId: draft.truckId,
      crewIds: draft.crewIds,
    };
    const crewLabel = (id: number) =>
      crew.find((member) => member.id === id)?.name ?? `Crew #${id}`;
    const truckLabel = (id: number) =>
      trucks.find((truck) => truck.id === id)?.name ?? `Truck #${id}`;
    const overlaps = conflictsFor(candidate, others).map((conflict) =>
      conflict.resource === "truck"
        ? tx(
            `${truckLabel(conflict.resourceId)} is already on job #${conflict.otherJobId} at an overlapping time.`,
            `${truckLabel(conflict.resourceId)} уже назначен на заказ #${conflict.otherJobId} в это же время.`,
          )
        : tx(
            `${crewLabel(conflict.resourceId)} is already on job #${conflict.otherJobId} at an overlapping time.`,
            `${crewLabel(conflict.resourceId)} уже назначен на заказ #${conflict.otherJobId} в это же время.`,
          ),
    );
    const truck = trucks.find((entry) => entry.id === draft.truckId);
    return {
      overlaps: [...new Set(overlaps)],
      capacity: truck ? truckCapacityConflict(editing.inventory, truck) : null,
    };
  }, [draft, editing, jobs, trucks, crew, tx]);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setFormError("");
    try {
      const saved = await crm.scheduleJob(draft.jobId, {
        truckId: draft.truckId,
        crewIds: draft.crewIds,
        moveDate: draft.moveDate,
        startHour: snapQuarter(draft.startHour),
        duration: snapQuarter(draft.duration) || draft.duration,
        notifyCrew: draft.notifyCrew,
      });
      const summary = (saved as Job & { schedule?: { notified: number; logged: number } }).schedule;
      toast.success(
        summary && summary.notified > 0
          ? tx(
              `Schedule saved · ${summary.notified} crew notification(s) sent`,
              `Расписание сохранено · уведомлений бригаде: ${summary.notified}`,
            )
          : summary && summary.logged > 0
            ? tx(
                "Schedule saved · shift messages were logged because no SMS/email sender is configured",
                "Расписание сохранено · сообщения записаны, так как отправитель SMS/email не настроен",
              )
            : tx("Schedule saved.", "Расписание сохранено."),
      );
      closeEdit();
      await refresh();
    } catch (reason) {
      setFormError(
        reason instanceof Error
          ? reason.message
          : tx("Could not save this change.", "Не удалось сохранить изменение."),
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingBlock label={tx("Loading the schedule…", "Загрузка расписания…")} />;
  if (error || !data) return <ErrorNotice error={error} retry={() => void refresh()} />;

  const dayCell = (day: string) => {
    const dayJobs = byDay.get(day) ?? [];
    return (
      <div
        key={day}
        className={`schedule-month__cell${sameMonth(day, anchor) ? "" : " is-outside"}${
          isToday(day) ? " is-today" : ""
        }`}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => dropOn(event, null, { moveDate: day })}
      >
        <header>
          <span>{Number(day.slice(8, 10))}</span>
          {isToday(day) && <em>{tx("Today", "Сегодня")}</em>}
        </header>
        {dayJobs.map((job) => (
          <JobBlock
            key={job.id}
            job={job}
            crewLabel={(job.crewIds ?? []).map(crewName).join(", ")}
            onOpen={() => openEdit(job)}
            onDragStart={(event) => dragStart(event, job)}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="schedule-page">
      <header className="schedule-head">
        <div>
          <h1>{tx("Schedule", "Расписание")}</h1>
          <p className="text-muted-foreground">
            {tx(
              "Month, week and day views of booked moves. Drag a job to another day or open it to reassign the crew.",
              "Месяц, неделя и день запланированных переездов. Перетащите заказ на другой день или откройте его, чтобы назначить бригаду.",
            )}
          </p>
        </div>
        <div
          className="schedule-tabs"
          role="group"
          aria-label={tx("Calendar view", "Вид календаря")}
        >
          {VIEWS.map((option) => (
            <Button
              key={option}
              variant={view === option ? "default" : "outline"}
              size="sm"
              aria-pressed={view === option}
              onClick={() => setView(option)}
            >
              {tx(option, option === "month" ? "Месяц" : option === "week" ? "Неделя" : "День")}
            </Button>
          ))}
        </div>
      </header>

      <div className="schedule-toolbar">
        <div className="schedule-nav">
          <Button
            variant="outline"
            size="icon"
            aria-label={tx("Previous", "Назад")}
            onClick={() => shift(-1)}
          >
            <ChevronLeft size={16} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAnchor(new Date().toISOString().slice(0, 10))}
          >
            {tx("Today", "Сегодня")}
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label={tx("Next", "Вперёд")}
            onClick={() => shift(1)}
          >
            <ChevronRight size={16} />
          </Button>
          <strong className="schedule-title">
            {view === "month"
              ? monthLabel(anchor)
              : view === "week"
                ? `${dayLabel(weekDays(anchor)[0])} – ${dayLabel(weekDays(anchor)[6], { month: "short", day: "numeric", year: "numeric" })}`
                : dayLabel(anchor, {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
          </strong>
          <input
            type="date"
            aria-label={tx("Jump to date", "Перейти к дате")}
            className="ws-input schedule-date"
            value={anchor}
            onChange={(event) => event.target.value && setAnchor(event.target.value)}
          />
        </div>

        <div className="schedule-filters">
          <label className="ws-field">
            {tx("Status", "Статус")}
            <select
              className="ws-input"
              value={filters.status}
              onChange={(event) => setFilters({ ...filters, status: event.target.value })}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {tx(option.label, option.label)}
                </option>
              ))}
            </select>
          </label>
          <label className="ws-field">
            {tx("Crew member", "Сотрудник")}
            <select
              className="ws-input"
              value={String(filters.crewId)}
              onChange={(event) =>
                setFilters({
                  ...filters,
                  crewId: event.target.value === "all" ? "all" : Number(event.target.value),
                })
              }
            >
              <option value="all">{tx("All crew", "Вся бригада")}</option>
              {crew.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>
          <label className="ws-field">
            {tx("Truck availability", "Доступность грузовика")}
            <select
              className="ws-input"
              value={String(filters.truckId)}
              onChange={(event) =>
                setFilters({
                  ...filters,
                  truckId:
                    event.target.value === "all" || event.target.value === "unassigned"
                      ? event.target.value
                      : Number(event.target.value),
                })
              }
            >
              <option value="all">{tx("All trucks", "Все грузовики")}</option>
              <option value="unassigned">{tx("No truck assigned", "Без грузовика")}</option>
              {trucks.map((truck) => (
                <option key={truck.id} value={truck.id}>
                  {truck.name} · {truck.status}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {!canDispatch && (
        <p className="schedule-notice" role="status">
          <CircleAlert size={15} />
          {tx(
            "Your role can view the schedule but not change assignments.",
            "Ваша роль может просматривать расписание, но не изменять назначения.",
          )}
        </p>
      )}
      {conflicts.length > 0 && (
        <p className="schedule-notice is-warning" role="status">
          <CircleAlert size={15} />
          {tx(
            `${conflicts.length} overlapping assignment(s) on this calendar. Open a job to resolve it.`,
            `${conflicts.length} пересекающихся назначений в календаре. Откройте заказ, чтобы исправить.`,
          )}
        </p>
      )}

      {declinedJobs.length > 0 && (
        <div className="schedule-notice is-danger" role="status">
          <CircleAlert size={15} />
          <span>
            {tx(
              `${declinedJobs.length} job(s) have a crew member who declined — assign a replacement.`,
              `${declinedJobs.length} заказ(ов) с отказом сотрудника — назначьте замену.`,
            )}{" "}
            {declinedJobs.map((job) => (
              <span key={job.id} className="schedule-declined-item">
                <button type="button" className="schedule-linkbtn" onClick={() => openEdit(job)}>
                  #{job.id}
                </button>
                <button
                  type="button"
                  className="schedule-replace-btn"
                  onClick={() => void openReplacement(job)}
                >
                  <Search size={13} /> {tx("Find Replacement", "Найти замену")}
                </button>
              </span>
            ))}
          </span>
        </div>
      )}

      {view === "month" && (
        <section
          className="schedule-month"
          aria-label={tx("Month schedule", "Расписание на месяц")}
        >
          <div className="schedule-month__days">
            {weekDays(anchor).map((day) => (
              <span key={day}>{dayLabel(day, { weekday: "short" })}</span>
            ))}
          </div>
          <div className="schedule-month__grid">{monthDays(anchor).map(dayCell)}</div>
        </section>
      )}

      {view === "week" && (
        <section className="schedule-week" aria-label={tx("Week schedule", "Расписание на неделю")}>
          {weekDays(anchor).map((day) => (
            <div
              key={day}
              className={`schedule-week__day${isToday(day) ? " is-today" : ""}`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => dropOn(event, null, { moveDate: day })}
            >
              <header>
                <span>{dayLabel(day, { weekday: "short" })}</span>
                <b>{Number(day.slice(8, 10))}</b>
              </header>
              {(byDay.get(day) ?? []).map((job) => (
                <JobBlock
                  key={job.id}
                  job={job}
                  crewLabel={(job.crewIds ?? []).map(crewName).join(", ")}
                  onOpen={() => openEdit(job)}
                  onDragStart={(event) => dragStart(event, job)}
                />
              ))}
            </div>
          ))}
        </section>
      )}

      {view === "day" && (
        <section className="schedule-day" aria-label={tx("Day schedule", "Расписание на день")}>
          {Array.from({ length: 17 }, (_, index) => 6 + index).map((hour) => (
            <div
              key={hour}
              className="schedule-day__row"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => dropOn(event, null, { moveDate: anchor, startHour: hour })}
            >
              <span className="schedule-day__hour">{timeLabel(hour)}</span>
              <div className="schedule-day__slot">
                {(byDay.get(anchor) ?? [])
                  .filter((job) => Math.floor(Number(job.startHour) || 0) === hour)
                  .map((job) => (
                    <JobBlock
                      key={job.id}
                      job={job}
                      crewLabel={(job.crewIds ?? []).map(crewName).join(", ")}
                      onOpen={() => openEdit(job)}
                      onDragStart={(event) => dragStart(event, job)}
                      detailed
                    />
                  ))}
              </div>
            </div>
          ))}
          {!(byDay.get(anchor) ?? []).length && (
            <p className="schedule-empty">
              {tx("No moves scheduled for this day.", "На этот день переездов нет.")}
            </p>
          )}
        </section>
      )}

      <footer className="schedule-legend">
        <span>
          {tx("Visible moves", "Видимых переездов")}: {visible.length}
        </span>
        <button type="button" className="ws-btn" onClick={() => navigate("/app/dispatch")}>
          <Users size={15} /> {tx("Open dispatch board", "Открыть диспетчерскую")}
        </button>
      </footer>

      {editing && draft && (
        <Modal
          title={tx(`Schedule job #${editing.id}`, `Планирование заказа #${editing.id}`)}
          onClose={closeEdit}
          wide
        >
          <div className="schedule-form">
            <p className="schedule-form__summary">
              <b>
                #{editing.id} {editing.customerName || editing.title}
              </b>
              <StatusChip status={editing.status} />
              <span>
                {editing.origin || "—"} → {editing.destination || "—"}
              </span>
            </p>

            <label className="ws-field">
              {tx("Move date", "Дата переезда")}
              <input
                type="date"
                className="ws-input"
                value={draft.moveDate}
                onChange={(event) => setDraft({ ...draft, moveDate: event.target.value })}
              />
            </label>
            <label className="ws-field">
              {tx("Start time", "Время начала")}
              <input
                type="time"
                step="900"
                className="ws-input"
                value={timeInputValue(draft.startHour)}
                onChange={(event) =>
                  setDraft({ ...draft, startHour: hourFromInput(event.target.value) })
                }
              />
            </label>
            <label className="ws-field">
              {tx("Duration (hours)", "Длительность (часы)")}
              <input
                type="number"
                min="0.25"
                max="24"
                step="0.25"
                className="ws-input"
                value={draft.duration}
                onChange={(event) =>
                  setDraft({ ...draft, duration: Number(event.target.value) || 0.25 })
                }
              />
            </label>
            <label className="ws-field">
              {tx("Truck", "Грузовик")}
              <select
                className="ws-input"
                value={draft.truckId ?? ""}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    truckId: event.target.value ? Number(event.target.value) : null,
                  })
                }
              >
                <option value="">{tx("No truck", "Без грузовика")}</option>
                {trucks.map((truck) => (
                  <option
                    key={truck.id}
                    value={truck.id}
                    disabled={truck.status === "maintenance"}
                  >
                    {truck.name} · {truck.status}
                    {truck.status === "maintenance" ? " — unavailable" : ""}
                  </option>
                ))}
              </select>
            </label>

            <fieldset className="schedule-crew">
              <legend>{tx("Assigned crew", "Назначенная бригада")}</legend>
              <div className="schedule-crew__replace">
                {editingDeclined.map((entry) => (
                  <button
                    key={entry.token}
                    type="button"
                    className="schedule-replace-btn"
                    onClick={() => void openReplacement(editing, entry.crewId)}
                  >
                    <Search size={13} />
                    {tx(
                      `Find replacement for ${entry.name || `Crew #${entry.crewId}`}`,
                      `Найти замену для ${entry.name || `сотрудника #${entry.crewId}`}`,
                    )}
                  </button>
                ))}
                {!editingDeclined.length && (
                  <button
                    type="button"
                    className="schedule-replace-btn"
                    onClick={() => void openReplacement(editing)}
                  >
                    <Search size={13} /> {tx("Find Replacement", "Найти замену")}
                  </button>
                )}
              </div>
              <div className="schedule-crew__choices">
                {crew.map((member) => (
                  <label key={member.id}>
                    <input
                      type="checkbox"
                      checked={draft.crewIds.includes(member.id)}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          crewIds: event.target.checked
                            ? [...draft.crewIds, member.id]
                            : draft.crewIds.filter((id) => id !== member.id),
                        })
                      }
                    />
                    {member.name}
                    {member.status === "inactive" && ` · ${tx("inactive", "неактивен")}`}
                    {(() => {
                      const entry = crewShifts(editing.crewShifts).find(
                        (item) => item.crewId === member.id,
                      );
                      if (!entry) return null;
                      return (
                        <em className={`schedule-crew__status is-${entry.status}`}>
                          {shiftStatusLabel(entry.status)}
                          {entry.reason ? ` · ${declineReasonLabel(entry.reason)}` : ""}
                        </em>
                      );
                    })()}
                  </label>
                ))}
                {!crew.length && (
                  <span>{tx("No crew records yet.", "Записей о бригаде пока нет.")}</span>
                )}
              </div>
            </fieldset>

            {(warnings.overlaps.length > 0 || warnings.capacity || formError) && (
              <div className="schedule-warning" role="alert">
                <CircleAlert size={16} />
                <div>
                  {warnings.overlaps.map((warning) => (
                    <p key={warning}>{warning}</p>
                  ))}
                  {warnings.capacity && <p>{warnings.capacity}</p>}
                  {formError && <p>{formError}</p>}
                </div>
              </div>
            )}

            <label className="schedule-toggle">
              <input
                type="checkbox"
                checked={draft.notifyCrew}
                onChange={(event) => setDraft({ ...draft, notifyCrew: event.target.checked })}
              />
              <span>
                <b>{tx("Notify assigned crew", "Уведомить назначенную бригаду")}</b>
                <small>
                  {tx(
                    "Sends the move date, time and addresses plus an accept/decline link by SMS and email.",
                    "Отправляет дату, время, адреса и ссылку для подтверждения по SMS и email.",
                  )}
                </small>
              </span>
            </label>

            {jobActivity(editing.activity).length > 0 && (
              <div className="schedule-activity">
                <h3>
                  <Clock size={14} /> {tx("Job activity", "Активность заказа")}
                </h3>
                <ul>
                  {jobActivity(editing.activity)
                    .slice(0, 5)
                    .map((event) => (
                      <li key={event.id}>
                        <b>{tx(event.title, event.title)}</b>
                        <span>{event.detail}</span>
                        <small>
                          {new Date(event.at).toLocaleString()} {event.by ? `· ${event.by}` : ""}
                        </small>
                      </li>
                    ))}
                </ul>
              </div>
            )}

            <div className="schedule-form__actions">
              <Button
                onClick={() => void save()}
                disabled={
                  saving ||
                  !canDispatch ||
                  warnings.overlaps.length > 0 ||
                  Boolean(warnings.capacity)
                }
              >
                {saving ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <CalendarDays size={15} />
                )}
                {saving
                  ? tx("Saving…", "Сохранение…")
                  : tx("Save schedule", "Сохранить расписание")}
              </Button>
              <Button variant="outline" onClick={closeEdit} disabled={saving}>
                {tx("Cancel", "Отмена")}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {replacementFor && (
        <div
          className="schedule-drawer-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeReplacement();
          }}
        >
          <aside
            className="schedule-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={tx("Replacement Crew", "Замена бригады")}
          >
            <header className="schedule-drawer__head">
              <div>
                <h2>{tx("Replacement Crew", "Замена бригады")}</h2>
                <p>
                  #{replacementFor.job.id} ·{" "}
                  {replacementFor.job.customerName || replacementFor.job.title} ·{" "}
                  {dayLabel(replacementFor.job.moveDate)} {timeLabel(replacementFor.job.startHour)}
                </p>
              </div>
              <button
                type="button"
                className="schedule-drawer__close"
                onClick={closeReplacement}
                aria-label={tx("Close", "Закрыть")}
              >
                <X size={18} />
              </button>
            </header>

            {replacement?.panel && replacement.panel.declined.length > 0 && (
              <p className="schedule-drawer__declined">
                <CircleAlert size={14} />
                <span>
                  {tx("Replacing", "Замена")}:{" "}
                  {replacement.panel.declined
                    .map((entry) => `${entry.name}${entry.reason ? ` (${entry.reason})` : ""}`)
                    .join(", ")}
                </span>
              </p>
            )}

            {replacement?.loading && (
              <LoadingBlock label={tx("Checking availability…", "Проверяем доступность…")} />
            )}

            {!replacement?.loading && replacement?.error && (
              <div className="schedule-drawer__error" role="alert">
                <CircleAlert size={15} />
                <p>{replacement.error}</p>
              </div>
            )}

            {!replacement?.loading &&
              !replacement?.error &&
              replacement?.panel &&
              replacement.panel.candidates.length === 0 && (
                <p className="schedule-drawer__empty">
                  {tx(
                    "No available crew for this window. Adjust the date or spread the roster.",
                    "На это время нет свободных сотрудников. Измените дату или распределите бригаду.",
                  )}
                </p>
              )}

            {!replacement?.loading &&
              !replacement?.error &&
              replacement?.panel &&
              replacement.panel.candidates.length > 0 && (
                <>
                  <p className="schedule-drawer__hint">
                    {tx(
                      "Ranked by hours already scheduled this week.",
                      "Отсортировано по запланированным часам на этой неделе.",
                    )}
                  </p>
                  <ul className="schedule-candidates">
                    {replacement.panel.candidates.map((candidate) => (
                      <li key={candidate.crewId} className="schedule-candidate">
                        <div className="schedule-candidate__head">
                          <b>{candidate.name}</b>
                          <em>{roleText(candidate.roleLabel)}</em>
                          <span>
                            {hoursLabel(candidate.weeklyHours)}{" "}
                            {tx("scheduled this week", "запланировано на этой неделе")}
                          </span>
                        </div>
                        <div className="schedule-candidate__chips">
                          {candidate.availability.map((chip) => (
                            <span key={chip}>{chipText(chip)}</span>
                          ))}
                          <span className="is-hours">
                            {hoursLabel(candidate.dayHours)} {tx("this day", "в этот день")}
                          </span>
                        </div>
                        <div className="schedule-candidate__badges">
                          {candidate.qualifications.map((badge) => (
                            <i key={badge}>{badgeText(badge)}</i>
                          ))}
                        </div>
                        <Button
                          size="sm"
                          onClick={() => void swapCandidate(candidate)}
                          disabled={swapping !== null || !canDispatch}
                        >
                          {swapping === candidate.crewId ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <UserPlus size={14} />
                          )}
                          {tx("Swap & Notify", "Заменить и уведомить")}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
          </aside>
        </div>
      )}
    </div>
  );
}

function JobBlock({
  job,
  crewLabel,
  onOpen,
  onDragStart,
  detailed = false,
}: {
  job: Job;
  crewLabel: string;
  onOpen: () => void;
  onDragStart: (event: DragEvent) => void;
  detailed?: boolean;
}) {
  const counts = shiftCounts(jobCrewShifts(job.crewShifts, job.crewIds));
  return (
    <button
      type="button"
      draggable
      onDragStart={onDragStart}
      onClick={onOpen}
      className={`schedule-block is-${scheduleTone(job.status)}${
        counts.declined > 0 ? " has-declined" : ""
      }`}
      title={`#${job.id} ${job.customerName || job.title} · ${timeLabel(job.startHour)}–${timeLabel(
        Number(job.startHour) + Number(job.duration),
      )}`}
    >
      <b>
        #{job.id} {job.customerName || job.title}
      </b>
      <span>
        {job.origin || "—"} → {job.destination || "—"}
      </span>
      <small>
        {timeLabel(job.startHour)} · {job.startHour && job.duration ? `${job.duration}h · ` : ""}
        {crewLabel || "Unassigned"}
        {detailed ? "" : ""}
      </small>
      {(counts.pending > 0 || counts.confirmed > 0 || counts.declined > 0) && (
        <em className="schedule-shifts">
          <i className="is-confirmed">✓ {counts.confirmed}</i>
          <i className="is-pending">… {counts.pending}</i>
          {counts.declined > 0 && <i className="is-declined">✕ {counts.declined}</i>}
        </em>
      )}
    </button>
  );
}
