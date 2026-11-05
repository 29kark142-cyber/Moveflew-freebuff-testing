import { useCallback, useEffect, useState } from "react";
import { crm, crmFetch } from "@/lib/crm";
import { useI18n } from "@/lib/i18n";
import type { ModuleProps } from "@shared/expansion";
import type {
  CorePaymentSettings,
  PaymentMethodConsent,
  Preauthorization,
} from "@shared/core-payments";
import type { Customer, Job } from "@shared/crm";
import { CoreCard, CoreNotice, CorePage } from "./CoreUI";

type Overview = {
  settings: CorePaymentSettings;
  methodConsents: PaymentMethodConsent[];
  preauthorizations: Preauthorization[];
};
const json = (method: string, value: unknown): RequestInit => ({
  method,
  body: JSON.stringify(value),
});
export default function PaymentsPage({ role }: ModuleProps) {
  const { tx, locale } = useI18n();
  const [data, setData] = useState<Overview | null>(null);
  const [settings, setSettings] = useState<CorePaymentSettings | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [jobId, setJobId] = useState(
    () => new URLSearchParams(window.location.search).get("job") || ""
  );
  const [consentId, setConsentId] = useState("");
  const [methodType, setMethodType] = useState("card");
  const [consentText, setConsentText] = useState(
    "I authorize my moving company to save this payment method and place a card authorization before my scheduled move, including the agreed estimate buffer. A hold is not a charge. Final collection requires the recorded invoice amount."
  );
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const allowed = role === "admin" || role === "office_admin";
  const fmt = (cents: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "USD",
    }).format(cents / 100);
  const load = useCallback(async () => {
    try {
      const [overview, people, moves] = await Promise.all([
        crmFetch<Overview>("/core/payments"),
        crm.customers(),
        crm.jobs(),
      ]);
      setData(overview);
      setSettings(overview.settings);
      setCustomers(people);
      setJobs(moves);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : tx("Could not load payments.", "Не удалось загрузить платежи.")
      );
    }
  }, [tx]);
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
          "Payment controls require an administrator role.",
          "Для управления платежами нужны права администратора."
        )}
      </CoreNotice>
    );
  return (
    <CorePage
      title={tx("Payments & authorizations", "Платежи и авторизации")}
      description={tx(
        "Stripe-hosted payment collection, customer consent, and scheduled card holds. Funds are recorded only after verified provider evidence.",
        "Приём платежей через Stripe, согласие клиента и запланированные удержания по карте. Средства учитываются только после подтверждения сервиса."
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
          "Providers are configured later. Live collection requires your live Stripe keys in project Integrations, republishing, and this workspace's live switch. ACH is a debit, not a preauthorization. The managed webhook does not subscribe to charge.refunded; use verified refund reconciliation.",
          "Сервисы можно настроить позже. Для реальных платежей нужны рабочие ключи Stripe в интеграциях проекта, повторная публикация и включение этого пространства. ACH — списание, а не удержание. Управляемый вебхук не подписан на charge.refunded; используйте проверенную сверку возвратов."
        )}
      </CoreNotice>
      {!data || !settings ? (
        <p>{tx("Loading payment policies…", "Загрузка платёжных правил…")}</p>
      ) : (
        <>
          <div className="core-grid">
            <CoreCard title={tx("Merchant policy", "Платёжные правила")}>
              <p>
                <b>{tx("Provider state", "Состояние сервиса")}: </b>
                {settings.providerState}
              </p>
              <label>
                <span>
                  <input
                    type="checkbox"
                    checked={settings.liveEnabled}
                    disabled={role !== "admin"}
                    onChange={e =>
                      setSettings({
                        ...settings,
                        liveEnabled: e.target.checked,
                      })
                    }
                  />{" "}
                  {tx("Enable live collection", "Включить реальные платежи")}
                </span>
              </label>
              <label>
                <span>
                  <input
                    type="checkbox"
                    checked={settings.achEnabled}
                    disabled={role !== "admin"}
                    onChange={e =>
                      setSettings({ ...settings, achEnabled: e.target.checked })
                    }
                  />{" "}
                  {tx(
                    "Offer Stripe-verified ACH bank debit",
                    "Предлагать проверенное Stripe списание ACH"
                  )}
                </span>
              </label>
              <label>
                <span>
                  <input
                    type="checkbox"
                    checked={settings.preauthorizationsEnabled}
                    disabled={role !== "admin"}
                    onChange={e =>
                      setSettings({
                        ...settings,
                        preauthorizationsEnabled: e.target.checked,
                      })
                    }
                  />{" "}
                  {tx(
                    "Enable scheduled consented card holds",
                    "Включить удержания по карте с согласием клиента"
                  )}
                </span>
              </label>
              <label>
                {tx("Business timezone", "Часовой пояс компании")}
                <input
                  value={settings.businessTimeZone}
                  onChange={e =>
                    setSettings({
                      ...settings,
                      businessTimeZone: e.target.value,
                    })
                  }
                />
              </label>
              <label>
                {tx("Hours before move (24–48)", "Часов до переезда (24–48)")}
                <input
                  type="number"
                  min="24"
                  max="48"
                  value={settings.holdWindowHours}
                  onChange={e =>
                    setSettings({
                      ...settings,
                      holdWindowHours: Number(e.target.value),
                    })
                  }
                />
              </label>
              <label>
                {tx("Estimate buffer (%)", "Запас к смете (%)")}
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={settings.holdBufferBps / 100}
                  onChange={e =>
                    setSettings({
                      ...settings,
                      holdBufferBps: Math.round(Number(e.target.value) * 100),
                    })
                  }
                />
              </label>
              <button
                className="core-primary"
                disabled={busy || role !== "admin"}
                onClick={() =>
                  void action(
                    () =>
                      crmFetch(
                        "/core/payments/settings",
                        json("PATCH", settings)
                      ),
                    tx(
                      "Policy saved. No funds were held by saving it.",
                      "Правила сохранены. Сохранение не удерживает средства."
                    )
                  )
                }
              >
                {tx("Save policy", "Сохранить правила")}
              </button>
            </CoreCard>
            <CoreCard
              title={tx(
                "Request customer authorization",
                "Запросить авторизацию клиента"
              )}
            >
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
                {tx("Method", "Способ")}
                <select
                  value={methodType}
                  onChange={e => setMethodType(e.target.value)}
                >
                  <option value="card">
                    {tx("Card for future holds", "Карта для будущих удержаний")}
                  </option>
                  <option value="us_bank_account">
                    {tx("ACH bank account", "Банковский счёт ACH")}
                  </option>
                </select>
              </label>
              <label>
                {tx("Agreement shown to customer", "Соглашение для клиента")}
                <textarea
                  rows={5}
                  value={consentText}
                  onChange={e => setConsentText(e.target.value)}
                />
              </label>
              <button
                disabled={busy || !customerId}
                onClick={() =>
                  void action(
                    async () => {
                      const response = await crmFetch<{ url: string }>(
                        "/core/payments/method-consents",
                        json("POST", {
                          customerId: Number(customerId),
                          methodType,
                          consentText,
                          origin: window.location.origin,
                        })
                      );
                      setLink(response.url);
                    },
                    tx(
                      "Customer link created. Their consent is still required.",
                      "Ссылка создана. Согласие клиента ещё требуется."
                    )
                  )
                }
              >
                {tx("Create secure customer link", "Создать защищённую ссылку")}
              </button>
              {link && (
                <p>
                  <a href={link} target="_blank" rel="noreferrer">
                    {tx(
                      "Open customer authorization page",
                      "Открыть страницу авторизации клиента"
                    )}
                  </a>
                  <button
                    onClick={() => void navigator.clipboard.writeText(link)}
                  >
                    {tx("Copy link", "Копировать ссылку")}
                  </button>
                </p>
              )}
              <p>
                {tx(
                  "No card or bank details are entered in CRM. The customer accepts the terms before being redirected to Stripe.",
                  "Реквизиты карты или банка не вводятся в CRM. Клиент принимает условия перед переходом в Stripe."
                )}
              </p>
            </CoreCard>
          </div>
          <CoreCard
            title={tx(
              "Schedule an estimated hold",
              "Запланировать удержание по смете"
            )}
          >
            <div className="core-grid">
              <label>
                {tx("Booked move", "Подтверждённый переезд")}
                <select value={jobId} onChange={e => setJobId(e.target.value)}>
                  <option value="">
                    {tx("Choose move", "Выберите переезд")}
                  </option>
                  {jobs
                    .filter(j => j.status === "booked")
                    .map(j => (
                      <option key={j.id} value={j.id}>
                        {j.title} · {j.moveDate} ·{" "}
                        {fmt(Math.round(j.total * 100))}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                {tx(
                  "Customer's active card consent",
                  "Активное согласие клиента на карту"
                )}
                <select
                  value={consentId}
                  onChange={e => setConsentId(e.target.value)}
                >
                  <option value="">
                    {tx(
                      "Choose saved consent",
                      "Выберите сохранённое согласие"
                    )}
                  </option>
                  {data.methodConsents
                    .filter(
                      c =>
                        c.status === "active" &&
                        c.methodType === "card" &&
                        c.customerId ===
                          jobs.find(j => String(j.id) === jobId)?.customerId
                    )
                    .map(c => (
                      <option key={c.id} value={c.id}>
                        {c.customerName} · #{c.id}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <button
              disabled={busy || !jobId || !consentId}
              onClick={() =>
                void action(
                  () =>
                    crmFetch(
                      "/core/payments/preauthorizations",
                      json("POST", {
                        jobId: Number(jobId),
                        paymentMethodConsentId: Number(consentId),
                        baseCents: Math.round(
                          (jobs.find(j => String(j.id) === jobId)?.total || 0) *
                            100
                        ),
                      })
                    ),
                  tx(
                    "Scheduled. The native runner must be separately enabled.",
                    "Запланировано. Планировщик должен быть отдельно включён."
                  )
                )
              }
            >
              {tx("Prepare scheduled hold", "Подготовить удержание")}
            </button>
          </CoreCard>
          <CoreCard title={tx("Authorization history", "История авторизаций")}>
            <div className="core-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{tx("Move / customer", "Переезд / клиент")}</th>
                    <th>
                      {tx(
                        "Requested / held / captured",
                        "Запрошено / удержано / списано"
                      )}
                    </th>
                    <th>{tx("State", "Статус")}</th>
                    <th>{tx("Hold / expiry", "Удержание / срок")}</th>
                    <th>{tx("Actions", "Действия")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.preauthorizations.map(h => (
                    <tr key={h.id}>
                      <td>
                        #{h.jobId} · {h.customerName}
                      </td>
                      <td>
                        {fmt(h.requestedCents)} / {fmt(h.heldCents)} /{" "}
                        {fmt(h.capturedCents)}
                      </td>
                      <td>{h.status}</td>
                      <td>
                        {new Date(h.holdAfter).toLocaleString(locale)}
                        <br />
                        {h.captureBefore
                          ? new Date(h.captureBefore).toLocaleString(locale)
                          : "—"}
                      </td>
                      <td>
                        {["held", "capture_due"].includes(h.status) && (
                          <>
                            <button
                              disabled={busy}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    tx(
                                      "Capture the remaining finalized invoice amount from this hold?",
                                      "Списать оставшуюся сумму итогового счёта из удержания?"
                                    )
                                  )
                                )
                                  void action(
                                    () =>
                                      crmFetch(
                                        `/core/payments/preauthorizations/${h.id}/capture`,
                                        json("POST", { confirmed: true })
                                      ),
                                    tx(
                                      "Capture submitted. Verified evidence controls the ledger.",
                                      "Списание отправлено. Учёт определяется подтверждением сервиса."
                                    )
                                  );
                              }}
                            >
                              {tx("Capture invoice", "Списать по счёту")}
                            </button>
                            <button
                              disabled={busy}
                              onClick={() =>
                                void action(
                                  () =>
                                    crmFetch(
                                      `/core/payments/preauthorizations/${h.id}/release`,
                                      json("POST", {})
                                    ),
                                  tx(
                                    "Release submitted.",
                                    "Запрос освобождения отправлен."
                                  )
                                )
                              }
                            >
                              {tx("Release hold", "Освободить удержание")}
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data.preauthorizations.length && (
              <p>
                {tx("No holds are scheduled.", "Удержания не запланированы.")}
              </p>
            )}
          </CoreCard>
          <CoreCard
            title={tx(
              "Saved agreements & refunds",
              "Сохранённые согласия и возвраты"
            )}
          >
            {data.methodConsents.map(c => (
              <p key={c.id}>
                {c.customerName} · {c.methodType} · {c.status}{" "}
                {c.status !== "revoked" && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void action(
                        () =>
                          crmFetch(
                            `/core/payments/method-consents/${c.id}/revoke`,
                            json("POST", {})
                          ),
                        tx(
                          "Consent revoked for future holds.",
                          "Согласие на будущие удержания отозвано."
                        )
                      )
                    }
                  >
                    {tx("Revoke", "Отозвать")}
                  </button>
                )}
              </p>
            ))}
            <button
              disabled={busy || role !== "admin"}
              onClick={() =>
                void action(
                  () =>
                    crmFetch(
                      "/core/payments/reconcile-refunds",
                      json("POST", {})
                    ),
                  tx(
                    "Verified Stripe refund reconciliation finished.",
                    "Сверка подтверждённых возвратов Stripe завершена."
                  )
                )
              }
            >
              {tx(
                "Reconcile actual Stripe refunds",
                "Сверить реальные возвраты Stripe"
              )}
            </button>
          </CoreCard>
        </>
      )}
    </CorePage>
  );
}
