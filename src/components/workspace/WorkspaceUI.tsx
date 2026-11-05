import { AlertCircle, Inbox, LoaderCircle, X } from "lucide-react";
import { useEffect, useState } from "react";
import { getLocale, useI18n } from "@/lib/i18n";

export function LoadingBlock({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <div className="ws-loading">
      <LoaderCircle size={18} className="ws-spin" />{" "}
      {t(label || "Loading workspace…")}
    </div>
  );
}

export function ErrorNotice({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  const { t } = useI18n();
  const message =
    error instanceof Error
      ? error.message
      : "We couldn't load this workspace data.";
  return (
    <div className="ws-error">
      <AlertCircle size={15} /> <span>{t(message)}</span>
      {retry && (
        <button className="ws-btn" onClick={retry}>
          {t("Try again")}
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="ws-empty">
      <Inbox size={23} />
      <h3>{t(title)}</h3>
      <p>{t(detail)}</p>
      {action}
    </div>
  );
}

export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div
      className="ws-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={t(title)}
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className={`ws-modal ${wide ? "ws-modal--wide" : ""}`}>
        <header className="ws-modal__head">
          <h2>{t(title)}</h2>
          <button
            className="ws-modal-close"
            onClick={onClose}
            aria-label={t("Close")}
          >
            <X size={18} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

export function StatusChip({ status }: { status?: string | null }) {
  const { t } = useI18n();
  const value = (status || "not scheduled").replace(/_/g, " ");
  const normalized = value.toLowerCase();
  const tone = /complete|paid|active|won|confirmed/.test(normalized)
    ? "green"
    : /cancel|overdue|failed/.test(normalized)
      ? "red"
      : /draft|lead|new|pending|scheduled|sent/.test(normalized)
        ? "blue"
        : /hold|late/.test(normalized)
          ? "orange"
          : "";
  return <span className={`ws-chip ${tone}`}>{t(value)}</span>;
}

export function useRemote<T>(
  load: () => Promise<T>,
  dependencies: React.DependencyList = []
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await load());
    } catch (reason) {
      setError(reason);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void refresh();
  }, dependencies); // caller controls stable dependencies
  return { data, loading, error, refresh, setData };
}

export function formatDate(
  value?: string | null,
  options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  }
) {
  if (!value) return "—";
  const date = new Date(`${value}`.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(getLocale(), options).format(date);
}

export function toLocalDateInput(value?: string | null) {
  if (!value) return new Date().toISOString().slice(0, 10);
  return value.slice(0, 10);
}
