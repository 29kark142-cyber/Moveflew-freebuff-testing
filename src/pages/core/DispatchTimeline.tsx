import TextWorker from "@/components/workspace/TextWorker";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ModuleProps } from "@shared/expansion";
import type {
  TimelineAssignmentInput,
  TimelineJob,
  TimelinePreview,
  TimelineResponse,
  TimelineWarningCode,
} from "@shared/timeline";
import { crmFetch } from "@/lib/crm";
import { useI18n } from "@/lib/i18n";
import { CoreCard, CoreNotice, CorePage } from "./CoreUI";
import "./dispatch-timeline.css";

type Draft = {
  jobId: number;
  truckId: number | null;
  crewIds: number[];
  moveDate: string;
  startHour: number;
  duration: number;
  expectedUpdatedAt: string;
};

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

const day = () => new Date().toISOString().slice(0, 10);
const timeValue = (hour: number) => {
  const total = Math.round(hour * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};
const hourValue = (value: string) => {
  const [hours, minutes] = value.split(":").map(Number);
  return (hours || 0) + (minutes || 0) / 60;
};

function draftFor(job: TimelineJob): Draft {
  return {
    jobId: job.id,
    truckId: job.truckId,
    crewIds: job.crewIds,
    moveDate: job.moveDate,
    startHour: job.startHour,
    duration: job.duration,
    expectedUpdatedAt: job.expectedUpdatedAt,
  };
}

export default function DispatchTimeline({ role }: ModuleProps) {
  const { tx, locale } = useI18n();
  const [date, setDate] = useState(day);
  const [timeline, setTimeline] = useState<TimelineResponse | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [preview, setPreview] = useState<TimelinePreview | null>(null);
  const [acknowledged, setAcknowledged] = useState<TimelineWarningCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const canDispatch = ["admin", "office_admin", "dispatcher"].includes(role);
  const warningText = (code: TimelineWarningCode) => {
    if (code === "truck_overlap")
      return tx(
        "The truck overlaps another scheduled job.",
        "Грузовик пересекается по времени с другим запланированным заказом."
      );
    if (code === "crew_overlap")
      return tx(
        "One or more crew members overlap another scheduled job.",
        "Один или несколько членов бригады пересекаются по времени с другим запланированным заказом."
      );
    return tx(
      "Selected inventory exceeds this truck’s configured capacity or weight limit.",
      "Выбранный инвентарь превышает настроенную вместимость или ограничение веса грузовика."
    );
  };

  const allJobs = useMemo(
    () => [...(timeline?.jobs ?? []), ...(timeline?.backlog ?? [])],
    [timeline]
  );
  const selectedJob = useMemo(
    () => allJobs.find(job => job.id === draft?.jobId) ?? null,
    [allJobs, draft?.jobId]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const next = await crmFetch<TimelineResponse>(
        `/core/timeline?date=${encodeURIComponent(date)}`
      );
      setTimeline(next);
      setDraft(current => {
        const retained =
          current &&
          [...next.jobs, ...next.backlog].find(job => job.id === current.jobId);
        return retained
          ? draftFor(retained)
          : (next.backlog[0] ?? next.jobs[0])
            ? draftFor(next.backlog[0] ?? next.jobs[0]!)
            : null;
      });
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : tx(
              "Could not load the timeline.",
              "Не удалось загрузить расписание."
            )
      );
    } finally {
      setLoading(false);
    }
  }, [date, tx]);

  useEffect(() => {
    void load();
  }, [load]);

  const chooseJob = (job: TimelineJob) => {
    setDraft(draftFor(job));
    setPreview(null);
    setAcknowledged([]);
    setError("");
    setNotice("");
  };

  const dropOnLane = (
    kind: "truck" | "crew",
    resourceId: number,
    event: React.DragEvent
  ) => {
    event.preventDefault();
    if (!canDispatch || !timeline) return;
    const id = Number(event.dataTransfer.getData("application/x-nw-job"));
    const job = allJobs.find(item => item.id === id);
    if (!job) return;
    const next = draftFor(job);
    if (kind === "truck") next.truckId = resourceId;
    else if (!next.crewIds.includes(resourceId))
      next.crewIds = [...next.crewIds, resourceId];
    chooseJob(job);
    setDraft(next);
  };

  const previewAssignment = async () => {
    if (!draft) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const next = await crmFetch<TimelinePreview>(
        "/core/timeline/preview",
        json("POST", {
          ...draft,
          previewToken: "preview",
          acknowledgedWarningCodes: [],
        })
      );
      setPreview(next);
      setAcknowledged([]);
      if (!next.warnings.length)
        setNotice(
          tx(
            "No dispatch warnings. Confirm to save this assignment.",
            "Предупреждений по назначению нет. Подтвердите, чтобы сохранить назначение."
          )
        );
    } catch (reason) {
      setPreview(null);
      setError(
        reason instanceof Error
          ? reason.message
          : tx(
              "Could not preview this assignment.",
              "Не удалось предварительно проверить это назначение."
            )
      );
    } finally {
      setSaving(false);
    }
  };

  const assign = async () => {
    if (!draft || !preview) return;
    setSaving(true);
    setError("");
    setNotice("");
    const request: TimelineAssignmentInput = {
      ...draft,
      previewToken: preview.previewToken,
      acknowledgedWarningCodes: acknowledged,
    };
    try {
      await crmFetch("/core/timeline/assign", json("POST", request));
      setPreview(null);
      setAcknowledged([]);
      setNotice(
        tx("Dispatch assignment saved.", "Назначение диспетчера сохранено.")
      );
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : tx(
              "Could not save this assignment.",
              "Не удалось сохранить это назначение."
            )
      );
    } finally {
      setSaving(false);
    }
  };

  const laneJobs = (kind: "truck" | "crew", id: number) =>
    (timeline?.jobs ?? []).filter(job =>
      kind === "truck" ? job.truckId === id : job.crewIds.includes(id)
    );
  const unassigned = (timeline?.backlog ?? []).filter(
    job => job.truckId === null || !job.crewIds.length
  );

  if (!canDispatch)
    return (
      <CorePage
        title={tx("Dispatch timeline", "График диспетчеризации")}
        description={tx(
          "A dispatch role is required to view assignments.",
          "Для просмотра назначений нужна роль диспетчера."
        )}
      >
        <CoreNotice tone="error">
          {tx(
            "Your workspace role cannot access dispatch controls.",
            "Ваша роль в рабочем пространстве не может использовать диспетчерские инструменты."
          )}
        </CoreNotice>
      </CorePage>
    );

  return (
    <CorePage
      title={tx("Dispatch timeline", "График диспетчеризации")}
      description={tx(
        "Drag a job onto a truck or crew lane, then preview and confirm. Jobs snap to 15-minute slots.",
        "Перетащите заказ на полосу грузовика или бригады, затем проверьте и подтвердите. Заказы привязаны к 15-минутным слотам."
      )}
      actions={
        <label className="timeline-date">
          {tx("Move date", "Дата переезда")}
          <input
            type="date"
            value={date}
            onChange={event => setDate(event.target.value)}
          />
        </label>
      }
    >
      {error && <CoreNotice tone="error">{error}</CoreNotice>}
      {notice && <CoreNotice tone="success">{notice}</CoreNotice>}
      {loading ? (
        <CoreCard>
          <p className="core-muted">
            {tx(
              "Loading dispatch timeline…",
              "Загрузка графика диспетчеризации…"
            )}
          </p>
        </CoreCard>
      ) : !timeline ? null : (
        <>
          <CoreCard title={tx("Unassigned backlog", "Неназначенные заказы")}>
            <p className="core-muted timeline-caption">
              {tx(
                "Drag a card to a lane or select it for the keyboard-accessible assignment form.",
                "Перетащите карточку на полосу или выберите её для формы назначения с клавиатуры."
              )}
            </p>
            {unassigned.length ? (
              <div
                className="timeline-backlog"
                aria-label={tx("Unassigned jobs", "Неназначенные заказы")}
              >
                {unassigned.map(job => (
                  <JobCard
                    key={job.id}
                    job={job}
                    selected={draft?.jobId === job.id}
                    onChoose={() => chooseJob(job)}
                  />
                ))}
              </div>
            ) : (
              <p className="core-empty">
                {tx(
                  "No unassigned active jobs in the dispatch backlog.",
                  "В очереди диспетчеризации нет активных неназначенных заказов."
                )}
              </p>
            )}
          </CoreCard>

          <CoreCard
            title={tx(
              "Truck and crew Gantt",
              "Диаграмма Ганта грузовиков и бригад"
            )}
          >
            <div
              className="timeline-scroll"
              role="region"
              aria-label={tx(
                "Dispatch Gantt",
                "Диаграмма Ганта диспетчеризации"
              )}
              tabIndex={0}
            >
              <div className="timeline-gantt">
                <div className="timeline-axis">
                  <span>{tx("Resource", "Ресурс")}</span>
                  <div>
                    {[0, 6, 12, 18, 24].map(hour => (
                      <span
                        key={hour}
                        style={{ left: `${(hour / 24) * 100}%` }}
                      >
                        {timeValue(hour)}
                      </span>
                    ))}
                  </div>
                </div>
                <h3>{tx("Trucks", "Грузовики")}</h3>
                {timeline.trucks.map(truck => (
                  <GanttLane
                    key={`truck-${truck.id}`}
                    kind="truck"
                    id={truck.id}
                    label={`${truck.name}${truck.plate ? ` · ${truck.plate}` : ""}`}
                    status={truck.status}
                    jobs={laneJobs("truck", truck.id)}
                    selectedId={draft?.jobId}
                    onDrop={dropOnLane}
                    onChoose={chooseJob}
                  />
                ))}
                {!timeline.trucks.length && (
                  <p className="core-empty">
                    {tx(
                      "No truck records are available.",
                      "Нет доступных записей о грузовиках."
                    )}
                  </p>
                )}
                <h3>{tx("Crew", "Бригада")}</h3>
                {timeline.crew.map(member => (
                  <GanttLane
                    key={`crew-${member.id}`}
                    kind="crew"
                    id={member.id}
                    label={member.name}
                    phone={member.phone}
                    status={member.status}
                    jobs={laneJobs("crew", member.id)}
                    selectedId={draft?.jobId}
                    onDrop={dropOnLane}
                    onChoose={chooseJob}
                  />
                ))}
                {!timeline.crew.length && (
                  <p className="core-empty">
                    {tx(
                      "No crew records are available.",
                      "Нет доступных записей о бригаде."
                    )}
                  </p>
                )}
              </div>
            </div>
          </CoreCard>

          <CoreCard title={tx("Assignment form", "Форма назначения")}>
            {!draft || !selectedJob ? (
              <p className="core-empty">
                {tx(
                  "Select a backlog or scheduled job to assign it.",
                  "Выберите неназначенный или запланированный заказ, чтобы назначить его."
                )}
              </p>
            ) : (
              <div className="timeline-form">
                <label>
                  {tx("Job", "Заказ")}
                  <select
                    value={draft.jobId}
                    onChange={event => {
                      const job = allJobs.find(
                        item => item.id === Number(event.target.value)
                      );
                      if (job) chooseJob(job);
                    }}
                  >
                    {allJobs.map(job => (
                      <option key={job.id} value={job.id}>
                        {job.title} — {job.customerName}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {tx("Move date", "Дата переезда")}
                  <input
                    type="date"
                    value={draft.moveDate}
                    onChange={event => {
                      setDraft({ ...draft, moveDate: event.target.value });
                      setPreview(null);
                    }}
                  />
                </label>
                <label>
                  {tx("Start time", "Время начала")}
                  <input
                    type="time"
                    step="900"
                    value={timeValue(draft.startHour)}
                    onChange={event => {
                      setDraft({
                        ...draft,
                        startHour: hourValue(event.target.value),
                      });
                      setPreview(null);
                    }}
                  />
                </label>
                <label>
                  {tx("Duration (hours)", "Продолжительность (часы)")}
                  <input
                    type="number"
                    min="0.25"
                    max="24"
                    step="0.25"
                    value={draft.duration}
                    onChange={event => {
                      setDraft({
                        ...draft,
                        duration: Number(event.target.value),
                      });
                      setPreview(null);
                    }}
                  />
                </label>
                <label>
                  {tx("Truck", "Грузовик")}
                  <select
                    value={draft.truckId ?? ""}
                    onChange={event => {
                      setDraft({
                        ...draft,
                        truckId: event.target.value
                          ? Number(event.target.value)
                          : null,
                      });
                      setPreview(null);
                    }}
                  >
                    <option value="">
                      {tx("Backlog / no truck", "Очередь / без грузовика")}
                    </option>
                    {timeline.trucks.map(truck => (
                      <option key={truck.id} value={truck.id}>
                        {truck.name} ({truck.status})
                      </option>
                    ))}
                  </select>
                </label>
                <fieldset>
                  <legend>{tx("Crew", "Бригада")}</legend>
                  <div className="timeline-crew-choices">
                    {timeline.crew.map(member => (
                      <label key={member.id}>
                        <input
                          type="checkbox"
                          checked={draft.crewIds.includes(member.id)}
                          onChange={event => {
                            const crewIds = event.target.checked
                              ? [...draft.crewIds, member.id]
                              : draft.crewIds.filter(id => id !== member.id);
                            setDraft({ ...draft, crewIds });
                            setPreview(null);
                          }}
                        />
                        {member.name}
                        {member.isDriver
                          ? ` · ${tx("driver", "водитель")}`
                          : ""}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="timeline-form-actions">
                  <button
                    className="core-primary"
                    onClick={() => void previewAssignment()}
                    disabled={saving}
                  >
                    {saving
                      ? tx("Checking…", "Проверка…")
                      : tx("Preview assignment", "Предварительная проверка")}
                  </button>
                  {preview && (
                    <button
                      onClick={() => void assign()}
                      disabled={
                        saving ||
                        preview.warnings.some(
                          warning => !acknowledged.includes(warning.code)
                        )
                      }
                    >
                      {tx("Confirm dispatch", "Подтвердить назначение")}
                    </button>
                  )}
                </div>
              </div>
            )}
            {preview && (
              <div className="timeline-preview" aria-live="polite">
                {preview.warnings.length ? (
                  preview.warnings.map(warning => (
                    <label className="timeline-warning" key={warning.code}>
                      <input
                        type="checkbox"
                        checked={acknowledged.includes(warning.code)}
                        onChange={event =>
                          setAcknowledged(current =>
                            event.target.checked
                              ? [...current, warning.code]
                              : current.filter(code => code !== warning.code)
                          )
                        }
                      />
                      <span>
                        <strong>
                          {tx(
                            "Dispatcher acknowledgement required",
                            "Требуется подтверждение диспетчера"
                          )}
                        </strong>
                        <br />
                        {warningText(warning.code)}
                      </span>
                    </label>
                  ))
                ) : (
                  <CoreNotice>
                    {tx(
                      "Server preview passed with no soft overlap or capacity warnings.",
                      "Проверка на сервере пройдена без мягких предупреждений о пересечениях или вместимости."
                    )}
                  </CoreNotice>
                )}
                <p className="core-muted">
                  {tx(
                    "Confirmation is bound to this server preview. If the job, resources, or overlapping schedule changes, preview again.",
                    "Подтверждение связано с этой серверной проверкой. Если заказ, ресурсы или пересекающееся расписание изменятся, выполните проверку снова."
                  )}
                </p>
              </div>
            )}
          </CoreCard>
        </>
      )}
    </CorePage>
  );
}

function JobCard({
  job,
  selected,
  onChoose,
}: {
  job: TimelineJob;
  selected: boolean;
  onChoose: () => void;
}) {
  return (
    <button
      className={`timeline-job-card${selected ? " is-selected" : ""}`}
      draggable
      onDragStart={event =>
        event.dataTransfer.setData("application/x-nw-job", String(job.id))
      }
      onClick={onChoose}
      aria-pressed={selected}
    >
      <strong>{job.title}</strong>
      <span>{job.customerName}</span>
      <small>
        {job.moveDate} · {timeValue(job.startHour)} · {job.duration}h
      </small>
    </button>
  );
}

function GanttLane({
  kind,
  id,
  label,
  status,
  phone,
  jobs,
  selectedId,
  onDrop,
  onChoose,
}: {
  kind: "truck" | "crew";
  id: number;
  label: string;
  status: string;
  phone?: string;
  jobs: TimelineJob[];
  selectedId?: number;
  onDrop: (kind: "truck" | "crew", id: number, event: React.DragEvent) => void;
  onChoose: (job: TimelineJob) => void;
}) {
  return (
    <div
      className="timeline-lane"
      onDragOver={event => event.preventDefault()}
      onDrop={event => onDrop(kind, id, event)}
    >
      <div className="timeline-lane__label">
        <strong>{label}</strong>
        <span>{status}</span>
        {kind === "crew" && <TextWorker phone={phone || ""} compact />}
      </div>
      <div className="timeline-lane__track">
        {jobs.map(job => (
          <button
            key={job.id}
            className={`timeline-task${selectedId === job.id ? " is-selected" : ""}`}
            draggable
            onDragStart={event =>
              event.dataTransfer.setData("application/x-nw-job", String(job.id))
            }
            onClick={() => onChoose(job)}
            style={{
              left: `${Math.max(0, (job.startHour / 24) * 100)}%`,
              width: `${Math.min(100 - (job.startHour / 24) * 100, (job.duration / 24) * 100)}%`,
            }}
            title={`${job.title}: ${timeValue(job.startHour)}–${timeValue(job.startHour + job.duration)}`}
          >
            <span>{job.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
