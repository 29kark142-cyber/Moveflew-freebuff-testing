// Sample payload for the customer tracking preview at /move/trk_demo.
// Entirely illustrative and labelled as such in the UI: no workspace record is read,
// so it can never show a real customer's move, addresses or crew phone number.
import type { PublicTrackingPayload, TrackingItem } from "@shared/tracking";

export const DEMO_TRACKING_TOKEN = "trk_demo";

const demoPhoto = (label: string, fill: string): string =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300"><rect width="480" height="300" fill="${fill}"/><text x="24" y="150" font-family="sans-serif" font-size="22" fill="#1e293b">${label}</text></svg>`,
  )}`;

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
  const demoCheckin = {
    id: "demo-checkin-1",
    milestone: "in_transit_destination" as const,
    label: "In Transit to Destination",
    note: "All eight items loaded; on the road to delivery.",
    at: minutesAgo(45),
    by: "Marcus Reed",
  };
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
    crew: [
      { name: "Marcus Reed", initials: "MR", role: "crew_lead", isDriver: true },
      { name: "Dana Kim", initials: "DK", role: "helper", isDriver: false },
      { name: "Owen Blake", initials: "OB", role: "driver", isDriver: true },
    ],
    checkins: [demoCheckin],
    lastCheckin: demoCheckin,
    vaults: [
      {
        code: "A-101",
        assets: [
          { name: "Three-seat sofa", quantity: 1 },
          { name: "Wardrobe boxes", quantity: 6 },
          { name: "Dining chairs", quantity: 4 },
        ],
        photos: [
          {
            id: "demo-vault-photo-1",
            url: demoPhoto("Sofa wrapped in vault A-101", "#dbeafe"),
            caption: "Sofa wrapped and labelled before storage",
            capturedAt: minutesAgo(240),
          },
          {
            id: "demo-vault-photo-2",
            url: demoPhoto("Boxes stacked in vault A-101", "#dcfce7"),
            caption: "Boxes stacked clear of the vault door",
            capturedAt: minutesAgo(232),
          },
        ],
      },
      {
        code: "B-204",
        assets: [{ name: "Dining table", quantity: 1 }],
        photos: [
          {
            id: "demo-vault-photo-3",
            url: demoPhoto("Table protected in vault B-204", "#fef3c7"),
            caption: "Table corner guards fitted",
            capturedAt: minutesAgo(210),
          },
        ],
      },
    ],
    inventory: demoItems.map((item, index) => ({
      id: `demo-${index}`,
      name: item.name,
      quantity: item.quantity,
      status: item.status,
    })),
    updatedAt: new Date(now).toISOString(),
  };
}
