import {
  CheckCircle2,
  CircleAlert,
  ClipboardList,
  CreditCard,
  ExternalLink,
  FileText,
  LoaderCircle,
  PackageCheck,
  RefreshCw,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Brand from "@/components/Brand";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { CrmApiError } from "@/lib/crm";
import { useI18n } from "@/lib/i18n";
import { engage, type PortalData } from "@/lib/engage-api";
import "@/engagement.css";

export default function CustomerPortal({
  params,
}: {
  params: { token: string };
}) {
  const { t } = useI18n();
  const token = params.token;
  const pending = useMemo(
    () =>
      new URLSearchParams(window.location.search).get("checkout") === "success",
    []
  );
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(
    pending
      ? "Your test checkout was opened. Invoice status changes only after a verified payment webhook; this portal will refresh while pending."
      : ""
  );
  const [selectedJobId, setSelectedJobId] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [submittingInventory, setSubmittingInventory] = useState(false);
  const [checkingOut, setCheckingOut] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const result = await engage.portal(token);
        if (active) {
          setData(result);
          setError("");
          setSelectedJobId(
            current => current || String(result.jobs[0]?.id || "")
          );
        }
      } catch (reason) {
        if (active)
          setError(
            publicError(
              reason,
              "This customer portal link is unavailable or has expired."
            )
          );
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    const timer = pending
      ? window.setInterval(() => void load(), 5000)
      : undefined;
    return () => {
      active = false;
      if (timer) window.clearInterval(timer);
    };
  }, [token, pending]);

  const selectedJob = data?.jobs.find(job => String(job.id) === selectedJobId);
  useEffect(() => {
    if (!selectedJob) return;
    const items = Array.isArray(selectedJob.inventory)
      ? selectedJob.inventory
      : [];
    setQuantities(
      Object.fromEntries(
        items.map((item: Record<string, any>) => [
          String(item.key || item.name),
          Math.max(0, Number(item.quantity || 0)),
        ])
      )
    );
  }, [selectedJobId, data]);

  const submitInventory = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedJob) return;
    const inventory = Array.isArray(selectedJob.inventory)
      ? selectedJob.inventory
      : [];
    const items = inventory
      .map((item: Record<string, any>) => ({
        key: item.key,
        name: item.name,
        quantity: quantities[String(item.key || item.name)] || 0,
      }))
      .filter(item => item.quantity > 0);
    setSubmittingInventory(true);
    setNotice("");
    try {
      await engage.submitPortalInventory(token, {
        jobId: Number(selectedJob.id),
        items,
      });
      setNotice(
        "Your inventory selection was submitted for staff review. It did not change a signed estimate or booking."
      );
    } catch (reason) {
      setNotice(
        publicError(reason, "We could not submit your inventory for review.")
      );
    } finally {
      setSubmittingInventory(false);
    }
  };
  const checkout = async (invoice: Record<string, any>) => {
    const balance = Number(invoice.balanceCents || 0);
    if (balance < 50) return;
    setCheckingOut(Number(invoice.id));
    setNotice("");
    try {
      const result = await engage.portalCheckout(token, Number(invoice.id), {
        origin: window.location.origin,
        amountCents: balance,
      });
      window.open(result.url, "_blank", "noopener,noreferrer");
      setNotice(
        "TEST checkout opened in a new tab. Returning here does not mark an invoice paid; verified payment processing updates the status."
      );
    } catch (reason) {
      setNotice(publicError(reason, "We could not open TEST checkout."));
    } finally {
      setCheckingOut(null);
    }
  };

  if (loading)
    return (
      <PortalFrame>
        <p className="eg-public-loading">
          <LoaderCircle className="ws-spin" size={18} />{" "}
          {t("Loading your portal…")}
        </p>
      </PortalFrame>
    );
  if (error && !data)
    return (
      <PortalFrame>
        <PublicError message={error} />
      </PortalFrame>
    );
  if (!data) return null;
  return (
    <PortalFrame company={data.company?.name}>
      <div className="eg-portal-intro">
        <div>
          <span className="eg-public-kicker">{t("Customer portal")}</span>
          <h1>
            {t("Hello, {name}", { name: data.customer?.name || t("customer") })}
          </h1>
          <p>
            {t(
              "This portal shows only the jobs, invoices, storage records, and documents linked to this access link."
            )}
          </p>
        </div>
        <button className="ws-btn" onClick={() => window.location.reload()}>
          <RefreshCw size={14} />
          {t("Refresh")}
        </button>
      </div>
      {notice && (
        <div
          className={
            /submitted|opened|verified/.test(notice)
              ? "eg-success"
              : "eg-public-error-inline"
          }
        >
          {t(notice)}
        </div>
      )}
      <section className="eg-portal-section">
        <h2>{t("Jobs and proposals")}</h2>
        <div className="eg-portal-grid">
          {data.jobs.map(job => (
            <article className="eg-public-card" key={job.id}>
              <b>{job.title || t("Move")}</b>
              <p>
                {job.moveDate || "—"}{" "}
                {job.startHour !== undefined ? `· ${job.startHour}:00` : ""}
              </p>
              <p>
                {job.origin || "—"} → {job.destination || "—"}
              </p>
              <span className="eg-raw-status">{job.status || "—"}</span>
              {job.proposalToken && (
                <a
                  className="eg-public-submit eg-inline-link"
                  href={`/proposal/${job.proposalToken}`}
                >
                  <FileText size={15} />
                  {t("Open proposal")}
                </a>
              )}
            </article>
          ))}
        </div>
        {!data.jobs.length && (
          <p className="eg-muted">
            {t("No linked jobs are available in this portal.")}
          </p>
        )}
      </section>
      <section className="eg-portal-section">
        <h2>{t("Invoices and balances")}</h2>
        <div className="eg-portal-grid">
          {data.invoices.map(invoice => {
            const balance = Number(invoice.balanceCents || 0);
            return (
              <article className="eg-public-card" key={invoice.id}>
                <b>
                  {invoice.invoiceNumber ||
                    t("Invoice #{id}", { id: invoice.id })}
                </b>
                <p>
                  {t("Balance")}: <strong>{moneyCents(balance)}</strong>
                </p>
                <span className="eg-raw-status">{invoice.status || "—"}</span>
                {balance >= 50 ? (
                  <button
                    className="eg-public-submit"
                    disabled={checkingOut === Number(invoice.id)}
                    onClick={() => void checkout(invoice)}
                  >
                    <CreditCard size={15} />
                    {t(
                      checkingOut === Number(invoice.id)
                        ? "Opening TEST checkout…"
                        : "Pay in TEST checkout"
                    )}
                  </button>
                ) : (
                  <small>{t("No eligible balance for TEST checkout.")}</small>
                )}
              </article>
            );
          })}
        </div>
        {!data.invoices.length && (
          <p className="eg-muted">
            {t("No linked invoices are available in this portal.")}
          </p>
        )}
      </section>
      <section className="eg-portal-section">
        <h2>{t("Storage")}</h2>
        <div className="eg-portal-grid">
          {data.storageAccounts.map(account => (
            <article className="eg-public-card" key={account.id}>
              <b>{account.kind || t("Storage account")}</b>
              <p>
                {t("Status")}:{" "}
                <span className="eg-raw-status">{account.status || "—"}</span>
              </p>
              <p>
                {account.startDate || "—"}
                {account.endDate ? ` — ${account.endDate}` : ""}
              </p>
            </article>
          ))}
        </div>
        {data.storageItems.length ? (
          <ul className="eg-storage-list">
            {data.storageItems.map(item => (
              <li key={item.id}>
                <PackageCheck size={15} />
                <span>
                  {item.name} × {item.quantity}
                </span>
                <small>{item.status || "—"}</small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="eg-muted">
            {t("No linked storage items are available.")}
          </p>
        )}
      </section>
      <section className="eg-portal-section">
        <h2>{t("Documents and recorded terms")}</h2>
        <div className="eg-document-list">
          {data.documents?.map(document => (
            <a
              key={document.id || document.url}
              href={document.url}
              target="_blank"
              rel="noreferrer"
            >
              <FileText size={15} />
              {document.name || t("Document")}
              <ExternalLink size={13} />
            </a>
          ))}
        </div>
        <div className="eg-contract-list">
          {data.jobs
            .filter(job => job.signature || job.completedSignature)
            .map(job => (
              <div key={job.id}>
                <ClipboardList size={15} />
                <span>{job.title || t("Move")}</span>
                <small>
                  {job.signature
                    ? t("Proposal acceptance recorded")
                    : t("Completion signature recorded")}
                </small>
              </div>
            ))}
        </div>
        {!data.documents?.length &&
          !data.jobs.some(job => job.signature || job.completedSignature) && (
            <p className="eg-muted">
              {t("No linked documents or recorded signatures are available.")}
            </p>
          )}
      </section>
      <section className="eg-portal-section">
        <h2>{t("Inventory for staff review")}</h2>
        <p>
          {t(
            "Select quantities from the canonical items already associated with a linked job. Submission is reviewed by staff and does not silently change a signed quote or booking."
          )}
        </p>
        {data.jobs.length ? (
          <form
            className="eg-public-card eg-inventory-form"
            onSubmit={submitInventory}
          >
            <label>
              {t("Linked job")}
              <select
                value={selectedJobId}
                onChange={event => setSelectedJobId(event.target.value)}
              >
                {data.jobs.map(job => (
                  <option key={job.id} value={job.id}>
                    {job.title || `Job #${job.id}`}
                  </option>
                ))}
              </select>
            </label>
            {selectedJob &&
              (Array.isArray(selectedJob.inventory) &&
              selectedJob.inventory.length ? (
                <div className="eg-inventory-lines">
                  {selectedJob.inventory.map((item: Record<string, any>) => {
                    const key = String(item.key || item.name);
                    return (
                      <label key={key}>
                        <span>{item.name}</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={quantities[key] ?? 0}
                          onChange={event =>
                            setQuantities(current => ({
                              ...current,
                              [key]: Math.max(0, Number(event.target.value)),
                            }))
                          }
                        />
                      </label>
                    );
                  })}
                </div>
              ) : (
                <p className="eg-muted">
                  {t(
                    "This linked job has no canonical inventory items available for selection."
                  )}
                </p>
              ))}
            <button
              className="eg-public-submit"
              disabled={
                submittingInventory ||
                !selectedJob ||
                !Array.isArray(selectedJob.inventory) ||
                !selectedJob.inventory.length
              }
            >
              <PackageCheck size={15} />
              {t(
                submittingInventory ? "Submitting…" : "Submit for staff review"
              )}
            </button>
          </form>
        ) : (
          <p className="eg-muted">
            {t("No linked job is available for an inventory submission.")}
          </p>
        )}
      </section>
    </PortalFrame>
  );
}

function PortalFrame({
  children,
  company,
}: {
  children: React.ReactNode;
  company?: string;
}) {
  const { t } = useI18n();
  return (
    <main className="eg-public-page">
      <header className="eg-public-header">
        <Brand light />
        <span>{company || t("Customer portal")}</span>
        <LanguageSwitcher />
      </header>
      <div className="eg-public-body eg-portal-body">{children}</div>
    </main>
  );
}
function PublicError({ message }: { message: string }) {
  const { t } = useI18n();
  return (
    <section className="eg-public-card eg-public-error">
      <CircleAlert size={30} />
      <h1>{t("Portal unavailable")}</h1>
      <p>{t(message)}</p>
    </section>
  );
}
const moneyCents = (value: number) =>
  new Intl.NumberFormat(
    document.documentElement.lang === "ru" ? "ru-RU" : "en-US",
    { style: "currency", currency: "USD" }
  ).format(value / 100);
function publicError(reason: unknown, fallback: string) {
  return reason instanceof CrmApiError && reason.status === 404
    ? fallback
    : reason instanceof Error
      ? reason.message
      : fallback;
}
