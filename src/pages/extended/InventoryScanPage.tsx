import { useCallback, useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Camera, Printer, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { InventoryEntry } from "@shared/crm";
import type { ModuleProps } from "@shared/expansion";
import {
  inventoryLabels,
  inventoryScanSummary,
  inventoryScans,
  type InventoryScanPhase,
} from "@shared/inventory-scan";
import { crmFetch } from "@/lib/crm";
import CameraScanner from "@/components/workspace/CameraScanner";
import { EmptyRows, PageHead } from "./operations-common";
import "./inventory-scan.css";

type ScanJob = {
  id: number;
  title?: string;
  customerName?: string;
  moveDate?: string;
  status?: string;
  inventory?: InventoryEntry[];
  inventoryScans?: unknown;
};

type FieldPayload = { me: { id: number; name: string } | null; jobs: ScanJob[] };
const officeRoles = new Set(["admin", "office_admin", "dispatcher"]);
const LABEL_PREVIEW = 120;

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
};

const time = (value: string) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : "—";
};

/**
 * Office label desk + crew scanning screen. Labels are generated per physical box from the
 * saved move inventory; scans are stored on the job so the job sheet can reconcile counts.
 */
export default function InventoryScanPage({ role }: ModuleProps) {
  const office = officeRoles.has(role);
  const [date, setDate] = useState(today);
  const [data, setData] = useState<FieldPayload | null>(null);
  const [jobId, setJobId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState<InventoryScanPhase>("origin");
  const [scanOpen, setScanOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [qr, setQr] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await crmFetch<FieldPayload>(`/field/jobs?date=${date}`);
      setData(result);
      setJobId((current) =>
        result.jobs.some((job) => job.id === current) ? current : (result.jobs[0]?.id ?? null),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load today's jobs.");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  const job = data?.jobs.find((entry) => entry.id === jobId) ?? null;
  const summary = job ? inventoryScanSummary(job) : null;
  const recent = job ? inventoryScans(job.inventoryScans).slice(0, 8) : [];
  const labels = useMemo(
    () => (job && office ? inventoryLabels(job).slice(0, LABEL_PREVIEW) : []),
    [job, office],
  );

  useEffect(() => {
    let cancelled = false;
    if (!labels.length) {
      setQr({});
      return;
    }
    setQr({});
    void Promise.all(
      labels.map(async (label) => {
        const url = await QRCode.toDataURL(label.code, {
          width: 220,
          margin: 2,
          errorCorrectionLevel: "M",
        });
        return [label.code, url] as const;
      }),
    )
      .then((entries) => {
        if (!cancelled) setQr(Object.fromEntries(entries));
      })
      .catch(() => {
        if (!cancelled) setQr({});
      });
    return () => {
      cancelled = true;
    };
  }, [labels]);

  const submitScan = async (value: string) => {
    if (!job) return;
    const code = value.trim().toUpperCase();
    if (!code.startsWith("INV-")) {
      toast.error("That code is not a MoveFlew box label.");
      return;
    }
    setSaving(true);
    try {
      const saved = await crmFetch<ScanJob>(`/field/jobs/${job.id}/scans`, {
        method: "POST",
        body: JSON.stringify({ code, phase, operationId: crypto.randomUUID() }),
      });
      setData((current) =>
        current
          ? {
              ...current,
              jobs: current.jobs.map((entry) => (entry.id === saved.id ? saved : entry)),
            }
          : current,
      );
      toast.success(phase === "origin" ? "Loaded on truck" : "Unloaded at destination");
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not save this scan.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ops" data-tour="inventory-page">
      <PageHead
        heading="Box inventory scanning"
        caption="Print a unique QR label for each box, then scan boxes onto the truck and at delivery. The job sheet flags anything missing."
        actions={
          <button className="ws-btn" onClick={() => void load()}>
            <RefreshCw size={14} /> Refresh
          </button>
        }
      />

      <div className="ws-card ws-card-pad space-y-3" data-tour="inventory-scan">
        <div className="flex flex-wrap items-end gap-3">
          <label className="ws-field">
            <span>Move date</span>
            <input
              className="ws-input"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          <label className="ws-field" style={{ minWidth: 240 }}>
            <span>Active job</span>
            <select
              className="ws-select"
              value={jobId ?? ""}
              onChange={(event) => setJobId(event.target.value ? Number(event.target.value) : null)}
            >
              {(data?.jobs ?? []).map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.title || entry.customerName || `Job #${entry.id}`} · #{entry.id}
                </option>
              ))}
            </select>
          </label>
        </div>

        {loading ? (
          <p className="ws-helper">Loading jobs…</p>
        ) : error ? (
          <p className="ws-helper text-destructive" role="alert">
            {error}
          </p>
        ) : !job ? (
          <EmptyRows
            title="No jobs on this date"
            detail="Choose another date or assign a crew to the move."
          />
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-4">
              {[
                { label: "Boxes", value: summary?.total ?? 0 },
                { label: "Loaded", value: summary?.originCount ?? 0 },
                { label: "Delivered", value: summary?.destinationCount ?? 0 },
                { label: "Missing", value: summary?.missingDestination.length ?? 0 },
              ].map((card) => (
                <div key={card.label} className="rounded-xl border border-border p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {card.label}
                  </p>
                  <p className="text-2xl font-semibold tabular-nums">{card.value}</p>
                </div>
              ))}
            </div>

            {(summary?.missingDestination.length ?? 0) > 0 && (
              <div
                className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm"
                role="alert"
              >
                <b>Missing at delivery:</b>{" "}
                {summary?.missingDestination.map((label) => label.code).join(", ")}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={`ws-btn${phase === "origin" ? " primary" : ""}`}
                onClick={() => setPhase("origin")}
                aria-pressed={phase === "origin"}
              >
                Loaded on truck
              </button>
              <button
                type="button"
                className={`ws-btn${phase === "destination" ? " primary" : ""}`}
                onClick={() => setPhase("destination")}
                aria-pressed={phase === "destination"}
              >
                Unloaded at destination
              </button>
              <button
                type="button"
                className="ws-btn primary"
                disabled={saving}
                onClick={() => setScanOpen(true)}
              >
                <Camera size={15} /> {saving ? "Saving…" : "Scan a box label"}
              </button>
            </div>
            <p className="ws-helper">
              Scanning as{" "}
              <b>{phase === "origin" ? "Loaded on truck" : "Unloaded at destination"}</b>. Replaying
              the same label never double-counts.
            </p>

            {recent.length > 0 && (
              <div>
                <b className="text-sm">Recent scans</b>
                <ul className="mt-1 space-y-1 text-sm">
                  {recent.map((entry) => (
                    <li key={`${entry.code}:${entry.phase}`} className="flex justify-between gap-2">
                      <span>
                        {entry.code} · {entry.by || "Crew"}
                      </span>
                      <span className="text-muted-foreground">
                        {entry.phase === "origin" ? "Loaded" : "Delivered"} {time(entry.at)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>

      {job && office && (
        <section className="ws-card ws-card-pad inv-page-tools">
          <div className="ws-card-title">
            <div>
              <h2>QR box labels</h2>
              <p>
                One label per physical box for {job.title || job.customerName || `job #${job.id}`}.
                {summary && summary.total > LABEL_PREVIEW
                  ? ` Showing the first ${LABEL_PREVIEW}.`
                  : ""}
              </p>
            </div>
            <button className="ws-btn" onClick={() => window.print()} disabled={!labels.length}>
              <Printer size={14} /> Print labels
            </button>
          </div>
          {labels.length ? (
            <div className="inv-label-sheet">
              {labels.map((label) => (
                <figure key={label.code} className="inv-label">
                  {qr[label.code] ? (
                    <img src={qr[label.code]} alt={`QR label ${label.code}`} />
                  ) : (
                    <div style={{ height: 120 }} aria-hidden />
                  )}
                  <figcaption>
                    <b>{label.name}</b>
                    <span>{label.code}</span>
                    <span>
                      Box {label.unitIndex + 1} of {label.quantity}
                      {label.room ? ` · ${label.room}` : ""}
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>
          ) : (
            <p className="ws-helper">
              This move has no inventory yet. Add items on the estimate before printing labels.
            </p>
          )}
        </section>
      )}

      <CameraScanner
        open={scanOpen}
        title="Scan a box label"
        hint="Point the camera at the QR label printed for this move."
        manualLabel="Or type the label code"
        manualPlaceholder="INV-42-1-1"
        onClose={() => setScanOpen(false)}
        onResult={(value) => {
          setScanOpen(false);
          void submitScan(value);
        }}
      />
    </div>
  );
}
