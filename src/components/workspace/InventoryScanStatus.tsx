import type { Job } from "@shared/crm";
import { inventoryScanSummary } from "@shared/inventory-scan";

/**
 * Job-sheet box reconciliation. Origin = boxes loaded at pickup, destination = boxes
 * unloaded at delivery; anything loaded but not delivered is called out by label code.
 */
export default function InventoryScanStatus({ job }: { job: Job }) {
  const summary = inventoryScanSummary(job);
  if (!summary.total) return null;
  const missing = summary.missingDestination;

  return (
    <section className="ws-card ws-card-pad" data-tour="inventory-scans">
      <div className="ws-card-title">
        <div>
          <h2>Box scan reconciliation</h2>
          <p>QR labels scanned at pickup and delivery for this move.</p>
        </div>
        <span className="ws-chip">
          {summary.complete ? "All boxes delivered" : `${missing.length} missing`}
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-border p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Boxes</p>
          <p className="text-xl font-semibold tabular-nums">{summary.total}</p>
        </div>
        <div className="rounded-xl border border-border p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Loaded at pickup</p>
          <p className="text-xl font-semibold tabular-nums">{summary.originCount}</p>
        </div>
        <div className="rounded-xl border border-border p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Delivered</p>
          <p className="text-xl font-semibold tabular-nums">{summary.destinationCount}</p>
        </div>
      </div>

      {missing.length ? (
        <div
          className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm"
          role="alert"
        >
          <b>Missing at delivery ({missing.length})</b>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {missing.map((label) => (
              <li
                key={label.code}
                className="rounded-full border border-amber-300 px-2 py-0.5 text-xs"
              >
                {label.code} · {label.name}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="ws-helper mt-3">Every loaded box has a delivery scan.</p>
      )}

      {summary.missingOrigin.length > 0 && (
        <p className="ws-helper mt-2">
          {summary.missingOrigin.length} box{summary.missingOrigin.length === 1 ? "" : "es"} not
          scanned onto the truck yet.
        </p>
      )}
    </section>
  );
}
