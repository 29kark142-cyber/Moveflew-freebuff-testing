import { Clipboard, FileJson, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ModuleProps } from "@shared/expansion";
import type {
  TariffLineItem,
  TariffProfileRate,
  TariffQuote,
  TariffRatingInput,
} from "@shared/tariffs";
import { crmFetch } from "@/lib/crm";
import { useI18n } from "@/lib/i18n";
import { CoreCard, CoreNotice, CorePage } from "./CoreUI";
import "./tariffs.css";

type TariffJob = {
  id: number;
  title: string;
  moveDate: string;
  status: string;
  crewSize: number;
  estimatedHours: number;
  distanceMiles: number;
  signatureLocked: boolean;
};

type TariffSnapshot = {
  id: number;
  jobId: number;
  profileId: number;
  profileVersion: string;
  revision: number;
  status: string;
  input: TariffRatingInput;
  totalCents: number;
  appliedAt: string;
  supersededAt: string | null;
  lines: TariffLineItem[];
};

type TariffOverview = {
  provider: { state: string; configured: boolean; reason: string };
  profiles: TariffProfileRate[];
  selectedJob: TariffJob | null;
  snapshot: TariffSnapshot | null;
};

type TariffPreview = {
  profile: TariffProfileRate;
  normalizedInputs: TariffRatingInput;
  quote: TariffQuote;
};

type InputDraft = {
  originState: string;
  destinationState: string;
  serviceDate: string;
  crewSize: string;
  estimatedHours: string;
  weightLb: string;
  distanceMi: string;
  tripCount: string;
  travelMiles: string;
  stairsFlights: string;
  elevatorStops: string;
  elevatorWaitMinutes: string;
  heavyCode: string;
  heavyQuantity: string;
  intentionalRevision: boolean;
};

const officeRoles = new Set(["admin", "office_admin", "estimator", "dispatcher"]);
const json = (method: string, value?: unknown): RequestInit => ({
  method,
  body: value === undefined ? undefined : JSON.stringify(value),
});

/** This document intentionally has no licensed rates and cannot pass attestation until the owner replaces it. */
const importTemplate = JSON.stringify(
  {
    schemaVersion: 1,
    profile: {
      name: "REPLACE — carrier tariff name",
      version: "REPLACE — published version",
      jurisdiction: "interstate",
      originState: null,
      destinationState: null,
      carrierName: "REPLACE — legal carrier name",
      usdotNumber: "REPLACE — USDOT number",
      authorityType: "interstate_hhg",
      vanline: null,
      tariffReference: "REPLACE — published tariff reference",
      sourceUrl: null,
      effectiveFrom: "YYYY-MM-DD",
      effectiveTo: null,
      licenseAndSourceAttested: false,
    },
    rules: [],
    weightBands: [],
    distanceBands: [],
  },
  null,
  2
);

function positiveJobIdFromQuery(): number | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("job");
  const id = value ? Number(value) : NaN;
  return Number.isInteger(id) && id > 0 ? id : null;
}

function draftForJob(job: TariffJob): InputDraft {
  return {
    originState: "",
    destinationState: "",
    serviceDate: job.moveDate || new Date().toISOString().slice(0, 10),
    crewSize: String(job.crewSize || 2),
    estimatedHours: String(job.estimatedHours || 0),
    weightLb: "0",
    distanceMi: String(job.distanceMiles || 0),
    tripCount: "1",
    travelMiles: String(job.distanceMiles || 0),
    stairsFlights: "0",
    elevatorStops: "0",
    elevatorWaitMinutes: "0",
    heavyCode: "",
    heavyQuantity: "1",
    intentionalRevision: false,
  };
}

function inputFromDraft(draft: InputDraft): TariffRatingInput {
  const heavyCode = draft.heavyCode.trim().toLowerCase();
  return {
    originState: draft.originState.trim().toUpperCase(),
    destinationState: draft.destinationState.trim().toUpperCase(),
    serviceDate: draft.serviceDate,
    crewSize: Number(draft.crewSize),
    estimatedHours: Number(draft.estimatedHours),
    weightLb: Number(draft.weightLb),
    distanceMi: Number(draft.distanceMi),
    tripCount: Number(draft.tripCount),
    travelMiles: Number(draft.travelMiles),
    stairsFlights: Number(draft.stairsFlights),
    elevatorStops: Number(draft.elevatorStops),
    elevatorWaitMinutes: Number(draft.elevatorWaitMinutes),
    heavyItems: heavyCode
      ? [{ code: heavyCode, quantity: Number(draft.heavyQuantity) }]
      : [],
    intentionalRevision: draft.intentionalRevision,
  };
}

function quoteKey(profileId: number, input: TariffRatingInput): string {
  return JSON.stringify({ profileId, input });
}

function effectiveRange(from: string, to: string | null): string {
  return to ? `${from} – ${to}` : `${from} – ongoing`;
}

function dollars(cents: number, language: string): string {
  return new Intl.NumberFormat(language === "ru" ? "ru-RU" : "en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export default function TariffsPage({ role, navigate }: ModuleProps) {
  const { tx, language } = useI18n();
  const allowed = officeRoles.has(role);
  const initialJobId = useMemo(positiveJobIdFromQuery, []);
  const [jobId, setJobId] = useState<number | null>(initialJobId);
  const [jobText, setJobText] = useState(initialJobId ? String(initialJobId) : "");
  const [data, setData] = useState<TariffOverview | null>(null);
  const [profileId, setProfileId] = useState("");
  const [draft, setDraft] = useState<InputDraft>(() =>
    draftForJob({
      id: 0,
      title: "",
      moveDate: new Date().toISOString().slice(0, 10),
      status: "draft",
      crewSize: 2,
      estimatedHours: 0,
      distanceMiles: 0,
      signatureLocked: false,
    })
  );
  const [preview, setPreview] = useState<TariffPreview | null>(null);
  const [previewKey, setPreviewKey] = useState("");
  const [documentText, setDocumentText] = useState(importTemplate);
  const [loading, setLoading] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const lastJobId = useRef<number | null>(null);

  const updateDraft = (changes: Partial<InputDraft>) => {
    setDraft(current => ({ ...current, ...changes }));
    setPreview(null);
    setPreviewKey("");
  };

  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setError("");
    try {
      const endpoint = jobId ? `/core/tariffs?job=${encodeURIComponent(jobId)}` : "/core/tariffs";
      const next = await crmFetch<TariffOverview>(endpoint);
      setData(next);
      const activeProfile = next.profiles.find(profile => profile.status === "active");
      setProfileId(current =>
        current && next.profiles.some(profile => String(profile.id) === current && profile.status === "active")
          ? current
          : activeProfile
            ? String(activeProfile.id)
            : ""
      );
      if (next.selectedJob && lastJobId.current !== next.selectedJob.id) {
        lastJobId.current = next.selectedJob.id;
        setDraft(draftForJob(next.selectedJob));
        setPreview(null);
        setPreviewKey("");
      }
    } catch (reason) {
      setData(null);
      setError(
        reason instanceof Error
          ? reason.message
          : tx("Could not load tariff profiles.", "Не удалось загрузить тарифные профили.")
      );
    } finally {
      setLoading(false);
    }
  }, [allowed, jobId, tx]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectJob = () => {
    const nextId = Number(jobText);
    if (!Number.isInteger(nextId) || nextId < 1) {
      setError(tx("Enter a valid positive job ID.", "Введите корректный положительный ID заказа."));
      return;
    }
    setError("");
    setNotice("");
    setJobId(nextId);
    navigate(`/app/tariffs?job=${nextId}`);
  };

  const selectedProfile = data?.profiles.find(profile => profile.id === Number(profileId)) ?? null;
  const currentInput = useMemo(() => inputFromDraft(draft), [draft]);
  const isPreviewCurrent = Boolean(
    preview && profileId && previewKey === quoteKey(Number(profileId), currentInput)
  );

  const previewQuote = async () => {
    if (!profileId) {
      setError(tx("Choose an active tariff profile first.", "Сначала выберите активный тарифный профиль."));
      return;
    }
    setPreviewing(true);
    setError("");
    setNotice("");
    try {
      const next = await crmFetch<TariffPreview>(
        "/core/tariffs/preview",
        json("POST", { profileId: Number(profileId), inputs: currentInput })
      );
      setPreview(next);
      setPreviewKey(quoteKey(Number(profileId), currentInput));
      setNotice(
        tx(
          "Server preview is ready. Review every effective-dated line before freezing it on the job.",
          "Предварительный расчёт сервера готов. Проверьте каждую строку с датой действия перед фиксацией в заказе."
        )
      );
    } catch (reason) {
      setPreview(null);
      setPreviewKey("");
      setError(
        reason instanceof Error
          ? reason.message
          : tx("Could not preview this tariff.", "Не удалось выполнить предварительный расчёт тарифа.")
      );
    } finally {
      setPreviewing(false);
    }
  };

  const applySnapshot = async () => {
    if (!data?.selectedJob || !profileId || !isPreviewCurrent) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await crmFetch<{ snapshot: TariffSnapshot }>(
        "/core/tariffs/snapshot",
        json("POST", {
          jobId: data.selectedJob.id,
          profileId: Number(profileId),
          inputs: currentInput,
        })
      );
      setData(current => (current ? { ...current, snapshot: result.snapshot } : current));
      setPreview(null);
      setPreviewKey("");
      setNotice(
        tx(
          "A frozen tariff revision was applied to this unsigned job and its linked draft estimate.",
          "Зафиксированная версия тарифа применена к этому неподписанному заказу и связанному черновику сметы."
        )
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : tx("Could not apply the tariff snapshot.", "Не удалось применить снимок тарифа.")
      );
    } finally {
      setSaving(false);
    }
  };

  const importDocument = async () => {
    let document: unknown;
    try {
      document = JSON.parse(documentText);
    } catch {
      setError(tx("The editor must contain valid JSON.", "Редактор должен содержать корректный JSON."));
      return;
    }
    setImporting(true);
    setError("");
    setNotice("");
    try {
      const result = await crmFetch<{ profile: TariffProfileRate }>(
        "/core/tariffs/profiles/import",
        json("POST", { document })
      );
      setProfileId(String(result.profile.id));
      setNotice(
        tx(
          "Owner-attested tariff profile imported. It is now available for server previews; no rate was created until this explicit import.",
          "Тарифный профиль с подтверждением владельца импортирован. Теперь он доступен для расчётов сервера; до этого явного импорта ставки не создавались."
        )
      );
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : tx("Could not import the tariff JSON.", "Не удалось импортировать JSON тарифа.")
      );
    } finally {
      setImporting(false);
    }
  };

  if (!allowed)
    return (
      <CorePage
        title={tx("Advanced tariffs", "Расширенные тарифы")}
        description={tx(
          "Carrier tariff profiles are available only to office roles.",
          "Профили тарифов перевозчика доступны только офисным ролям."
        )}
      >
        <CoreNotice tone="error">
          {tx(
            "Your workspace role cannot view or rate tariff profiles.",
            "Ваша роль в рабочем пространстве не может просматривать или рассчитывать тарифные профили."
          )}
        </CoreNotice>
      </CorePage>
    );

  return (
    <CorePage
      title={tx("Advanced tariffs", "Расширенные тарифы")}
      description={tx(
        "Rate only owner-attested, carrier-specific tables. Preview effective-dated lines before creating an intentionally frozen job quote.",
        "Рассчитывайте только подтверждённые владельцем таблицы конкретного перевозчика. Проверяйте строки с датами действия перед созданием намеренно зафиксированной сметы заказа."
      )}
      actions={
        <button className="core-primary" type="button" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={15} aria-hidden="true" /> {tx("Refresh", "Обновить")}
        </button>
      }
    >
      <div className="tariffs-page">
        {error && <CoreNotice tone="error">{error}</CoreNotice>}
        {notice && <CoreNotice tone="success">{notice}</CoreNotice>}
        <CoreNotice>
          {tx(
            "This is not a universal 400N calculator. Interstate and state rules must be owner-provided, carrier-specific, licensed or permissioned, and effective on the service date. No provider account is connected or called.",
            "Это не универсальный калькулятор 400N. Межштатные и штатные правила должны быть предоставлены владельцем, относиться к конкретному перевозчику, быть лицензированы или разрешены и действовать в дату услуги. Учётная запись провайдера не подключена и не вызывается."
          )}
        </CoreNotice>

        <CoreCard title={tx("Job selector", "Выбор заказа")}>
          <div className="tariffs-job-selector">
            <label>
              {tx("Job ID", "ID заказа")}
              <input
                type="number"
                min="1"
                step="1"
                value={jobText}
                onChange={event => setJobText(event.target.value)}
                placeholder={tx("Open a job with ?job=", "Откройте заказ через ?job=")}
              />
            </label>
            <button type="button" className="core-primary" onClick={selectJob}>
              {tx("Open job", "Открыть заказ")}
            </button>
            <span className="core-muted">
              {tx(
                "A job link uses /app/tariffs?job=ID. Selecting a job loads its frozen revision without changing it.",
                "Ссылка на заказ использует /app/tariffs?job=ID. Выбор заказа загружает его зафиксированную версию без изменений."
              )}
            </span>
          </div>
          {data?.selectedJob && (
            <div className="tariffs-job-summary">
              <strong>{data.selectedJob.title}</strong>
              <span>#{data.selectedJob.id}</span>
              <span>{data.selectedJob.moveDate}</span>
              <span>{data.selectedJob.status}</span>
              {data.selectedJob.signatureLocked && (
                <b>{tx("Signed or completed — changes blocked", "Подписан или завершён — изменения заблокированы")}</b>
              )}
            </div>
          )}
          {!loading && jobId && !data?.selectedJob && (
            <p className="core-empty">
              {tx("No selected job is available.", "Выбранный заказ недоступен.")}
            </p>
          )}
        </CoreCard>

        <div className="core-grid tariffs-profile-grid">
          <CoreCard title={tx("Imported tariff profiles", "Импортированные тарифные профили")}>
            {loading ? (
              <p className="core-muted">{tx("Loading profiles…", "Загрузка профилей…")}</p>
            ) : !data?.profiles.length ? (
              <p className="core-empty">
                {tx(
                  "No carrier tariff profile has been imported. Use the owner-attested JSON editor below; no default rates are seeded.",
                  "Тарифный профиль перевозчика не импортирован. Используйте редактор JSON с подтверждением владельца ниже; ставки по умолчанию не создаются."
                )}
              </p>
            ) : (
              <div className="tariffs-profile-list">
                {data.profiles.map(profile => (
                  <button
                    type="button"
                    key={profile.id}
                    className={`tariffs-profile${String(profile.id) === profileId ? " is-selected" : ""}`}
                    onClick={() => {
                      if (profile.status === "active") {
                        setProfileId(String(profile.id));
                        setPreview(null);
                        setPreviewKey("");
                      }
                    }}
                    disabled={profile.status !== "active"}
                    aria-pressed={String(profile.id) === profileId}
                  >
                    <strong>{profile.name}</strong>
                    <span>{profile.carrierName} · {profile.version}</span>
                    <small>{profile.jurisdiction} · {effectiveRange(profile.effectiveFrom, profile.effectiveTo)}</small>
                    <small>{profile.status === "active" ? tx("Attested and active", "Подтверждён и активен") : tx("Archived", "Архивирован")}</small>
                  </button>
                ))}
              </div>
            )}
          </CoreCard>

          <CoreCard title={tx("Provider status", "Статус провайдера")}>
            <p className="tariffs-provider-state">
              <span className="core-pill">{data?.provider.state ?? tx("Loading", "Загрузка")}</span>
              <b>{data?.provider.configured ? tx("Configured", "Настроен") : tx("Not configured", "Не настроен")}</b>
            </p>
            <p className="core-muted">
              {data?.provider.reason ?? tx("Provider status is loading.", "Статус провайдера загружается.")}
            </p>
            <p className="core-muted">
              {tx(
                "Local rating uses imported, attested data and approved tenant hourly rates. It does not imply carrier authority, provider permission, or legal tariff publication.",
                "Локальный расчёт использует импортированные подтверждённые данные и утверждённые почасовые ставки арендатора. Он не означает полномочия перевозчика, разрешение провайдера или юридическую публикацию тарифа."
              )}
            </p>
          </CoreCard>
        </div>

        <CoreCard title={tx("Server quote preview", "Предварительный расчёт сервера")}>
          {!data?.selectedJob ? (
            <p className="core-empty">
              {tx(
                "Open a job with ?job=ID to prepare a quote snapshot. Previewing alone never changes a job, estimate, or tariff profile.",
                "Откройте заказ через ?job=ID, чтобы подготовить снимок сметы. Один лишь предварительный расчёт никогда не изменяет заказ, смету или тарифный профиль."
              )}
            </p>
          ) : (
            <>
              <p className="core-muted tariffs-caption">
                {tx(
                  "The server checks state, jurisdiction, profile/rule effective dates, input types, bands, and approved hourly pricing. Amounts are integer cents.",
                  "Сервер проверяет штат, юрисдикцию, даты действия профиля/правил, типы входных данных, диапазоны и утверждённые почасовые цены. Суммы хранятся в целых центах."
                )}
              </p>
              <div className="tariffs-input-grid">
                <label>
                  {tx("Profile", "Профиль")}
                  <select value={profileId} onChange={event => { setProfileId(event.target.value); setPreview(null); setPreviewKey(""); }}>
                    <option value="">{tx("Choose an active profile", "Выберите активный профиль")}</option>
                    {(data.profiles ?? []).filter(profile => profile.status === "active").map(profile => (
                      <option key={profile.id} value={profile.id}>{profile.name} · {profile.version}</option>
                    ))}
                  </select>
                </label>
                <label>
                  {tx("Service date", "Дата услуги")}
                  <input type="date" value={draft.serviceDate} onChange={event => updateDraft({ serviceDate: event.target.value })} />
                </label>
                <label>
                  {tx("Origin state", "Штат отправления")}
                  <input value={draft.originState} maxLength={2} placeholder="IL" onChange={event => updateDraft({ originState: event.target.value })} />
                </label>
                <label>
                  {tx("Destination state", "Штат назначения")}
                  <input value={draft.destinationState} maxLength={2} placeholder="WI" onChange={event => updateDraft({ destinationState: event.target.value })} />
                </label>
                <label>
                  {tx("Crew size", "Размер бригады")}
                  <input type="number" min="1" max="6" step="1" value={draft.crewSize} onChange={event => updateDraft({ crewSize: event.target.value })} />
                </label>
                <label>
                  {tx("Estimated hours", "Расчётные часы")}
                  <input type="number" min="0" max="48" step="0.25" value={draft.estimatedHours} onChange={event => updateDraft({ estimatedHours: event.target.value })} />
                </label>
                <label>
                  {tx("Shipment weight (lb)", "Вес отправления (фунты)")}
                  <input type="number" min="0" step="1" value={draft.weightLb} onChange={event => updateDraft({ weightLb: event.target.value })} />
                </label>
                <label>
                  {tx("Distance (mi)", "Расстояние (мили)")}
                  <input type="number" min="0" step="0.1" value={draft.distanceMi} onChange={event => updateDraft({ distanceMi: event.target.value })} />
                </label>
                <label>
                  {tx("Trips", "Поездки")}
                  <input type="number" min="0" step="1" value={draft.tripCount} onChange={event => updateDraft({ tripCount: event.target.value })} />
                </label>
                <label>
                  {tx("Travel miles", "Мили в пути")}
                  <input type="number" min="0" step="0.1" value={draft.travelMiles} onChange={event => updateDraft({ travelMiles: event.target.value })} />
                </label>
                <label>
                  {tx("Stair flights", "Пролёты лестниц")}
                  <input type="number" min="0" step="1" value={draft.stairsFlights} onChange={event => updateDraft({ stairsFlights: event.target.value })} />
                </label>
                <label>
                  {tx("Elevator stops", "Остановки лифта")}
                  <input type="number" min="0" step="1" value={draft.elevatorStops} onChange={event => updateDraft({ elevatorStops: event.target.value })} />
                </label>
                <label>
                  {tx("Elevator wait (minutes)", "Ожидание лифта (минуты)")}
                  <input type="number" min="0" step="1" value={draft.elevatorWaitMinutes} onChange={event => updateDraft({ elevatorWaitMinutes: event.target.value })} />
                </label>
                <label>
                  {tx("Heavy-item code (optional)", "Код тяжёлого предмета (необязательно)")}
                  <input value={draft.heavyCode} placeholder={tx("e.g. piano", "например, piano")} onChange={event => updateDraft({ heavyCode: event.target.value })} />
                </label>
                <label>
                  {tx("Heavy-item quantity", "Количество тяжёлых предметов")}
                  <input type="number" min="1" step="1" value={draft.heavyQuantity} disabled={!draft.heavyCode.trim()} onChange={event => updateDraft({ heavyQuantity: event.target.value })} />
                </label>
              </div>
              {data.snapshot && (
                <label className="tariffs-revision">
                  <input type="checkbox" checked={draft.intentionalRevision} onChange={event => updateDraft({ intentionalRevision: event.target.checked })} />
                  {tx(
                    "I intentionally want a new revision of the existing frozen quote.",
                    "Я намеренно хочу создать новую версию существующей зафиксированной сметы."
                  )}
                </label>
              )}
              {selectedProfile && (
                <p className="core-muted tariffs-effective">
                  {tx("Selected profile effective", "Дата действия выбранного профиля")}: {effectiveRange(selectedProfile.effectiveFrom, selectedProfile.effectiveTo)} · {selectedProfile.jurisdiction}
                </p>
              )}
              <div className="tariffs-preview-actions">
                <button type="button" className="core-primary" onClick={() => void previewQuote()} disabled={previewing || !profileId}>
                  {previewing ? tx("Checking…", "Проверка…") : tx("Preview server quote", "Предварительный расчёт сервера")}
                </button>
                <button type="button" onClick={() => void applySnapshot()} disabled={saving || !isPreviewCurrent || data.selectedJob.signatureLocked}>
                  <Clipboard size={15} aria-hidden="true" />
                  {saving ? tx("Freezing…", "Фиксация…") : tx("Freeze on unsigned job", "Зафиксировать в неподписанном заказе")}
                </button>
                {!isPreviewCurrent && preview && <span className="core-muted">{tx("Inputs changed; preview again before freezing.", "Данные изменились; перед фиксацией выполните расчёт снова.")}</span>}
              </div>
              {data.selectedJob.signatureLocked && (
                <CoreNotice tone="error">
                  {tx(
                    "This job is signed or completed. Its tariff quote cannot be revised.",
                    "Этот заказ подписан или завершён. Его тарифная смета не может быть изменена."
                  )}
                </CoreNotice>
              )}
              {preview && <QuoteLines quote={preview.quote} language={language} tx={tx} />}
              {data.snapshot && <SnapshotLines snapshot={data.snapshot} language={language} tx={tx} />}
            </>
          )}
        </CoreCard>

        {role === "admin" && (
          <CoreCard title={tx("Owner-attested JSON import editor", "Редактор импорта JSON с подтверждением владельца")}>
            <p className="core-muted">
              {tx(
                "Load the blank template, replace every REPLACE value with the carrier’s licensed/published data, add effective-dated rules and bands, then set licenseAndSourceAttested to true only after review. Loading or editing this text creates no business row.",
                "Загрузите пустой шаблон, замените каждое значение REPLACE лицензированными/опубликованными данными перевозчика, добавьте правила и диапазоны с датами действия, затем установите licenseAndSourceAttested в true только после проверки. Загрузка или редактирование текста не создаёт бизнес-строку."
              )}
            </p>
            <div className="tariffs-editor-actions">
              <button type="button" onClick={() => setDocumentText(importTemplate)}>
                <FileJson size={15} aria-hidden="true" /> {tx("Load blank template", "Загрузить пустой шаблон")}
              </button>
              <button type="button" className="core-primary" onClick={() => void importDocument()} disabled={importing}>
                {importing ? tx("Importing…", "Импорт…") : tx("Import attested JSON", "Импортировать подтверждённый JSON")}
              </button>
            </div>
            <label className="tariffs-json-label">
              {tx("Carrier tariff JSON", "JSON тарифа перевозчика")}
              <textarea value={documentText} spellCheck={false} onChange={event => setDocumentText(event.target.value)} />
            </label>
            <p className="core-muted">
              {tx(
                "The server rejects invalid states, jurisdiction/type mismatches, missing interstate USDOT identity, unattested sources, invalid dates, and overlapping effective quantity bands. This module never seeds a 400N table or calls a tariff vendor.",
                "Сервер отклоняет некорректные штаты, несоответствия юрисдикции/типа, отсутствующий межштатный USDOT, неподтверждённые источники, некорректные даты и пересекающиеся диапазоны количества по датам. Этот модуль никогда не создаёт таблицу 400N и не вызывает поставщика тарифов."
              )}
            </p>
          </CoreCard>
        )}
      </div>
    </CorePage>
  );
}

function QuoteLines({
  quote,
  language,
  tx,
}: {
  quote: TariffQuote;
  language: string;
  tx: (english: string, russian: string) => string;
}) {
  return (
    <div className="tariffs-quote" aria-live="polite">
      <div className="tariffs-quote__head">
        <div>
          <b>{tx("Preview line items", "Строки предварительного расчёта")}</b>
          <span>{quote.profileName} · {quote.profileVersion} · {quote.tariffReference}</span>
        </div>
        <strong>{dollars(quote.totalCents, language)}</strong>
      </div>
      <p className="core-muted">
        {tx("Approved hourly rate", "Утверждённая почасовая ставка")}: {dollars(quote.approvedHourlyRateCents, language)} · {tx("minimum labor", "минимум труда")}: {quote.minimumLaborHours} {tx("hours", "часов")}
      </p>
      <LineTable lines={quote.lines} language={language} tx={tx} />
    </div>
  );
}

function SnapshotLines({
  snapshot,
  language,
  tx,
}: {
  snapshot: TariffSnapshot;
  language: string;
  tx: (english: string, russian: string) => string;
}) {
  return (
    <div className="tariffs-snapshot">
      <div className="tariffs-quote__head">
        <div>
          <b>{tx("Current frozen snapshot", "Текущий зафиксированный снимок")}</b>
          <span>{tx("Revision", "Версия")} {snapshot.revision} · {snapshot.profileVersion} · {new Date(snapshot.appliedAt).toLocaleString()}</span>
        </div>
        <strong>{dollars(snapshot.totalCents, language)}</strong>
      </div>
      <LineTable lines={snapshot.lines} language={language} tx={tx} />
      <p className="core-muted">
        {tx(
          "Later profile and approved-rate edits do not rewrite this snapshot. Final advanced invoice calculation re-rates only this frozen material with actual hours.",
          "Последующие изменения профиля и утверждённой ставки не переписывают этот снимок. Итоговый расширенный счёт пересчитывает только этот зафиксированный материал с фактическими часами."
        )}
      </p>
    </div>
  );
}

function LineTable({
  lines,
  language,
  tx,
}: {
  lines: TariffLineItem[];
  language: string;
  tx: (english: string, russian: string) => string;
}) {
  return (
    <div className="core-scroll">
      <table className="core-table tariffs-lines">
        <thead>
          <tr>
            <th>{tx("Line", "Строка")}</th>
            <th>{tx("Quantity", "Количество")}</th>
            <th>{tx("Calculation", "Расчёт")}</th>
            <th>{tx("Effective range", "Период действия")}</th>
            <th>{tx("Amount", "Сумма")}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map(line => (
            <tr key={line.key}>
              <td>{line.description}</td>
              <td>{line.quantity}</td>
              <td>{line.calculation}</td>
              <td>{effectiveRange(line.effectiveFrom, line.effectiveTo)}</td>
              <td>{dollars(line.amountCents, language)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
