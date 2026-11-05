import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import type { WorkspaceRole } from "@shared/crm";
import { getLocale, useI18n } from "@/lib/i18n";
import { csvCell, csvContent } from "@/lib/csv-export";
import "@/operations.css";

export const officeFinanceRoles: WorkspaceRole[] = ["admin", "office_admin"];
export const dispatchManagementRoles: WorkspaceRole[] = [
  "admin",
  "office_admin",
  "dispatcher",
];
export const bolRoles: WorkspaceRole[] = [
  "admin",
  "office_admin",
  "estimator",
  "dispatcher",
  "crew",
];

export function canAccess(role: WorkspaceRole, roles: WorkspaceRole[]) {
  return roles.includes(role);
}

export function money(cents: number | null | undefined) {
  return new Intl.NumberFormat(getLocale(), {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format((Number(cents) || 0) / 100);
}

/** Converts a dollar input to integer cents at the API boundary; never send floats. */
export function dollarsToCents(value: string): number | null {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  const cents = `${fraction}00`.slice(0, 2);
  const parsed = Number(whole) * 100 + Number(cents);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function dateToday() {
  return new Date().toISOString().slice(0, 10);
}
export function monthToday() {
  return dateToday().slice(0, 7);
}

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
    <div className="ws-page-head">
      <div>
        <h1>{t(heading)}</h1>
        <p>{t(caption)}</p>
      </div>
      {actions && <div className="ws-actions">{actions}</div>}
    </div>
  );
}

export function PermissionNotice({ roles }: { roles: WorkspaceRole[] }) {
  const { t } = useI18n();
  const names = roles
    .map(role =>
      role === "office_admin"
        ? t("Office admin")
        : role === "admin"
          ? t("Admin")
          : role === "dispatcher"
            ? t("Dispatcher")
            : t("Field crew")
    )
    .join(", ");
  return (
    <div className="ops-permission" role="status">
      <AlertCircle size={17} />
      <div>
        <b>{t("Access is limited")}</b>
        <p>{t("This module is available to: {roles}.", { roles: names })}</p>
        <small>
          {t("The server verifies every request and remains authoritative.")}
        </small>
      </div>
    </div>
  );
}

export function SuccessNotice({ message }: { message: string | null }) {
  const { t } = useI18n();
  if (!message) return null;
  return (
    <div className="ops-success" role="status">
      <CheckCircle2 size={16} /> {t(message)}
    </div>
  );
}

export function SectionTitle({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="ws-card-title">
      <div>
        <h2>{t(title)}</h2>
        {detail && <p>{t(detail)}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyRows({
  title,
  detail,
}: {
  title: string;
  detail: string;
}) {
  const { t } = useI18n();
  return (
    <div className="ops-empty">
      <b>{t(title)}</b>
      <span>{t(detail)}</span>
    </div>
  );
}

export function csvValue(value: unknown) {
  return csvCell(value);
}

export function downloadCsv(filename: string, rows: unknown[][]) {
  const content = csvContent(rows);
  const blob = new Blob(["\ufeff", content], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function jobLabel(job: {
  id: number;
  title?: string;
  customerName?: string;
}) {
  return job.title || job.customerName || `#${job.id}`;
}

export function shortDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(getLocale(), {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(date);
}
