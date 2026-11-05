import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Loader2, Plus, ScanLine, Trash2, Warehouse, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import CameraScanner from "@/components/workspace/CameraScanner";
import { crmFetch } from "@/lib/crm";
import { money } from "@shared/crm";
import {
  BILLING_MODES,
  dueForRelease,
  findVaultByTag,
  isBillingMode,
  isVaultStatus,
  monthlyStorageCents,
  nextInvoiceDate,
  nextVaultCode,
  recurringByCustomer,
  storageSummary,
  VAULT_STATUSES,
  vaultStatusLabel,
  vaultUsage,
  type StorageVault,
  type VaultStatus,
} from "@shared/storage-vaults";

const OFFICE = ["admin", "office_admin", "dispatcher"];

const STATUS_TONE: Record<VaultStatus, string> = {
  available: "green",
  occupied: "blue",
  reserved: "orange",
  maintenance: "red",
};

const dollars = (cents: number) => (cents / 100).toFixed(2);
const toCents = (value: string) => Math.max(0, Math.round(Number(value || 0) * 100));

const emptyDraft = (vaults: StorageVault[]) => ({
  code: nextVaultCode(vaults, "A"),
  section: "A",
  squareFeet: "50",
  capacityCuft: "600",
  status: "available" as VaultStatus,
  billingMode: "flat" as StorageVault["billingMode"],
  monthlyRate: "240",
  ratePerSqft: "5",
  invoiceDay: "1",
});

/** Visual warehouse map: vault grid, itemised storage log and recurring billing. */
export default function StorageVaultPage({ role }: { role: string }) {
  const [vaults, setVaults] = useState<StorageVault[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState(() => emptyDraft([]));
  const [adding, setAdding] = useState(false);
  const [edit, setEdit] = useState<StorageVault | null>(null);
  const [itemName, setItemName] = useState("");
  const [itemQty, setItemQty] = useState("1");
  const [itemCuft, setItemCuft] = useState("5");
  // Camera tag scanning: open the scanned vault, or add the scanned tag as inventory.
  const [scanOpen, setScanOpen] = useState(false);
  const [scanMode, setScanMode] = useState<"vault" | "item">("vault");
  const [lastTag, setLastTag] = useState("");
  const [focusItem, setFocusItem] = useState(0);
  const itemInput = useRef<HTMLInputElement>(null);

  const allowed = OFFICE.includes(role);

  const load = useCallback(async () => {
    try {
      const list = await crmFetch<StorageVault[]>("/vaults");
      setVaults(list);
      setError("");
      setDraft((current) => (current.code ? current : emptyDraft(list)));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load storage vaults.");
    }
  }, []);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  const summary = useMemo(() => storageSummary(vaults ?? []), [vaults]);
  const billing = useMemo(() => recurringByCustomer(vaults ?? []), [vaults]);
  const selected = (vaults ?? []).find((vault) => vault.id === selectedId) ?? null;

  useEffect(() => {
    setEdit(selected ? { ...selected, items: selected.items ?? [] } : null);
  }, [selected]);

  const createVault = async () => {
    setBusy(true);
    try {
      const saved = await crmFetch<StorageVault>("/vaults", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: draft.code.trim().toUpperCase(),
          section: draft.section.trim().toUpperCase(),
          squareFeet: Number(draft.squareFeet) || 0,
          capacityCuft: Number(draft.capacityCuft) || 0,
          status: draft.status,
          billingMode: draft.billingMode,
          monthlyRateCents: toCents(draft.monthlyRate),
          ratePerSqftCents: toCents(draft.ratePerSqft),
          invoiceDay: Number(draft.invoiceDay) || 1,
        }),
      });
      toast.success(`Vault ${saved.code} added`);
      setAdding(false);
      await load();
      setDraft(emptyDraft((await crmFetch<StorageVault[]>("/vaults").catch(() => [])) ?? []));
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not add the vault");
    } finally {
      setBusy(false);
    }
  };

  const saveVault = async () => {
    if (!edit) return;
    setBusy(true);
    try {
      const saved = await crmFetch<StorageVault>(`/vaults/${edit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: edit.code.trim().toUpperCase(),
          section: edit.section.trim().toUpperCase(),
          squareFeet: Number(edit.squareFeet) || 0,
          capacityCuft: Number(edit.capacityCuft) || 0,
          status: edit.status,
          billingMode: edit.billingMode,
          monthlyRateCents: Math.round(edit.monthlyRateCents),
          ratePerSqftCents: Math.round(edit.ratePerSqftCents),
          customerId: edit.customerId,
          contactName: edit.contactName,
          contactPhone: edit.contactPhone,
          contactEmail: edit.contactEmail,
          jobId: edit.jobId,
          items: edit.items,
          moveInAt: edit.moveInAt || null,
          moveOutAt: edit.moveOutAt || null,
          invoiceDay: Math.max(1, Math.min(28, Number(edit.invoiceDay) || 1)),
          notes: edit.notes,
        }),
      });
      toast.success(`Vault ${saved.code} saved`);
      await load();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not save the vault");
    } finally {
      setBusy(false);
    }
  };

  const change = (patch: Partial<StorageVault>) =>
    setEdit((current) => (current ? { ...current, ...patch } : current));

  const addItem = () => {
    if (!edit || !itemName.trim()) return;
    change({
      items: [
        ...(edit.items ?? []),
        {
          name: itemName.trim(),
          quantity: Math.max(1, Number(itemQty) || 1),
          cuft: Math.max(0, Number(itemCuft) || 0),
        },
      ],
    });
    setItemName("");
    setItemQty("1");
    setItemCuft("5");
  };

  const applyScan = useCallback(
    (raw: string) => {
      const tag = raw.trim();
      setScanOpen(false);
      if (!tag) return;
      setLastTag(tag);
      if (scanMode === "item" && edit) {
        // Assign the scanned tag straight to the vault that is open.
        change({
          items: [
            ...(edit.items ?? []),
            {
              name: tag.slice(0, 80),
              quantity: 1,
              cuft: Math.max(0, Number(itemCuft) || 0),
            },
          ],
        });
        setItemName(tag.slice(0, 80));
        setFocusItem((count) => count + 1);
        toast.success(`Tag ${tag} added to vault ${edit.code} — save the vault to keep it`);
        return;
      }
      const match = findVaultByTag(vaults ?? [], tag);
      if (!match) {
        toast.error(`No vault matches tag “${tag}”`, {
          description: "Check the label, or add the vault first.",
        });
        return;
      }
      setSelectedId(match.id);
      toast.success(`Vault ${match.code} opened`);
    },
    [edit, itemCuft, scanMode, vaults],
  );

  useEffect(() => {
    if (focusItem) itemInput.current?.focus();
  }, [focusItem]);

  if (!allowed) {
    return (
      <div className="ws-alert" role="alert">
        Storage vaults hold customer belongings and contact details, so this screen is limited to
        office staff.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Storage &amp; warehouse vaults</h1>
          <p className="text-sm text-muted-foreground">
            Vault availability, stored inventory and recurring holding fees.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            className="ws-btn"
            onClick={() => {
              setScanMode("vault");
              setScanOpen(true);
            }}
          >
            <ScanLine size={15} /> Scan Vault Tag
          </Button>
          <Button onClick={() => setAdding((current) => !current)} className="ws-btn primary">
            <Plus size={15} /> Add vault
          </Button>
        </div>
      </header>

      {error && (
        <div className="ws-error" role="alert">
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Vaults", value: String(summary.total) },
          { label: "Occupied", value: String(summary.occupied) },
          { label: "Available", value: String(summary.available) },
          { label: "Monthly storage", value: money(summary.monthlyCents / 100) },
        ].map((metric) => (
          <div className="ws-card ws-card-pad" key={metric.label}>
            <small className="text-xs uppercase tracking-wide text-muted-foreground">
              {metric.label}
            </small>
            <b className="mt-1 block text-2xl">{metric.value}</b>
          </div>
        ))}
      </div>

      {adding && (
        <section className="ws-card ws-card-pad space-y-3">
          <h2 className="font-semibold">New vault</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm">
              Code
              <input
                className="ws-input"
                value={draft.code}
                onChange={(event) => setDraft({ ...draft, code: event.target.value })}
              />
            </label>
            <label className="text-sm">
              Section
              <input
                className="ws-input"
                value={draft.section}
                onChange={(event) => setDraft({ ...draft, section: event.target.value })}
              />
            </label>
            <label className="text-sm">
              Square feet
              <input
                className="ws-input"
                type="number"
                min="0"
                value={draft.squareFeet}
                onChange={(event) => setDraft({ ...draft, squareFeet: event.target.value })}
              />
            </label>
            <label className="text-sm">
              Capacity (ft³)
              <input
                className="ws-input"
                type="number"
                min="0"
                value={draft.capacityCuft}
                onChange={(event) => setDraft({ ...draft, capacityCuft: event.target.value })}
              />
            </label>
            <label className="text-sm">
              Billing
              <select
                className="ws-select"
                value={draft.billingMode}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    billingMode: isBillingMode(event.target.value) ? event.target.value : "flat",
                  })
                }
              >
                {BILLING_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode === "flat" ? "Flat per vault" : "Per square foot"}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Monthly rate ($)
              <input
                className="ws-input"
                type="number"
                min="0"
                step="0.01"
                value={draft.monthlyRate}
                onChange={(event) => setDraft({ ...draft, monthlyRate: event.target.value })}
              />
            </label>
            <label className="text-sm">
              Per sq ft ($)
              <input
                className="ws-input"
                type="number"
                min="0"
                step="0.01"
                value={draft.ratePerSqft}
                onChange={(event) => setDraft({ ...draft, ratePerSqft: event.target.value })}
              />
            </label>
            <label className="text-sm">
              Invoice day
              <input
                className="ws-input"
                type="number"
                min="1"
                max="28"
                value={draft.invoiceDay}
                onChange={(event) => setDraft({ ...draft, invoiceDay: event.target.value })}
              />
            </label>
          </div>
          <div className="flex gap-2">
            <Button
              className="ws-btn primary"
              disabled={busy || !draft.code.trim()}
              onClick={() => void createVault()}
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Create
              vault
            </Button>
            <Button className="ws-btn" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </section>
      )}

      {vaults === null && !error && (
        <p className="ws-helper">
          <Loader2 className="inline h-4 w-4 animate-spin" /> Loading vaults…
        </p>
      )}

      {vaults && vaults.length === 0 && (
        <section className="ws-card ws-card-pad text-center">
          <Warehouse className="mx-auto h-8 w-8 text-muted-foreground" />
          <h2 className="mt-2 font-semibold">No vaults yet</h2>
          <p className="text-sm text-muted-foreground">
            Add your first vault to start tracking stored shipments.
          </p>
        </section>
      )}

      {vaults && vaults.length > 0 && (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {vaults.map((vault) => {
            const usage = vaultUsage(vault);
            const release = dueForRelease(vault);
            return (
              <article key={vault.id} className="ws-card ws-card-pad space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <b className="text-lg">{vault.code}</b>
                  <span className={`ws-chip ${STATUS_TONE[vault.status]}`}>
                    {vaultStatusLabel(vault.status)}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {vault.contactName || "Unassigned"} · {vault.squareFeet} ft²
                </p>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${usage.percent}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {usage.cuft} / {vault.capacityCuft || "—"} ft³ stored
                </p>
                <p className="text-sm font-medium">
                  {money(monthlyStorageCents(vault) / 100)} / month
                </p>
                {release && <p className="ws-chip orange">Move-out date reached</p>}
                <Button className="ws-btn w-full" onClick={() => setSelectedId(vault.id)}>
                  Open vault
                </Button>
              </article>
            );
          })}
        </section>
      )}

      {billing.length > 0 && (
        <section className="ws-card ws-card-pad">
          <div className="ws-card-title">
            <div>
              <h2>Recurring storage billing</h2>
              <p>Monthly holding fees attached to each customer account.</p>
            </div>
          </div>
          <div className="ws-table-wrap">
            <table className="ws-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Vaults</th>
                  <th>Monthly</th>
                  <th>Next invoice</th>
                </tr>
              </thead>
              <tbody>
                {billing.map((row) => (
                  <tr key={row.key}>
                    <td>
                      <span className="ws-table-main">{row.contactName}</span>
                      <small>{row.contactPhone || row.contactEmail || "No contact saved"}</small>
                    </td>
                    <td>{row.vaults.join(", ")}</td>
                    <td className="ws-table-main">{money(row.monthlyCents / 100)}</td>
                    <td>
                      <CalendarClock className="mr-1 inline h-3.5 w-3.5" />
                      {row.nextInvoiceOn}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="ws-helper">
            Schedule only — this screen calculates the recurring fee and next billing date; it does
            not create or send an invoice.
          </p>
        </section>
      )}

      {selected && edit && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/40"
          role="dialog"
          aria-modal="true"
          aria-label={`Vault ${selected.code}`}
        >
          <aside className="h-full w-full max-w-lg overflow-y-auto bg-background p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Vault {selected.code}</h2>
                <p className="text-sm text-muted-foreground">
                  {vaultUsage(edit).cuft} ft³ · {money(monthlyStorageCents(edit) / 100)} / month
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  className="ws-btn"
                  onClick={() => {
                    setScanMode("item");
                    setScanOpen(true);
                  }}
                >
                  <ScanLine size={15} /> Scan item tag
                </Button>
                <Button
                  className="ws-btn"
                  aria-label="Close vault"
                  onClick={() => setSelectedId(null)}
                >
                  <X size={15} />
                </Button>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">
                  Status
                  <select
                    className="ws-select"
                    value={edit.status}
                    onChange={(event) =>
                      change({
                        status: isVaultStatus(event.target.value)
                          ? event.target.value
                          : "available",
                      })
                    }
                  >
                    {VAULT_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {vaultStatusLabel(status)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  Section
                  <input
                    className="ws-input"
                    value={edit.section}
                    onChange={(event) => change({ section: event.target.value })}
                  />
                </label>
                <label className="text-sm">
                  Customer name
                  <input
                    className="ws-input"
                    value={edit.contactName}
                    onChange={(event) => change({ contactName: event.target.value })}
                  />
                </label>
                <label className="text-sm">
                  Phone
                  <input
                    className="ws-input"
                    value={edit.contactPhone}
                    onChange={(event) => change({ contactPhone: event.target.value })}
                  />
                </label>
                <label className="text-sm col-span-2">
                  Email
                  <input
                    className="ws-input"
                    type="email"
                    value={edit.contactEmail}
                    onChange={(event) => change({ contactEmail: event.target.value })}
                  />
                </label>
                <label className="text-sm">
                  Move-in date
                  <input
                    className="ws-input"
                    type="date"
                    value={edit.moveInAt ?? ""}
                    onChange={(event) => change({ moveInAt: event.target.value || null })}
                  />
                </label>
                <label className="text-sm">
                  Projected move-out
                  <input
                    className="ws-input"
                    type="date"
                    value={edit.moveOutAt ?? ""}
                    onChange={(event) => change({ moveOutAt: event.target.value || null })}
                  />
                </label>
              </div>

              <div className="rounded-xl border border-border p-3">
                <b className="text-sm">Stored items</b>
                {edit.items.length === 0 && (
                  <p className="text-xs text-muted-foreground">No items logged yet.</p>
                )}
                <ul className="mt-2 space-y-1">
                  {edit.items.map((item, index) => (
                    <li
                      key={`${item.name}-${index}`}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <span>
                        {item.name} × {item.quantity}
                        {item.cuft ? ` · ${item.cuft} ft³` : ""}
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove ${item.name}`}
                        className="ws-icon-btn"
                        onClick={() => change({ items: edit.items.filter((_, i) => i !== index) })}
                      >
                        <Trash2 size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 grid grid-cols-[1fr_60px_70px_auto] items-end gap-2">
                  <label className="text-xs">
                    Item
                    <input
                      ref={itemInput}
                      className="ws-input"
                      value={itemName}
                      onChange={(event) => setItemName(event.target.value)}
                    />
                  </label>
                  <label className="text-xs">
                    Qty
                    <input
                      className="ws-input"
                      type="number"
                      min="1"
                      value={itemQty}
                      onChange={(event) => setItemQty(event.target.value)}
                    />
                  </label>
                  <label className="text-xs">
                    ft³ each
                    <input
                      className="ws-input"
                      type="number"
                      min="0"
                      value={itemCuft}
                      onChange={(event) => setItemCuft(event.target.value)}
                    />
                  </label>
                  <Button className="ws-btn" onClick={addItem}>
                    <Plus size={14} />
                  </Button>
                </div>
              </div>

              <div className="rounded-xl border border-border p-3 space-y-2">
                <b className="text-sm">Monthly holding fee</b>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm">
                    Billing
                    <select
                      className="ws-select"
                      value={edit.billingMode}
                      onChange={(event) =>
                        change({
                          billingMode: isBillingMode(event.target.value)
                            ? event.target.value
                            : "flat",
                        })
                      }
                    >
                      {BILLING_MODES.map((mode) => (
                        <option key={mode} value={mode}>
                          {mode === "flat" ? "Flat per vault" : "Per square foot"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    Square feet
                    <input
                      className="ws-input"
                      type="number"
                      min="0"
                      value={edit.squareFeet}
                      onChange={(event) => change({ squareFeet: Number(event.target.value) || 0 })}
                    />
                  </label>
                  <label className="text-sm">
                    Flat rate ($)
                    <input
                      className="ws-input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={dollars(edit.monthlyRateCents)}
                      onChange={(event) =>
                        change({ monthlyRateCents: toCents(event.target.value) })
                      }
                    />
                  </label>
                  <label className="text-sm">
                    Per sq ft ($)
                    <input
                      className="ws-input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={dollars(edit.ratePerSqftCents)}
                      onChange={(event) =>
                        change({ ratePerSqftCents: toCents(event.target.value) })
                      }
                    />
                  </label>
                  <label className="text-sm">
                    Invoice day
                    <input
                      className="ws-input"
                      type="number"
                      min="1"
                      max="28"
                      value={edit.invoiceDay}
                      onChange={(event) => change({ invoiceDay: Number(event.target.value) || 1 })}
                    />
                  </label>
                  <div className="text-sm">
                    Next invoice
                    <p className="mt-2">{nextInvoiceDate(edit)}</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {money(monthlyStorageCents(edit) / 100)} per month, billed on day{" "}
                  {edit.invoiceDay}.
                </p>
              </div>

              <label className="block text-sm">
                Notes
                <textarea
                  className="ws-textarea"
                  value={edit.notes}
                  onChange={(event) => change({ notes: event.target.value })}
                />
              </label>
              {lastTag && (
                <p className="text-xs text-muted-foreground" role="status">
                  Last scanned tag: {lastTag}
                </p>
              )}

              <div className="flex gap-2">
                <Button className="ws-btn primary" disabled={busy} onClick={() => void saveVault()}>
                  {busy ? <Loader2 size={15} className="animate-spin" /> : null} Save vault
                </Button>
                <Button className="ws-btn" onClick={() => setSelectedId(null)}>
                  Close
                </Button>
              </div>
            </div>
          </aside>
        </div>
      )}

      <CameraScanner
        open={scanOpen}
        title={scanMode === "item" ? "Scan inventory tag" : "Scan vault tag"}
        hint={
          scanMode === "item"
            ? `The scanned tag is added to vault ${edit?.code ?? ""} as stored inventory.`
            : "Point the camera at the vault label, or type the vault code."
        }
        manualLabel="Vault code or tag"
        manualPlaceholder="A-101"
        onClose={() => setScanOpen(false)}
        onResult={applyScan}
      />
    </div>
  );
}
