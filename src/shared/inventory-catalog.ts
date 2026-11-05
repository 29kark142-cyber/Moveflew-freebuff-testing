import { INVENTORY, type InventoryEntry } from "./crm";
type CatalogRow = {
  id: number;
  itemKey: string;
  name: string;
  room: string;
  cuft: number | string;
  weight: number | string;
  active: boolean;
};
type Choice = Omit<InventoryEntry, "quantity">;
export function catalogIdFromKey(key: string): number | null {
  const match = /^catalog:(\d+)$/.exec(key);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
export function catalogChoices(rows: CatalogRow[]): Choice[] {
  const byKey = new Map(rows.map(row => [row.itemKey, row]));
  const custom = (row: CatalogRow): Choice => ({
    key: `catalog:${row.id}`,
    name: row.name,
    room: row.room,
    cuft: Number(row.cuft),
    weight: Number(row.weight),
  });
  const baseKeys = new Set(INVENTORY.map(item => item.key));
  return [
    ...INVENTORY.flatMap(item => {
      const row = byKey.get(item.key);
      if (!row) return [item];
      if (!row.active) return [];
      return row.name === item.name &&
        row.room === item.room &&
        Number(row.cuft) === item.cuft &&
        Number(row.weight) === item.weight
        ? [item]
        : [custom(row)];
    }),
    ...rows.filter(row => row.active && !baseKeys.has(row.itemKey)).map(custom),
  ];
}
export function inventoryText(
  item: Pick<InventoryEntry, "key" | "name" | "room">,
  field: "name" | "room",
  translate: (key: string) => string
): string {
  return catalogIdFromKey(item.key) !== null
    ? item[field]
    : translate(item[field]);
}
