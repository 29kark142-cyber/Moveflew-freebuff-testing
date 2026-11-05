// Sample records for "Load Demo Job": one truck, two crew and one booked, fully assigned move.
// Every record is clearly named "Demo" so testers can tell it apart from real work.
export const DEMO_TRUCK = { name: "Demo Truck 26ft", plate: "DEMO-26", capacityCuft: 1600, weightLimit: 10000, dimensions: "26' x 8' x 8'", status: "available" };
export const DEMO_CREW = [
  { name: "Alex Demo", email: "", phone: "", isDriver: true, skillLevel: 3, hourlyRate: 28, status: "active", crewRole: "driver" },
  { name: "Sam Demo", email: "", phone: "", isDriver: false, skillLevel: 2, hourlyRate: 22, status: "active", crewRole: "helper" },
];
export const DEMO_CUSTOMER = { name: "Jordan Rivera (Demo)", email: "", phone: "(312) 555-0142", source: "Demo data" };

export function demoJob(date: string, truckId: number, crewIds: number[], customerId: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Invalid date");
  return {
    title: "Demo move — 2BR apartment",
    customerId,
    moveDate: date,
    startHour: 9,
    duration: 4,
    origin: "233 S Wacker Dr, Chicago, IL 60606",
    destination: "1603 Orrington Ave, Evanston, IL 60201",
    originNotes: "Freight elevator reserved 9–11 AM.",
    destinationNotes: "Street parking; 2nd floor walk-up.",
    moveSize: "2 bedroom",
    status: "booked",
    pricingMode: "hourly",
    crewSize: 2,
    hourlyRate: 130,
    estimatedHours: 4,
    distanceMiles: 14,
    travelMinutes: 30,
    travelFee: 45,
    fees: [],
    inventory: [],
    truckId,
    crewIds,
    notes: "Sample job created by Load Demo Job. Safe to delete.",
  };
}

const DEMO_JOB_TITLE = "Demo move — 2BR apartment";
const DEMO_JOB_NOTES = "Sample job created by Load Demo Job. Safe to delete.";
type Data = Record<string, unknown>;

/** True only for records created by the demo loader (matched on its exact sample values). */
export function isDemoRecord(kind: string, d: Data): boolean {
  if (kind === "job") return d["title"] === DEMO_JOB_TITLE && d["notes"] === DEMO_JOB_NOTES;
  if (kind === "truck") return d["name"] === DEMO_TRUCK.name && d["plate"] === DEMO_TRUCK.plate;
  if (kind === "crew") return DEMO_CREW.some(c => c.name === d["name"] && c.crewRole === d["crewRole"]) && !d["userId"];
  if (kind === "customer") return d["name"] === DEMO_CUSTOMER.name && d["source"] === DEMO_CUSTOMER.source;
  return false;
}
