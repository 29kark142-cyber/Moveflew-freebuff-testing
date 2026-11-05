import { Edit3, PackagePlus, Plus, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import type { Customer } from "@shared/crm";
import type {
  Facility,
  StorageAccount,
  StorageItem,
  Vault,
} from "@shared/expansion";
import type { ModuleProps } from "@shared/expansion";
import { crm } from "@/lib/crm";
import { useI18n } from "@/lib/i18n";
import {
  ErrorNotice,
  LoadingBlock,
  Modal,
  StatusChip,
  useRemote,
} from "@/components/workspace/WorkspaceUI";
import { ops, type StorageMovement } from "@/lib/ops-api";
import {
  canAccess,
  dateToday,
  dispatchManagementRoles,
  dollarsToCents,
  EmptyRows,
  money,
  PageHead,
  PermissionNotice,
  SectionTitle,
  shortDate,
  SuccessNotice,
} from "./operations-common";

type StorageData = {
  facilities: Facility[];
  vaults: Vault[];
  accounts: StorageAccount[];
  items: StorageItem[];
  movements: StorageMovement[];
  customers: Customer[];
};
type Tab = "warehouses" | "vaults" | "accounts" | "inventory";
const loadStorage = async (): Promise<StorageData> => {
  const [facilities, vaults, accounts, items, movements, customers] =
    await Promise.all([
      ops.facilities(),
      ops.vaults(),
      ops.storageAccounts(),
      ops.storageItems(),
      ops.storageMovements(),
      crm.customers(),
    ]);
  return { facilities, vaults, accounts, items, movements, customers };
};

export function StoragePage({ role }: ModuleProps) {
  const { t } = useI18n();
  if (!canAccess(role, dispatchManagementRoles)) {
    return (
      <>
        <PageHead
          heading="Storage"
          caption="Facilities, customer agreements, and stored inventory."
        />
        <PermissionNotice roles={dispatchManagementRoles} />
      </>
    );
  }
  return <StorageContent t={t} />;
}

function StorageContent({
  t,
}: {
  t: (text: string, values?: Record<string, string | number>) => string;
}) {
  const { data, loading, error, refresh } = useRemote(loadStorage, []);
  const [tab, setTab] = useState<Tab>("warehouses");
  const [facilityEdit, setFacilityEdit] = useState<
    Facility | null | undefined
  >();
  const [vaultEdit, setVaultEdit] = useState<Vault | null | undefined>();
  const [accountEdit, setAccountEdit] = useState<
    StorageAccount | null | undefined
  >();
  const [itemOpen, setItemOpen] = useState(false);
  const [releaseItem, setReleaseItem] = useState<StorageItem | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const saved = async (message: string) => {
    await refresh();
    setSuccess(message);
  };
  if (loading) return <LoadingBlock label={t("Loading storage records…")} />;
  if (error || !data)
    return (
      <>
        <PageHead
          heading="Storage"
          caption="Facilities, customer agreements, and stored inventory."
        />
        <ErrorNotice error={error} retry={() => void refresh()} />
      </>
    );
  const tabs: Array<[Tab, string]> = [
    ["warehouses", "Warehouses"],
    ["vaults", "Vaults"],
    ["accounts", "Accounts"],
    ["inventory", "Inventory"],
  ];
  return (
    <div className="ops">
      <PageHead
        heading="Storage"
        caption="Live facilities, agreements, and inventory from this workspace."
        actions={
          <button className="ws-btn" onClick={() => void refresh()}>
            <RotateCcw size={14} />
            {t("Refresh")}
          </button>
        }
      />
      <SuccessNotice message={success} />
      <nav className="ops-tabs" aria-label={t("Storage sections")}>
        {tabs.map(([value, label]) => (
          <button
            key={value}
            className={tab === value ? "active" : ""}
            onClick={() => setTab(value)}
          >
            {t(label)}
          </button>
        ))}
      </nav>
      {tab === "warehouses" && (
        <FacilitiesTab
          rows={data.facilities}
          onAdd={() => setFacilityEdit(null)}
          onEdit={setFacilityEdit}
          t={t}
        />
      )}
      {tab === "vaults" && (
        <VaultsTab
          rows={data.vaults}
          facilities={data.facilities}
          onAdd={() => setVaultEdit(null)}
          onEdit={setVaultEdit}
          t={t}
        />
      )}
      {tab === "accounts" && (
        <AccountsTab
          rows={data.accounts}
          customers={data.customers}
          onAdd={() => setAccountEdit(null)}
          onEdit={setAccountEdit}
          t={t}
        />
      )}
      {tab === "inventory" && (
        <InventoryTab
          items={data.items}
          vaults={data.vaults}
          accounts={data.accounts}
          movements={data.movements}
          onAdd={() => setItemOpen(true)}
          onRelease={setReleaseItem}
          t={t}
        />
      )}
      {facilityEdit !== undefined && (
        <FacilityForm
          row={facilityEdit}
          onClose={() => setFacilityEdit(undefined)}
          onSaved={saved}
        />
      )}
      {vaultEdit !== undefined && (
        <VaultForm
          row={vaultEdit}
          facilities={data.facilities}
          onClose={() => setVaultEdit(undefined)}
          onSaved={saved}
        />
      )}
      {accountEdit !== undefined && (
        <AccountForm
          row={accountEdit}
          customers={data.customers}
          onClose={() => setAccountEdit(undefined)}
          onSaved={saved}
        />
      )}
      {itemOpen && (
        <ItemForm
          accounts={data.accounts}
          vaults={data.vaults}
          onClose={() => setItemOpen(false)}
          onSaved={saved}
        />
      )}
      {releaseItem && (
        <ReleaseForm
          item={releaseItem}
          onClose={() => setReleaseItem(null)}
          onSaved={saved}
        />
      )}
    </div>
  );
}

function FacilitiesTab({
  rows,
  onAdd,
  onEdit,
  t,
}: {
  rows: Facility[];
  onAdd: () => void;
  onEdit: (row: Facility) => void;
  t: any;
}) {
  return (
    <section className="ws-card ws-card-pad">
      <SectionTitle
        title="Warehouses"
        detail="Physical facility records used by storage vaults."
        action={
          <button className="ws-btn primary" onClick={onAdd}>
            <Plus size={15} />
            {t("Add warehouse")}
          </button>
        }
      />
      {rows.length ? (
        <div className="ws-table-wrap">
          <table className="ws-table">
            <thead>
              <tr>
                <th>{t("Name")}</th>
                <th>{t("Address")}</th>
                <th>{t("Notes")}</th>
                <th aria-label={t("Actions")}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id}>
                  <td className="ws-table-main">{row.name}</td>
                  <td>{row.address}</td>
                  <td>{row.notes || t("—")}</td>
                  <td>
                    <button
                      className="ws-icon-btn"
                      title={t("Edit")}
                      onClick={() => onEdit(row)}
                    >
                      <Edit3 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyRows
          title="No warehouses"
          detail="Add an actual facility before creating vaults."
        />
      )}
    </section>
  );
}
function VaultsTab({
  rows,
  facilities,
  onAdd,
  onEdit,
  t,
}: {
  rows: Vault[];
  facilities: Facility[];
  onAdd: () => void;
  onEdit: (row: Vault) => void;
  t: any;
}) {
  const facilityName = (id: number) =>
    facilities.find(row => row.id === id)?.name || `#${id}`;
  return (
    <section className="ws-card ws-card-pad">
      <SectionTitle
        title="Vaults"
        detail="Occupied cubic feet are derived from stored items."
        action={
          <button
            className="ws-btn primary"
            disabled={!facilities.length}
            title={
              !facilities.length ? t("Create a warehouse first") : undefined
            }
            onClick={onAdd}
          >
            <Plus size={15} />
            {t("Add vault")}
          </button>
        }
      />
      {rows.length ? (
        <div className="ws-table-wrap">
          <table className="ws-table">
            <thead>
              <tr>
                <th>{t("Vault")}</th>
                <th>{t("Facility")}</th>
                <th>{t("Capacity")}</th>
                <th>{t("Status")}</th>
                <th aria-label={t("Actions")}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const percent = row.capacityCuft
                  ? Math.min(
                      100,
                      Math.round((row.occupiedCuft / row.capacityCuft) * 100)
                    )
                  : 0;
                return (
                  <tr key={row.id}>
                    <td className="ws-table-main">
                      {row.name}
                      <small>{row.kind}</small>
                    </td>
                    <td>{facilityName(row.facilityId)}</td>
                    <td>
                      <div className="ops-capacity">
                        <span>
                          {row.occupiedCuft} / {row.capacityCuft} {t("cu ft")}
                        </span>
                        <div className="ops-capacity__bar">
                          <span
                            className={percent >= 100 ? "is-full" : ""}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td>
                      <StatusChip status={row.status} />
                    </td>
                    <td>
                      <button
                        className="ws-icon-btn"
                        title={t("Edit")}
                        onClick={() => onEdit(row)}
                      >
                        <Edit3 size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyRows
          title="No vaults"
          detail="Vault capacity becomes available after a vault is saved."
        />
      )}
    </section>
  );
}
function AccountsTab({
  rows,
  customers,
  onAdd,
  onEdit,
  t,
}: {
  rows: StorageAccount[];
  customers: Customer[];
  onAdd: () => void;
  onEdit: (row: StorageAccount) => void;
  t: any;
}) {
  return (
    <section className="ws-card ws-card-pad">
      <SectionTitle
        title="Customer storage accounts"
        detail="SIT and long-term agreements are billed only when auto-invoice is enabled."
        action={
          <button
            className="ws-btn primary"
            disabled={!customers.length}
            onClick={onAdd}
          >
            <Plus size={15} />
            {t("New agreement")}
          </button>
        }
      />
      <p className="ops-legal-note">
        {t(
          "Automatic collection is not connected until customer consent is recorded. Automatic billing only creates eligible invoices."
        )}
      </p>
      {rows.length ? (
        <div className="ws-table-wrap">
          <table className="ws-table">
            <thead>
              <tr>
                <th>{t("Customer")}</th>
                <th>{t("Agreement")}</th>
                <th>{t("Rate")}</th>
                <th>{t("Term")}</th>
                <th>{t("Invoicing")}</th>
                <th>{t("Status")}</th>
                <th aria-label={t("Actions")}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id}>
                  <td className="ws-table-main">{row.customerName}</td>
                  <td>{row.kind}</td>
                  <td className="ops-money">
                    {money(row.monthlyRateCents)}
                    <small>
                      {t("Due day")} {row.dueDay}
                    </small>
                  </td>
                  <td>
                    {shortDate(row.startDate)}
                    <small>
                      {row.endDate ? shortDate(row.endDate) : t("No end date")}
                    </small>
                  </td>
                  <td>
                    {row.autoInvoice
                      ? t("Invoice generation enabled")
                      : t("Manual invoicing")}
                  </td>
                  <td>
                    <StatusChip status={row.status} />
                  </td>
                  <td>
                    <button
                      className="ws-icon-btn"
                      title={t("Edit")}
                      onClick={() => onEdit(row)}
                    >
                      <Edit3 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyRows
          title="No storage accounts"
          detail="Create an agreement linked to an existing customer."
        />
      )}
    </section>
  );
}
function InventoryTab({
  items,
  vaults,
  accounts,
  movements,
  onAdd,
  onRelease,
  t,
}: {
  items: StorageItem[];
  vaults: Vault[];
  accounts: StorageAccount[];
  movements: StorageMovement[];
  onAdd: () => void;
  onRelease: (item: StorageItem) => void;
  t: any;
}) {
  const [accountId, setAccountId] = useState("");
  const selected = accountId ? Number(accountId) : null;
  const filteredItems = selected
    ? items.filter(item => item.accountId === selected)
    : items;
  const filteredMoves = selected
    ? movements.filter(item => item.accountId === selected)
    : movements;
  const vault = (id: number) =>
    vaults.find(row => row.id === id)?.name || `#${id}`;
  const account = (id: number) =>
    accounts.find(row => row.id === id)?.customerName || `#${id}`;
  return (
    <>
      <section className="ws-card ws-card-pad">
        <SectionTitle
          title="Stored inventory"
          detail="Quantity, cubic feet, and weight are stored per unit."
          action={
            <button
              className="ws-btn primary"
              disabled={!accounts.length || !vaults.length}
              onClick={onAdd}
            >
              <PackagePlus size={15} />
              {t("Add stored item")}
            </button>
          }
        />
        <div className="ws-toolbar">
          <div className="ws-toolbar__filters">
            <select
              className="ws-select"
              value={accountId}
              onChange={event => setAccountId(event.target.value)}
            >
              <option value="">{t("All accounts")}</option>
              {accounts.map(row => (
                <option value={row.id} key={row.id}>
                  {row.customerName}
                </option>
              ))}
            </select>
          </div>
        </div>
        {filteredItems.length ? (
          <div className="ws-table-wrap">
            <table className="ws-table">
              <thead>
                <tr>
                  <th>{t("Item")}</th>
                  <th>{t("Account")}</th>
                  <th>{t("Vault")}</th>
                  <th>{t("Per unit")}</th>
                  <th>{t("Quantity")}</th>
                  <th>{t("Status")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map(row => (
                  <tr key={row.id}>
                    <td className="ws-table-main">
                      {row.name}
                      <small>{row.notes || t("—")}</small>
                    </td>
                    <td>{account(row.accountId)}</td>
                    <td>{vault(row.vaultId)}</td>
                    <td>
                      {row.cuft} {t("cu ft")} · {row.weightLbs} {t("lb")}
                    </td>
                    <td>{row.quantity}</td>
                    <td>
                      <StatusChip status={row.status} />
                    </td>
                    <td>
                      {row.quantity > 0 && (
                        <button
                          className="ws-btn"
                          onClick={() => onRelease(row)}
                        >
                          {t("Release")}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyRows
            title="No stored inventory"
            detail="Stored items will appear after an account and vault are selected."
          />
        )}
      </section>
      <section className="ws-card ws-card-pad">
        <SectionTitle
          title="Movement timeline"
          detail="Actual storage movements recorded for the selected account."
        />
        {filteredMoves.length ? (
          <div className="ops-timeline">
            {filteredMoves.map(move => (
              <div className="ops-timeline__row" key={move.id}>
                <b>{String(move.kind || t("Storage movement"))}</b>
                <span>
                  {typeof move.quantity === "number"
                    ? ` · ${move.quantity}`
                    : ""}
                  {move.notes ? ` · ${move.notes}` : ""}
                </span>
                <small>{shortDate(move.createdAt)}</small>
              </div>
            ))}
          </div>
        ) : (
          <EmptyRows
            title="No movements"
            detail="Saved intake and release events appear here."
          />
        )}
      </section>
    </>
  );
}
function FacilityForm({
  row,
  onClose,
  onSaved,
}: {
  row: Facility | null;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(row?.name || "");
  const [address, setAddress] = useState(row?.address || "");
  const [notes, setNotes] = useState(row?.notes || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const value = { name, address, notes };
      row
        ? await ops.updateFacility(row.id, value)
        : await ops.createFacility(value);
      await onSaved(row ? "Warehouse updated." : "Warehouse saved.");
      onClose();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t("Could not save warehouse.")
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal title={row ? "Edit warehouse" : "Add warehouse"} onClose={onClose}>
      <form className="ws-modal__body ops-form" onSubmit={submit}>
        <label className="ws-field">
          <span>{t("Name")}</span>
          <input
            className="ws-input"
            required
            value={name}
            onChange={e => setName(e.target.value)}
          />
        </label>
        <label className="ws-field">
          <span>{t("Address")}</span>
          <textarea
            className="ws-textarea"
            required
            value={address}
            onChange={e => setAddress(e.target.value)}
          />
        </label>
        <label className="ws-field">
          <span>{t("Notes")}</span>
          <textarea
            className="ws-textarea"
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </label>
        {error && <ErrorNotice error={new Error(error)} />}
        <div className="ops-form-actions">
          <button type="button" className="ws-btn" onClick={onClose}>
            {t("Cancel")}
          </button>
          <button className="ws-btn primary" disabled={saving}>
            {saving ? t("Saving…") : t("Save warehouse")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function VaultForm({
  row,
  facilities,
  onClose,
  onSaved,
}: {
  row: Vault | null;
  facilities: Facility[];
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const [facilityId, setFacilityId] = useState(
    String(row?.facilityId || facilities[0]?.id || "")
  );
  const [name, setName] = useState(row?.name || "");
  const [kind, setKind] = useState(row?.kind || "vault");
  const [capacity, setCapacity] = useState(String(row?.capacityCuft || ""));
  const [status, setStatus] = useState(row?.status || "active");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const capacityCuft = Number(capacity);
    if (!Number.isFinite(capacityCuft) || capacityCuft <= 0)
      return setError(t("Capacity must be greater than zero."));
    setSaving(true);
    setError("");
    try {
      const value = {
        facilityId: Number(facilityId),
        name,
        kind,
        capacityCuft,
        status,
      };
      row ? await ops.updateVault(row.id, value) : await ops.createVault(value);
      await onSaved(row ? "Vault updated." : "Vault saved.");
      onClose();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t("Could not save vault.")
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal title={row ? "Edit vault" : "Add vault"} onClose={onClose}>
      <form className="ws-modal__body ops-form" onSubmit={submit}>
        <div className="ws-form-grid">
          <label className="ws-field">
            <span>{t("Facility")}</span>
            <select
              className="ws-select"
              value={facilityId}
              onChange={e => setFacilityId(e.target.value)}
            >
              {facilities.map(f => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <label className="ws-field">
            <span>{t("Name")}</span>
            <input
              className="ws-input"
              required
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </label>
          <label className="ws-field">
            <span>{t("Kind")}</span>
            <select
              className="ws-select"
              value={kind}
              onChange={e => setKind(e.target.value)}
            >
              <option value="vault">vault</option>
              <option value="container">container</option>
              <option value="shelf">shelf</option>
            </select>
          </label>
          <label className="ws-field">
            <span>{t("Capacity (cu ft)")}</span>
            <input
              className="ws-input"
              type="number"
              min="1"
              required
              value={capacity}
              onChange={e => setCapacity(e.target.value)}
            />
          </label>
          <label className="ws-field">
            <span>{t("Status")}</span>
            <select
              className="ws-select"
              value={status}
              onChange={e => setStatus(e.target.value)}
            >
              <option value="active">active</option>
              <option value="unavailable">unavailable</option>
            </select>
          </label>
        </div>
        {error && <ErrorNotice error={new Error(error)} />}
        <div className="ops-form-actions">
          <button type="button" className="ws-btn" onClick={onClose}>
            {t("Cancel")}
          </button>
          <button className="ws-btn primary" disabled={saving}>
            {saving ? t("Saving…") : t("Save vault")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function AccountForm({
  row,
  customers,
  onClose,
  onSaved,
}: {
  row: StorageAccount | null;
  customers: Customer[];
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const [customerId, setCustomerId] = useState(
    String(row?.customerId || customers[0]?.id || "")
  );
  const [kind, setKind] = useState(row?.kind || "SIT");
  const [startDate, setStartDate] = useState(row?.startDate || dateToday());
  const [endDate, setEndDate] = useState(row?.endDate || "");
  const [rate, setRate] = useState(
    row ? String(row.monthlyRateCents / 100) : ""
  );
  const [dueDay, setDueDay] = useState(String(row?.dueDay || 1));
  const [status, setStatus] = useState(row?.status || "active");
  const [autoInvoice, setAutoInvoice] = useState(row?.autoInvoice || false);
  const [notes, setNotes] = useState(row?.notes || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const monthlyRateCents = dollarsToCents(rate),
      due = Number(dueDay);
    if (monthlyRateCents === null || monthlyRateCents < 0)
      return setError(
        t("Enter a valid monthly dollar amount with no more than two decimals.")
      );
    if (!Number.isInteger(due) || due < 1 || due > 28)
      return setError(t("Due day must be from 1 through 28."));
    setSaving(true);
    setError("");
    try {
      const value = {
        customerId: Number(customerId),
        kind,
        startDate,
        endDate: endDate || null,
        monthlyRateCents,
        dueDay: due,
        status,
        autoInvoice,
        notes,
      };
      row
        ? await ops.updateStorageAccount(row.id, value)
        : await ops.createStorageAccount(value);
      await onSaved(
        row ? "Storage agreement updated." : "Storage agreement saved."
      );
      onClose();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t("Could not save storage agreement.")
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      title={row ? "Edit storage agreement" : "New storage agreement"}
      onClose={onClose}
      wide
    >
      <form className="ws-modal__body ops-form" onSubmit={submit}>
        <div className="ws-form-grid">
          <label className="ws-field">
            <span>{t("Customer")}</span>
            <select
              className="ws-select"
              value={customerId}
              onChange={e => setCustomerId(e.target.value)}
            >
              {customers.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="ws-field">
            <span>{t("Agreement kind")}</span>
            <select
              className="ws-select"
              value={kind}
              onChange={e => setKind(e.target.value)}
            >
              <option value="SIT">SIT</option>
              <option value="long_term">long_term</option>
            </select>
          </label>
          <label className="ws-field">
            <span>{t("Start date")}</span>
            <input
              className="ws-input"
              type="date"
              required
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
            />
          </label>
          <label className="ws-field">
            <span>{t("End date")}</span>
            <input
              className="ws-input"
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
            />
          </label>
          <label className="ws-field">
            <span>{t("Monthly rate (USD)")}</span>
            <input
              className="ws-input"
              inputMode="decimal"
              required
              value={rate}
              onChange={e => setRate(e.target.value)}
            />
          </label>
          <label className="ws-field">
            <span>{t("Due day")}</span>
            <input
              className="ws-input"
              type="number"
              min="1"
              max="28"
              required
              value={dueDay}
              onChange={e => setDueDay(e.target.value)}
            />
          </label>
          <label className="ws-field">
            <span>{t("Status")}</span>
            <select
              className="ws-select"
              value={status}
              onChange={e => setStatus(e.target.value)}
            >
              <option value="active">active</option>
              <option value="closed">closed</option>
            </select>
          </label>
          <label className="ws-checkbox">
            <input
              type="checkbox"
              checked={autoInvoice}
              onChange={e => setAutoInvoice(e.target.checked)}
            />
            <span>{t("Generate monthly invoices automatically")}</span>
          </label>
          <label className="ws-field full">
            <span>{t("Notes")}</span>
            <textarea
              className="ws-textarea"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </label>
        </div>
        <p className="ops-meta">
          {t(
            "Invoice generation does not charge a customer. Automatic collection is not connected until consent is recorded."
          )}
        </p>
        {error && <ErrorNotice error={new Error(error)} />}
        <div className="ops-form-actions">
          <button type="button" className="ws-btn" onClick={onClose}>
            {t("Cancel")}
          </button>
          <button className="ws-btn primary" disabled={saving}>
            {saving ? t("Saving…") : t("Save agreement")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function ItemForm({
  accounts,
  vaults,
  onClose,
  onSaved,
}: {
  accounts: StorageAccount[];
  vaults: Vault[];
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const [accountId, setAccountId] = useState(String(accounts[0]?.id || ""));
  const [vaultId, setVaultId] = useState(String(vaults[0]?.id || ""));
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [cuft, setCuft] = useState("");
  const [weightLbs, setWeightLbs] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = Number(quantity),
      v = Number(cuft),
      w = Number(weightLbs);
    if (
      !Number.isInteger(q) ||
      q < 1 ||
      !Number.isFinite(v) ||
      v < 0 ||
      !Number.isFinite(w) ||
      w < 0
    )
      return setError(
        t(
          "Quantity must be a whole number and measurements cannot be negative."
        )
      );
    setSaving(true);
    setError("");
    try {
      await ops.createStorageItem({
        accountId: Number(accountId),
        vaultId: Number(vaultId),
        name,
        quantity: q,
        cuft: v,
        weightLbs: w,
        notes,
      });
      await onSaved("Stored item saved.");
      onClose();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t("Could not save stored item.")
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal title="Add stored item" onClose={onClose}>
      <form className="ws-modal__body ops-form" onSubmit={submit}>
        <div className="ws-form-grid">
          <label className="ws-field">
            <span>{t("Storage account")}</span>
            <select
              className="ws-select"
              value={accountId}
              onChange={e => setAccountId(e.target.value)}
            >
              {accounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.customerName}
                </option>
              ))}
            </select>
          </label>
          <label className="ws-field">
            <span>{t("Vault")}</span>
            <select
              className="ws-select"
              value={vaultId}
              onChange={e => setVaultId(e.target.value)}
            >
              {vaults.map(v => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <label className="ws-field">
            <span>{t("Item name")}</span>
            <input
              className="ws-input"
              required
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </label>
          <label className="ws-field">
            <span>{t("Quantity")}</span>
            <input
              className="ws-input"
              type="number"
              min="1"
              required
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
            />
          </label>
          <label className="ws-field">
            <span>{t("Cubic feet per unit")}</span>
            <input
              className="ws-input"
              type="number"
              min="0"
              step="0.01"
              required
              value={cuft}
              onChange={e => setCuft(e.target.value)}
            />
          </label>
          <label className="ws-field">
            <span>{t("Weight (lb) per unit")}</span>
            <input
              className="ws-input"
              type="number"
              min="0"
              step="0.01"
              required
              value={weightLbs}
              onChange={e => setWeightLbs(e.target.value)}
            />
          </label>
        </div>
        <label className="ws-field">
          <span>{t("Notes")}</span>
          <textarea
            className="ws-textarea"
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </label>
        {error && <ErrorNotice error={new Error(error)} />}
        <div className="ops-form-actions">
          <button type="button" className="ws-btn" onClick={onClose}>
            {t("Cancel")}
          </button>
          <button className="ws-btn primary" disabled={saving}>
            {saving ? t("Saving…") : t("Save item")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function ReleaseForm({
  item,
  onClose,
  onSaved,
}: {
  item: StorageItem;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const [quantity, setQuantity] = useState("1"),
    [notes, setNotes] = useState(""),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = Number(quantity);
    if (!Number.isInteger(q) || q < 1 || q > item.quantity)
      return setError(
        t("Release quantity must be between 1 and the stored quantity.")
      );
    setSaving(true);
    setError("");
    try {
      await ops.releaseStorageItem(item.id, q, notes);
      await onSaved("Release recorded.");
      onClose();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t("Could not record release.")
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal title="Release stored item" onClose={onClose}>
      <form className="ws-modal__body ops-form" onSubmit={submit}>
        <p className="ops-meta">
          {item.name} · {t("Available quantity")}: {item.quantity}
        </p>
        <label className="ws-field">
          <span>{t("Quantity to release")}</span>
          <input
            className="ws-input"
            type="number"
            min="1"
            max={item.quantity}
            required
            value={quantity}
            onChange={e => setQuantity(e.target.value)}
          />
        </label>
        <label className="ws-field">
          <span>{t("Release notes")}</span>
          <textarea
            className="ws-textarea"
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </label>
        {error && <ErrorNotice error={new Error(error)} />}
        <div className="ops-form-actions">
          <button type="button" className="ws-btn" onClick={onClose}>
            {t("Cancel")}
          </button>
          <button className="ws-btn primary" disabled={saving}>
            {saving ? t("Saving…") : t("Record release")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
