import { workerCalendarDate } from "@shared/worker-period";
import { useEffect, useState } from "react";
import { Download, Plus, RefreshCw } from "lucide-react";
import type { CrewMember } from "@shared/crm";
import { workersApi } from "@/lib/workers-api";
import { useI18n } from "@/lib/i18n";
import {
  ErrorNotice,
  LoadingBlock,
  Modal,
  useRemote,
} from "@/components/workspace/WorkspaceUI";
import {
  dollarsToCents,
  downloadCsv,
  money,
  shortDate,
} from "../extended/operations-common";
import { WorkerPeriodPicker, useWorkerPeriod } from "./WorkerPeriodPicker";
import "./workers.css";

export default function RecordZellePayout({
  crew,
  onRecorded,
}: {
  crew: CrewMember[];
  onRecorded: (message: string) => Promise<void>;
}) {
  const { tx } = useI18n();
  const period = useWorkerPeriod();
  const history = useRemote(
    () =>
      period.valid ? workersApi.payouts(period.period) : Promise.resolve([]),
    [period.period.from, period.period.to, period.valid]
  );
  const [open, setOpen] = useState(false);
  const [workerId, setWorkerId] = useState(crew[0]?.id || 0);
  const detail = useRemote(
    () =>
      open && workerId && period.valid
        ? workersApi.detail(workerId, period.period)
        : Promise.resolve(null),
    [open, workerId, period.period.from, period.period.to, period.valid]
  );
  const [cardIds, setCardIds] = useState<number[]>([]);
  const [tipIds, setTipIds] = useState<number[]>([]);
  const [amount, setAmount] = useState("");
  const [paidDate, setPaidDate] = useState(workerCalendarDate());
  const [reference, setReference] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    setCardIds([]);
    setTipIds([]);
    setAmount("");
    setConfirmed(false);
  }, [workerId, period.period.from, period.period.to, open]);
  const cards = (detail.data?.timecards || []).filter(
    card => card.approved && card.payoutId === null
  );
  const tips = (detail.data?.tipAllocations || []).filter(
    tip => tip.payoutId === null
  );
  const total =
    cards
      .filter(card => cardIds.includes(card.id))
      .reduce((sum, card) => sum + card.earnedCents, 0) +
    tips
      .filter(tip => tipIds.includes(tip.id))
      .reduce((sum, tip) => sum + tip.amountCents, 0);
  const toggle = (
    id: number,
    selected: number[],
    setter: (ids: number[]) => void
  ) => {
    setter(
      selected.includes(id)
        ? selected.filter(item => item !== id)
        : [...selected, id]
    );
    setConfirmed(false);
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const amountCents = dollarsToCents(amount);
    if (
      !confirmed ||
      amountCents === null ||
      amountCents <= 0 ||
      amountCents !== total ||
      !reference.trim() ||
      !paidDate
    ) {
      setError(
        new Error(
          tx(
            "Enter the exact selected amount, date and reference, and confirm the external payment.",
            "Укажите точную выбранную сумму, дату и идентификатор и подтвердите внешний платеж."
          )
        )
      );
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await workersApi.recordZellePayout({
        crewMemberId: workerId,
        amountCents,
        paidDate,
        reference: reference.trim(),
        timecardIds: cardIds,
        tipAllocationIds: tipIds,
      });
      setOpen(false);
      setReference("");
      setAmount("");
      await history.refresh();
      await onRecorded(
        tx(
          "Zelle payout recorded. No funds were sent by the CRM.",
          "Выплата Zelle учтена. CRM не отправляла средства."
        )
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason
          : new Error(
              tx("Could not record payout.", "Не удалось учесть выплату.")
            )
      );
    } finally {
      setSaving(false);
    }
  };
  const exportHistory = () =>
    downloadCsv("zelle-payout-history.csv", [
      [
        "Worker",
        "Paid date",
        "Amount USD",
        "Zelle reference",
        "Timecards",
        "Tips",
      ],
      ...(history.data || []).map(row => [
        row.workerName,
        row.paidDate,
        (row.amountCents / 100).toFixed(2),
        row.reference,
        row.timecardIds.join(";"),
        row.tipAllocationIds.join(";"),
      ]),
    ]);
  return (
    <section className="ws-card ws-card-pad">
      <div className="worker-directory__head">
        <div>
          <h2>{tx("Zelle payout history", "История выплат Zelle")}</h2>
          <p>
            {tx(
              "Record payments completed outside the CRM; this never initiates a Zelle transfer. Selected timecard amounts include the existing weekly overtime review policy.",
              "Фиксируйте платежи, завершенные вне CRM. Здесь нельзя инициировать перевод Zelle. Выбранные суммы табелей учитывают действующие правила расчета сверхурочных."
            )}
          </p>
        </div>
        <div className="ws-row-actions">
          <WorkerPeriodPicker value={period} />
          <button
            className="ws-btn"
            onClick={exportHistory}
            disabled={!history.data?.length}
          >
            <Download size={14} />
            {tx("Export CSV", "Экспорт CSV")}
          </button>
          <button className="ws-btn" onClick={() => void history.refresh()}>
            <RefreshCw size={14} />
          </button>
          <button
            className="ws-btn primary"
            disabled={!crew.length || !period.valid}
            onClick={() => {
              setError(null);
              setReference("");
              setOpen(true);
            }}
          >
            <Plus size={14} />
            {tx("Record Zelle Payout", "Учесть выплату Zelle")}
          </button>
        </div>
      </div>
      {history.loading ? (
        <LoadingBlock />
      ) : history.error ? (
        <ErrorNotice
          error={history.error}
          retry={() => void history.refresh()}
        />
      ) : history.data?.length ? (
        <div className="ws-table-wrap">
          <table className="ws-table">
            <thead>
              <tr>
                <th>{tx("Worker", "Сотрудник")}</th>
                <th>{tx("Date", "Дата")}</th>
                <th>{tx("Amount", "Сумма")}</th>
                <th>{tx("Reference", "Идентификатор")}</th>
                <th>{tx("Sources", "Источники")}</th>
                <th>{tx("Status", "Статус")}</th>
              </tr>
            </thead>
            <tbody>
              {history.data.map(row => (
                <tr key={row.id}>
                  <td>{row.workerName}</td>
                  <td>{shortDate(row.paidDate)}</td>
                  <td>{money(row.amountCents)}</td>
                  <td>{row.reference}</td>
                  <td>
                    {row.timecardIds.length} {tx("timecards", "табелей")} ·{" "}
                    {row.tipAllocationIds.length} {tx("tips", "чаевых")}
                  </td>
                  <td>
                    <span className="worker-paid-badge">
                      {tx("Paid via Zelle", "Выплачено через Zelle")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="worker-history-note">
          {tx(
            "No recorded payouts in this period.",
            "За этот период выплат не записано."
          )}
        </p>
      )}
      {open && (
        <Modal
          title="Record Zelle Payout"
          wide
          onClose={() => {
            if (!saving) setOpen(false);
          }}
        >
          <form
            className="ws-modal__body"
            onSubmit={event => void submit(event)}
          >
            <p className="ws-alert">
              {tx(
                "Record-only: complete the payment in your bank/Zelle app first. Select approved unpaid hours/tips below. The entered amount must exactly equal the selected sources; partial source payments are not supported.",
                "Только учет: сначала завершите платеж в банковском приложении/Zelle. Выберите утвержденные неоплаченные часы/чаевые. Сумма должна точно совпадать с выбранными источниками; частичная оплата источников не поддерживается."
              )}
            </p>
            <div className="ws-form-grid" style={{ marginBlock: 16 }}>
              <label className="ws-field">
                <span>{tx("Worker", "Сотрудник")}</span>
                <select
                  className="ws-select"
                  disabled={saving}
                  value={workerId}
                  onChange={event => setWorkerId(Number(event.target.value))}
                >
                  {crew.map(worker => (
                    <option key={worker.id} value={worker.id}>
                      {worker.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="ws-field">
                <span>{tx("Paid date", "Дата выплаты")}</span>
                <input
                  required
                  className="ws-input"
                  type="date"
                  value={paidDate}
                  onChange={event => setPaidDate(event.target.value)}
                />
              </label>
            </div>
            {detail.loading ? (
              <LoadingBlock />
            ) : detail.error ? (
              <ErrorNotice
                error={detail.error}
                retry={() => void detail.refresh()}
              />
            ) : (
              <>
                <h3>
                  {tx(
                    "Approved unpaid timecards",
                    "Утвержденные неоплаченные табели"
                  )}
                </h3>
                {cards.map(card => (
                  <label
                    key={card.id}
                    className="ws-checkbox"
                    style={{ paddingBlock: 8 }}
                  >
                    <input
                      disabled={saving}
                      type="checkbox"
                      checked={cardIds.includes(card.id)}
                      onChange={() => toggle(card.id, cardIds, setCardIds)}
                    />
                    <span>
                      #{card.id} · {shortDate(card.workDate)} ·{" "}
                      {((card.minutes - card.breakMinutes) / 60).toFixed(2)}{" "}
                      {tx("hours", "часов")} · {money(card.earnedCents)}
                    </span>
                  </label>
                ))}
                {!cards.length && (
                  <p className="worker-help">
                    {tx(
                      "No approved unpaid timecards in this date range.",
                      "За этот период нет утвержденных неоплаченных табелей."
                    )}
                  </p>
                )}
                <h3 style={{ marginTop: 16 }}>
                  {tx(
                    "Unpaid allocated tips",
                    "Неоплаченные распределенные чаевые"
                  )}
                </h3>
                {tips.map(tip => (
                  <label
                    key={tip.id}
                    className="ws-checkbox"
                    style={{ paddingBlock: 8 }}
                  >
                    <input
                      disabled={saving}
                      type="checkbox"
                      checked={tipIds.includes(tip.id)}
                      onChange={() => toggle(tip.id, tipIds, setTipIds)}
                    />
                    <span>
                      #{tip.id} · {shortDate(tip.tipDate)} ·{" "}
                      {tx("Job", "Заказ")} #{tip.jobId} ·{" "}
                      {money(tip.amountCents)}
                    </span>
                  </label>
                ))}
                {!tips.length && (
                  <p className="worker-help">
                    {tx(
                      "No unpaid tip allocations in this date range.",
                      "За этот период нет неоплаченных распределений чаевых."
                    )}
                  </p>
                )}
              </>
            )}
            <p style={{ marginBlock: 18 }}>
              <b>
                {tx("Selected payable total", "Выбранная сумма к выплате")}:{" "}
                {money(total)}
              </b>{" "}
              <button
                type="button"
                className="ws-btn"
                disabled={!total || saving}
                onClick={() => setAmount((total / 100).toFixed(2))}
              >
                {tx("Use selected total", "Использовать выбранную сумму")}
              </button>
            </p>
            <div className="ws-form-grid">
              <label className="ws-field">
                <span>{tx("Payout amount (USD)", "Сумма выплаты (USD)")}</span>
                <input
                  required
                  className="ws-input"
                  inputMode="decimal"
                  value={amount}
                  onChange={event => setAmount(event.target.value)}
                />
              </label>
              <label className="ws-field">
                <span>
                  {tx(
                    "Zelle transaction reference",
                    "Идентификатор транзакции Zelle"
                  )}
                </span>
                <input
                  required
                  maxLength={180}
                  className="ws-input"
                  value={reference}
                  onChange={event => setReference(event.target.value)}
                />
              </label>
            </div>
            <label className="ws-checkbox" style={{ marginBlock: 20 }}>
              <input
                type="checkbox"
                checked={confirmed}
                onChange={event => setConfirmed(event.target.checked)}
              />
              {tx(
                "I confirm this payment was completed externally and the selected allocations are correct.",
                "Подтверждаю, что платеж выполнен вне CRM и выбранные источники верны."
              )}
            </label>
            {error && <ErrorNotice error={error} />}
            <div className="ops-form-actions">
              <button
                className="ws-btn"
                type="button"
                disabled={saving}
                onClick={() => setOpen(false)}
              >
                {tx("Cancel", "Отмена")}
              </button>
              <button
                className="ws-btn primary"
                disabled={
                  saving ||
                  detail.loading ||
                  !!detail.error ||
                  !confirmed ||
                  total <= 0 ||
                  dollarsToCents(amount) !== total
                }
              >
                {saving
                  ? tx("Recording…", "Записываем…")
                  : tx("Record payout", "Учесть выплату")}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
