import {
  Copy,
  Link2,
  Mail,
  RefreshCw,
  Send,
  Share2,
  Trash2,
  UsersRound,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { WorkerInvitation } from "@shared/access";
import type { WorkspaceRole } from "@shared/crm";
import { invitationsApi } from "@/lib/access-api";
import { crmFetch } from "@/lib/crm";
import { useI18n } from "@/lib/i18n";
import { LoadingBlock, formatDate } from "./WorkspaceUI";
import "./CrewInvitations.css";

export type CrewInvitationsProps = {
  role: WorkspaceRole;
  onAccepted?: () => void;
};

type InviteKind = "link" | "email";
const managerRoles: WorkspaceRole[] = ["admin", "office_admin"];
const inviteRoles: WorkspaceRole[] = [
  "crew",
  "dispatcher",
  "estimator",
  "office_admin",
  "admin",
];

function centsFromDollars(value: string) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0
    ? Math.round(amount * 100)
    : null;
}

function browserOrigin() {
  return typeof window === "undefined" ? undefined : window.location.origin;
}

function CopyOrShare({ url, label }: { url: string; label: string }) {
  const { tx } = useI18n();
  const [notice, setNotice] = useState("");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setNotice(
        tx("Invitation link copied.", "Ссылка приглашения скопирована.")
      );
    } catch {
      // A visible URL is a usable fallback when clipboard permission is unavailable.
      setNotice(
        tx(
          "Copy the invitation link below.",
          "Скопируйте ссылку приглашения ниже."
        )
      );
    }
  };
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: label, url });
        return;
      } catch {
        // Cancellation and unsupported share targets fall back to copy without an error.
      }
    }
    await copy();
  };
  return (
    <div className="crew-invitations__fresh">
      <label>
        {label}
        <input
          readOnly
          value={url}
          aria-label={label}
          onFocus={event => event.currentTarget.select()}
        />
      </label>
      <div className="ws-row-actions">
        <button type="button" className="ws-btn" onClick={() => void copy()}>
          <Copy size={14} /> {tx("Copy", "Копировать")}
        </button>
        <button type="button" className="ws-btn" onClick={() => void share()}>
          <Share2 size={14} /> {tx("Share", "Поделиться")}
        </button>
      </div>
      {notice && <small>{notice}</small>}
    </div>
  );
}

export default function CrewInvitations({
  role,
  onAccepted,
}: CrewInvitationsProps) {
  const { tx, locale } = useI18n();
  const [invitations, setInvitations] = useState<WorkerInvitation[] | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());
  const pendingActions = useRef(new Set<number>());
  const [kind, setKind] = useState<InviteKind>("link");
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>("crew");
  const [hourlyRate, setHourlyRate] = useState("0");
  const [workerId, setWorkerId] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [freshUrl, setFreshUrl] = useState("");
  const [candidates, setCandidates] = useState<{ id: number; name: string; email?: string }[]>([]);
  useEffect(() => {
    void crmFetch<{ id: number; name: string; email?: string; userId?: string | null }[]>("/crew")
      .then(rows => setCandidates(rows.filter(r => !r.userId)))
      .catch(() => setCandidates([]));
  }, []);
  const rowUrl = (invitation: WorkerInvitation) =>
    `${window.location.origin}/join-crew?token=${(invitation as WorkerInvitation & { token?: string }).token ?? ""}`;
  const copyRow = async (invitation: WorkerInvitation) => {
    try {
      await navigator.clipboard.writeText(rowUrl(invitation));
      setFreshUrl(rowUrl(invitation));
    } catch {
      setFreshUrl(rowUrl(invitation));
    }
  };
  const openEmail = (to: string, url: string) => {
    const subject = encodeURIComponent("Join our moving crew");
    const text = encodeURIComponent(`You're invited to join our team workspace.\n\nAccept here: ${url}`);
    window.location.href = `mailto:${to}?subject=${subject}&body=${text}`;
  };
  const accepted = useRef(new Set<number>());
  const readyForTransitions = useRef(false);

  const load = async () => {
    setLoading(true);
    try {
      setInvitations(await invitationsApi.list());
    } catch {
      toast.error(tx("Invitations could not be loaded", "Не удалось загрузить приглашения"));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (!invitations) return;
    const next = new Set(
      invitations
        .filter(invitation => invitation.status === "accepted")
        .map(invitation => invitation.id)
    );
    if (
      readyForTransitions.current &&
      onAccepted &&
      [...next].some(id => !accepted.current.has(id))
    )
      onAccepted();
    accepted.current = next;
    readyForTransitions.current = true;
  }, [invitations, onAccepted]);

  if (!managerRoles.includes(role)) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const hourlyRateCents = centsFromDollars(hourlyRate);
    const candidateId = workerId.trim() ? Number(workerId) : undefined;
    if (hourlyRateCents === null) {
      setFormError(
        tx("Enter a valid hourly rate.", "Введите корректную почасовую ставку.")
      );
      return;
    }
    if (kind === "email" && !email.trim()) {
      setFormError(tx("Enter an email address.", "Введите адрес эл. почты."));
      return;
    }
    if (
      candidateId !== undefined &&
      (!Number.isInteger(candidateId) || candidateId <= 0)
    ) {
      setFormError(
        tx(
          "Worker candidate ID must be a positive whole number.",
          "ID кандидата должен быть положительным целым числом."
        )
      );
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const created = await invitationsApi.create({
        kind,
        email: kind === "email" ? email.trim() : undefined,
        role: kind === "link" ? "crew" : inviteRole,
        hourlyRateCents,
        workerId: candidateId,
        publicOrigin: browserOrigin(),
      });
      setFreshUrl(created.inviteUrl);
      await navigator.clipboard?.writeText(created.inviteUrl).catch(() => undefined);
      if (kind === "email" && email.trim()) openEmail(email.trim(), created.inviteUrl);
      setEmail("");
      setWorkerId("");
      await load();
    } catch (reason) {
      setFormError(
        reason instanceof Error
          ? reason.message
          : tx(
              "We could not create this invitation.",
              "Не удалось создать приглашение."
            )
      );
    } finally {
      setSaving(false);
    }
  };

  const resend = async (invitation: WorkerInvitation) => {
    if (invitation.status !== "pending" || pendingActions.current.has(invitation.id)) return;
    pendingActions.current.add(invitation.id);
    setBusyIds(new Set(pendingActions.current));
    try {
      const result = await invitationsApi.resend(
        invitation.id,
        browserOrigin()
      );
      setFreshUrl(result.inviteUrl);
      await navigator.clipboard?.writeText(result.inviteUrl).catch(() => undefined);
      if (invitation.email) openEmail(invitation.email, result.inviteUrl);
      await load();
    } catch {
      toast.error(tx("Invitation could not be resent", "Не удалось повторно отправить приглашение"));
    } finally {
      pendingActions.current.delete(invitation.id);
      setBusyIds(new Set(pendingActions.current));
    }
  };
  const revoke = async (invitation: WorkerInvitation) => {
    if (invitation.status !== "pending" || pendingActions.current.has(invitation.id)) return;
    if (
      !window.confirm(
        tx(
          "Revoke this invitation? Its link will stop working.",
          "Отозвать это приглашение? Его ссылка перестанет работать."
        )
      )
    )
      return;
    pendingActions.current.add(invitation.id);
    setBusyIds(new Set(pendingActions.current));
    try {
      const result = await invitationsApi.revoke(invitation.id);
      setInvitations(rows => rows?.flatMap(row => {
        if (row.id !== invitation.id) return [row];
        return result.revoked ? [] : [{ ...row, status: result.status }];
      }) ?? null);
      if (result.revoked) {
        if (freshUrl === rowUrl(invitation)) setFreshUrl("");
        toast.success(tx("Invitation revoked successfully", "Приглашение отозвано"));
      } else {
        toast.error(tx("Invitation could not be revoked: it is no longer pending", "Приглашение уже обработано и не может быть отозвано"));
      }
    } catch {
      toast.error(tx("Invitation could not be revoked", "Не удалось отозвать приглашение"));
    } finally {
      pendingActions.current.delete(invitation.id);
      setBusyIds(new Set(pendingActions.current));
    }
  };

  return (
    <section className="crew-invitations ws-card ws-card-pad">
      <header className="crew-invitations__head">
        <div>
          <span className="ws-eyebrow">
            {tx("CREW ACCESS", "ДОСТУП К КОМАНДЕ")}
          </span>
          <h2>{tx("Invite a crew member", "Пригласить сотрудника")}</h2>
          <p>
            {tx(
              "Create a secure invitation link or email an invitation to the new team member.",
              "Создайте защищённую ссылку или отправьте приглашение новому сотруднику по эл. почте."
            )}
          </p>
        </div>
        <UsersRound size={24} aria-hidden="true" />
      </header>

      <form className="crew-invitations__form" onSubmit={submit}>
        <div
          className="crew-invitations__kind"
          role="radiogroup"
          aria-label={tx("Invitation type", "Тип приглашения")}
        >
          <button
            type="button"
            role="radio"
            aria-checked={kind === "link"}
            className={kind === "link" ? "selected" : ""}
            onClick={() => setKind("link")}
          >
            <Link2 size={15} /> {tx("Share link", "Ссылка")}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={kind === "email"}
            className={kind === "email" ? "selected" : ""}
            onClick={() => setKind("email")}
          >
            <Mail size={15} /> {tx("Send email", "Отправить email")}
          </button>
        </div>
        {kind === "email" && (
          <label>
            {tx("Email address", "Адрес эл. почты")}
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={event => setEmail(event.target.value)}
            />
          </label>
        )}
        <label>
          {tx("Workspace role", "Роль в рабочем пространстве")}
          <select
            value={kind === "link" ? "crew" : inviteRole}
            onChange={event =>
              setInviteRole(event.target.value as WorkspaceRole)
            }
          >
            {inviteRoles
              .filter(
                value =>
                  role === "admin" || !["admin", "office_admin"].includes(value)
              )
              .map(value => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
          </select>
        </label>
        <label>
          {tx("Hourly rate (USD)", "Почасовая ставка (USD)")}
          <input
            inputMode="decimal"
            value={hourlyRate}
            onChange={event => setHourlyRate(event.target.value)}
          />
        </label>
        <details className="crew-invitations__candidate">
          <summary>
            {tx(
              "Associate an existing worker candidate (optional)",
              "Связать с существующим кандидатом (необязательно)"
            )}
          </summary>
          <label htmlFor="crew-invite-candidate">{tx("Worker candidate", "Кандидат")}</label>
          <select
            id="crew-invite-candidate"
            value={workerId}
            onChange={event => setWorkerId(event.target.value)}
          >
            <option value="">{tx("No candidate", "Без кандидата")}</option>
            {candidates.map(c => (
              <option key={c.id} value={String(c.id)}>
                {c.name || `#${c.id}`}{c.email ? ` · ${c.email}` : ""}
              </option>
            ))}
          </select>
          {candidates.length === 0 && (
            <small>{tx("No unlinked crew records yet. Add one under Fleet & crew.", "Нет свободных записей сотрудников.")}</small>
          )}
        </details>
        {formError && (
          <p className="ws-error" role="alert">
            {formError}
          </p>
        )}
        <button className="ws-btn primary" disabled={saving}>
          <Send size={15} />{" "}
          {saving
            ? tx("Creating…", "Создание…")
            : kind === "email"
              ? tx(
                  "Create and send invitation",
                  "Создать и отправить приглашение"
                )
              : tx("Create invitation link", "Создать ссылку приглашения")}
        </button>
      </form>
      {freshUrl && (
        <CopyOrShare
          url={freshUrl}
          label={tx("Fresh invitation link", "Новая ссылка приглашения")}
        />
      )}

      <div className="crew-invitations__list-head">
        <h3>{tx("Invitation activity", "Активность приглашений")}</h3>
        <button
          type="button"
          className="ws-icon-btn"
          onClick={() => void load()}
          disabled={loading}
          aria-label={tx("Refresh invitations", "Обновить приглашения")}
        >
          <RefreshCw size={16} />
        </button>
      </div>
      {loading && invitations === null ? (
        <LoadingBlock
          label={tx("Loading invitations…", "Загрузка приглашений…")}
        />
      ) : invitations?.length ? (
        <div className="ws-table-wrap">
          <table className="ws-table crew-invitations__table">
            <thead>
              <tr>
                <th>{tx("Invitation", "Приглашение")}</th>
                <th>{tx("Role", "Роль")}</th>
                <th>{tx("Status", "Статус")}</th>
                <th>{tx("Delivery", "Доставка")}</th>
                <th>{tx("Expires", "Истекает")}</th>
                <th aria-label={tx("Actions", "Действия")} />
              </tr>
            </thead>
            <tbody>
              {invitations.map(invitation => (
                <tr key={invitation.id}>
                  <td>
                    <b>{invitation.kind}</b>
                    {invitation.email && <small>{invitation.email}</small>}
                  </td>
                  <td>{invitation.role}</td>
                  <td>{invitation.status}</td>
                  <td>
                    {invitation.sendStatus}
                    {invitation.sendError && (
                      <small className="crew-invitations__delivery-error">
                        {invitation.sendError}
                      </small>
                    )}
                  </td>
                  <td>{formatDate(invitation.expiresAt)}</td>
                  <td>
                    <div className="ws-row-actions">
                      {invitation.status === "pending" && (
                        <button
                          type="button"
                          className="ws-icon-btn"
                          title={tx("Copy link", "Копировать ссылку")}
                          aria-label={tx("Copy link", "Копировать ссылку")}
                          onClick={() => void copyRow(invitation)}
                        >
                          <Copy size={15} />
                        </button>
                      )}
                      {invitation.status === "pending" && <Button
                        variant="ghost"
                        size="icon"
                        disabled={busyIds.has(invitation.id) || loading}
                        type="button"
                        className="ws-icon-btn"
                        title={tx(
                          "Resend (extends 14 days)",
                          "Отправить повторно"
                        )}
                        aria-label={tx(
                          "Resend (extends 14 days)",
                          "Отправить повторно"
                        )}
                        onClick={() => void resend(invitation)}
                      >
                        <RefreshCw size={15} />
                      </Button>}
                      {invitation.status === "pending" && <Button
                        variant="ghost"
                        size="icon"
                        disabled={busyIds.has(invitation.id) || loading}
                        type="button"
                        className="ws-icon-btn danger"
                        title={tx("Revoke invitation", "Отозвать приглашение")}
                        aria-label={tx(
                          "Revoke invitation",
                          "Отозвать приглашение"
                        )}
                        onClick={() => void revoke(invitation)}
                      >
                        <Trash2 size={15} />
                      </Button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="ws-empty">
          <Link2 size={22} />
          <h3>{tx("No invitations yet", "Приглашений пока нет")}</h3>
          <p>
            {tx(
              "Create a link or email invitation to add someone to the crew workspace.",
              "Создайте ссылку или email-приглашение, чтобы добавить сотрудника в рабочее пространство."
            )}
          </p>
        </div>
      )}
      <small className="crew-invitations__privacy">
        {tx(
          "Only Admin and Office roles can view invitation details, compensation, or candidate association.",
          "Только роли Admin и Office могут просматривать детали приглашений, оплату или связь с кандидатом."
        )}
      </small>
    </section>
  );
}
