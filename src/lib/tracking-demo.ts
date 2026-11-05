// Sample payload for the customer tracking preview at /move/trk_demo.
// Entirely illustrative and labelled as such in the UI: no workspace record is read,
// so it can never show a real customer's move, addresses or crew phone number.
import type { PublicTrackingPayload, TrackingItem } from "@shared/tracking";

export const DEMO_TRACKING_TOKEN = "trk_demo";

const demoItems: { name: string; quantity: number; status: TrackingItem["status"] }[] = [
  { name: "Three-seat sofa", quantity: 1, status: "in_transit" },
  { name: "Queen bed frame", quantity: 1, status: "in_transit" },
  { name: "Dining table", quantity: 1, status: "in_transit" },
  { name: "Dining chairs", quantity: 4, status: "unloaded" },
  { name: "Wardrobe boxes", quantity: 6, status: "unloaded" },
  { name: "Kitchen crates", quantity: 5, status: "unloaded" },
  { name: "Desk and monitor", quantity: 1, status: "unloaded" },
  { name: "Bookshelf", quantity: 2, status: "unloaded" },
];

/** Mid-unload move so the preview exercises every part of the tracking screen. */
export function demoTrackingPayload(now = Date.now()): PublicTrackingPayload {
  const at = new Date(now);
  const minutesAgo = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
  const moveDate = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(
    at.getDate(),
  ).padStart(2, "0")}`;
  // Schedule the completion a little ahead of "now" so the countdown has something to show.
  const completionHour = at.getHours() + at.getMinutes() / 60 + 0.75;
  const startHour = Math.max(0, Math.min(19, completionHour - 4));
  return {
    reference: "MF-0042",
    company: {
      name: "MoveFlew Moving Co.",
      phone: "+15550100789",
      email: "dispatch@moveflew.example",
      monogram: "MF",
    },
    moveDate,
    startHour,
    duration: 4,
    travelMinutes: 40,
    distanceMiles: 18,
    origin: "1204 Cedar Lane, Springfield",
    destination: "88 Harbour View Rd, Riverton",
    timeline: {
      start_travel: minutesAgo(120),
      arrive_pickup: minutesAgo(95),
      start_loading: minutesAgo(85),
      in_transit: minutesAgo(45),
      arrive_dropoff: minutesAgo(6),
    },
    foreman: {
      name: "Marcus Reed",
      phone: "+15550100789",
      role: "crew_lead",
      initials: "MR",
    },
    inventory: demoItems.map((item, index) => ({
      id: `demo-${index}`,
      name: item.name,
      quantity: item.quantity,
      status: item.status,
    })),
    updatedAt: new Date(now).toISOString(),
  };
}
