import { Copy, MessageSquareHeart, Play, Plus, Star } from "lucide-react";
import { useState } from "react";
import type { ModuleProps, ReviewRequest } from "@shared/expansion";
import { crm } from "@/lib/crm";
import { useI18n } from "@/lib/i18n";
import { EmptyState, Modal, useRemote } from "@/components/workspace/WorkspaceUI";
import { engage } from "@/lib/engage-api";
import {
  CopyButton,
  PageFailure,
  PageHead,
  PageLoading,
  PermissionNotice,
  StatusChip,
  canSales,
  formatDate,
} from "./EngagementUI";

type CreatedReview = { token: string; url: string; customerName: string };

export function ReviewsPage({ role }: ModuleProps) {
  const { t } = useI18n();
  const { data, loading, error, refresh } = useRemote(
    () => Promise.all([engage.reviews(), crm.customers(), crm.jobs()]),
    [],
  );
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<CreatedReview | null>(null);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState("");
  const allowed = canSales(role);
  if (loading) return <PageLoading label="Loading private feedback records…" />;
  if (error || !data)
    return (
      <PageFailure
        heading="Reviews"
        caption="Private feedback requests, escalations and review score metrics."
        error={error}
        retry={() => void refresh()}
      />
    );
  const [overview, customers, jobs] = data;
  const { reviews, metrics } = overview;
  const resolveEscalation = async (id: number) => {
    try {
      await engage.resolveReview(id);
      await refresh();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Could not resolve the escalation.");
    }
  };
  const runDispatch = async () => {
    setRunning(true);
    setNotice("");
    try {
      const result = (await engage.runReviews()) as {
        created?: unknown[];
        sent?: number;
        blocked?: number;
        failed?: number;
        skipped?: number;
      };
      setNotice(
        `Completed-job sweep finished: ${result.created?.length ?? 0} new requests, ${result.sent ?? 0} accepted, ${result.blocked ?? 0} blocked, ${result.failed ?? 0} failed, ${result.skipped ?? 0} already requested.`,
      );
      await refresh();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Could not run review dispatch.");
    } finally {
      setRunning(false);
    }
  };
  return (
    <>
      <PageHead
        heading="Reviews"
        caption="Completed moves receive a private 1–5 rating link. Five-star customers may optionally continue to Google; lower ratings stay private and alert the office."
        actions={
          allowed ? (
            <>
              <button className="ws-btn" disabled={running} onClick={() => void runDispatch()}>
                <Play size={15} /> {t(running ? "Checking…" : "Run completed-job requests")}
              </button>
              <button className="ws-btn primary" onClick={() => setOpen(true)}>
                <Plus size={15} /> {t("Create feedback request")}
              </button>
            </>
          ) : undefined
        }
      />
      {!allowed && <PermissionNotice />}
      {notice && <div className={notice.includes("failed") || notice.includes("blocked") ? "ws-alert" : "eg-success"}>{t(notice)}</div>}
      <div className="ws-stat-grid">
        <ReviewStat label={t("Average rating")} value={metrics.average === null ? "—" : `${metrics.average}/5`} hint={`${metrics.responded} of ${metrics.requested} responded`} />
        <ReviewStat label={t("Response rate")} value={`${metrics.responseRate}%`} hint={t("Returned ratings over requests")} />
        <ReviewStat label={t("Five-star")} value={String(metrics.fiveStar)} hint={t("Optional Google redirect offered")} />
        <ReviewStat label={t("Open escalations")} value={String(metrics.openEscalations)} hint={t("Ratings 1–4 awaiting manager follow-up")} />
      </div>
      <p className="eg-disclaimer">
        {t("Every rating is saved privately. A five-star response offers the company's Google Business page; ratings below five never receive that redirect and create an internal escalation instead.")}
      </p>
      <section className="ws-card ws-card-pad">
        <div className="ws-card-title">
          <div>
            <h2>{t("Feedback requests")}</h2>
            <p>{t("Provider-accepted, blocked and failed deliveries are shown exactly as recorded by the server.")}</p>
          </div>
        </div>
        <div className="ws-table-wrap">
          <table className="ws-table">
            <thead>
              <tr>
                <th>{t("Customer")}</th>
                <th>{t("Status")}</th>
                <th>{t("Rating")}</th>
                <th>{t("Feedback")}</th>
                <th>{t("Channel")}</th>
                <th>{t("Created")}</th>
                <th>{t("Private link")}</th>
              </tr>
            </thead>
            <tbody>
              {reviews.map(review => (
                <ReviewRow key={review.id} review={review} onResolve={resolveEscalation} />
              ))}
            </tbody>
          </table>
        </div>
        {!reviews.length && (
          <EmptyState
            title="No feedback requests"
            detail="Close a job through its final stage to create an automatic review request, or create a one-time private link manually."
            action={
              allowed ? (
                <button
                  className="ws-btn primary"
                  onClick={() => setOpen(true)}
                >
                  {t("Create feedback request")}
                </button>
              ) : undefined
            }
          />
        )}
      </section>
      {open && (
        <CreateReview
          customers={customers}
          jobs={jobs}
          onClose={() => setOpen(false)}
          onCreated={async value => {
            setOpen(false);
            setCreated(value);
            await refresh();
          }}
        />
      )}
      {created && (
        <Modal title="Private feedback link created" onClose={() => setCreated(null)}>
          <div className="ws-modal__body">
            <div className="eg-success">
              <MessageSquareHeart size={17} />
              {t("A private feedback link was created for {customer}. It has not been sent.", {
                customer: created.customerName,
              })}
            </div>
            <p>{t("Copy and share this one-time token link through your approved process. The token will not be shown again after this dialog closes.")}</p>
            <code className="eg-token">{created.url}</code>
          </div>
          <footer className="ws-modal__foot">
            <CopyButton value={created.url} label="Copy link" />
            <button className="ws-btn primary" onClick={() => setCreated(null)}>
              {t("Done")}
            </button>
          </footer>
        </Modal>
      )}
    </>
  );
}

function ReviewStat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="ws-card ws-card-pad">
      <span className="eg-muted">{label}</span>
      <strong style={{ display: "block", fontSize: 24, marginTop: 6 }}>{value}</strong>
      <small className="eg-muted">{hint}</small>
    </div>
  );
}

function ReviewRow({
  review,
  onResolve,
}: {
  review: ReviewRequest;
  onResolve: (id: number) => void;
}) {
  const { t } = useI18n();
  return (
    <tr>
      <td className="ws-table-main">{review.customerName}</td>
      <td>
        <StatusChip status={review.status} />
        {review.escalated && review.status !== "resolved" && (
          <button className="ws-btn" onClick={() => onResolve(review.id)}>
            {t("Resolve escalation")}
          </button>
        )}
      </td>
      <td>
        {review.rating === null ? (
          "—"
        ) : (
          <span className="eg-rating">
            <Star size={14} fill="currentColor" /> {review.rating}/5
          </span>
        )}
      </td>
      <td className="eg-feedback-cell">{review.feedback || "—"}</td>
      <td>
        {review.channel || "—"}
        {review.deliveryStatus && <small className="eg-muted"> · {review.deliveryStatus}</small>}
      </td>
      <td>{formatDate(review.createdAt)}</td>
      <td>
        {review.publicReviewUrl ? (
          <a className="ws-btn" href={review.publicReviewUrl} target="_blank" rel="noreferrer">
            {t("Open link")}
          </a>
        ) : (
          "—"
        )}
      </td>
    </tr>
  );
}

function CreateReview({
  customers,
  jobs,
  onClose,
  onCreated,
}: {
  customers: Awaited<ReturnType<typeof crm.customers>>;
  jobs: Awaited<ReturnType<typeof crm.jobs>>;
  onClose: () => void;
  onCreated: (value: CreatedReview) => Promise<void>;
}) {
  const { t } = useI18n();
  const [customerId, setCustomerId] = useState("");
  const [jobId, setJobId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const relevantJobs = jobs.filter(job => !customerId || job.customerId === Number(customerId));
  return (
    <Modal title="Create private feedback request" onClose={onClose}>
      <form
        onSubmit={async event => {
          event.preventDefault();
          setSaving(true);
          setError("");
          try {
            const result = await engage.createReview({
              customerId: Number(customerId),
              jobId: jobId ? Number(jobId) : undefined,
            });
            if (!result.token)
              throw new Error("The request was saved, but a one-time feedback token was not returned.");
            const customer = customers.find(item => item.id === Number(customerId));
            await onCreated({
              token: result.token,
              url: `${window.location.origin}${result.url ?? `/review/${result.token}`}`,
              customerName: customer?.name || "",
            });
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Could not create this feedback request.");
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="ws-modal__body">
          <p>{t("This creates a neutral private feedback access link. It does not send an email, SMS, or public review request.")}</p>
          <div className="ws-form-grid">
            <label>
              {t("Customer")}
              <select
                className="ws-select"
                required
                value={customerId}
                onChange={event => {
                  setCustomerId(event.target.value);
                  setJobId("");
                }}
              >
                <option value="">{t("Choose saved customer")}</option>
                {customers.map(customer => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("Related job (optional)")}
              <select className="ws-select" value={jobId} onChange={event => setJobId(event.target.value)}>
                <option value="">{t("No related job")}</option>
                {relevantJobs.map(job => (
                  <option key={job.id} value={job.id}>
                    {job.title || `Job #${job.id}`}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {error && <div className="ws-error">{t(error)}</div>}
        </div>
        <footer className="ws-modal__foot">
          <button type="button" className="ws-btn" onClick={onClose}>
            {t("Cancel")}
          </button>
          <button className="ws-btn primary" disabled={saving || !customerId}>
            <Copy size={14} />
            {t(saving ? "Creating…" : "Create private link")}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

export default ReviewsPage;
