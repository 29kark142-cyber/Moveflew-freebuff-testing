import { AlertCircle, Copy, ExternalLink } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { ModuleProps } from "@shared/expansion";
import { getLocale, useI18n } from "@/lib/i18n";
import {
  ErrorNotice,
  LoadingBlock,
  StatusChip,
  formatDate,
} from "@/components/workspace/WorkspaceUI";

export type EngagementPageProps = ModuleProps;
export const canSales = (role: ModuleProps["role"]) =>
  ["admin", "office_admin", "estimator"].includes(role);
export const canAdmin = (role: ModuleProps["role"]) =>
  ["admin", "office_admin"].includes(role);

export function PageHead({
  heading,
  caption,
  actions,
}: {
  heading: string;
  caption: string;
  actions?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="ws-page-head eg-page-head">
      <div>
        <h1>{t(heading)}</h1>
        <p>{t(caption)}</p>
      </div>
      {actions && <div className="ws-actions">{actions}</div>}
    </div>
  );
}

export function PageFailure({
  heading,
  caption,
  error,
  retry,
}: {
  heading: string;
  caption: string;
  error: unknown;
  retry: () => void;
}) {
  return (
    <>
      <PageHead heading={heading} caption={caption} />
      <ErrorNotice error={error} retry={retry} />
    </>
  );
}

export function PageLoading({ label }: { label: string }) {
  return <LoadingBlock label={label} />;
}

export function PermissionNotice() {
  const { t } = useI18n();
  return (
    <div className="ws-error eg-notice">
      <AlertCircle size={16} />
      {t("Your workspace role can view this data but cannot change it.")}
    </div>
  );
}

export const cents = (value: unknown) =>
  new Intl.NumberFormat(getLocale(), {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0) / 100);

export const dateInputToday = () => new Date().toISOString().slice(0, 10);
export const monthBounds = (month: string) => {
  const [year, selectedMonth] = month.split("-").map(Number);
  const last = new Date(year, selectedMonth, 0).getDate();
  return {
    from: `${month}-01`,
    to: `${month}-${String(last).padStart(2, "0")}`,
  };
};

const neutralize = (value: unknown) => {
  const cell = value === null || value === undefined ? "" : String(value);
  return /^[=+\-@]/.test(cell) ? `'${cell}` : cell;
};
export function downloadSafeCsv(
  filename: string,
  rows: Array<Record<string, unknown>>
) {
  const columns = [...new Set(rows.flatMap(row => Object.keys(row)))];
  const quote = (value: unknown) =>
    `"${neutralize(value).replace(/"/g, '""')}"`;
  const csv = [
    columns.map(quote).join(","),
    ...rows.map(row => columns.map(key => quote(row[key])).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function CopyButton({
  value,
  label = "Copy",
}: {
  value: string;
  label?: string;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="ws-btn"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        } catch {
          setCopied(false);
        }
      }}
    >
      <Copy size={14} /> {t(copied ? "Copied" : label)}
    </button>
  );
}

export function ExternalButton({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a className="ws-btn" href={href} target="_blank" rel="noreferrer">
      {children} <ExternalLink size={14} />
    </a>
  );
}

export { formatDate, StatusChip };
