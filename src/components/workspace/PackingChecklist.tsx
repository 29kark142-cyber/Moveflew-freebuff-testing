import type { Job } from "@shared/crm";
import { packingLines, packingSubtotal, isPackingEmpty } from "@shared/packing";

const money = (cents: number) =>
  (Number(cents) || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });

/**
 * Crew-facing packing list generated from the customer's quote selection. Quantities come
 * from the saved job, never from local state, so the crew and the invoice agree.
 */
export default function PackingChecklist({ job }: { job: Job }) {
  const lines = packingLines(job.packingSelection ?? { materials: {}, services: [] });
  const materials = lines.filter((line) => line.kind === "material");
  const services = lines.filter((line) => line.kind === "service");
  const subtotal = packingSubtotal(job.packingSelection ?? { materials: {}, services: [] });

  return (
    <section className="ws-card ws-card-pad" data-tour="packing-checklist">
      <div className="ws-card-title">
        <div>
          <h2>Packing &amp; materials checklist</h2>
          <p>Added by the customer on the quote and saved to this move.</p>
        </div>
        <span className="ws-chip">
          {isPackingEmpty(job.packingSelection ?? { materials: {}, services: [] })
            ? "None"
            : money(subtotal)}
        </span>
      </div>

      {!lines.length ? (
        <p className="ws-helper">
          No packing supplies or add-ons were purchased on this quote. Confirm with the office
          before the crew packs.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <b className="text-sm">Supplies</b>
            {materials.length ? (
              <ul className="mt-2 space-y-1 text-sm">
                {materials.map((line) => (
                  <li key={line.id} className="flex items-center justify-between gap-2">
                    <span>
                      {line.label} <span className="text-muted-foreground">× {line.quantity}</span>
                    </span>
                    <span className="tabular-nums">{money(line.amountCents)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">No supplies purchased.</p>
            )}
          </div>
          <div>
            <b className="text-sm">Add-on services</b>
            {services.length ? (
              <ul className="mt-2 space-y-1 text-sm">
                {services.map((line) => (
                  <li key={line.id} className="flex items-center justify-between gap-2">
                    <span>{line.label}</span>
                    <span className="tabular-nums">{money(line.amountCents)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">No add-on services purchased.</p>
            )}
          </div>
        </div>
      )}

      <p className="ws-helper mt-3">
        Charges are included in the quote total and the deposit; the signed bill of lading remains
        the final authority on move-day charges.
      </p>
    </section>
  );
}
