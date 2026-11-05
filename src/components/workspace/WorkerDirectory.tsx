import { RefreshCw, UserRound } from "lucide-react";
import type { WorkspaceRole } from "@shared/crm";
import { WORKER_DIRECTORY_ROLES, type WorkerSummary } from "@shared/workers";
import CrewInvitations from "./CrewInvitations";
import { useI18n } from "@/lib/i18n";
import { workersApi } from "@/lib/workers-api";
import {
  ErrorNotice,
  LoadingBlock,
  StatusChip,
  useRemote,
} from "./WorkspaceUI";
import TextWorker from "./TextWorker";
import {
  WorkerPeriodPicker,
  useWorkerPeriod,
} from "@/pages/workers/WorkerPeriodPicker";
import "@/pages/workers/workers.css";

type WorkerDirectoryProps = {
  role: WorkspaceRole;
  navigate: (path: string) => void;
};

const financeRoles: WorkspaceRole[] = ["admin", "office_admin"];

function formatUSD(cents: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function formatHours(minutes: number | null, locale: string) {
  if (minutes === null) return "—";
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
    minutes / 60
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="worker-metric">
      <small>{label}</small>
      <b>{value}</b>
    </div>
  );
}

function visibleCompensation(worker: WorkerSummary) {
  return (
    worker.baseEarnedCents !== null ||
    worker.tipsCents !== null ||
    worker.totalEarnedCents !== null ||
    worker.paidCents !== null
  );
}

export default function WorkerDirectory({
  role,
  navigate,
}: WorkerDirectoryProps) {
  const { tx, locale } = useI18n();
  const period = useWorkerPeriod();
  const { data, loading, error, refresh } = useRemote(
    () =>
      period.valid
        ? workersApi.directory(period.period)
        : Promise.resolve(null),
    [period.period.from, period.period.to, period.valid]
  );
  const workers = data?.workers || [];
  const compensationVisible =
    (financeRoles.includes(role) || role === "crew") &&
    workers.some(visibleCompensation);
  const approvedMinutes = workers.reduce(
    (total, worker) => total + (worker.approvedMinutes || 0),
    0
  );
  const completedJobs = workers.reduce(
    (total, worker) => total + worker.completedJobs,
    0
  );
  const earnedCents = workers.reduce(
    (total, worker) => total + (worker.totalEarnedCents || 0),
    0
  );

  if (!WORKER_DIRECTORY_ROLES.includes(role)) return null;

  return (
    <section className="worker-directory ws-card ws-card-pad">
      <div className="worker-directory__head">
        <div>
          <h2>{tx("Worker directory", "Справочник сотрудников")}</h2>
          <p>
            {tx(
              "Approved time and completed jobs from the selected period.",
              "Утверждённое время и выполненные заказы за выбранный период."
            )}
          </p>
        </div>
        <div className="ws-row-actions">
          <WorkerPeriodPicker value={period} />
          <button
            type="button"
            className="ws-icon-btn"
            aria-label={tx(
              "Refresh worker directory",
              "Обновить справочник сотрудников"
            )}
            title={tx("Refresh", "Обновить")}
            onClick={() => void refresh()}
            disabled={!period.valid || loading}
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {(role === "admin" || role === "office_admin") && (
        <CrewInvitations role={role} />
      )}
      {period.valid && data && (
        <div className="worker-directory__metrics">
          <Metric
            label={tx("Workers", "Сотрудники")}
            value={String(workers.length)}
          />
          <Metric
            label={tx("Approved net hours", "Утверждённые чистые часы")}
            value={
              workers.some(worker => worker.approvedMinutes !== null)
                ? formatHours(approvedMinutes, locale)
                : "—"
            }
          />
          <Metric
            label={tx("Worker-job completions", "Выполнено сотрудниками")}
            value={String(completedJobs)}
          />
          {compensationVisible && (
            <Metric
              label={tx("Recorded earned", "Учтено заработано")}
              value={formatUSD(earnedCents, locale)}
            />
          )}
        </div>
      )}

      {loading && period.valid ? (
        <LoadingBlock label={tx("Loading workers…", "Загрузка сотрудников…")} />
      ) : error ? (
        <ErrorNotice error={error} retry={() => void refresh()} />
      ) : data ? (
        workers.length ? (
          <div className="ws-table-wrap">
            <table className="ws-table">
              <thead>
                <tr>
                  <th>{tx("Worker", "Сотрудник")}</th>
                  <th>{tx("Role", "Роль")}</th>
                  <th>
                    {tx("Approved net hours", "Утверждённые чистые часы")}
                  </th>
                  <th>{tx("Completed jobs", "Выполненные заказы")}</th>
                  {compensationVisible && (
                    <>
                      <th>{tx("Base earned", "Базовый заработок")}</th>
                      <th>{tx("Tips", "Чаевые")}</th>
                      <th>{tx("Recorded paid", "Учтено выплачено")}</th>
                    </>
                  )}
                  <th aria-label={tx("Contact", "Связь")} />
                </tr>
              </thead>
              <tbody>
                {workers.map(worker => (
                  <tr key={worker.id} className="worker-directory__row">
                    <td>
                      <button
                        type="button"
                        className="worker-directory__name"
                        onClick={() => navigate(`/app/workers/${worker.id}`)}
                      >
                        <b>{worker.name}</b>
                        <small>{worker.email || worker.phone || "—"}</small>
                      </button>
                    </td>
                    <td>
                      <StatusChip
                        status={worker.isDriver ? "driver" : "crew"}
                      />
                      <small>
                        {tx("Skill level {level}", "Уровень навыков {level}", {
                          level: worker.skillLevel,
                        })}
                      </small>
                    </td>
                    <td>{formatHours(worker.approvedMinutes, locale)}</td>
                    <td>{worker.completedJobs}</td>
                    {compensationVisible && (
                      <>
                        <td className="ops-money">
                          {worker.baseEarnedCents === null
                            ? "—"
                            : formatUSD(worker.baseEarnedCents, locale)}
                        </td>
                        <td className="ops-money">
                          {worker.tipsCents === null
                            ? "—"
                            : formatUSD(worker.tipsCents, locale)}
                        </td>
                        <td className="ops-money">
                          {worker.paidCents === null
                            ? "—"
                            : formatUSD(worker.paidCents, locale)}
                        </td>
                      </>
                    )}
                    <td>
                      <TextWorker
                        phone={worker.phone}
                        compact
                        body={tx(
                          "Hello, this is the office team.",
                          "Здравствуйте, это офис."
                        )}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="ws-empty">
            <UserRound size={22} />
            <h3>
              {tx(
                "No workers in this period",
                "Нет сотрудников за этот период"
              )}
            </h3>
            <p>
              {tx(
                "Add crew members and approved timecards to populate this directory.",
                "Добавьте сотрудников и утверждённые табели, чтобы заполнить этот справочник."
              )}
            </p>
          </div>
        )
      ) : null}
    </section>
  );
}
