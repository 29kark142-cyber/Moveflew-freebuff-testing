import { useState } from "react";
import { Trash2, ShieldAlert } from "lucide-react";
import type { WorkspaceRole } from "@shared/crm";
import { crmFetch } from "@/lib/crm";
import { useI18n } from "@/lib/i18n";
import { ErrorNotice, Modal } from "./WorkspaceUI";

type Preview = {
  jobId: number;
  title: string;
  timecards: number;
  inventory: number;
  invoices: number;
  finalizedMoveRecord?: boolean;
  blockers: string[];
  revision: string;
};
export default function DeleteJobButton({
  jobId,
  role,
  estimate = false,
  onDeleted,
}: {
  jobId: number;
  role: WorkspaceRole;
  estimate?: boolean;
  onDeleted: () => void | Promise<void>;
}) {
  const { tx, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  if (role !== "admin" && role !== "office_admin") return null;
  const load = async () => {
    setOpen(true);
    setPreview(null);
    setError(null);
    setBusy(true);
    setConfirmed(false);
    try {
      setPreview(await crmFetch<Preview>(`/jobs/${jobId}/deletion-preview`));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason
          : new Error("Could not load deletion warning")
      );
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!preview || !confirmed) return;
    setBusy(true);
    setError(null);
    try {
      await crmFetch(`/jobs/${jobId}`, {
        method: "DELETE",
        body: JSON.stringify({ confirm: true, revision: preview.revision }),
      });
      setOpen(false);
      await onDeleted();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason : new Error("Could not delete job")
      );
      setConfirmed(false);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button
        className="ws-btn"
        style={{ color: "#be3f48" }}
        onClick={() => void load()}
      >
        <Trash2 size={14} />
        {estimate
          ? tx("Delete Estimate", "Удалить смету")
          : tx("Delete Job", "Удалить задание")}
      </button>
      {open && (
        <Modal
          title={estimate ? "Delete Estimate" : "Delete Job"}
          onClose={() => {
            if (!busy) setOpen(false);
          }}
        >
          <div className="ws-modal__body">
            <p>
              <ShieldAlert
                size={22}
                style={{ color: "#bd5b29", marginBottom: 12 }}
              />
              {tx(
                "This removes the record from active jobs, estimates, dispatch and revenue projections. Linked records are preserved for audit and accounting; this is a soft deletion, not a refund or financial cancellation.",
                "Запись исчезнет из активных заданий, смет, диспетчеризации и прогнозов выручки. Связанные данные сохраняются для аудита и учета. Это мягкое удаление, а не возврат денег или отмена финансовых обязательств."
              )}
            </p>
            {preview && (
              <>
                <h3 style={{ marginBlock: 18 }}>
                  {preview.title || `#${jobId}`}
                </h3>
                <div className="ws-detail-grid">
                  <div>
                    {tx("Linked timecards", "Связанные табели")}{" "}
                    <b>{preview.timecards}</b>
                  </div>
                  <div>
                    {tx("Inventory entries", "Записи инвентаря")}{" "}
                    <b>{preview.inventory}</b>
                  </div>
                  <div>
                    {tx("Invoices", "Счета")} <b>{preview.invoices}</b>
                  </div>
                </div>
                {preview.finalizedMoveRecord && (
                  <p className="ws-alert">
                    {tx(
                      "The finalized move amount is also preserved for financial audit.",
                      "Итоговая сумма переезда также сохраняется для финансового аудита."
                    )}
                  </p>
                )}
                {preview.blockers.length ? (
                  <div className="ws-error" style={{ marginTop: 18 }}>
                    {preview.blockers.map(text => (
                      <p key={text}>{t(text)}</p>
                    ))}
                  </div>
                ) : (
                  <label className="ws-checkbox" style={{ marginBlock: 20 }}>
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={event => setConfirmed(event.target.checked)}
                    />
                    {tx(
                      "I have reviewed the linked records and want to delete this job/estimate.",
                      "Я проверил связанные записи и хочу удалить задание/смету."
                    )}
                  </label>
                )}
              </>
            )}
            {error && <ErrorNotice error={error} retry={() => void load()} />}
            {busy && !preview && (
              <p>
                {tx("Checking linked records…", "Проверяем связанные записи…")}
              </p>
            )}
            <div className="ops-form-actions">
              <button
                className="ws-btn"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                {tx("Keep record", "Сохранить запись")}
              </button>
              <button
                className="ws-btn"
                style={{ background: "#bd4049", color: "white" }}
                disabled={
                  busy || !preview || !!preview.blockers.length || !confirmed
                }
                onClick={() => void remove()}
              >
                {busy
                  ? tx("Working…", "Выполняется…")
                  : tx("Confirm deletion", "Подтвердить удаление")}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
