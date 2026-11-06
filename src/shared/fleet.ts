// Fleet maintenance and pre-trip inspection rules shared by the office fleet page,
// the crew field app and the CRM/field servers.

export type MaintenanceEntry = {
  id: string;
  serviceDate: string;
  odometer: number;
  service: string;
  vendor: string;
  costCents: number;
  notes: string;
  nextServiceMiles: number | null;
  createdAt: string;
};

export type VehicleInspectionItem = {
  key: string;
  label: string;
  ok: boolean;
  note: string;
};

export type VehicleInspection = {
  id: string;
  truckId: number;
  truckName: string;
  driverId: number | null;
  driverName: string;
  date: string;
  items: VehicleInspectionItem[];
  passed: boolean;
  notes: string;
  createdAt: string;
};

export const PRE_TRIP_ITEMS = [
  { key: "oil", label: "Engine oil level" },
  { key: "tire_pressure", label: "Tire pressure and tread" },
  { key: "ramps", label: "Ramps secured and undamaged" },
  { key: "straps", label: "Straps and tie-downs" },
  { key: "lights", label: "Lights and signals" },
  { key: "brakes", label: "Brakes and parking brake" },
  { key: "fluids", label: "Coolant and washer fluid" },
  { key: "cleanliness", label: "Cab and cargo area clean" },
] as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const KEYS = new Set<string>(PRE_TRIP_ITEMS.map((item) => item.key));
const num = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const round = (value: number) => Math.round(value);

export function inspectionItems(): VehicleInspectionItem[] {
  return PRE_TRIP_ITEMS.map((item) => ({ ...item, ok: true, note: "" }));
}

type InspectionSubmission = { items: VehicleInspectionItem[]; notes: string };

/** Validates a complete pre-trip checklist: every required item exactly once. */
export function parseInspectionSubmission(value: unknown): InspectionSubmission | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  if (!Array.isArray(source["items"])) return null;
  const found = new Map<string, VehicleInspectionItem>();
  for (const entry of source["items"]) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const item = entry as Record<string, unknown>;
    const key = text(item["key"]);
    if (!KEYS.has(key) || found.has(key) || typeof item["ok"] !== "boolean") return null;
    const note = text(item["note"]);
    if (note.length > 500) return null;
    found.set(key, {
      key,
      label: PRE_TRIP_ITEMS.find((definition) => definition.key === key)!.label,
      ok: item["ok"],
      note,
    });
  }
  if (found.size !== PRE_TRIP_ITEMS.length) return null;
  const notes = text(source["notes"]);
  if (notes.length > 2000) return null;
  return {
    items: PRE_TRIP_ITEMS.map((definition) => found.get(definition.key)!),
    notes,
  };
}

export function parseInspection(value: unknown): VehicleInspection | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const id = text(source["id"]);
  const truckId = num(source["truckId"]);
  const date = text(source["date"]);
  const createdAt = text(source["createdAt"]);
  if (!id || truckId <= 0 || !DATE_RE.test(date) || !createdAt) return null;
  const submission = parseInspectionSubmission({
    items: source["items"],
    notes: source["notes"],
  });
  if (!submission) return null;
  return {
    id,
    truckId,
    truckName: text(source["truckName"]),
    driverId: source["driverId"] == null ? null : num(source["driverId"]) || null,
    driverName: text(source["driverName"]),
    date,
    items: submission.items,
    passed: submission.items.every((item) => item.ok),
    notes: submission.notes,
    createdAt,
  };
}

export function maintenanceLog(value: unknown): MaintenanceEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is Record<string, unknown> =>
        Boolean(entry) && typeof entry === "object" && !Array.isArray(entry),
    )
    .map((entry) => ({
      id: text(entry["id"]),
      serviceDate: text(entry["serviceDate"]).slice(0, 10),
      odometer: num(entry["odometer"]),
      service: text(entry["service"]),
      vendor: text(entry["vendor"]),
      costCents: Math.max(0, round(num(entry["costCents"]))),
      notes: text(entry["notes"]),
      nextServiceMiles:
        entry["nextServiceMiles"] == null || entry["nextServiceMiles"] === ""
          ? null
          : Math.max(0, round(num(entry["nextServiceMiles"]))),
      createdAt: text(entry["createdAt"]),
    }))
    .filter(
      (entry) => entry.id && DATE_RE.test(entry.serviceDate) && entry.service && entry.createdAt,
    )
    .slice(0, 100);
}

export type TruckServiceState = {
  nextServiceMiles: number | null;
  milesRemaining: number | null;
  dueByMiles: boolean;
  dueByDate: boolean;
  due: boolean;
  label: string;
};

type ServiceTruck = {
  mileage?: number;
  serviceIntervalMiles?: number;
  lastServiceMiles?: number;
  nextServiceDate?: string;
};

/** Service is due at the configured mileage interval or the saved calendar date. */
export function serviceDue(
  truck: ServiceTruck,
  today = new Date().toISOString().slice(0, 10),
): TruckServiceState {
  const mileage = Math.max(0, num(truck.mileage));
  const interval = Math.max(0, num(truck.serviceIntervalMiles));
  const lastService = Math.max(0, num(truck.lastServiceMiles));
  const nextServiceMiles =
    interval > 0 ? (lastService > 0 ? lastService + interval : interval) : null;
  const milesRemaining = nextServiceMiles == null ? null : round(nextServiceMiles - mileage);
  const dueByMiles = milesRemaining != null && milesRemaining <= 0;
  const nextDate = text(truck.nextServiceDate).slice(0, 10);
  const dueByDate = DATE_RE.test(nextDate) && nextDate <= today;
  const due = dueByMiles || dueByDate;
  return {
    nextServiceMiles,
    milesRemaining,
    dueByMiles,
    dueByDate,
    due,
    label: dueByMiles
      ? `Service due · ${Math.abs(milesRemaining ?? 0).toLocaleString()} mi overdue`
      : dueByDate
        ? `Service due · ${nextDate}`
        : milesRemaining != null
          ? `${milesRemaining.toLocaleString()} mi to service`
          : nextDate
            ? `Due ${nextDate}`
            : "No service interval set",
  };
}
