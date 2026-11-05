import "@/automation.css";
import {
  CalendarClock,
  CirclePause,
  CirclePlay,
  ExternalLink,
  FileText,
  LoaderCircle,
  MailX,
  RefreshCw,
  ShieldCheck,
  Webhook,
} from "lucide-react";
import { useState } from "react";
import type { ModuleProps } from "@shared/expansion";
import { ErrorNotice, useRemote } from "@/components/workspace/WorkspaceUI";
import { automation, type AutomationStatus } from "@/lib/automation-api";
import { useI18n } from "@/lib/i18n";

const canManageAutomation = (role: ModuleProps["role"]) =>
  role === "admin" || role === "office_admin";

type Translate = (english: string, russian: string) => string;

function statusCopy(state: AutomationStatus["state"], tx: Translate) {
  if (state === "active")
    return tx(
      "Active stored configuration",
      "Активная сохранённая конфигурация"
    );
  if (state === "paused")
    return tx(
      "Paused stored configuration",
      "Приостановленная сохранённая конфигурация"
    );
  return tx("Planned setup", "Запланированная настройка");
}

function formatTimestamp(value: string | null, locale: string, empty: string) {
  if (!value) return empty;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

/** Parent adds this page to the extended route map; it does not activate a task on render. */
export function AutomationPage({ role, navigate, path }: ModuleProps) {
  const { t, language, locale } = useI18n();
  const tx: Translate = (english, russian) =>
    language === "ru" ? russian : t(english);
  const manages = canManageAutomation(role);
  const { data, loading, error, refresh } = useRemote(
    () => (manages ? automation.status() : Promise.resolve(null)),
    [manages]
  );
  const [saving, setSaving] = useState<"activate" | "pause" | "resume" | null>(
    null
  );
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState<unknown>(null);
  const currentRoute = path === "/app/automation";

  const apply = async (action: "activate" | "pause" | "resume") => {
    if (!manages) return;
    setSaving(action);
    setActionError(null);
    setNotice("");
    try {
      const next =
        action === "activate"
          ? await automation.activate(window.location.origin)
          : action === "pause"
            ? await automation.pause()
            : await automation.resume();
      setNotice(
        next.configuration
          ? tx(
              "The server returned the stored automation configuration.",
              "Сервер вернул сохранённую конфигурацию автоматизации."
            )
          : tx(
              "No scheduler configuration was returned.",
              "Сервер не вернул конфигурацию планировщика."
            )
      );
      await refresh();
    } catch (reason) {
      setActionError(reason);
    } finally {
      setSaving(null);
    }
  };

  return (
    <section className="automation-page">
      <header className="ws-page-head automation-page__head">
        <div>
          <div className="automation-kicker">
            <CalendarClock size={14} />
            {tx("Workspace operations", "Операции рабочего пространства")}
          </div>
          <h1>{tx("Automation", "Автоматизация")}</h1>
          <p>
            {tx(
              "Opt-in native scheduling for this workspace only. Configuration status is read from saved workspace records.",
              "Подключаемое нативное расписание только для этого рабочего пространства. Статус конфигурации берётся из сохранённых записей рабочего пространства."
            )}
          </p>
        </div>
        <div className="ws-actions">
          <button
            className="ws-btn"
            type="button"
            onClick={() => void refresh()}
            disabled={loading || saving !== null}
          >
            <RefreshCw size={15} className={loading ? "ws-spin" : ""} />
            {tx("Refresh", "Обновить")}
          </button>
          <button
            className="ws-btn"
            type="button"
            onClick={() => navigate("/app/integrations")}
          >
            <ExternalLink size={15} />
            {tx("Webhook targets", "Цели вебхуков")}
          </button>
        </div>
      </header>

      {loading && (
        <div className="automation-loading">
          <LoaderCircle size={18} className="ws-spin" />
          {tx(
            "Loading automation configuration…",
            "Загрузка конфигурации автоматизации…"
          )}
        </div>
      )}
      {Boolean(error) && !data && (
        <ErrorNotice error={error} retry={() => void refresh()} />
      )}
      {Boolean(actionError) && <ErrorNotice error={actionError} />}
      {notice && <div className="eg-success automation-notice">{notice}</div>}

      {!manages && (
        <div className="automation-blocked">
          {tx(
            "Automation configuration is available only to workspace admins and office admins.",
            "Конфигурация автоматизации доступна только администраторам рабочего пространства и офисным администраторам."
          )}
        </div>
      )}

      {data && (
        <div className="automation-layout">
          <section className="ws-card ws-card-pad automation-overview">
            <div className="automation-card-head">
              <div>
                <div className="automation-label">
                  {tx("Native scheduler", "Нативный планировщик")}
                </div>
                <h2>
                  {tx("Workspace runner", "Запуск рабочего пространства")}
                </h2>
                <p>
                  {tx(
                    "A platform task is recorded only after the platform returns its real task identity.",
                    "Задача платформы сохраняется только после возврата платформой её реального идентификатора."
                  )}
                </p>
              </div>
              <span
                className={`automation-state automation-state--${data.state.replace(
                  "_",
                  "-"
                )}`}
              >
                <ShieldCheck size={15} /> {statusCopy(data.state, tx)}
              </span>
            </div>

            {data.state === "not_activated" && !data.activation.ready && (
              <div className="automation-blocked">
                <b>{tx("Activation blocked", "Активация заблокирована")}</b>
                <span>
                  {language === "ru"
                    ? "Для опубликованного канонического адреса или среды обратного вызова пока нет подтверждённой конфигурации. Планировщик не был создан."
                    : data.activation.reason}
                </span>
              </div>
            )}
            {data.state === "not_activated" && data.activation.ready && (
              <div className="automation-planned">
                {tx(
                  "Planned setup: Activate verifies the browser’s canonical published origin and its health route before requesting a platform task.",
                  "Запланированная настройка: «Активировать» проверяет канонический опубликованный адрес браузера и его маршрут работоспособности перед запросом задачи платформы."
                )}
              </div>
            )}

            <dl className="automation-details">
              <div>
                <dt>{tx("Cadence", "Частота")}</dt>
                <dd>{data.runner.cronExpression} UTC</dd>
              </div>
              <div>
                <dt>
                  {tx("Current billing period", "Текущий расчётный период")}
                </dt>
                <dd>{data.runner.currentPeriod}</dd>
              </div>
              <div>
                <dt>{tx("Last callback", "Последний обратный вызов")}</dt>
                <dd>
                  {formatTimestamp(
                    data.configuration?.lastRunAt ?? null,
                    locale,
                    tx(
                      "No recorded callback",
                      "Нет зарегистрированного обратного вызова"
                    )
                  )}
                </dd>
              </div>
              <div>
                <dt>{tx("Published origin", "Опубликованный адрес")}</dt>
                <dd>
                  {data.activation.canonicalPublishedOrigin ??
                    tx("Not configured", "Не настроен")}
                </dd>
              </div>
            </dl>
            {data.configuration?.lastError && (
              <div className="automation-error-record">
                <b>
                  {tx(
                    "Last recorded runner error",
                    "Последняя зарегистрированная ошибка запуска"
                  )}
                </b>
                <span>{data.configuration.lastError}</span>
              </div>
            )}

            <div className="automation-controls">
              {data.state === "not_activated" && (
                <button
                  className="ws-btn primary"
                  type="button"
                  onClick={() => void apply("activate")}
                  disabled={
                    !manages || !data.activation.ready || saving !== null
                  }
                >
                  <CirclePlay size={16} />
                  {saving === "activate"
                    ? tx("Verifying…", "Проверка…")
                    : tx("Activate scheduler", "Активировать планировщик")}
                </button>
              )}
              {data.state === "active" && (
                <button
                  className="ws-btn danger"
                  type="button"
                  onClick={() => void apply("pause")}
                  disabled={!manages || saving !== null}
                >
                  <CirclePause size={16} />
                  {saving === "pause"
                    ? tx("Pausing…", "Приостановка…")
                    : tx("Pause scheduler", "Приостановить планировщик")}
                </button>
              )}
              {data.state === "paused" && (
                <button
                  className="ws-btn primary"
                  type="button"
                  onClick={() => void apply("resume")}
                  disabled={!manages || saving !== null}
                >
                  <CirclePlay size={16} />
                  {saving === "resume"
                    ? tx("Resuming…", "Возобновление…")
                    : tx("Resume scheduler", "Возобновить планировщик")}
                </button>
              )}
              <small>
                {currentRoute
                  ? tx(
                      "Controls act only after an explicit click; opening this page never registers or runs a task.",
                      "Управление работает только после явного нажатия; открытие этой страницы никогда не регистрирует и не запускает задачу."
                    )
                  : tx(
                      "Automation controls are available on the Automation page.",
                      "Управление автоматизацией доступно на странице «Автоматизация»."
                    )}
              </small>
            </div>
          </section>

          <section className="ws-card ws-card-pad automation-runbook">
            <div className="automation-card-head">
              <div>
                <div className="automation-label">
                  {tx("Runner boundaries", "Границы запуска")}
                </div>
                <h2>
                  {tx(
                    "What the five-minute runner does",
                    "Что делает пятиминутный запуск"
                  )}
                </h2>
              </div>
            </div>
            <article>
              <FileText size={19} />
              <div>
                <b>{tx("Storage invoices only", "Только счета за хранение")}</b>
                <p>
                  {tx(
                    "It generates current-period storage invoices. This billing step does not collect payments; card authorizations have a separate explicit owner setting and customer consent.",
                    "Формируются счета за хранение за текущий период. Этот шаг не принимает платежи; для авторизации карт нужны отдельная настройка владельца и согласие клиента."
                  )}
                </p>
              </div>
            </article>
            <article>
              <MailX size={19} />
              <div>
                <b>
                  {tx(
                    "Internal lead reminders",
                    "Внутренние напоминания по лидам"
                  )}
                </b>
                <p>
                  {tx(
                    "Enabled lead sequences produce idempotent internal reminders. Transactional emails and SMS are processed only when provider credentials, recipient consent, templates, and owner automation settings are ready.",
                    "Включённые сценарии создают идемпотентные внутренние напоминания. Email и SMS обрабатываются только при наличии учётных данных сервиса, согласия получателя, шаблонов и настроек автоматизации владельца."
                  )}
                </p>
              </div>
            </article>
            <article>
              <Webhook size={19} />
              <div>
                <b>
                  {tx(
                    "Bounded webhook delivery",
                    "Ограниченная доставка вебхуков"
                  )}
                </b>
                <p>
                  {tx(
                    "Only queued outbox IDs selected from this workspace are pumped. An enabled owner-configured HTTPS target receives a real signed delivery attempt; no delivery history is invented.",
                    "Обрабатываются только идентификаторы очереди этого рабочего пространства. Включённая HTTPS-цель, настроенная владельцем, получает реальную подписанную попытку доставки; история доставки не выдумывается."
                  )}
                </p>
              </div>
            </article>
          </section>
        </div>
      )}
      <div className="core-notice" style={{ marginTop: 18 }}>
        {tx(
          "Payment holds and QuickBooks sync remain independently disabled until configured and enabled in their modules. The runner never automatically captures a held amount or issues a claim payout.",
          "Удержания средств и синхронизация QuickBooks отключены до отдельной настройки и включения в своих модулях. Планировщик не списывает удержанную сумму автоматически и не выплачивает возмещение по претензиям."
        )}
      </div>
    </section>
  );
}

export default AutomationPage;
