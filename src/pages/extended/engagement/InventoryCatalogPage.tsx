import { PackagePlus, Pencil, Save } from "lucide-react";
import { useState } from "react";
import type { ModuleProps } from "@shared/expansion";
import { useI18n } from "@/lib/i18n";
import {
  EmptyState,
  Modal,
  useRemote,
} from "@/components/workspace/WorkspaceUI";
import { engage, type CatalogItem } from "@/lib/engage-api";
import {
  PageFailure,
  PageHead,
  PageLoading,
  PermissionNotice,
  StatusChip,
  canSales,
} from "./EngagementUI";

type CatalogForm = Omit<CatalogItem, "id">;
const blankItem = (): CatalogForm => ({
  itemKey: "",
  name: "",
  room: "",
  cuft: 0,
  weight: 0,
  active: true,
});

export function InventoryCatalogPage({ role }: ModuleProps) {
  const { t } = useI18n();
  const {
    data: items,
    loading,
    error,
    refresh,
  } = useRemote(() => engage.catalog(), []);
  const [editor, setEditor] = useState<CatalogItem | "new" | null>(null);
  const allowed = canSales(role);
  if (loading) return <PageLoading label="Loading tenant inventory catalog…" />;
  if (error || !items)
    return (
      <PageFailure
        heading="Inventory catalog"
        caption="Tenant-defined items available for inventory pickers."
        error={error}
        retry={() => void refresh()}
      />
    );
  return (
    <>
      <PageHead
        heading="Inventory catalog"
        caption="Manage canonical item names and per-unit estimates for this tenant."
        actions={
          allowed ? (
            <button className="ws-btn primary" onClick={() => setEditor("new")}>
              <PackagePlus size={15} />
              {t("Add catalog item")}
            </button>
          ) : undefined
        }
      />
      {!allowed && <PermissionNotice />}
      <p className="eg-disclaimer">
        {t(
          "Volume and weight are per unit estimates for planning, not a guaranteed quote or certified measurement. Parent inventory pickers should consume this tenant catalog after route integration."
        )}
      </p>
      <section className="ws-card ws-card-pad">
        <div className="ws-table-wrap">
          <table className="ws-table">
            <thead>
              <tr>
                <th>{t("Item key")}</th>
                <th>{t("Canonical item")}</th>
                <th>{t("Room")}</th>
                <th>{t("Per-unit cu ft")}</th>
                <th>{t("Per-unit lb")}</th>
                <th>{t("Status")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id}>
                  <td>
                    <code>{item.itemKey}</code>
                  </td>
                  <td className="ws-table-main">{item.name}</td>
                  <td>{item.room}</td>
                  <td>{item.cuft}</td>
                  <td>{item.weight}</td>
                  <td>
                    <StatusChip status={item.active ? "active" : "inactive"} />
                  </td>
                  <td>
                    {allowed && (
                      <button
                        className="ws-btn"
                        onClick={() => setEditor(item)}
                      >
                        <Pencil size={14} />
                        {t("Edit")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!items.length && (
          <EmptyState
            title="No catalog items"
            detail="Add a tenant item before offering it in an inventory picker."
            action={
              allowed ? (
                <button
                  className="ws-btn primary"
                  onClick={() => setEditor("new")}
                >
                  {t("Add catalog item")}
                </button>
              ) : undefined
            }
          />
        )}
      </section>
      {editor && (
        <CatalogEditor
          item={editor === "new" ? null : editor}
          onClose={() => setEditor(null)}
          onSaved={async () => {
            setEditor(null);
            await refresh();
          }}
        />
      )}
    </>
  );
}

function CatalogEditor({
  item,
  onClose,
  onSaved,
}: {
  item: CatalogItem | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState<CatalogForm>(
    item
      ? {
          itemKey: item.itemKey,
          name: item.name,
          room: item.room,
          cuft: item.cuft,
          weight: item.weight,
          active: item.active,
        }
      : blankItem()
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const change = (key: keyof CatalogForm, value: string | number | boolean) =>
    setForm(current => ({ ...current, [key]: value }));
  return (
    <Modal
      title={item ? "Edit catalog item" : "Add catalog item"}
      onClose={onClose}
    >
      <form
        onSubmit={async event => {
          event.preventDefault();
          setSaving(true);
          setError("");
          try {
            if (item) await engage.updateCatalogItem(item.id, form);
            else await engage.createCatalogItem(form);
            await onSaved();
          } catch (reason) {
            setError(
              reason instanceof Error
                ? reason.message
                : "Could not save inventory item."
            );
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="ws-modal__body">
          <div className="ws-form-grid">
            <label>
              {t("Item key")}
              <input
                className="ws-input"
                required
                pattern="[A-Za-z0-9_-]+"
                value={form.itemKey}
                onChange={event => change("itemKey", event.target.value)}
              />
              <small>
                {t(
                  "Stable identifier: letters, numbers, underscore, or hyphen."
                )}
              </small>
            </label>
            <label>
              {t("Canonical item name")}
              <input
                className="ws-input"
                required
                value={form.name}
                onChange={event => change("name", event.target.value)}
              />
            </label>
            <label>
              {t("Room")}
              <input
                className="ws-input"
                required
                value={form.room}
                onChange={event => change("room", event.target.value)}
              />
            </label>
            <label>
              {t("Per-unit cubic feet")}
              <input
                className="ws-input"
                required
                type="number"
                min="0"
                step="0.01"
                value={form.cuft}
                onChange={event => change("cuft", Number(event.target.value))}
              />
            </label>
            <label>
              {t("Per-unit pounds")}
              <input
                className="ws-input"
                required
                type="number"
                min="0"
                step="0.01"
                value={form.weight}
                onChange={event => change("weight", Number(event.target.value))}
              />
            </label>
            <label className="ws-checkbox">
              <input
                type="checkbox"
                checked={form.active}
                onChange={event => change("active", event.target.checked)}
              />
              {t("Active in inventory picker")}
            </label>
          </div>
          {error && <div className="ws-error">{t(error)}</div>}
        </div>
        <footer className="ws-modal__foot">
          <button className="ws-btn" type="button" onClick={onClose}>
            {t("Cancel")}
          </button>
          <button className="ws-btn primary" disabled={saving}>
            <Save size={14} />
            {t(saving ? "Saving…" : "Save catalog item")}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

export default InventoryCatalogPage;
