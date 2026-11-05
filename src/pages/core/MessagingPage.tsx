import { useCallback, useEffect, useState } from "react";
import { crm, crmFetch } from "@/lib/crm";
import { useI18n } from "@/lib/i18n";
import type { ModuleProps } from "@shared/expansion";
import type { Customer } from "@shared/crm";
import {
  BUSINESS_MESSAGE_EVENTS,
  type MessagingSettings,
  type MessagingTemplate,
  type MessagingRecipient,
  type MessagingOutboxItem,
} from "@shared/messaging";
import { CoreCard, CoreNotice, CorePage } from "./CoreUI";

type Overview = {
  settings: MessagingSettings;
  availability: { email: { connected: boolean }; sms: { connected: boolean } };
  templates: MessagingTemplate[];
  recipients: MessagingRecipient[];
  outbox: MessagingOutboxItem[];
};
const json = (method: string, value: unknown): RequestInit => ({
  method,
  body: JSON.stringify(value),
});
export default function MessagingPage({ role }: ModuleProps) {
  const { tx, locale } = useI18n();
  const [data, setData] = useState<Overview | null>(null);
  const [settings, setSettings] = useState<MessagingSettings | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [channel, setChannel] = useState("email");
  const [eventType, setEventType] = useState<string>("estimate.sent");
  const [subject, setSubject] = useState("Your {{companyName}} estimate");
  const [body, setBody] = useState(
    "Hi {{customerName}}, your estimate for {{jobTitle}} is ready: {{proposalUrl}}"
  );
  const [enabled, setEnabled] = useState(false);
  const [source, setSource] = useState("");
  const [consent, setConsent] = useState(false);
  const [reviewConsent, setReviewConsent] = useState(false);
  const [reOptIn, setReOptIn] = useState(false);
  const [resourceId, setResourceId] = useState(
    () => new URLSearchParams(window.location.search).get("job") || ""
  );
  const [preview, setPreview] = useState<{
    subject: string;
    body: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const admin = ["admin", "office_admin"].includes(role);
  const allowed = role !== "crew";
  const load = useCallback(async () => {
    try {
      const [overview, people] = await Promise.all([
        crmFetch<Overview>("/core/messaging"),
        crm.customers(),
      ]);
      setData(overview);
      setSettings(overview.settings);
      setCustomers(people);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not load messaging"
      );
    }
  }, []);
  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);
  const action = async (work: () => Promise<unknown>, message: string) => {
    setBusy(true);
    setError("");
    setNote("");
    try {
      await work();
      setNote(message);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };
  if (!allowed)
    return (
      <CoreNotice tone="error">
        {tx(
          "This page is for office staff.",
          "Эта страница предназначена для офисных сотрудников."
        )}
      </CoreNotice>
    );
  return (
    <CorePage
      title={tx("Transactional messages", "Сервисные сообщения")}
      description={tx(
        "SendGrid / SES email and Twilio SMS, linked to real moving workflows. Accepted is not delivered; uncertain submissions are never automatically retried.",
        "Email через SendGrid / SES и SMS через Twilio для реальных заказов. Принято не означает доставлено; неопределённые отправки не повторяются автоматически."
      )}
      actions={
        <button onClick={() => void load()} disabled={busy}>
          {tx("Refresh", "Обновить")}
        </button>
      }
    >
      {error && <CoreNotice tone="error">{error}</CoreNotice>}
      {note && <CoreNotice tone="success">{note}</CoreNotice>}
      <CoreNotice>
        {tx(
          "Credentials, verified senders, and Twilio callbacks can be configured later. Saving a template does not contact a customer. Explicit automation settings and recorded consent are required before sending. Review requests follow the same neutral wording for every customer.",
          "Учётные данные, подтверждённых отправителей и вебхуки Twilio можно настроить позже. Сохранение шаблона не отправляет сообщение клиенту. Нужны отдельные настройки автоматизации и зафиксированное согласие. Запросы отзывов одинаково нейтральны для всех клиентов."
        )}
      </CoreNotice>
      <CoreNotice>
        {tx(
          "Amazon SES reports submission acceptance only here; verified delivery/bounce events require a separate SNS/EventBridge integration. SendGrid and Twilio have verified delivery callbacks.",
          "Amazon SES здесь подтверждает только принятие отправки; события доставки и отказа требуют отдельной интеграции SNS/EventBridge. SendGrid и Twilio имеют проверенные вебхуки доставки."
        )}
      </CoreNotice>
      {!data || !settings ? (
        <p>
          {tx("Loading message controls…", "Загрузка управления сообщениями…")}
        </p>
      ) : (
        <>
          <div className="core-grid">
            <CoreCard title={tx("Provider policy", "Правила сервисов")}>
              <p>
                {tx("Email ready", "Email настроен")}:{" "}
                {data.availability.email.connected
                  ? tx("Yes", "Да")
                  : tx("No", "Нет")}{" "}
                · {tx("SMS ready", "SMS настроен")}:{" "}
                {data.availability.sms.connected
                  ? tx("Yes", "Да")
                  : tx("No", "Нет")}
              </p>
              <label>
                {tx("Email provider", "Email-сервис")}
                <select
                  value={settings.emailProvider}
                  onChange={e =>
                    setSettings({
                      ...settings,
                      emailProvider: e.target
                        .value as MessagingSettings["emailProvider"],
                    })
                  }
                >
                  <option value="sendgrid">SendGrid</option>
                  <option value="ses">Amazon SES</option>
                </select>
              </label>
              <label>
                <span>
                  <input
                    type="checkbox"
                    checked={settings.emailAutomationEnabled}
                    onChange={e =>
                      setSettings({
                        ...settings,
                        emailAutomationEnabled: e.target.checked,
                      })
                    }
                  />{" "}
                  {tx("Enable transactional email", "Включить сервисный email")}
                </span>
              </label>
              <label>
                <span>
                  <input
                    type="checkbox"
                    checked={settings.smsAutomationEnabled}
                    onChange={e =>
                      setSettings({
                        ...settings,
                        smsAutomationEnabled: e.target.checked,
                      })
                    }
                  />{" "}
                  {tx("Enable consented SMS", "Включить SMS с согласием")}
                </span>
              </label>
              <button
                className="core-primary"
                disabled={!admin || busy}
                onClick={() =>
                  void action(
                    () =>
                      crmFetch(
                        "/core/messaging/settings",
                        json("PUT", settings)
                      ),
                    tx("Message policy saved.", "Правила сообщений сохранены.")
                  )
                }
              >
                {tx("Save policy", "Сохранить правила")}
              </button>
            </CoreCard>
            <CoreCard title={tx("Recipient consent", "Согласие получателя")}>
              <label>
                {tx("Customer", "Клиент")}
                <select
                  value={customerId}
                  onChange={e => setCustomerId(e.target.value)}
                >
                  <option value="">
                    {tx("Choose customer", "Выберите клиента")}
                  </option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {tx("Channel", "Канал")}
                <select
                  value={channel}
                  onChange={e => setChannel(e.target.value)}
                >
                  <option value="email">Email</option>
                  <option value="sms">SMS</option>
                </select>
              </label>
              <label>
                {tx(
                  "Consent evidence / source",
                  "Основание / источник согласия"
                )}
                <input
                  value={source}
                  onChange={e => setSource(e.target.value)}
                />
              </label>
              <label>
                <span>
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={e => setConsent(e.target.checked)}
                  />{" "}
                  {tx(
                    "Customer agreed to transactional messages",
                    "Клиент согласился на сервисные сообщения"
                  )}
                </span>
              </label>
              {channel === "sms" && (
                <label>
                  <span>
                    <input
                      type="checkbox"
                      checked={reviewConsent}
                      onChange={e => setReviewConsent(e.target.checked)}
                    />{" "}
                    {tx(
                      "Customer also agreed to review-request SMS",
                      "Клиент также согласился на SMS с запросом отзыва"
                    )}
                  </span>
                </label>
              )}
              <label>
                <span>
                  <input
                    type="checkbox"
                    checked={reOptIn}
                    onChange={e => setReOptIn(e.target.checked)}
                  />{" "}
                  {tx(
                    "Documented re-opt-in after STOP, if applicable",
                    "Документированное повторное согласие после STOP, если применимо"
                  )}
                </span>
              </label>
              <button
                disabled={!admin || busy || !customerId || !source}
                onClick={() =>
                  void action(
                    () =>
                      crmFetch(
                        `/core/messaging/recipients/${customerId}`,
                        json("PUT", {
                          channel,
                          transactionalConsent: consent,
                          reviewConsent,
                          consentSource: source,
                          reOptIn,
                        })
                      ),
                    tx("Consent record saved.", "Запись согласия сохранена.")
                  )
                }
              >
                {tx("Record consent", "Зафиксировать согласие")}
              </button>
            </CoreCard>
          </div>
          <CoreCard title={tx("Create a template", "Создать шаблон")}>
            <div className="core-grid">
              <label>
                {tx("Business event", "Событие")}
                <select
                  value={eventType}
                  onChange={e => setEventType(e.target.value)}
                >
                  {BUSINESS_MESSAGE_EVENTS.map(event => (
                    <option key={event} value={event}>
                      {event}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {tx("Channel", "Канал")}
                <select
                  value={channel}
                  onChange={e => setChannel(e.target.value)}
                >
                  <option value="email">Email</option>
                  <option value="sms">SMS</option>
                </select>
              </label>
            </div>
            {channel === "email" && (
              <label>
                {tx("Subject", "Тема")}
                <input
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                />
              </label>
            )}
            <label>
              {tx("Plain-text body", "Текст сообщения")}
              <textarea
                rows={5}
                value={body}
                onChange={e => setBody(e.target.value)}
              />
            </label>
            <p>
              {tx("Tokens", "Переменные")}:{" "}
              {
                "{{companyName}}, {{customerName}}, {{jobTitle}}, {{moveDate}}, {{invoiceAmount}}, {{proposalUrl}}, {{portalUrl}}, {{reviewUrl}}"
              }
            </p>
            <label>
              <span>
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={e => setEnabled(e.target.checked)}
                />{" "}
                {tx(
                  "Enable this template for future events",
                  "Включить шаблон для будущих событий"
                )}
              </span>
            </label>
            <div className="core-actions">
              <button
                disabled={busy}
                onClick={() =>
                  void action(
                    () =>
                      crmFetch(
                        "/core/messaging/templates",
                        json("POST", {
                          eventType,
                          channel,
                          subject,
                          body,
                          enabled,
                        })
                      ),
                    tx("Template saved.", "Шаблон сохранён.")
                  )
                }
              >
                {tx("Save template", "Сохранить шаблон")}
              </button>
              <button
                disabled={busy || !customerId}
                onClick={() =>
                  void action(
                    async () => {
                      setPreview(
                        await crmFetch<{ subject: string; body: string }>(
                          "/core/messaging/preview",
                          json("POST", {
                            customerId: Number(customerId),
                            subject,
                            body,
                          })
                        )
                      );
                    },
                    tx(
                      "Preview only — no message sent.",
                      "Только предпросмотр — сообщение не отправлено."
                    )
                  )
                }
              >
                {tx(
                  "Preview for selected customer",
                  "Предпросмотр для выбранного клиента"
                )}
              </button>
            </div>
            {preview && (
              <pre style={{ whiteSpace: "pre-wrap" }}>
                {preview.subject}
                {"\n\n"}
                {preview.body}
              </pre>
            )}
          </CoreCard>
          <CoreCard title={tx("Saved templates", "Сохранённые шаблоны")}>
            {data.templates.map(template => (
              <div
                key={template.id}
                className="core-actions"
                style={{ marginBottom: 10 }}
              >
                <b>
                  {template.eventType} · {template.channel}
                </b>
                <span>{template.subject || template.body.slice(0, 70)}</span>
                <button
                  disabled={busy}
                  onClick={() =>
                    void action(
                      () =>
                        crmFetch(
                          `/core/messaging/templates/${template.id}`,
                          json("PATCH", { enabled: !template.enabled })
                        ),
                      tx("Template updated.", "Шаблон обновлён.")
                    )
                  }
                >
                  {template.enabled
                    ? tx("Disable", "Отключить")
                    : tx("Enable", "Включить")}
                </button>
              </div>
            ))}
            {!data.templates.length && (
              <p>{tx("No templates yet.", "Шаблонов пока нет.")}</p>
            )}
          </CoreCard>
          <CoreCard
            title={tx("Queue a business event", "Поставить событие в очередь")}
          >
            <label>
              {tx(
                "Resource ID: job ID, invoice ID, or move-JOBID",
                "ID ресурса: заказа, счёта или move-IDЗАКАЗА"
              )}
              <input
                value={resourceId}
                onChange={e => setResourceId(e.target.value)}
              />
            </label>
            <div className="core-actions">
              <button
                disabled={
                  busy || !resourceId || eventType === "review.requested"
                }
                onClick={() =>
                  void action(
                    () =>
                      crmFetch(
                        "/core/messaging/enqueue",
                        json("POST", { eventType, resourceId })
                      ),
                    tx(
                      "Event queued under consent and provider controls.",
                      "Событие поставлено в очередь с проверкой согласия и сервиса."
                    )
                  )
                }
              >
                {tx(
                  "Queue selected event",
                  "Поставить выбранное событие в очередь"
                )}
              </button>
              <button
                disabled={!admin || busy}
                onClick={() => {
                  if (
                    window.confirm(
                      tx(
                        "Process eligible queued messages using your enabled providers?",
                        "Обработать допустимые сообщения через включённые сервисы?"
                      )
                    )
                  )
                    void action(
                      () => crmFetch("/core/messaging/run", json("POST", {})),
                      tx(
                        "Queue evaluated. Check actual status below.",
                        "Очередь обработана. Проверьте фактический статус ниже."
                      )
                    );
                }}
              >
                {tx("Process eligible queue", "Обработать допустимую очередь")}
              </button>
            </div>
            <p>
              {tx(
                "Create review links on Marketing → Reviews. Their one-time token is securely queued at creation, not reconstructed from a hash.",
                "Создавайте ссылки на отзывы в разделе Маркетинг → Отзывы. Одноразовый токен ставится в очередь при создании, а не восстанавливается из хеша."
              )}
            </p>
          </CoreCard>
          <CoreCard
            title={tx(
              "Submission & delivery history",
              "История отправки и доставки"
            )}
          >
            <div className="core-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{tx("Date", "Дата")}</th>
                    <th>{tx("Event / recipient", "Событие / получатель")}</th>
                    <th>{tx("Status", "Статус")}</th>
                    <th>
                      {tx(
                        "Provider reference / error",
                        "Референс сервиса / ошибка"
                      )}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.outbox.map(message => (
                    <tr key={message.id}>
                      <td>
                        {new Date(message.createdAt).toLocaleString(locale)}
                      </td>
                      <td>
                        {message.eventType} · {message.recipient}
                      </td>
                      <td>{message.status}</td>
                      <td>
                        {message.providerMessageId || "—"}
                        <br />
                        {message.lastError}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data.outbox.length && (
              <p>
                {tx(
                  "No queued or submitted messages.",
                  "Сообщений в очереди или отправке нет."
                )}
              </p>
            )}
          </CoreCard>
        </>
      )}
    </CorePage>
  );
}
