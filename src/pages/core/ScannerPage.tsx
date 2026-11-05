import { BrowserMultiFormatReader } from "@zxing/browser";
import QRCode from "qrcode";
import { Camera, Printer, RefreshCw, ScanLine, Square } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type { ModuleProps } from "@shared/expansion";
import type {
  WarehouseAction,
  WarehouseLabel,
  WarehouseOverview,
  WarehouseResolveResult,
} from "@shared/warehouse";
import { crmFetch } from "@/lib/crm";
import { useI18n } from "@/lib/i18n";
import { CoreCard, CoreNotice, CorePage } from "./CoreUI";
import "./scanner.css";

const managementRoles = new Set(["admin", "office_admin", "dispatcher"]);
const json = (method: string, value?: unknown): RequestInit => ({
  method,
  body: value === undefined ? undefined : JSON.stringify(value),
});

type NativeDetection = { rawValue?: string };
type NativeBarcodeDetector = {
  detect(source: HTMLVideoElement): Promise<NativeDetection[]>;
};
type NativeBarcodeDetectorConstructor = {
  new (options?: { formats?: string[] }): NativeBarcodeDetector;
  getSupportedFormats(): Promise<string[]>;
};
type ScannerControls = { stop: () => void };
type CameraSession = { stop: () => void };

type TransferResult = {
  idempotent: boolean;
  action: WarehouseAction;
  movementId: number | null;
  item: { id: number; name: string; quantity: number; status: string };
};

function clientActionKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
    return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 16)}`;
}

function cameraErrorMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError")
    return "Camera permission was denied. Use a secure HTTPS page, allow the camera, or enter/select a label manually.";
  if (name === "NotFoundError")
    return "No camera was found. Enter a label manually or choose a stored record.";
  if (name === "NotReadableError")
    return "The camera is already in use by another application. Close it and try again.";
  return error instanceof Error
    ? error.message
    : "Could not start the scanner camera.";
}

export default function ScannerPage({ role }: ModuleProps) {
  const { tx } = useI18n();
  const allowed = managementRoles.has(role);
  const [data, setData] = useState<WarehouseOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [manualValue, setManualValue] = useState("");
  const [action, setAction] = useState<WarehouseAction>("cross_dock");
  const [itemId, setItemId] = useState("");
  const [destinationVaultId, setDestinationVaultId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [notes, setNotes] = useState("");
  const [transferKey, setTransferKey] = useState(clientActionKey);
  const [saving, setSaving] = useState(false);
  const [labelTarget, setLabelTarget] = useState("");
  const [printLabel, setPrintLabel] = useState<WarehouseLabel | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraMessage, setCameraMessage] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const sessionRef = useRef<CameraSession | null>(null);
  const sessionTokenRef = useRef(0);
  const resolvingRef = useRef(false);

  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setError("");
    try {
      setData(await crmFetch<WarehouseOverview>("/core/warehouse"));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not load warehouse scanner records."
      );
    } finally {
      setLoading(false);
    }
  }, [allowed]);

  useEffect(() => {
    void load();
  }, [load]);

  const stopCamera = useCallback(() => {
    sessionTokenRef.current += 1;
    sessionRef.current?.stop();
    sessionRef.current = null;
    const video = videoRef.current;
    const stream = video?.srcObject as MediaStream | null;
    stream?.getTracks().forEach(track => track.stop());
    if (video) video.srcObject = null;
    setCameraOn(false);
  }, []);

  useEffect(() => {
    const stopWhenHidden = () => {
      if (document.hidden) stopCamera();
    };
    document.addEventListener("visibilitychange", stopWhenHidden);
    return () => {
      document.removeEventListener("visibilitychange", stopWhenHidden);
      stopCamera();
    };
  }, [stopCamera]);

  useEffect(() => {
    let cancelled = false;
    if (!printLabel) {
      setQrDataUrl("");
      return;
    }
    void QRCode.toDataURL(printLabel.value, {
      errorCorrectionLevel: "H",
      width: 360,
      margin: 4,
      color: { dark: "#061d31", light: "#ffffff" },
    })
      .then(value => !cancelled && setQrDataUrl(value))
      .catch(() => !cancelled && setQrDataUrl(""));
    return () => {
      cancelled = true;
    };
  }, [printLabel]);

  const resetTransferKey = () => setTransferKey(clientActionKey());

  const resolveCode = useCallback(
    async (value: string) => {
      const trimmed = value.trim();
      if (!trimmed || resolvingRef.current) return;
      resolvingRef.current = true;
      setError("");
      setNotice("");
      try {
        const result = await crmFetch<WarehouseResolveResult>(
          "/core/warehouse/resolve",
          json("POST", { value: trimmed })
        );
        if (!result.found) {
          setNotice(
            "This label is not active in the selected workspace. No storage state was changed."
          );
          return;
        }
        if (result.targetKind === "item") {
          setItemId(String(result.targetId));
          resetTransferKey();
          setNotice(
            `Item selected: ${result.displayName}. Choose an action and explicitly confirm it below.`
          );
        } else {
          setDestinationVaultId(String(result.targetId));
          resetTransferKey();
          setNotice(
            `Destination selected: ${result.displayName}. Choose an item, quantity, and explicitly confirm below.`
          );
        }
        setManualValue(trimmed);
        void load();
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : "Could not resolve this warehouse label."
        );
      } finally {
        resolvingRef.current = false;
      }
    },
    [load]
  );

  const startCamera = useCallback(async () => {
    stopCamera();
    setCameraMessage("");
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setCameraMessage(
        "Camera scanning requires HTTPS and browser camera support. Use manual entry or saved selection instead."
      );
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    const token = sessionTokenRef.current + 1;
    sessionTokenRef.current = token;
    const decoded = (value: string) => {
      if (token !== sessionTokenRef.current || resolvingRef.current) return;
      stopCamera();
      void resolveCode(value);
    };
    try {
      const NativeDetector = (
        globalThis as typeof globalThis & {
          BarcodeDetector?: NativeBarcodeDetectorConstructor;
        }
      ).BarcodeDetector;
      const desiredFormats = ["qr_code", "ean_13", "code_128"];
      const nativeFormats = NativeDetector
        ? await NativeDetector.getSupportedFormats().catch(() => [])
        : [];
      if (NativeDetector && nativeFormats.some(format => desiredFormats.includes(format))) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        if (token !== sessionTokenRef.current) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        video.srcObject = stream;
        await video.play();
        const detector = new NativeDetector({
          formats: desiredFormats.filter(format => nativeFormats.includes(format)),
        });
        let checking = false;
        const interval = window.setInterval(() => {
          if (checking || token !== sessionTokenRef.current) return;
          checking = true;
          void detector
            .detect(video)
            .then(results => {
              const value = results[0]?.rawValue;
              if (value) decoded(value);
            })
            .catch(() => {
              // A transient frame decode failure is expected while a camera is live.
            })
            .finally(() => {
              checking = false;
            });
        }, 450);
        sessionRef.current = {
          stop: () => {
            window.clearInterval(interval);
            stream.getTracks().forEach(track => track.stop());
          },
        };
        setCameraOn(true);
        return;
      }

      const reader = new BrowserMultiFormatReader();
      const controls = (await reader.decodeFromConstraints(
        {
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        },
        video,
        result => {
          if (result) decoded(result.getText());
        }
      )) as ScannerControls;
      if (token !== sessionTokenRef.current) {
        controls.stop();
        return;
      }
      sessionRef.current = {
        stop: () => controls.stop(),
      };
      setCameraOn(true);
    } catch (reason) {
      if (token === sessionTokenRef.current) {
        stopCamera();
        setCameraMessage(cameraErrorMessage(reason));
      }
    }
  }, [resolveCode, stopCamera]);

  const labelTargets = useMemo(() => {
    if (!data) return [] as Array<{ value: string; label: string }>;
    return [
      ...data.vaults
        .filter(vault => vault.kind === "vault" || vault.kind === "container")
        .map(vault => ({
          value: `${vault.kind}:${vault.id}`,
          label: `${vault.name} (${vault.kind})`,
        })),
      ...data.items.map(item => ({
        value: `item:${item.id}`,
        label: item.name,
      })),
    ];
  }, [data]);

  const selectableItems = useMemo(() => {
    if (!data) return [];
    return data.items.filter(item =>
      action === "intake"
        ? item.status === "released" && item.quantity === 0
        : item.status === "stored" && item.quantity > 0
    );
  }, [action, data]);
  const selectableDestinations = useMemo(
    () =>
      (data?.vaults ?? []).filter(
        vault =>
          vault.status === "active" &&
          (vault.kind === "vault" || vault.kind === "container")
      ),
    [data]
  );

  useEffect(() => {
    if (labelTarget || !labelTargets[0]) return;
    setLabelTarget(labelTargets[0].value);
  }, [labelTarget, labelTargets]);

  if (!allowed)
    return (
      <CorePage
        title={tx("Warehouse scanner", "Сканер склада")}
        description={tx(
          "Camera-assisted storage handling is limited to warehouse management roles.",
          "Работа со складом через камеру доступна только ролям управления складом."
        )}
      >
        <CoreNotice tone="error">
          {tx(
            "Your workspace role cannot view or operate warehouse scanner records.",
            "Ваша роль в рабочем пространстве не может просматривать или использовать сканер склада."
          )}
        </CoreNotice>
      </CorePage>
    );

  const createLabel = async () => {
    if (!labelTarget) return;
    const [targetKind, rawId] = labelTarget.split(":");
    setError("");
    try {
      const label = await crmFetch<WarehouseLabel>(
        "/core/warehouse/labels",
        json("POST", { targetKind, targetId: Number(rawId) })
      );
      setPrintLabel(label);
      setNotice(
        "QR label is ready to print. Printing does not change storage inventory."
      );
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not create a warehouse label."
      );
    }
  };

  const confirmTransfer = async (event: FormEvent) => {
    event.preventDefault();
    const parsedQuantity = Number(quantity);
    if (!itemId || !Number.isInteger(parsedQuantity) || parsedQuantity < 1) {
      setError("Select an item and enter a whole-number quantity before confirming.");
      return;
    }
    if (
      (action === "intake" || action === "cross_dock") &&
      !destinationVaultId
    ) {
      setError("Select or scan a destination vault or container before confirming.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await crmFetch<TransferResult>(
        "/core/warehouse/transfer",
        json("POST", {
          confirmed: true,
          action,
          itemId: Number(itemId),
          quantity: parsedQuantity,
          destinationVaultId:
            action === "release" ? undefined : Number(destinationVaultId),
          notes,
          idempotencyKey: transferKey,
        })
      );
      setNotice(
        result.idempotent
          ? "The earlier confirmed action was returned without a second movement."
          : `Confirmed ${result.action.replace("_", " ")} for ${result.item.name}.`
      );
      resetTransferKey();
      setNotes("");
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not confirm the warehouse action. Retry uses the same safe action key."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <CorePage
      title={tx("Warehouse scanner", "Сканер склада")}
      description={tx(
        "Resolve local labels with a camera or manually, then confirm each physical movement separately.",
        "Считывайте локальные метки камерой или вручную, затем отдельно подтверждайте каждое физическое перемещение."
      )}
      actions={
        <button className="core-primary" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={15} aria-hidden="true" /> {tx("Refresh", "Обновить")}
        </button>
      }
    >
      <div className="scanner-page">
        {error && <CoreNotice tone="error">{error}</CoreNotice>}
        {notice && <CoreNotice tone="success">{notice}</CoreNotice>}
        <CoreNotice>
          {tx(
            "Camera scanning needs HTTPS and permission. A scan only selects or resolves a saved local record; it never checks an item in, out, or across a dock by itself.",
            "Сканирование камерой требует HTTPS и разрешения. Сканирование только выбирает или находит сохранённую локальную запись; само по себе оно не принимает, не выдаёт и не перемещает предмет."
          )}
        </CoreNotice>

        <div className="core-grid scanner-grid">
          <CoreCard title={tx("Scan a local label", "Сканировать локальную метку")}>
            <div className="scanner-camera">
              <video ref={videoRef} muted playsInline aria-label={tx("Camera preview", "Предпросмотр камеры")} />
              {!cameraOn && (
                <div className="scanner-camera__idle">
                  <Camera size={26} aria-hidden="true" />
                  <span>{tx("Camera is off", "Камера выключена")}</span>
                </div>
              )}
            </div>
            <div className="core-inline scanner-camera__actions">
              {!cameraOn ? (
                <button className="core-primary" type="button" onClick={() => void startCamera()}>
                  <ScanLine size={15} aria-hidden="true" /> {tx("Start camera", "Включить камеру")}
                </button>
              ) : (
                <button type="button" onClick={stopCamera}>
                  <Square size={15} aria-hidden="true" /> {tx("Stop camera", "Остановить камеру")}
                </button>
              )}
            </div>
            {cameraMessage && <p className="scanner-help">{cameraMessage}</p>}
            <form
              className="scanner-manual"
              onSubmit={event => {
                event.preventDefault();
                void resolveCode(manualValue);
              }}
            >
              <label>
                {tx("Manual label value", "Значение метки вручную")}
                <input
                  value={manualValue}
                  onChange={event => setManualValue(event.target.value)}
                  placeholder={tx("Scan or paste an opaque warehouse code", "Сканируйте или вставьте непрозрачный складской код")}
                  autoComplete="off"
                />
              </label>
              <button type="submit">{tx("Resolve label", "Найти метку")}</button>
            </form>
          </CoreCard>

          <CoreCard title={tx("Generate a QR label", "Создать QR-метку")}>
            <p className="core-muted">
              {tx(
                "Labels are opaque tenant-scoped values for active vaults, containers, or individual stored items. No public URL is encoded.",
                "Метки — это непрозрачные значения в рамках рабочего пространства для активных ячеек, контейнеров или отдельных предметов. Публичный URL не кодируется."
              )}
            </p>
            <label>
              {tx("Saved record", "Сохранённая запись")}
              <select value={labelTarget} onChange={event => setLabelTarget(event.target.value)}>
                {!labelTargets.length && <option value="">{tx("No eligible records", "Нет подходящих записей")}</option>}
                {labelTargets.map(target => (
                  <option key={target.value} value={target.value}>{target.label}</option>
                ))}
              </select>
            </label>
            <button type="button" className="core-primary" disabled={!labelTarget} onClick={() => void createLabel()}>
              {tx("Create / show label", "Создать / показать метку")}
            </button>
            {printLabel && (
              <div className="scanner-print" aria-live="polite">
                <div>
                  <b>{printLabel.displayName}</b>
                  <span>{printLabel.targetKind} · #{printLabel.targetId}</span>
                </div>
                {qrDataUrl ? <img src={qrDataUrl} alt={tx("QR label for {name}", "QR-метка для {name}", { name: printLabel.displayName })} /> : <p>{tx("Generating QR image…", "Создание QR-изображения…")}</p>}
                <code>{printLabel.value}</code>
                <button type="button" onClick={() => window.print()}>
                  <Printer size={15} aria-hidden="true" /> {tx("Print label", "Печать метки")}
                </button>
              </div>
            )}
          </CoreCard>
        </div>

        <CoreCard title={tx("Explicit storage action", "Явное складское действие")}>
          <p className="core-muted">
            {tx(
              "Use scanning or the selectors below. This form is the only place that records an intake, release, or cross-dock movement.",
              "Используйте сканирование или селекторы ниже. Только эта форма фиксирует приёмку, выдачу или перемещение между ячейками."
            )}
          </p>
          <form className="scanner-transfer" onSubmit={confirmTransfer}>
            <label>
              {tx("Action", "Действие")}
              <select value={action} onChange={event => { setAction(event.target.value as WarehouseAction); setItemId(""); resetTransferKey(); }}>
                <option value="intake">{tx("Check in / intake", "Принять / приёмка")}</option>
                <option value="release">{tx("Check out / release", "Выдать / выдача")}</option>
                <option value="cross_dock">{tx("Cross-dock", "Переместить между ячейками")}</option>
              </select>
            </label>
            <label>
              {tx("Item", "Предмет")}
              <select value={itemId} onChange={event => { setItemId(event.target.value); resetTransferKey(); }}>
                <option value="">{tx("Select or scan an item", "Выберите или отсканируйте предмет")}</option>
                {selectableItems.map(item => <option key={item.id} value={item.id}>{item.name} · {item.quantity} · {item.status}</option>)}
              </select>
            </label>
            {(action === "intake" || action === "cross_dock") && (
              <label>
                {tx("Destination vault or container", "Ячейка или контейнер назначения")}
                <select value={destinationVaultId} onChange={event => { setDestinationVaultId(event.target.value); resetTransferKey(); }}>
                  <option value="">{tx("Select or scan a destination", "Выберите или отсканируйте место назначения")}</option>
                  {selectableDestinations.map(vault => <option key={vault.id} value={vault.id}>{vault.name} · {vault.occupiedCuft}/{vault.capacityCuft} cu ft</option>)}
                </select>
              </label>
            )}
            <label>
              {tx("Quantity", "Количество")}
              <input type="number" min="1" step="1" value={quantity} onChange={event => { setQuantity(event.target.value); resetTransferKey(); }} />
            </label>
            <label className="scanner-transfer__notes">
              {tx("Movement note (optional)", "Примечание к перемещению (необязательно)")}
              <input value={notes} maxLength={5000} onChange={event => setNotes(event.target.value)} />
            </label>
            <div className="scanner-transfer__confirm">
              <button className="core-primary" disabled={saving}>
                {saving ? tx("Confirming…", "Подтверждение…") : tx("Confirm physical action", "Подтвердить физическое действие")}
              </button>
              <span>{tx("Capacity, ownership, duplicate retry key, and quantity are checked by the server.", "Сервер проверяет вместимость, принадлежность, ключ повтора, исключающий дубликаты, и количество.")}</span>
            </div>
          </form>
        </CoreCard>

        <CoreCard title={tx("Recent scanner audit", "Последний журнал сканера")}>
          {loading ? <p className="core-muted">{tx("Loading saved warehouse records…", "Загрузка сохранённых складских записей…")}</p> : !data?.audits.length ? <p className="core-empty">{tx("No camera or manual scan activity has been recorded.", "Нет сохранённых действий камеры или ручного сканирования.")}</p> : (
            <div className="core-scroll"><table className="core-table"><thead><tr><th>{tx("Event", "Событие")}</th><th>{tx("Target", "Цель")}</th><th>{tx("Quantity", "Количество")}</th><th>{tx("Time", "Время")}</th></tr></thead><tbody>{data.audits.map(audit => <tr key={audit.id}><td>{audit.eventType}</td><td>{audit.targetKind ? `${audit.targetKind} #${audit.targetId}` : "—"}</td><td>{audit.quantity ?? "—"}</td><td>{new Date(audit.createdAt).toLocaleString()}</td></tr>)}</tbody></table></div>
          )}
        </CoreCard>
      </div>
    </CorePage>
  );
}
