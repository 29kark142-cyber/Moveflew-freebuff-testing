import type { InventoryEntry } from "./crm";

export function inventoryLoad(items: InventoryEntry[]): {
  cuft: number;
  weightLbs: number;
} {
  return items.reduce(
    (total, item) => ({
      cuft: total.cuft + Number(item.cuft) * Number(item.quantity),
      weightLbs: total.weightLbs + Number(item.weight) * Number(item.quantity),
    }),
    { cuft: 0, weightLbs: 0 }
  );
}

/** A zero limit means not configured, not a vehicle with zero usable capacity. */
export function capacityFailure(
  items: InventoryEntry[],
  capacityCuft: number,
  weightLimit: number
): string | null {
  const load = inventoryLoad(items);
  if (
    !Number.isFinite(load.cuft) ||
    !Number.isFinite(load.weightLbs) ||
    load.cuft < 0 ||
    load.weightLbs < 0
  )
    return "Inventory capacity values are invalid";
  if (capacityCuft > 0 && load.cuft > capacityCuft + 0.0001)
    return "Selected inventory exceeds this truck’s cubic-foot capacity";
  if (weightLimit > 0 && load.weightLbs > weightLimit + 0.0001)
    return "Selected inventory exceeds this truck’s weight limit";
  return null;
}
