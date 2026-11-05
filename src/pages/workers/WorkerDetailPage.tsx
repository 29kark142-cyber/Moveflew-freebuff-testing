import { ChevronLeft, RefreshCw, UserRound } from "lucide-react";
import type { WorkspaceRole } from "@shared/crm";
import {
  WORKER_DIRECTORY_ROLES,
  type WorkerCard,
  type WorkerTip,
} from "@shared/workers";
import type { ModuleProps } from "@shared/expansion";
import { useI18n } from "@/lib/i18n";
import { workersApi } from "@/lib/workers-api";
import TextWorker from "@/components/workspace/TextWorker";
import {
  ErrorNotice,
  LoadingBlock,
  StatusChip,
  useRemote,
} from "@/components/workspace/WorkspaceUI";
import { WorkerPeriodPicker, useWorkerPeriod } from "./WorkerPeriodPicker";
import "./workers.css";

export type WorkerDetailPageProps = ModuleProps;

const financeRoles: WorkspaceRole[] = ["admin", "office_admin"];

function formatUSD(cents: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function formatHours(minutes: number, locale: string) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
    minutes / 60
  );
}

function shortDate(value: string, locale: string) {
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(locale, {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(date);
}

function netMinutes(card: WorkerCard) {
  return Math.max(0, card.minutes - card.breakMinutes);
}

function WorkerMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="worker-metric">
      <small>{label}</small>
      <b>{value}</b>
    </div>
  );
}

function PayoutBadge({
  payoutId,
  paidMethod,
}: Pick<WorkerCard | WorkerTip, "payoutId" | "paidMethod">) {
  const { tx } = useI18n();
  if (!payoutId)
    return (
      <span className="worker-unpaid-badge">
        {tx("Unpaid", "Не выплачено")}
      </span>
    );
  return (
    <span
      className="worker-paid-badge"
      title={tx(
        "This is a recorded payout state, not transfer confirmation.",
        "Это учтённый статус выплаты, а не подтверждение перевода."
      )}
    >
      {paidMethod === "zelle"
        ? tx("Paid via Zelle", "Выплачено через Zelle")
        : tx("Recorded paid", "Учтено выплачено")}
    </span>
  );
}

export default function WorkerDetailPage({
  role,
  navigate,
  path,
}: WorkerDetailPageProps) {
  const { tx, locale } = useI18n();
  const period = useWorkerPeriod();
  const workerId = Number(/^\/app\/workers\/(\d+)\/?$/.exec(path)?.[1]);
  const validWorkerId = Number.isSafeInteger(workerId) && workerId > 0;
  const { data, loading, error, refresh } = useRemote(
    () =>
      validWorkerId && period.valid
        ? workersApi.detail(workerId, period.period)
        : Promise.resolve(null),
    [
      workerId,
      validWorkerId,
      period.period.from,
      period.period.to,
      period.valid,
    ]
  );
  const canSeeCompensation =
    Boolean(data?.compensationVisible) &&
    (financeRoles.includes(role) || role === "crew");

  if (!WORKER_DIRECTORY_ROLES.includes(role)) {
    return (
      <div className="worker-detail">
        <button
          className="worker-detail__back"
          onClick={() => navigate("/app/fleet")}
        >
          <ChevronLeft size={16} />
          {tx("Back to Fleet & crew", "Назад к автопарку и бригаде")}
        </button>
        <div className="worker-compensation-note">
          {tx(
            "Worker records are not available for your role.",
            "Записи о сотрудниках недоступны для вашей роли."
          )}
        </div>
      </div>
    );
  }

  if (!validWorkerId) {
    return (
      <div className="worker-detail">
        <button
          className="worker-detail__back"
          onClick={() => navigate("/app/fleet")}
        >
          <ChevronLeft size={16} />
          {tx("Back to Fleet & crew", "Назад к автопарку и бригаде")}
        </button>
        <div className="worker-compensation-note">
          {tx("Worker record not found.", "Запись сотрудника не найдена.")}
        </div>
      </div>
    );
  }

  return (
    <div className="worker-detail">
      <div className="worker-detail__head">
        <div>
          <button
            className="worker-detail__back"
            onClick={() => navigate("/app/fleet")}
          >
            <ChevronLeft size={16} />
            {tx("Back to Fleet & crew", "Назад к автопарку и бригаде")}
          </button>
          {data ? (
            <div className="worker-detail__identity">
              <h1>{data.worker.name}</h1>
              <p>
                {data.worker.isDriver
                  ? tx("Driver", "Водитель")
                  : tx("Crew member", "Член бригады")}
                {" · "}
                {tx("Skill level {level}", "Уровень навыков {level}", {
                  level: data.worker.skillLevel,
                })}
              </p>
            </div>
          ) : (
            <div className="worker-detail__identity">
              <h1>{tx("Worker detail", "Карточка сотрудника")}</h1>
            </div>
          )}
        </div>
        <div className="ws-row-actions">
          <WorkerPeriodPicker value={period} />
          <button
            type="button"
            className="ws-icon-btn"
            aria-label={tx(
              "Refresh worker detail",
              "Обновить карточку сотрудника"
            )}
            title={tx("Refresh", "Обновить")}
            disabled={!period.valid || loading}
            onClick={() => void refresh()}
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {loading && period.valid ? (
        <LoadingBlock label={tx("Loading worker…", "Загрузка сотрудника…")} />
      ) : error ? (
        <ErrorNotice error={error} retry={() => void refresh()} />
      ) : data ? (
        <>
          <section className="ws-card ws-card-pad">
            <div className="worker-detail__overview">
              <div>
                <div className="worker-detail__facts">
                  <div className="worker-detail__fact">
                    <small>{tx("Email", "Электронная почта")}</small>
                    <span>{data.worker.email || "—"}</span>
                  </div>
                  <div className="worker-detail__fact">
                    <small>{tx("Phone", "Телефон")}</small>
                    <span>{data.worker.phone || "—"}</span>
                  </div>
                  <div className="worker-detail__fact">
                    <small>{tx("Status", "Статус")}</small>
                    <StatusChip status={data.worker.status} />
                  </div>
                  <div className="worker-detail__fact">
                    <small>{tx("Period", "Период")}</small>
                    <span>
                      {shortDate(data.period.from, locale)} —{" "}
                      {shortDate(data.period.to, locale)}
                    </span>
                  </div>
                </div>
                <div className="worker-detail__contact">
                  <TextWorker
                    phone={data.worker.phone}
                    body={tx(
                      "Hello, this is the office team.",
                      "Здравствуйте, это офис."
                    )}
                  />
                  <span className="worker-help">
                    {tx(
                      "Opens an SMS draft only; no message is sent automatically.",
                      "Открывает только черновик SMS; сообщение не отправляется автоматически."
                    )}
                  </span>
                </div>
              </div>
              <div className="worker-detail__metrics">
                <WorkerMetric
                  label={tx("Approved net hours", "Утверждённые чистые часы")}
                  value={
                    data.worker.approvedMinutes === null
                      ? "—"
                      : formatHours(data.worker.approvedMinutes, locale)
                  }
                />
                <WorkerMetric
                  label={tx("Completed jobs", "Выполненные заказы")}
                  value={String(data.worker.completedJobs)}
                />
                {canSeeCompensation && (
                  <>
                    <WorkerMetric
                      label={tx("Total earned", "Всего заработано")}
                      value={formatUSD(
                        data.worker.totalEarnedCents || 0,
                        locale
                      )}
                    />
                    <WorkerMetric
                      label={tx("Base earnings", "Базовый заработок")}
                      value={formatUSD(
                        data.worker.baseEarnedCents || 0,
                        locale
                      )}
                    />
                    <WorkerMetric
                      label={tx("Tips", "Чаевые")}
                      value={formatUSD(data.worker.tipsCents || 0, locale)}
                    />
                  </>
                )}
              </div>
            </div>
            {!canSeeCompensation && (
              <p className="worker-compensation-note">
                {tx(
                  "Payroll and compensation records are restricted. Dispatch can review contact details and related jobs; linked crew accounts can review their own records.",
                  "Табели и вознаграждение доступны только уполномоченным ролям. Диспетчер видит контакты и связанные задания, а бригада — собственные записи."
                )}
              </p>
            )}
          </section>

          <WorkerTimecards
            cards={data.timecards}
            jobs={data.jobs}
            compensationVisible={canSeeCompensation}
            locale={locale}
          />
          <WorkerTips
            tips={data.tipAllocations}
            jobs={data.jobs}
            compensationVisible={canSeeCompensation}
            locale={locale}
          />
          <WorkerJobs jobs={data.jobs} locale={locale} />
          <WorkerPayoutHistory
            payouts={data.payouts}
            compensationVisible={canSeeCompensation}
            locale={locale}
          />
        </>
      ) : null}
    </div>
  );
}

function WorkerTimecards({
  cards,
  jobs,
  compensationVisible,
  locale,
}: {
  cards: WorkerCard[];
  jobs: Array<{ id: number; title: string; moveDate: string; status: string }>;
  compensationVisible: boolean;
  locale: string;
}) {
  const { tx } = useI18n();
  const jobName = (id: number | null) =>
    id
      ? jobs.find(job => job.id === id)?.title || `#${id}`
      : tx("Not job-linked", "Не связано с заказом");
  return (
    <section className="ws-card ws-card-pad">
      <div className="ws-card-title">
        <div>
          <h2>{tx("Timecards", "Табели")}</h2>
          <p>
            {tx(
              "Only approved time is included in the worker summary.",
              "В сводку сотрудника включается только утверждённое время."
            )}
          </p>
        </div>
      </div>
      {cards.length ? (
        <>
          <div className="ws-table-wrap">
            <table className="ws-table">
              <thead>
                <tr>
                  <th>{tx("Work date", "Дата работы")}</th>
                  <th>{tx("Job", "Заказ")}</th>
                  <th>{tx("Net hours", "Чистые часы")}</th>
                  <th>{tx("Approval", "Утверждение")}</th>
                  <th>{tx("Payout", "Выплата")}</th>
                  {compensationVisible && (
                    <>
                      <th>{tx("Historical rate", "Историческая ставка")}</th>
                      <th>{tx("Payable", "К выплате")}</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {cards.map(card => (
                  <tr key={card.id}>
                    <td>{shortDate(card.workDate, locale)}</td>
                    <td>{jobName(card.jobId)}</td>
                    <td>{formatHours(netMinutes(card), locale)}</td>
                    <td>
                      <StatusChip
                        status={card.approved ? "approved" : "pending"}
                      />
                    </td>
                    <td>
                      <PayoutBadge
                        payoutId={card.payoutId}
                        paidMethod={card.paidMethod}
                      />
                    </td>
                    {compensationVisible && (
                      <>
                        <td className="ops-money">
                          {formatUSD(card.rateCents, locale)}
                        </td>
                        <td className="ops-money">
                          {formatUSD(card.earnedCents, locale)}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {compensationVisible && (
            <p className="worker-history-note">
              {tx(
                "Rates are historical timecard snapshots, not the worker's current rate. Recorded payout badges do not verify an external transfer.",
                "Ставки — это исторические снимки из табелей, а не текущая ставка сотрудника. Значки учтённой выплаты не подтверждают внешний перевод."
              )}
            </p>
          )}
        </>
      ) : (
        <WorkerEmpty
          title={tx("No timecards", "Нет табелей")}
          detail={tx(
            "No timecards were returned for the selected period.",
            "За выбранный период табели не найдены."
          )}
        />
      )}
    </section>
  );
}

function WorkerTips({
  tips,
  jobs,
  compensationVisible,
  locale,
}: {
  tips: WorkerTip[];
  jobs: Array<{ id: number; title: string; moveDate: string; status: string }>;
  compensationVisible: boolean;
  locale: string;
}) {
  const { tx } = useI18n();
  const jobName = (id: number) =>
    jobs.find(job => job.id === id)?.title || `#${id}`;
  return (
    <section className="ws-card ws-card-pad">
      <div className="ws-card-title">
        <div>
          <h2>{tx("Tip allocations", "Распределения чаевых")}</h2>
          <p>
            {tx(
              "Manual allocation records tied to completed work.",
              "Записи ручного распределения, связанные с выполненной работой."
            )}
          </p>
        </div>
      </div>
      {tips.length ? (
        <div className="ws-table-wrap">
          <table className="ws-table">
            <thead>
              <tr>
                <th>{tx("Tip date", "Дата чаевых")}</th>
                <th>{tx("Job", "Заказ")}</th>
                <th>{tx("Payout", "Выплата")}</th>
                {compensationVisible && <th>{tx("Amount", "Сумма")}</th>}
              </tr>
            </thead>
            <tbody>
              {tips.map(tip => (
                <tr key={tip.id}>
                  <td>{shortDate(tip.tipDate, locale)}</td>
                  <td>{jobName(tip.jobId)}</td>
                  <td>
                    <PayoutBadge
                      payoutId={tip.payoutId}
                      paidMethod={tip.paidMethod}
                    />
                  </td>
                  {compensationVisible && (
                    <td className="ops-money">
                      {formatUSD(tip.amountCents, locale)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <WorkerEmpty
          title={tx("No tip allocations", "Нет распределений чаевых")}
          detail={tx(
            "No tip allocations were returned for the selected period.",
            "За выбранный период распределения чаевых не найдены."
          )}
        />
      )}
    </section>
  );
}

function WorkerJobs({
  jobs,
  locale,
}: {
  jobs: Array<{ id: number; title: string; moveDate: string; status: string }>;
  locale: string;
}) {
  const { tx } = useI18n();
  return (
    <section className="ws-card ws-card-pad">
      <div className="ws-card-title">
        <div>
          <h2>{tx("Related jobs", "Связанные задания")}</h2>
          <p>
            {tx(
              "Related job records returned for this period.",
              "Связанные записи заказов, возвращённые за этот период."
            )}
          </p>
        </div>
      </div>
      {jobs.length ? (
        <div className="ws-table-wrap">
          <table className="ws-table">
            <thead>
              <tr>
                <th>{tx("Job", "Заказ")}</th>
                <th>{tx("Move date", "Дата переезда")}</th>
                <th>{tx("Status", "Статус")}</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map(job => (
                <tr key={job.id}>
                  <td className="ws-table-main">{job.title || `#${job.id}`}</td>
                  <td>{shortDate(job.moveDate, locale)}</td>
                  <td>
                    <StatusChip status={job.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <WorkerEmpty
          title={tx("No related jobs", "Нет связанных заданий")}
          detail={tx(
            "No related jobs were returned for the selected period.",
            "За выбранный период связанные задания не найдены."
          )}
        />
      )}
    </section>
  );
}

function WorkerPayoutHistory({
  payouts,
  compensationVisible,
  locale,
}: {
  payouts: Array<{
    id: number;
    paidDate: string;
    reference: string;
    method: "zelle";
    amountCents: number;
    timecardIds: number[];
    tipAllocationIds: number[];
  }>;
  compensationVisible: boolean;
  locale: string;
}) {
  const { tx } = useI18n();
  return (
    <section className="ws-card ws-card-pad">
      <div className="ws-card-title">
        <div>
          <h2>{tx("Payout history", "История выплат")}</h2>
          <p>
            {tx(
              "Recorded Zelle payout entries for this worker.",
              "Учтённые записи выплат Zelle для этого сотрудника."
            )}
          </p>
        </div>
      </div>
      {payouts.length ? (
        <div className="ws-table-wrap">
          <table className="ws-table">
            <thead>
              <tr>
                <th>{tx("Paid date", "Дата выплаты")}</th>
                <th>{tx("Method", "Способ")}</th>
                <th>{tx("Reference", "Идентификатор")}</th>
                <th>{tx("Sources", "Источники")}</th>
                {compensationVisible && (
                  <th>{tx("Recorded amount", "Учтённая сумма")}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {payouts.map(payout => (
                <tr key={payout.id}>
                  <td>{shortDate(payout.paidDate, locale)}</td>
                  <td>
                    <span className="worker-paid-badge">Zelle</span>
                  </td>
                  <td>{payout.reference}</td>
                  <td>
                    {tx(
                      "{timecards} timecards · {tips} tips",
                      "Табели: {timecards} · чаевые: {tips}",
                      {
                        timecards: payout.timecardIds.length,
                        tips: payout.tipAllocationIds.length,
                      }
                    )}
                  </td>
                  {compensationVisible && (
                    <td className="ops-money">
                      {formatUSD(payout.amountCents, locale)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <WorkerEmpty
          title={tx("No payout history", "Нет истории выплат")}
          detail={tx(
            "No payout entries were returned for the selected period.",
            "За выбранный период записи о выплатах не найдены."
          )}
        />
      )}
      <p className="worker-history-note">
        {tx(
          "A payout entry records an externally completed Zelle payment. It does not initiate, send, or confirm a bank transfer.",
          "Запись о выплате фиксирует внешне завершённый платёж Zelle. Она не инициирует, не отправляет и не подтверждает банковский перевод."
        )}
      </p>
    </section>
  );
}

function WorkerEmpty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="ws-empty">
      <UserRound size={22} />
      <h3>{title}</h3>
      <p>{detail}</p>
    </div>
  );
}
