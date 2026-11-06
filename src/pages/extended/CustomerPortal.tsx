import {
  CalendarDays,
  Camera,
  CheckCircle2,
  CircleAlert,
  Download,
  FileText,
  MapPin,
  RefreshCw,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Brand from "@/components/Brand";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { SectionLoader } from "@/components/loaders/MoveFlewLoader";
import { portalApi, PortalApiError, type PortalJob, type PortalPayload } from "@/lib/portal-api";
import "@/engagement.css";

type Mode = "date_change" | "address";

const money = (cents: number) =>
  new Intl.NumberFormat(document.documentElement.lang === "ru" ? "ru-RU" : "en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);

const today = () => new Date().toISOString().slice(0, 10);

function friendly(reason: unknown, fallback: string) {
  if (reason instanceof PortalApiError && reason.status === 404) return fallback;
  return reason instanceof Error ? reason.message : fallback;
}

/** Compress a customer photo in the browser so uploads stay small and predictable. */
function compressPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      reject(new Error("Photos must be JPEG, PNG or WebP."));
      return;
    }
    if (file.size > 8_000_000) {
      reject(new Error("Each photo must be smaller than 8 MB."));
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, 1400 / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("This browser cannot prepare the photo."));
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.78));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file could not be read as a photo."));
    };
    image.src = url;
  });
}

export default function CustomerPortal({ params }: { params: { token: string } }) {
  const token = params.token;
  const [data, setData] = useState<PortalPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [jobId, setJobId] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>("date_change");
  const [requestedDate, setRequestedDate] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [claimType, setClaimType] = useState<"damage" | "missing" | "other">("damage");
  const [claimDescription, setClaimDescription] = useState("");
  const [claimAmount, setClaimAmount] = useState("");
  const [claimSaving, setClaimSaving] = useState(false);

  const selected = useMemo(
    () => data?.jobs.find((job) => job.id === jobId) ?? data?.jobs[0] ?? null,
    [data, jobId],
  );

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const payload = await portalApi.read(token);
      setData(payload);
      setJobId((current) =>
        payload.jobs.some((job) => job.id === current) ? current : (payload.jobs[0]?.id ?? null),
      );
      setError("");
    } catch (reason) {
      setError(friendly(reason, "This customer portal link is unavailable or has expired."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // The token is the URL credential; reload only when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!selected) return;
    setOrigin("");
    setDestination("");
    setRequestedDate("");
    setNotes("");
  }, [selected?.id]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    setNotice("");
    try {
      await portalApi.request(token, {
        jobId: selected.id,
        kind: mode,
        ...(mode === "date_change" ? { requestedDate } : {}),
        ...(mode === "address"
          ? { origin: origin.trim() || undefined, destination: destination.trim() || undefined }
          : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      setNotice(
        "Your request was sent to the dispatch team. You will be contacted once it is reviewed; nothing has changed automatically.",
      );
      setNotes("");
      await load(true);
    } catch (reason) {
      setNotice(friendly(reason, "We could not submit your request."));
    } finally {
      setSaving(false);
    }
  };

  const submitClaim = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    const claimedCents = claimAmount.trim() ? Math.round(Number(claimAmount) * 100) : 0;
    if (!Number.isFinite(claimedCents) || claimedCents < 0) {
      setNotice("Enter a valid claimed amount, or leave it blank.");
      return;
    }
    setClaimSaving(true);
    setNotice("");
    try {
      await portalApi.claim(token, {
        jobId: selected.id,
        type: claimType,
        description: claimDescription.trim(),
        claimedCents,
      });
      setNotice(
        "Your claim was submitted for review. The office will contact you about the next step.",
      );
      setClaimDescription("");
      setClaimAmount("");
      await load(true);
    } catch (reason) {
      setNotice(friendly(reason, "We could not submit this claim."));
    } finally {
      setClaimSaving(false);
    }
  };

  const upload = async (files: FileList | null) => {
    if (!selected || !files?.length) return;
    setUploading(true);
    setNotice("");
    try {
      const photos = [];
      for (const file of Array.from(files).slice(0, 6))
        photos.push({ name: file.name, dataUrl: await compressPhoto(file) });
      const result = await portalApi.uploadPhotos(token, { jobId: selected.id, photos });
      setNotice(
        `${result.photos.length} photo${result.photos.length === 1 ? "" : "s"} saved to your move.${
          result.rejected ? ` ${result.rejected} file(s) were skipped.` : ""
        }`,
      );
      await load(true);
    } catch (reason) {
      setNotice(friendly(reason, "We could not upload those photos."));
    } finally {
      setUploading(false);
    }
  };

  if (loading)
    return (
      <Frame>
        <SectionLoader label="Loading your portal…" />
      </Frame>
    );
  if (error && !data)
    return (
      <Frame>
        <section className="eg-public-card eg-public-error">
          <CircleAlert size={30} />
          <h1>Portal unavailable</h1>
          <p>{error}</p>
        </section>
      </Frame>
    );
  if (!data) return null;

  const photos = selected?.photos ?? [];
  const photoUrl = (id: string) => `/api/public/portal/${encodeURIComponent(token)}/photos/${id}`;

  return (
    <Frame company={data.company.name}>
      <div className="eg-portal-intro">
        <div>
          <span className="eg-public-kicker">Customer portal</span>
          <h1>Hello, {data.customer.name || "customer"}</h1>
          <p>
            Request a new move date, update your addresses, add inventory photos, and download your
            estimate or invoice. Changes are reviewed by the office before they take effect.
          </p>
        </div>
        <button className="ws-btn" onClick={() => void load()}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {notice && (
        <div className={/sent|saved|photo/i.test(notice) ? "eg-success" : "eg-public-error-inline"}>
          {notice}
        </div>
      )}

      <section className="eg-portal-section">
        <h2>Your moves</h2>
        <div className="eg-portal-grid">
          {data.jobs.map((job) => (
            <article className="eg-public-card" key={job.id}>
              <b>{job.title}</b>
              <p>
                <CalendarDays size={14} /> {job.moveDate || "Date not scheduled"}
              </p>
              <p>
                {job.origin || "—"} → {job.destination || "—"}
              </p>
              <span className="eg-raw-status">{job.status || "—"}</span>
              <button
                className="eg-public-submit eg-inline-link"
                onClick={() => setJobId(job.id)}
                disabled={selected?.id === job.id}
              >
                {selected?.id === job.id ? "Managing this move" : "Manage this move"}
              </button>
            </article>
          ))}
        </div>
        {!data.jobs.length && <p className="eg-muted">No jobs are linked to this portal yet.</p>}
      </section>

      {selected && (
        <section className="eg-portal-section">
          <h2>Change a date or address</h2>
          <p>
            Requests are saved on your job and alert the dispatch team. A new date does not change
            your booking until the office confirms it.
          </p>
          <form className="eg-public-card eg-inventory-form" onSubmit={submit}>
            <label>
              Move
              <select
                value={selected.id}
                onChange={(event) => setJobId(Number(event.target.value))}
              >
                {data.jobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.title} · {job.moveDate || "unscheduled"}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={`ws-btn${mode === "date_change" ? " primary" : ""}`}
                onClick={() => setMode("date_change")}
                aria-pressed={mode === "date_change"}
              >
                <CalendarDays size={15} /> Change date
              </button>
              <button
                type="button"
                className={`ws-btn${mode === "address" ? " primary" : ""}`}
                onClick={() => setMode("address")}
                aria-pressed={mode === "address"}
              >
                <MapPin size={15} /> Update addresses
              </button>
            </div>

            {mode === "date_change" ? (
              <label>
                Preferred new date
                <input
                  className="ws-input"
                  type="date"
                  min={today()}
                  required
                  value={requestedDate}
                  onChange={(event) => setRequestedDate(event.target.value)}
                />
              </label>
            ) : (
              <>
                <label>
                  Pickup address
                  <input
                    className="ws-input"
                    maxLength={300}
                    value={origin}
                    onChange={(event) => setOrigin(event.target.value)}
                    placeholder={selected.origin || "Current pickup address"}
                  />
                </label>
                <label>
                  Delivery address
                  <input
                    className="ws-input"
                    maxLength={300}
                    value={destination}
                    onChange={(event) => setDestination(event.target.value)}
                    placeholder={selected.destination || "Current delivery address"}
                  />
                </label>
              </>
            )}

            <label>
              Notes for the dispatch team (optional)
              <textarea
                className="ws-input"
                maxLength={500}
                rows={3}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </label>

            <button className="eg-public-submit" disabled={saving}>
              <CheckCircle2 size={15} /> {saving ? "Sending…" : "Send request to dispatch"}
            </button>
          </form>

          <h3 className="mt-4 font-semibold">Request history</h3>
          {selected.requests.length ? (
            <ul className="eg-storage-list">
              {selected.requests.map((request) => (
                <li key={request.id}>
                  {request.kind === "date_change" ? (
                    <CalendarDays size={15} />
                  ) : (
                    <MapPin size={15} />
                  )}
                  <span>
                    {request.kind === "date_change"
                      ? `New date: ${request.requestedDate ?? "—"}`
                      : [request.origin, request.destination].filter(Boolean).join(" → ")}
                    {request.notes ? ` · ${request.notes}` : ""}
                  </span>
                  <small>
                    {request.status} · {new Date(request.at).toLocaleDateString()}
                  </small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="eg-muted">No change requests yet.</p>
          )}
        </section>
      )}

      {selected && (
        <section className="eg-portal-section">
          <h2>Report damage or a missing item</h2>
          <p>
            Tell us what happened and the office will review it. A submitted claim does not promise
            a refund or payout.
          </p>
          <form className="eg-public-card eg-inventory-form" onSubmit={submitClaim}>
            <label>
              What are you reporting?
              <select
                value={claimType}
                onChange={(event) =>
                  setClaimType(event.target.value as "damage" | "missing" | "other")
                }
              >
                <option value="damage">Damaged item</option>
                <option value="missing">Missing item</option>
                <option value="other">Something else</option>
              </select>
            </label>
            <label>
              Describe the item and what happened
              <textarea
                className="ws-input"
                required
                minLength={5}
                maxLength={2000}
                rows={4}
                value={claimDescription}
                onChange={(event) => setClaimDescription(event.target.value)}
              />
            </label>
            <label>
              Estimated value (USD, optional)
              <input
                className="ws-input"
                inputMode="decimal"
                value={claimAmount}
                onChange={(event) => setClaimAmount(event.target.value)}
              />
            </label>
            <button
              className="eg-public-submit"
              disabled={claimSaving || claimDescription.trim().length < 5}
            >
              <CircleAlert size={15} /> {claimSaving ? "Submitting…" : "Submit claim for review"}
            </button>
          </form>
          {data.claims.filter((claim) => claim.jobId === selected.id).length > 0 && (
            <ul className="eg-storage-list">
              {data.claims
                .filter((claim) => claim.jobId === selected.id)
                .map((claim) => (
                  <li key={claim.id}>
                    <CircleAlert size={15} />
                    <span>
                      {claim.type} · {claim.description}
                      {claim.approvedCents > 0 ? ` · approved ${money(claim.approvedCents)}` : ""}
                    </span>
                    <small>{claim.status.replace(/_/g, " ")}</small>
                  </li>
                ))}
            </ul>
          )}
        </section>
      )}

      {selected && (
        <section className="eg-portal-section">
          <h2>Inventory photos</h2>
          <p>
            Add up to 12 photos of furniture, boxes or access details. Photos are attached to this
            move for the crew and estimator.
          </p>
          <label className="eg-public-card eg-inventory-form">
            <span>
              <Camera size={15} /> Add photos ({photos.length}/12)
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              disabled={uploading || photos.length >= 12}
              onChange={(event) => {
                void upload(event.target.files);
                event.target.value = "";
              }}
            />
            <small>
              {uploading ? "Uploading…" : "JPEG, PNG or WebP. Photos are resized before upload."}
            </small>
          </label>
          {photos.length > 0 && (
            <div className="eg-portal-grid">
              {photos.map((photo) => (
                <figure className="eg-public-card" key={photo.id}>
                  <img
                    src={photoUrl(photo.id)}
                    alt={photo.name}
                    style={{ width: "100%", borderRadius: 8, maxHeight: 180, objectFit: "cover" }}
                  />
                  <figcaption>
                    {photo.name}
                    <small> · {new Date(photo.at).toLocaleDateString()}</small>
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="eg-portal-section">
        <h2>Invoices and documents</h2>
        <div className="eg-portal-grid">
          {data.invoices.map((invoice) => (
            <article className="eg-public-card" key={invoice.id}>
              <b>{invoice.invoiceNumber}</b>
              <p>
                Balance: <strong>{money(invoice.balanceCents)}</strong>
              </p>
              <p>Total: {money(invoice.amountCents)}</p>
              <span className="eg-raw-status">{invoice.status}</span>
            </article>
          ))}
        </div>
        <div className="eg-document-list">
          {data.documents.map((document) => (
            <a key={document.id} href={document.url}>
              {document.kind === "invoice" ? <FileText size={15} /> : <Download size={15} />}
              Download {document.name.toLowerCase()} (PDF)
            </a>
          ))}
          {!data.documents.length && (
            <p className="eg-muted">No estimate or invoice is available to download yet.</p>
          )}
        </div>
      </section>

      <section className="eg-portal-section">
        <h2>Need help?</h2>
        <p>
          Contact {data.company.name}
          {data.company.phone ? ` at ${data.company.phone}` : ""}
          {data.company.email ? ` or ${data.company.email}` : ""}. This link is private to your
          move; do not forward it.
        </p>
      </section>
    </Frame>
  );
}

function Frame({ children, company }: { children: React.ReactNode; company?: string }) {
  return (
    <main className="eg-public-page">
      <header className="eg-public-header">
        <Brand light />
        <span>{company || "Customer portal"}</span>
        <LanguageSwitcher />
      </header>
      <div className="eg-public-body eg-portal-body">{children}</div>
    </main>
  );
}
