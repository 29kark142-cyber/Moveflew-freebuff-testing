import { Camera, CheckCircle2, CircleAlert, LoaderCircle, Plus, Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Brand from "@/components/Brand";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useI18n } from "@/lib/i18n";
import "./claims-settlement.css";

type ClaimItem = {
  id: number;
  name: string;
  description: string;
  quantity: number;
  requestedCents: number;
  createdAt: string;
};
type ClaimPhoto = {
  id: number;
  itemId: number | null;
  storageUrl: string;
  contentType: string;
  byteSize: number;
  caption: string;
  createdAt: string;
};
type PortalData = {
  customer: { name: string };
  job: { title: string; moveDate: string };
  claim: {
    id: number;
    type: string;
    status: string;
    description: string;
    claimedCents: number;
    submittedAt: string | null;
    acceptsCustomerUpdates: boolean;
  };
  affectedItems: ClaimItem[];
  photos: ClaimPhoto[];
};

function cents(value: string): number | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const [whole, fraction = ""] = value.trim().split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(amount) ? amount : null;
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the selected photo."));
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Could not read the selected photo."));
    reader.readAsDataURL(file);
  });
}

async function portalFetch<T>(token: string, suffix = "", init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/customer-claims/${encodeURIComponent(token)}${suffix}`, {
    ...init,
    headers: { Accept: "application/json", "Content-Type": "application/json", ...init.headers },
    credentials: "omit",
  });
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      body && typeof body.error === "string" ? body.error : `Request failed (${response.status})`
    );
  return body as T;
}

export default function CustomerClaims() {
  const { language } = useI18n();
  const tx = (en: string, ru: string) => (language === "ru" ? ru : en);
  const token = useMemo(
    () => window.location.pathname.split("/").filter(Boolean).at(-1) ?? "",
    []
  );
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [itemName, setItemName] = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [itemQuantity, setItemQuantity] = useState("1");
  const [itemAmount, setItemAmount] = useState("0.00");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoItemId, setPhotoItemId] = useState("");
  const [photoCaption, setPhotoCaption] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      setData(await portalFetch<PortalData>(token));
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : tx("This claim link is unavailable.", "Ссылка на претензию недоступна."));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => void load(), [token]);

  const addItem = async (event: React.FormEvent) => {
    event.preventDefault();
    const requestedCents = cents(itemAmount);
    const quantity = Number(itemQuantity);
    if (requestedCents === null || !Number.isInteger(quantity) || quantity < 1) {
      setNotice(tx("Enter a whole quantity and a USD amount with at most two decimals.", "Укажите целое количество и сумму в USD с не более чем двумя знаками."));
      return;
    }
    setSaving(true);
    setNotice("");
    try {
      await portalFetch(token, "/items", {
        method: "POST",
        body: JSON.stringify({ name: itemName, description: itemDescription, quantity, requestedCents }),
      });
      setItemName("");
      setItemDescription("");
      setItemQuantity("1");
      setItemAmount("0.00");
      setNotice(tx("Item detail saved for staff review.", "Сведения о предмете сохранены для проверки сотрудниками."));
      await load();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : tx("Item could not be saved.", "Не удалось сохранить предмет."));
    } finally {
      setSaving(false);
    }
  };

  const uploadPhoto = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!photoFile) return;
    if (photoFile.size > 5 * 1024 * 1024) {
      setNotice(tx("Choose a photo no larger than 5 MB.", "Выберите фото размером не более 5 МБ."));
      return;
    }
    setSaving(true);
    setNotice("");
    try {
      const photoData = await readDataUrl(photoFile);
      await portalFetch(token, "/photos", {
        method: "POST",
        body: JSON.stringify({
          itemId: photoItemId ? Number(photoItemId) : undefined,
          caption: photoCaption,
          photoData,
        }),
      });
      setPhotoFile(null);
      setPhotoItemId("");
      setPhotoCaption("");
      setNotice(tx("Photo added to this claim.", "Фото добавлено к этой претензии."));
      await load();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : tx("Photo could not be uploaded.", "Не удалось загрузить фото."));
    } finally {
      setSaving(false);
    }
  };

  const submit = async () => {
    setSaving(true);
    setNotice("");
    try {
      await portalFetch(token, "/submit", { method: "POST" });
      setNotice(tx("Your claim details were submitted for staff review.", "Сведения по претензии отправлены на проверку сотрудникам."));
      await load();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : tx("Details could not be submitted.", "Не удалось отправить сведения."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="claims-public-page">
      <header className="claims-public-header">
        <Brand light />
        <span>{tx("Customer claim portal", "Портал претензий клиента")}</span>
        <LanguageSwitcher />
      </header>
      <div className="claims-public-body">
        {loading && <p className="claims-loading"><LoaderCircle className="ws-spin" size={18} /> {tx("Loading your claim…", "Загрузка претензии…")}</p>}
        {!loading && error && <section className="claims-public-card claims-error"><CircleAlert size={28} /><h1>{tx("Claim link unavailable", "Ссылка на претензию недоступна")}</h1><p>{error}</p></section>}
        {!loading && data && (
          <>
            <section className="claims-public-card claims-intro">
              <div><span className="claims-kicker">{tx("Post-move claim", "Претензия после переезда")}</span><h1>{data.customer.name}</h1><p>{tx("This private link shows only this completed move and its claim details.", "Эта приватная ссылка показывает только этот завершенный переезд и сведения по претензии.")}</p></div>
              <dl><div><dt>{tx("Move", "Переезд")}</dt><dd>{data.job.title}</dd></div><div><dt>{tx("Move date", "Дата переезда")}</dt><dd>{data.job.moveDate}</dd></div><div><dt>{tx("Claim status", "Статус претензии")}</dt><dd><span className="claims-status">{data.claim.status}</span></dd></div></dl>
            </section>
            {notice && <div className={/saved|added|submitted/i.test(notice) ? "claims-notice claims-notice--success" : "claims-notice claims-notice--error"}>{notice}</div>}
            <section className="claims-public-card"><h2>{tx("Claim summary", "Сводка по претензии")}</h2><p><b>{data.claim.type}</b></p><p className="claims-prewrap">{data.claim.description}</p><small>{tx("Reported claim amount", "Заявленная сумма")}: {new Intl.NumberFormat(language === "ru" ? "ru-RU" : "en-US", { style: "currency", currency: "USD" }).format(data.claim.claimedCents / 100)}</small></section>
            <section className="claims-public-card"><h2>{tx("Affected items", "Поврежденные предметы")}</h2>{data.affectedItems.length ? <div className="claims-item-list">{data.affectedItems.map(item => <article key={item.id}><b>{item.name} × {item.quantity}</b><p className="claims-prewrap">{item.description}</p><small>{new Intl.NumberFormat(language === "ru" ? "ru-RU" : "en-US", { style: "currency", currency: "USD" }).format(item.requestedCents / 100)}</small></article>)}</div> : <p className="claims-muted">{tx("No item details have been added yet.", "Сведения о предметах еще не добавлены.")}</p>}
              {data.claim.acceptsCustomerUpdates && <form className="claims-form" onSubmit={addItem}><h3>{tx("Add an affected item", "Добавить поврежденный предмет")}</h3><label>{tx("Item name", "Название предмета")}<input required value={itemName} onChange={event => setItemName(event.target.value)} /></label><label>{tx("What happened", "Что произошло")}<textarea value={itemDescription} onChange={event => setItemDescription(event.target.value)} /></label><div className="claims-form-grid"><label>{tx("Quantity", "Количество")}<input required type="number" min="1" step="1" value={itemQuantity} onChange={event => setItemQuantity(event.target.value)} /></label><label>{tx("Amount requested (USD)", "Заявленная сумма (USD)")}<input required inputMode="decimal" value={itemAmount} onChange={event => setItemAmount(event.target.value)} /></label></div><button disabled={saving}><Plus size={15} /> {tx("Save item", "Сохранить предмет")}</button></form>}</section>
            <section className="claims-public-card"><h2>{tx("Photos", "Фотографии")}</h2>{data.photos.length ? <div className="claims-photo-grid">{data.photos.map(photo => <figure key={photo.id}><img src={photo.storageUrl} alt={photo.caption || tx("Claim evidence", "Фото по претензии")} /><figcaption>{photo.caption || tx("Claim evidence", "Фото по претензии")}</figcaption></figure>)}</div> : <p className="claims-muted">{tx("No photos have been added yet.", "Фотографии еще не добавлены.")}</p>}
              {data.claim.acceptsCustomerUpdates && <form className="claims-form" onSubmit={uploadPhoto}><h3>{tx("Add a photo", "Добавить фото")}</h3><p className="claims-muted">{tx("PNG, JPEG, or WebP only; 5 MB maximum. Files are verified by the server before storage.", "Только PNG, JPEG или WebP; максимум 5 МБ. Сервер проверяет файл перед сохранением.")}</p><label>{tx("Related item (optional)", "Связанный предмет (необязательно)")}<select value={photoItemId} onChange={event => setPhotoItemId(event.target.value)}><option value="">{tx("General claim photo", "Общее фото по претензии")}</option>{data.affectedItems.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>{tx("Photo", "Фото")}<input required type="file" accept="image/png,image/jpeg,image/webp" onChange={event => setPhotoFile(event.target.files?.[0] ?? null)} /></label><label>{tx("Caption (optional)", "Подпись (необязательно)")}<input value={photoCaption} onChange={event => setPhotoCaption(event.target.value)} /></label><button disabled={saving || !photoFile}><Camera size={15} /> {tx("Upload photo", "Загрузить фото")}</button></form>}</section>
            <section className="claims-public-card claims-submit-card"><h2>{data.claim.submittedAt ? tx("Details submitted", "Сведения отправлены") : tx("Submit for review", "Отправить на проверку")}</h2><p>{tx("Submitting alerts staff through the claim record; it does not issue a refund, payout, or payment instruction.", "Отправка фиксируется в записи претензии для сотрудников; она не оформляет возврат, выплату или платежное поручение.")}</p>{data.claim.submittedAt ? <div className="claims-submitted"><CheckCircle2 size={18} /> {tx("Submitted for staff review.", "Отправлено на проверку сотрудникам.")}</div> : <button disabled={saving || !data.claim.acceptsCustomerUpdates} onClick={() => void submit()}><Send size={15} /> {tx("Submit claim details", "Отправить сведения по претензии")}</button>}</section>
          </>
        )}
      </div>
    </main>
  );
}
