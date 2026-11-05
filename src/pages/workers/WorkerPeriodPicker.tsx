import { currentWorkerWeek, previousWorkerPeriod } from "@shared/worker-period";
import { useMemo, useState } from "react";
import type { WorkerPeriod } from "@shared/workers";
import { useI18n } from "@/lib/i18n";

export type WorkerPeriodPreset = "current_week" | "previous_14" | "custom";

type WorkerPeriodState = {
  preset: WorkerPeriodPreset;
  period: WorkerPeriod;
  valid: boolean;
  setPreset: (preset: WorkerPeriodPreset) => void;
  setFrom: (from: string) => void;
  setTo: (to: string) => void;
};

export { currentWorkerWeek };
export const previousFourteenDays = previousWorkerPeriod;

export function useWorkerPeriod(): WorkerPeriodState {
  const currentWeek = currentWorkerWeek();
  const [preset, setPreset] = useState<WorkerPeriodPreset>("current_week");
  const [customFrom, setCustomFrom] = useState(currentWeek.from);
  const [customTo, setCustomTo] = useState(currentWeek.to);
  const period = useMemo(() => {
    if (preset === "current_week") return currentWorkerWeek();
    if (preset === "previous_14") return previousFourteenDays();
    return { from: customFrom, to: customTo };
  }, [preset, customFrom, customTo]);

  return {
    preset,
    period,
    valid: Boolean(period.from && period.to && period.from <= period.to),
    setPreset,
    setFrom: setCustomFrom,
    setTo: setCustomTo,
  };
}

export function WorkerPeriodPicker({ value }: { value: WorkerPeriodState }) {
  const { tx } = useI18n();
  return (
    <div
      className="worker-period-picker"
      aria-label={tx("Worker date range", "Диапазон дат сотрудников")}
    >
      <label className="ws-field">
        <span>{tx("Period", "Период")}</span>
        <select
          className="ws-select"
          value={value.preset}
          onChange={event =>
            value.setPreset(event.target.value as WorkerPeriodPreset)
          }
        >
          <option value="current_week">
            {tx("Current week", "Текущая неделя")}
          </option>
          <option value="previous_14">
            {tx(
              "Previous pay period (14 days)",
              "Прошлый расчетный период (14 дней)"
            )}
          </option>
          <option value="custom">{tx("Custom range", "Свой диапазон")}</option>
        </select>
      </label>
      {value.preset === "custom" && (
        <>
          <label className="ws-field">
            <span>{tx("From", "С")}</span>
            <input
              className="ws-input"
              type="date"
              value={value.period.from}
              max={value.period.to || undefined}
              onChange={event => value.setFrom(event.target.value)}
            />
          </label>
          <label className="ws-field">
            <span>{tx("To", "По")}</span>
            <input
              className="ws-input"
              type="date"
              value={value.period.to}
              min={value.period.from || undefined}
              onChange={event => value.setTo(event.target.value)}
            />
          </label>
        </>
      )}
      {!value.valid && (
        <span className="worker-period-picker__error">
          {tx(
            "Choose an end date on or after the start date.",
            "Выберите дату окончания не раньше даты начала."
          )}
        </span>
      )}
    </div>
  );
}
