import { Clock3, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { crmFetch } from "@/lib/crm";
import { useI18n } from "@/lib/i18n";

type Clock = {
  id: number;
  jobId: number;
  startAt: string;
  endAt: string | null;
  timecardId: number | null;
};
type ClockState = {
  eligible: boolean;
  canStart: boolean;
  activeClock: Clock | null;
  history: Clock[];
};

function formatTimestamp(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

/** Personal payroll clock; deliberately separate from the customer-billable job clock. */
export function IndividualClock({ jobId }: { jobId: number }) {
  const { locale, t } = useI18n();
  const [state, setState] = useState<ClockState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setState(
        await crmFetch<ClockState>(
          `/ops/field-clock?jobId=${encodeURIComponent(jobId)}`
        )
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not load individual clock."
      );
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = async (
    path: "/start" | "/stop",
    body: Record<string, number>
  ) => {
    setSaving(true);
    setError("");
    try {
      await crmFetch(`/ops/field-clock${path}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      await refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not update individual clock."
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return <div className="ws-loading">{t("Loading individual clock…")}</div>;
  if (!state?.eligible) return null;
  const activeHere =
    state.activeClock?.jobId === jobId ? state.activeClock : null;

  return (
    <section className="ws-card ws-card-pad" style={{ marginTop: 12 }}>
      <div className="ws-card-title">
        <div>
          <h2>{t("Individual clock")}</h2>
          <p>
            {t(
              "This records individual payroll time independently from billed job labor."
            )}
          </p>
        </div>
        <button
          className="ws-icon-btn"
          onClick={() => void refresh()}
          disabled={saving}
          title={t("Refresh")}
        >
          <RefreshCw size={15} />
        </button>
      </div>
      {error && (
        <div className="ws-error" role="alert">
          {t(error)}
        </div>
      )}
      {activeHere ? (
        <div className="ws-actions" style={{ marginTop: 12 }}>
          <span className="ws-helper">
            {t("Clocked in at {time}", {
              time: formatTimestamp(activeHere.startAt, locale),
            })}
          </span>
          <button
            className="ws-btn primary"
            disabled={saving}
            onClick={() => void save("/stop", { clockId: activeHere.id })}
          >
            <Clock3 size={15} />
            {saving ? t("Saving…") : t("Stop individual clock")}
          </button>
        </div>
      ) : state.activeClock ? (
        <p className="ws-helper" style={{ marginTop: 12 }}>
          {t(
            "An individual clock is active on another job. Stop it there before starting a new one."
          )}
        </p>
      ) : (
        <div className="ws-actions" style={{ marginTop: 12 }}>
          <button
            className="ws-btn primary"
            disabled={saving || !state.canStart}
            onClick={() => void save("/start", { jobId })}
          >
            <Clock3 size={15} />
            {saving ? t("Saving…") : t("Start individual clock")}
          </button>
          {!state.canStart && (
            <span className="ws-helper">
              {t(
                "Individual clocks can start when this assigned job is booked or in progress."
              )}
            </span>
          )}
        </div>
      )}
      {state.history.length > 0 && (
        <div className="ws-table-wrap" style={{ marginTop: 14 }}>
          <table className="ws-table">
            <thead>
              <tr>
                <th>{t("Started")}</th>
                <th>{t("Stopped")}</th>
                <th>{t("Payroll status")}</th>
              </tr>
            </thead>
            <tbody>
              {state.history.map(clock => (
                <tr key={clock.id}>
                  <td>{formatTimestamp(clock.startAt, locale)}</td>
                  <td>
                    {clock.endAt
                      ? formatTimestamp(clock.endAt, locale)
                      : t("Active")}
                  </td>
                  <td>
                    {clock.timecardId ? t("Pending review") : t("Active")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
