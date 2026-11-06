import { useCallback, useEffect, useState } from "react";
import { Check, FileText, Loader2, PenLine, RefreshCw } from "lucide-react";
import type { Job } from "@shared/crm";
import type { ModuleProps } from "@shared/expansion";
import type { BolDocument, BolRole } from "@shared/bol";
import { crm } from "@/lib/crm";
import { getLocale } from "@/lib/i18n";
import { ErrorNotice, LoadingBlock } from "@/components/workspace/WorkspaceUI";
import SignaturePad from "@/components/workspace/SignaturePad";
import { ops } from "@/lib/ops-api";
import { bolRoles, canAccess, jobLabel, PageHead, PermissionNotice, shortDate } from "./operations-common";

const jobFromPath = (path: string) => {
  const match = /^\/app\/jobs\/(\d+)\/bol\/?$/.exec(path);
  return match ? Number(match[1]) : null;
};
const text = (value: unknown) => (typeof value === "string" ? value : "");
const money = (cents: number) =>
  new Intl.NumberFormat(getLocale(), { style: "currency", currency: "USD" }).format(cents / 100);

export function BolPage({ role, path }: ModuleProps) {
  if (!canAccess(role, bolRoles))
    return (
      <>
        <PageHead heading="Bill of lading" caption="Printable moving record for an authorized job." />
        <PermissionNotice roles={bolRoles} />
      </>
    );
  return <BolContent path={path} canSign={["admin", "office_admin", "dispatcher", "crew"].includes(role)} />;
}

function BolContent({ path, canSign }: { path: string; canSign: boolean }) {
  const exact = jobFromPath(path);
  const [selected, setSelected] = useState<number | null>(exact);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [document, setDocument] = useState<BolDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => setSelected(exact), [exact]);

  const load = useCallback(async () => {
    if (!selected) {
      setDocument(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setDocument(await ops.bol(selected));
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load the bill of lading.");
    } finally {
      setLoading(false);
    }
  }, [selected]);

  useEffect(() => {
    void crm.jobs().then(setJobs).catch(() => setJobs([]));
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const sign = async (role: BolRole, signature: string, signerName: string) => {
    if (!selected) return;
    setBusy(true);
    try {
      setDocument(await ops.signBol(selected, { role, signature, signerName }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the signature.");
    } finally {
      setBusy(false);
    }
  };

  if (!exact)
    return (
      <div className="ops">
        <PageHead heading="Bill of lading" caption="Choose an existing job to generate a compliant record." />
        <section className="ws-card ws-card-pad">
          <label className="ws-field">
            <span>Job</span>
            <select className="ws-select" value={selected ?? ""} onChange={(event) => setSelected(event.target.value ? Number(event.target.value) : null)}>
              <option value="">Choose a job</option>
              {jobs.map((job) => <option key={job.id} value={job.id}>{jobLabel(job)}</option>)}
            </select>
          </label>
          {loading && selected && <LoadingBlock label="Loading bill of lading…" />}
          {error && <ErrorNotice error={new Error(error)} retry={() => void load()} />}
          {document && <BolDocumentView data={document} canSign={canSign} busy={busy} onSign={sign} onRefresh={load} />}
        </section>
      </div>
    );

  if (loading) return <LoadingBlock label="Loading bill of lading…" />;
  if (error || !document)
    return (
      <>
        <PageHead heading="Bill of lading" caption="Printable moving record for an authorized job." />
        <ErrorNotice error={new Error(error || "Bill of lading not found")} retry={() => void load()} />
      </>
    );
  return (
    <div className="ops">
      <PageHead
        heading="Bill of lading"
        caption="Signed legal record for this job, with declared valuation and final pricing."
        actions={
          <div className="ops-no-print ws-row-actions">
            <button className="ws-btn" onClick={() => void load()} disabled={busy}>
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
        }
      />
      <BolDocumentView data={document} canSign={canSign} busy={busy} onSign={sign} onRefresh={load} />
    </div>
  );
}

function BolSignoff({
  role,
  existing,
  busy,
  onSign,
}: {
  role: BolRole;
  existing: BolDocument["signatures"]["origin"];
  busy: boolean;
  onSign: (role: BolRole, signature: string, signerName: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [ack, setAck] = useState(false);
  const label = role === "origin" ? "Origin pickup sign-off" : "Destination delivery sign-off";
  if (existing)
    return (
      <div className="rounded-xl border border-border p-3" data-tour={`bol-${role}-signoff`}>
        <b className="flex items-center gap-1 text-sm"><Check size={14} /> {label}</b>
        <p className="text-xs text-muted-foreground">{existing.signerName || "Customer"} · {existing.signedAt ? new Date(existing.signedAt).toLocaleString() : "Signed"}</p>
        <img src={existing.signature} alt={label} className="mt-2 h-24 w-full rounded border border-border object-contain" />
      </div>
    );
  return (
    <div className="rounded-xl border border-border p-3 space-y-2" data-tour={`bol-${role}-signoff`}>
      <b className="flex items-center gap-1 text-sm"><PenLine size={14} /> {label}</b>
      <label className="block text-sm">
        Signer name
        <input className="ws-input" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} placeholder="Customer name" />
      </label>
      <SignaturePad onChange={setSignature} label={`Sign ${label.toLowerCase()}`} disabled={busy} />
      <label className="flex items-start gap-2 text-xs">
        <input type="checkbox" checked={ack} onChange={(event) => setAck(event.target.checked)} />
        I reviewed the shipment, declared valuation, final pricing and contract terms for this {role}.
      </label>
      <button
        className="ws-btn primary"
        disabled={!signature || !name.trim() || !ack || busy}
        onClick={() => signature && void onSign(role, signature, name.trim())}
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Sign &amp; generate PDF
      </button>
    </div>
  );
}

function BolDocumentView({
  data,
  canSign,
  busy,
  onSign,
  onRefresh,
}: {
  data: BolDocument;
  canSign: boolean;
  busy: boolean;
  onSign: (role: BolRole, signature: string, signerName: string) => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const job = data.job;
  const generated = new Date(data.generatedAt);
  const date = Number.isNaN(generated.getTime()) ? data.generatedAt : generated.toLocaleString();
  return (
    <article className="ws-card ws-card-pad ops-print-doc space-y-4" data-tour="bol-document">
      <header className="ops-print-doc__head">
        <div>
          <span className="ws-eyebrow">Legal moving record</span>
          <h2>Bill of Lading</h2>
          <p>{text(job["companyName"]) || "MoveFlew"}</p>
        </div>
        <div>
          <span className="ops-stamp">{data.pdf ? "Signed PDF attached" : "Draft — signatures pending"}</span>
          <p>Job #{String(job["id"] ?? "")}</p>
          <p>{date}</p>
        </div>
      </header>

      <div className="ops-print-grid">
        <section>
          <h3>Customer</h3>
          <p><b>{text(job["customerName"]) || text(job["title"])}</b></p>
          <p>{text(job["customerEmail"])}</p>
          <p>{text(job["customerPhone"])}</p>
        </section>
        <section>
          <h3>Move details</h3>
          <p><b>{text(job["title"])}</b></p>
          <p>{shortDate(text(job["moveDate"]))}</p>
          <p>Pickup: {text(job["origin"])}</p>
          <p>Delivery: {text(job["destination"])}</p>
        </section>
      </div>

      <section>
        <h3>Contract terms</h3>
        <p className="ops-legal-note">{data.terms}</p>
      </section>

      <section>
        <h3>Itemised declared valuation</h3>
        {data.valuation.lines.length === 0 ? <p>No shipment inventory is saved for this job.</p> : (
          <div className="ws-table-wrap">
            <table className="ws-table">
              <thead><tr><th>Item</th><th>Qty</th><th>Weight (lb)</th><th>Declared value</th></tr></thead>
              <tbody>
                {data.valuation.lines.map((item, index) => (
                  <tr key={`${item.name}-${index}`}>
                    <td>{item.name}</td><td>{item.quantity}</td><td>{item.weight}</td><td>{money(item.totalCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-sm font-medium">Total declared: {money(data.valuation.totalCents)}{!data.valuation.declared && " (no value declared)"}</p>
      </section>

      <section>
        <h3>Final pricing</h3>
        <dl className="grid gap-1 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">Estimated charges</dt><dd>{money(data.pricing.estimatedCents)}</dd></div>
          <div><dt className="text-muted-foreground">Fees</dt><dd>{money(data.pricing.feesCents)}</dd></div>
          <div><dt className="text-muted-foreground">Discount</dt><dd>{money(data.pricing.discountCents)}</dd></div>
          <div><dt className="text-muted-foreground">Surge</dt><dd>{money(data.pricing.surgeCents)}</dd></div>
          <div><dt className="font-medium">Final amount</dt><dd className="font-bold">{money(data.pricing.finalCents)}</dd></div>
          <div><dt className="text-muted-foreground">Balance due</dt><dd>{money(data.pricing.balanceCents)}</dd></div>
        </dl>
      </section>

      <section className="space-y-2">
        <h3>Pickup and delivery sign-offs</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <BolSignoff role="origin" existing={data.signatures.origin} busy={busy} onSign={onSign} />
          <BolSignoff role="delivery" existing={data.signatures.delivery} busy={busy} onSign={onSign} />
        </div>
        {!canSign && <p className="text-sm text-muted-foreground">Only dispatch and crew can add signatures.</p>}
        {data.pdf && <p className="flex items-center gap-1 text-xs text-muted-foreground"><FileText size={13} /> Signed PDF attached to this job’s documents.</p>}
      </section>
      <div className="ops-no-print" data-tour="bol-pdf">
        <button className="ws-btn" onClick={() => void onRefresh()}><RefreshCw size={14} /> Reload signed record</button>
      </div>
    </article>
  );
}
