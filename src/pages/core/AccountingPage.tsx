import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { crmFetch } from "@/lib/crm";
import type { ModuleProps } from "@shared/expansion";
import { CoreCard, CoreNotice, CorePage } from "./CoreUI";
import "./accounting.css";

type AccountingStatus = {
  provider: { state: string; active: boolean; message: string };
  connection: {
    status: string;
    realmId: string | null;
    accessTokenExpiresAt: string | null;
    refreshTokenExpiresAt: string | null;
    connectedAt: string | null;
    lastError: string | null;
  };
  settings: {
    inboundEnabled: boolean;
    outboundEnabled: boolean;
    lastInboundWatermark: string | null;
    lastSuccessfulSyncAt: string | null;
    lastError: string | null;
  };
  mappings: Array<{
    accountKey: string;
    qboAccountId: string;
    qboAccountName: string;
    active: boolean;
  }>;
  counts: { outboundAwaitingReview: number; inboundPending: number };
};

type Journal = {
  id: number;
  sourceKey: string;
  transactionDate: string;
  memo: string;
  debitCents: number;
  creditCents: number;
  status: string;
  lastError: string | null;
};

type Review = {
  id: number;
  entityType: string;
  qboEntityId: string;
  localKind: string | null;
  localId: number | null;
  decision: string;
  reason: string;
  remoteCents: number | null;
  localCents: number | null;
};

type AccountingAction = { message: string };

const money = (cents: number | null, locale: string) =>
  cents === null
    ? "—"
    : new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "USD",
      }).format(cents / 100);

/** Parent mounts this at the accounting core route; it intentionally has no provider-activation control. */
export default function AccountingPage({ role }: ModuleProps) {
  const { language, locale } = useI18n();
  const tx = (english: string, russian: string) =>
    language === "ru" ? russian : english;
  const [status, setStatus] = useState<AccountingStatus | null>(null);
  const [journals, setJournals] = useState<Journal[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const allowed = role === "admin" || role === "office_admin";

  const refresh = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setError("");
    try {
      const [nextStatus, nextJournals, nextReviews] = await Promise.all([
        crmFetch<AccountingStatus>("/core/accounting/status"),
        crmFetch<Journal[]>("/core/accounting/outbound"),
        crmFetch<Review[]>("/core/accounting/inbound-reviews"),
      ]);
      setStatus(nextStatus);
      setJournals(nextJournals);
      setReviews(nextReviews);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : tx(
              "Could not load accounting status.",
              "Не удалось загрузить статус учета."
            )
      );
    } finally {
      setLoading(false);
    }
  }, [allowed, language]);

  const performAction = useCallback(
    async (key: string, path: string) => {
      setActing(key);
      setError("");
      setNotice("");
      try {
        const result = await crmFetch<AccountingAction>(path, {
          method: "POST",
        });
        setNotice(result.message);
        await refresh();
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : tx(
                "Accounting action could not be completed.",
                "Не удалось выполнить действие учета."
              )
        );
      } finally {
        setActing(null);
      }
    },
    [refresh, language]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!allowed)
    return (
      <CorePage
        title={tx("Accounting", "Бухгалтерия")}
        description={tx(
          "QuickBooks reconciliation is restricted to workspace finance administrators.",
          "Сверка с QuickBooks доступна только финансовым администраторам рабочего пространства."
        )}
      >
        <CoreNotice tone="error">
          {tx(
            "Your workspace role cannot view accounting integration data.",
            "Ваша роль в рабочем пространстве не может просматривать данные интеграции учета."
          )}
        </CoreNotice>
      </CorePage>
    );

  const inactive = !status?.provider.active;
  return (
    <CorePage
      title={tx("QuickBooks accounting", "Бухгалтерия QuickBooks")}
      description={tx(
        "Review-controlled bidirectional reconciliation. A finance administrator must approve and deliberately send each mapped local journal; inbound application never changes local money.",
        "Двунаправленная сверка с контролем проверки. Финансовый администратор должен одобрить и явно отправить каждую сопоставленную локальную проводку; входящее применение никогда не меняет локальные деньги."
      )}
      actions={
        <button
          className="core-primary"
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
        >
          {loading
            ? tx("Refreshing…", "Обновление…")
            : tx("Refresh", "Обновить")}
        </button>
      }
    >
      {error && <CoreNotice tone="error">{error}</CoreNotice>}
      {notice && <CoreNotice tone="success">{notice}</CoreNotice>}
      {inactive ? (
        <CoreNotice>
          <strong>{tx("Inactive — ", "Неактивно — ")}</strong>
          {status?.provider.message ??
            tx(
              "QuickBooks has not been configured. No connection, sync, or accounting write is enabled.",
              "QuickBooks не настроен. Подключение, синхронизация и бухгалтерские записи не включены."
            )}
        </CoreNotice>
      ) : (
        <CoreNotice>
          {tx(
            "Provider credentials are ready for owner-controlled setup. Inbound reads and outbound sends each require connection plus their separate owner enablement; all changes remain reviewed.",
            "Учетные данные провайдера готовы к настройке владельцем. Входящее чтение и исходящая отправка требуют подключения и отдельных включений владельцем; все изменения остаются на проверке."
          )}
        </CoreNotice>
      )}

      <div className="core-grid accounting-summary">
        <CoreCard title={tx("Connection", "Подключение")}>
          <div className="core-stack">
            <div>
              <span className="core-pill">
                {status?.connection.status ?? tx("Loading", "Загрузка")}
              </span>
            </div>
            <p className="core-muted">
              {status?.connection.realmId
                ? `${tx("Company realm", "Компания realm")}: ${status.connection.realmId}`
                : tx(
                    "No QuickBooks company is linked.",
                    "Компания QuickBooks не подключена."
                  )}
            </p>
            {status?.connection.lastError && (
              <CoreNotice tone="error">
                {status.connection.lastError}
              </CoreNotice>
            )}
          </div>
        </CoreCard>
        <CoreCard title={tx("Reconciliation safeguards", "Защита сверки")}>
          <dl className="accounting-metrics">
            <div>
              <dt>{tx("Inbound review", "Входящая проверка")}</dt>
              <dd>{status?.counts.inboundPending ?? 0}</dd>
            </div>
            <div>
              <dt>{tx("Outbound review", "Исходящая проверка")}</dt>
              <dd>{status?.counts.outboundAwaitingReview ?? 0}</dd>
            </div>
            <div>
              <dt>{tx("Inbound sync", "Входящая синхронизация")}</dt>
              <dd>
                {status?.settings.inboundEnabled
                  ? tx("Enabled", "Включена")
                  : tx("Disabled", "Отключена")}
              </dd>
            </div>
          </dl>
          <p className="core-muted">
            {tx(
              "A remote invoice or payment never overwrites paid local records. Apply can only accept a mapped safe metadata update; it never changes local money or marks an invoice paid.",
              "Удаленный счет или платеж никогда не перезаписывает оплаченные локальные записи. Применение может принять только безопасное обновление сопоставленных метаданных; оно никогда не меняет локальные деньги и не помечает счет как оплаченный."
            )}
          </p>
        </CoreCard>
      </div>

      <CoreCard
        title={tx(
          "Required account mappings",
          "Необходимые сопоставления счетов"
        )}
      >
        {!status?.mappings.length ? (
          <div className="core-empty">
            {tx(
              "No accounts are mapped. Account IDs must be discovered from the linked QuickBooks company; names are never treated as IDs.",
              "Счета не сопоставлены. Идентификаторы счетов необходимо обнаружить в подключенной компании QuickBooks; названия никогда не считаются идентификаторами."
            )}
          </div>
        ) : (
          <div className="core-scroll">
            <table className="core-table">
              <thead>
                <tr>
                  <th>{tx("Role", "Роль")}</th>
                  <th>{tx("QuickBooks account", "Счет QuickBooks")}</th>
                  <th>{tx("State", "Статус")}</th>
                </tr>
              </thead>
              <tbody>
                {status.mappings.map(mapping => (
                  <tr key={mapping.accountKey}>
                    <td>
                      <code>{mapping.accountKey}</code>
                    </td>
                    <td>{mapping.qboAccountName || mapping.qboAccountId}</td>
                    <td>
                      <span className="core-pill">
                        {mapping.active
                          ? tx("Active", "Активно")
                          : tx("Inactive", "Неактивно")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CoreCard>

      <CoreCard
        title={tx(
          "Local journal review queue",
          "Очередь проверки локальных проводок"
        )}
      >
        <p className="core-muted">
          {tx(
            "Candidates are sourced from legacy jobs/payments and operations invoices, ledger, supported expenses, tips, and append-only claims accounting entries. Approval is required first; Send is a second deliberate action and uses the stored request ID. An uncertain send is read back, never resent.",
            "Кандидаты поступают из устаревших работ/платежей и операционных счетов, реестра, поддерживаемых расходов, чаевых и неизменяемых бухгалтерских записей претензий. Сначала требуется одобрение; «Отправить» — второе явное действие и использует сохраненный ID запроса. Неопределенная отправка проверяется чтением и никогда не отправляется повторно."
          )}
        </p>
        {!journals.length ? (
          <div className="core-empty">
            {tx(
              "No local journals are staged.",
              "Локальные проводки не подготовлены."
            )}
          </div>
        ) : (
          <div className="core-scroll">
            <table className="core-table">
              <thead>
                <tr>
                  <th>{tx("Source", "Источник")}</th>
                  <th>{tx("Date", "Дата")}</th>
                  <th>{tx("Amount", "Сумма")}</th>
                  <th>{tx("State", "Статус")}</th>
                  <th>{tx("Action", "Действие")}</th>
                </tr>
              </thead>
              <tbody>
                {journals.slice(0, 20).map(journal => {
                  const sendKey = `send-${journal.id}`;
                  const approveKey = `approve-${journal.id}`;
                  const readbackKey = `readback-${journal.id}`;
                  return (
                    <tr key={journal.id}>
                      <td>
                        <code>{journal.sourceKey}</code>
                        <br />
                        <span className="core-muted">{journal.memo}</span>
                      </td>
                      <td>{journal.transactionDate}</td>
                      <td>{money(journal.debitCents, locale)}</td>
                      <td>
                        <span className="core-pill">{journal.status}</span>
                        {journal.lastError && (
                          <>
                            <br />
                            <span className="core-muted">
                              {journal.lastError}
                            </span>
                          </>
                        )}
                      </td>
                      <td>
                        {["queued_review", "send_failed"].includes(
                          journal.status
                        ) && (
                          <button
                            className="core-secondary"
                            type="button"
                            disabled={acting !== null}
                            onClick={() =>
                              void performAction(
                                approveKey,
                                `/core/accounting/outbound/${journal.id}/review`
                              )
                            }
                          >
                            {acting === approveKey
                              ? tx("Approving…", "Одобрение…")
                              : tx(
                                  "Approve for sending",
                                  "Одобрить для отправки"
                                )}
                          </button>
                        )}
                        {journal.status === "approved" && (
                          <button
                            className="core-primary"
                            type="button"
                            disabled={inactive || acting !== null}
                            onClick={() =>
                              void performAction(
                                sendKey,
                                `/core/accounting/outbound/${journal.id}/send`
                              )
                            }
                          >
                            {acting === sendKey
                              ? tx("Sending…", "Отправка…")
                              : tx(
                                  "Send to QuickBooks",
                                  "Отправить в QuickBooks"
                                )}
                          </button>
                        )}
                        {journal.status === "uncertain" && (
                          <button
                            className="core-secondary"
                            type="button"
                            disabled={inactive || acting !== null}
                            onClick={() =>
                              void performAction(
                                readbackKey,
                                `/core/accounting/outbound/${journal.id}/readback`
                              )
                            }
                          >
                            {acting === readbackKey
                              ? tx("Checking…", "Проверка…")
                              : tx("Read back only", "Только проверить")}
                          </button>
                        )}
                        {![
                          "queued_review",
                          "send_failed",
                          "approved",
                          "uncertain",
                        ].includes(journal.status) && (
                          <span className="core-muted">
                            {tx(
                              "Review or mapping required",
                              "Требуется проверка или сопоставление"
                            )}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CoreCard>

      <CoreCard
        title={tx(
          "Inbound QuickBooks reconciliation",
          "Входящая сверка QuickBooks"
        )}
      >
        {!reviews.length ? (
          <div className="core-empty">
            {tx(
              "No inbound changes are awaiting review.",
              "Нет входящих изменений, ожидающих проверки."
            )}
          </div>
        ) : (
          <div className="core-scroll">
            <table className="core-table">
              <thead>
                <tr>
                  <th>{tx("QuickBooks", "QuickBooks")}</th>
                  <th>{tx("Local candidate", "Локальный кандидат")}</th>
                  <th>{tx("Amounts", "Суммы")}</th>
                  <th>{tx("Review", "Проверка")}</th>
                  <th>{tx("Action", "Действие")}</th>
                </tr>
              </thead>
              <tbody>
                {reviews.slice(0, 20).map(review => {
                  const applyKey = `apply-${review.id}`;
                  const canApply =
                    review.decision === "pending" &&
                    (review.entityType === "invoice" ||
                      review.entityType === "payment") &&
                    Boolean(review.localKind && review.localId);
                  return (
                    <tr key={review.id}>
                      <td>
                        {review.entityType} <code>#{review.qboEntityId}</code>
                      </td>
                      <td>
                        {review.localKind
                          ? `${review.localKind} #${review.localId}`
                          : tx("No safe match", "Нет безопасного совпадения")}
                      </td>
                      <td>
                        {money(review.remoteCents, locale)} /{" "}
                        {money(review.localCents, locale)}
                      </td>
                      <td>
                        <span className="core-pill">{review.decision}</span>
                        <br />
                        <span className="core-muted">{review.reason}</span>
                      </td>
                      <td>
                        {canApply ? (
                          <button
                            className="core-primary"
                            type="button"
                            disabled={acting !== null}
                            onClick={() =>
                              void performAction(
                                applyKey,
                                `/core/accounting/inbound-reviews/${review.id}/apply`
                              )
                            }
                          >
                            {acting === applyKey
                              ? tx("Applying…", "Применение…")
                              : tx(
                                  "Apply safe update",
                                  "Применить безопасное обновление"
                                )}
                          </button>
                        ) : (
                          <span className="core-muted">
                            {review.entityType === "journalentry"
                              ? tx(
                                  "Unsupported locally",
                                  "Локально не поддерживается"
                                )
                              : tx(
                                  "Manual reconciliation required",
                                  "Требуется ручная сверка"
                                )}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CoreCard>
    </CorePage>
  );
}
