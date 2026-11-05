import { FileText, Printer, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import type { Job } from "@shared/crm";
import type { ModuleProps } from "@shared/expansion";
import { crm } from "@/lib/crm";
import { getLocale, useI18n } from "@/lib/i18n";
import {
  ErrorNotice,
  LoadingBlock,
  useRemote,
} from "@/components/workspace/WorkspaceUI";
import { ops, type BolDocument } from "@/lib/ops-api";
import {
  bolRoles,
  canAccess,
  jobLabel,
  PageHead,
  PermissionNotice,
  shortDate,
} from "./operations-common";

const jobFromPath = (path: string) => {
  const match = /^\/app\/jobs\/(\d+)\/bol\/?$/.exec(path);
  return match ? Number(match[1]) : null;
};
export function BolPage({ role, path }: ModuleProps) {
  const { t } = useI18n();
  if (!canAccess(role, bolRoles))
    return (
      <>
        <PageHead
          heading="Bill of lading"
          caption="Printable moving record for an authorized job."
        />
        <PermissionNotice roles={bolRoles} />
      </>
    );
  return <BolContent path={path} />;
}
function BolContent({ path }: { path: string }) {
  const { t } = useI18n();
  const exact = jobFromPath(path);
  const [selected, setSelected] = useState<number | null>(exact);
  useEffect(() => setSelected(exact), [exact]);
  const jobs = useRemote(() => crm.jobs(), []);
  const document = useRemote(
    () => (selected ? ops.bol(selected) : Promise.resolve(null)),
    [selected]
  );
  if (jobs.loading || (selected !== null && document.loading))
    return <LoadingBlock label={t("Loading bill of lading…")} />;
  if (jobs.error)
    return (
      <>
        <PageHead
          heading="Bill of lading"
          caption="Printable moving record for an authorized job."
        />
        <ErrorNotice error={jobs.error} retry={() => void jobs.refresh()} />
      </>
    );
  if (!exact)
    return (
      <div className="ops">
        <PageHead
          heading="Bill of lading"
          caption="Choose an existing job to generate a printable record."
        />
        <section className="ws-card ws-card-pad">
          <label className="ws-field">
            <span>{t("Job")}</span>
            <select
              className="ws-select"
              value={selected ?? ""}
              onChange={e =>
                setSelected(e.target.value ? Number(e.target.value) : null)
              }
            >
              <option value="">{t("Choose a job")}</option>
              {(jobs.data || []).map(job => (
                <option key={job.id} value={job.id}>
                  {jobLabel(job)}
                </option>
              ))}
            </select>
          </label>
          {selected && Boolean(document.error) && (
            <ErrorNotice
              error={document.error}
              retry={() => void document.refresh()}
            />
          )}{" "}
          {document.data && (
            <BolDocumentView
              data={document.data}
              onRefresh={document.refresh}
            />
          )}
        </section>
      </div>
    );
  if (document.error || !document.data)
    return (
      <>
        <PageHead
          heading="Bill of lading"
          caption="Printable moving record for an authorized job."
        />
        <ErrorNotice
          error={document.error}
          retry={() => void document.refresh()}
        />
      </>
    );
  return (
    <div className="ops">
      <PageHead
        heading="Bill of lading"
        caption="Printable moving record loaded from the authorized job."
        actions={
          <div className="ops-no-print ws-row-actions">
            <button className="ws-btn" onClick={() => void document.refresh()}>
              <RefreshCw size={14} />
              {t("Refresh")}
            </button>
            <button className="ws-btn primary" onClick={() => window.print()}>
              <Printer size={15} />
              {t("Print")}
            </button>
          </div>
        }
      />
      <BolDocumentView data={document.data} onRefresh={document.refresh} />
    </div>
  );
}
const string = (value: unknown) => (typeof value === "string" ? value : "");
const value = (row: Record<string, unknown>, key: string) => string(row[key]);
function SignatureEvidence({
  label,
  signature,
}: {
  label: string;
  signature: unknown;
}) {
  const { t } = useI18n();
  const source = string(signature);
  const image = /^(data:image\/(png|jpeg|jpg|webp);base64,|https:\/\/)/i.test(
    source
  )
    ? source
    : "";
  return (
    <div className="ops-signature-label">
      <b>{t(label)}</b>
      {image ? (
        <img
          className="ops-signature-image"
          src={image}
          alt={t("Saved signature")}
        />
      ) : (
        <span>{source ? t("On file") : t("Not on file")}</span>
      )}
    </div>
  );
}
function BolDocumentView({
  data,
  onRefresh,
}: {
  data: BolDocument;
  onRefresh: () => Promise<void>;
}) {
  const { t } = useI18n();
  const job = data.job,
    customer = data.customer,
    company = data.company;
  const generated = new Date(data.generatedAt);
  const date = Number.isNaN(generated.getTime())
    ? data.generatedAt
    : new Intl.DateTimeFormat(getLocale(), {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(generated);
  const inventory = Array.isArray(job.inventory)
    ? (job.inventory as Array<Record<string, unknown>>)
    : [];
  return (
    <article className="ws-card ws-card-pad ops-print-doc">
      <header className="ops-print-doc__head">
        <div>
          <span className="ws-eyebrow">{t("Moving record")}</span>
          <h2>{t("Bill of lading")}</h2>
          <p>{value(company, "name")}</p>
          {value(company, "phone") && <p>{value(company, "phone")}</p>}
        </div>
        <div>
          <span className="ops-stamp">{t("Generated record")}</span>
          <p>
            {t("Job")} #{String(job.id || "")}
          </p>
          <p>{date}</p>
        </div>
      </header>
      <p className="ops-legal-note">
        {t(
          "Recordkeeping only. This generated moving record is not legal certification and does not replace any required local documents."
        )}
      </p>
      <div className="ops-print-grid">
        <section>
          <h3>{t("Customer")}</h3>
          <p>
            <b>{value(customer, "name") || value(job, "customerName")}</b>
          </p>
          <p>{value(customer, "email")}</p>
          <p>{value(customer, "phone")}</p>
          <p>{value(customer, "address")}</p>
        </section>
        <section>
          <h3>{t("Move details")}</h3>
          <p>
            <b>{value(job, "title")}</b>
          </p>
          <p>{shortDate(value(job, "moveDate"))}</p>
          <p>
            {t("Pickup")}: {value(job, "origin")}
          </p>
          <p>
            {t("Delivery")}: {value(job, "destination")}
          </p>
          <p>
            {t("Truck")}: {value(job, "truckName")}
          </p>
        </section>
      </div>
      <section>
        <h3>{t("Inventory")}</h3>
        {inventory.length ? (
          <div className="ws-table-wrap">
            <table className="ws-table">
              <thead>
                <tr>
                  <th>{t("Item")}</th>
                  <th>{t("Quantity")}</th>
                  <th>{t("Cubic feet")}</th>
                  <th>{t("Weight (lb)")}</th>
                </tr>
              </thead>
              <tbody>
                {inventory.map((item, index) => (
                  <tr key={index}>
                    <td>{value(item, "name")}</td>
                    <td>{String(item.quantity ?? "")}</td>
                    <td>{String(item.cuft ?? "")}</td>
                    <td>{String(item.weight ?? "")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>{t("No inventory is saved for this job.")}</p>
        )}
      </section>
      <section>
        <h3>{t("Condition and damage notes")}</h3>
        {data.damages.length ? (
          <div className="ops-timeline">
            {data.damages.map((damage, index) => (
              <div
                className="ops-timeline__row"
                key={String(damage.id ?? index)}
              >
                {value(damage, "notes") || value(damage, "note")}
                <small>{value(damage, "phase")}</small>
              </div>
            ))}
          </div>
        ) : (
          <p>{t("No damage entries are saved for this job.")}</p>
        )}
      </section>
      <section>
        <h3>{t("Terms and notes")}</h3>
        <p>{t(data.terms)}</p>
        <p>{value(job, "originNotes")}</p>
        <p>{value(job, "destinationNotes")}</p>
      </section>
      <div className="ops-signatures">
        <SignatureEvidence
          label="Customer signature"
          signature={job.signature}
        />
        <SignatureEvidence
          label="Completion signature"
          signature={job.completedSignature}
        />
      </div>
    </article>
  );
}
