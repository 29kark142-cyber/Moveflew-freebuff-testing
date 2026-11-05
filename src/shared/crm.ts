import { clampDiscountPercent } from "./route-pricing";
import type { SurchargeSettings } from "./surcharges";

export type WorkspaceRole =
  | "admin"
  | "office_admin"
  | "estimator"
  | "dispatcher"
  | "crew";
export type Customer = {
  id: number;
  tenantId: number;
  name: string;
  email: string;
  phone: string;
  source: string;
  score: number;
  status: string;
  notes: string;
  createdAt: string;
};
export type InventoryEntry = {
  key: string;
  name: string;
  room: string;
  cuft: number;
  weight: number;
  quantity: number;
  /** Tagged as a heavy item, so the quote adds the heavy item surcharge. */
  heavy?: boolean;
  /** Per-item override of the configured heavy item fee. */
  heavyFee?: number;
};
export type Fee = { name: string; amount: number };
export type Job = {
  id: number;
  tenantId: number;
  customerId: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  title: string;
  moveDate: string;
  startHour: number;
  duration: number;
  origin: string;
  destination: string;
  originNotes: string;
  destinationNotes: string;
  /** Optional storage address visited between pickup and drop-off. */
  storageAddress?: string;
  /** Geocoded endpoints of the calculated driving route, shown on the job sheet. */
  routeCoords?: {
    origin: { lat: number; lng: number } | null;
    destination: { lat: number; lng: number } | null;
  } | null;
  /** Percentage discount an admin or dispatcher applied to the estimate subtotal. */
  discountPercent?: number;
  moveSize: string;
  status: string;
  pricingMode: "hourly" | "long_distance";
  crewSize: number;
  hourlyRate: number;
  estimatedHours: number;
  distanceMiles: number;
  travelMinutes: number;
  travelFee: number;
  weightRate: number;
  mileRate: number;
  inventory: InventoryEntry[];
  fees: Fee[];
  total: number;
  truckId: number | null;
  crewIds: number[];
  requiredSkill: number;
  proposalToken: string;
  signature: string | null;
  clockIn: string | null;
  clockOut: string | null;
  completedSignature: string | null;
  invoiceStatus: string;
  actualHours: number | null;
  finalTotal: number | null;
  /** Crew tip recorded after the customer signed the eBOL. */
  tipCents?: number;
  /** Set once the Google review offer has been shown, so it is never repeated. */
  reviewRequestedAt?: string | null;
  reviewUrl?: string | null;
};
export type Truck = {
  id: number;
  name: string;
  plate: string;
  capacityCuft: number;
  weightLimit: number;
  dimensions: string;
  status: string;
};
export type CrewMember = {
  id: number;
  userId: number | null;
  name: string;
  email: string;
  phone: string;
  isDriver: boolean;
  crewRole?: "driver" | "helper" | "crew_lead";
  skillLevel: number;
  hourlyRate: number;
  status: string;
};
export type Reminder = {
  id: number;
  customerId: number | null;
  title: string;
  dueAt: string;
  completed: boolean;
};
export type Sequence = {
  id: number;
  name: string;
  trigger: string;
  channel: "email" | "sms";
  delayHours: number;
  condition: string;
  template: string;
  enabled: boolean;
  deliveryStatus: string;
};
export type Damage = {
  id: number;
  jobId: number;
  phase: "pre" | "post";
  note: string;
  photoUrl: string | null;
  /** Pre-move inspection metadata captured with the photo. */
  room?: string;
  item?: string;
  description?: string;
  createdAt: string;
};
export type Pricing = {
  truckFee?: number;
  /** Workspace defaults for the dynamic access and heavy item tariffs. */
  surcharges?: SurchargeSettings;
  rates: number[];
  minimumHours: number;
  packingRate: number;
  weekendPercent: number;
  travelPerMile: number;
  weightRate: number;
  mileRate: number;
  materials: { name: string; price: number }[];
};
export const DEFAULT_PRICING: Pricing = {
  rates: [50, 130, 180, 230, 280, 330],
  minimumHours: 2.5,
  packingRate: 85,
  weekendPercent: 0,
  travelPerMile: 0,
  weightRate: 0.5,
  mileRate: 2,
  materials: [
    { name: "Small box", price: 3 },
    { name: "Medium box", price: 5 },
    { name: "Wardrobe box", price: 18 },
  ],
};
export const INVENTORY: Omit<InventoryEntry, "quantity">[] = [
  { key: "sofa", name: "Sofa", room: "Living room", cuft: 50, weight: 350 },
  {
    key: "sectional",
    name: "Sectional sofa",
    room: "Living room",
    cuft: 90,
    weight: 630,
  },
  {
    key: "armchair",
    name: "Armchair",
    room: "Living room",
    cuft: 25,
    weight: 175,
  },
  {
    key: "coffee",
    name: "Coffee table",
    room: "Living room",
    cuft: 10,
    weight: 70,
  },
  { key: "tv", name: "TV & stand", room: "Living room", cuft: 15, weight: 105 },
  { key: "king", name: "King bed", room: "Bedroom", cuft: 70, weight: 490 },
  { key: "queen", name: "Queen bed", room: "Bedroom", cuft: 60, weight: 420 },
  { key: "dresser", name: "Dresser", room: "Bedroom", cuft: 30, weight: 210 },
  {
    key: "nightstand",
    name: "Nightstand",
    room: "Bedroom",
    cuft: 5,
    weight: 35,
  },
  {
    key: "dining",
    name: "Dining table",
    room: "Dining room",
    cuft: 30,
    weight: 210,
  },
  {
    key: "chair",
    name: "Dining chair",
    room: "Dining room",
    cuft: 5,
    weight: 35,
  },
  { key: "desk", name: "Office desk", room: "Office", cuft: 25, weight: 175 },
  {
    key: "wardrobe",
    name: "Wardrobe box",
    room: "Boxes",
    cuft: 10,
    weight: 70,
  },
  { key: "mediumbox", name: "Medium box", room: "Boxes", cuft: 3, weight: 21 },
  {
    key: "fridge",
    name: "Refrigerator",
    room: "Kitchen",
    cuft: 60,
    weight: 420,
  },
  { key: "washer", name: "Washer", room: "Kitchen", cuft: 25, weight: 175 },
];
export function volume(items: InventoryEntry[]) {
  return items.reduce((n, i) => n + i.cuft * i.quantity, 0);
}
export function weight(items: InventoryEntry[]) {
  return items.reduce((n, i) => n + i.weight * i.quantity, 0);
}
export function calculateQuote(
  j: Pick<
    Job,
    | "pricingMode"
    | "hourlyRate"
    | "estimatedHours"
    | "distanceMiles"
    | "travelFee"
    | "weightRate"
    | "mileRate"
    | "inventory"
    | "fees"
    | "discountPercent"
  >,
  minimumHours = 2.5
) {
  const subtotal =
    (j.pricingMode === "hourly"
      ? j.hourlyRate * Math.max(minimumHours, j.estimatedHours)
      : weight(j.inventory) * j.weightRate + j.distanceMiles * j.mileRate) +
    j.travelFee +
    j.fees.reduce((n, f) => n + f.amount, 0);
  // The estimate-level discount is applied once to the rounded subtotal, so the
  // sheet's preview, the saved total and the invoice all derive from one number.
  const discount = clampDiscountPercent(j.discountPercent);
  return Math.round(subtotal * (1 - discount / 100) * 100) / 100;
}
export function overlaps(
  a: Pick<Job, "moveDate" | "startHour" | "duration">,
  b: Pick<Job, "moveDate" | "startHour" | "duration">
) {
  return (
    a.moveDate === b.moveDate &&
    a.startHour < b.startHour + b.duration &&
    b.startHour < a.startHour + a.duration
  );
}
export const money = (
  n: number,
  locale = typeof document !== "undefined" &&
  document.documentElement.lang === "ru"
    ? "ru-RU"
    : "en-US"
) =>
  new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
