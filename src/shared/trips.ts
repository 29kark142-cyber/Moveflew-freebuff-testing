export type TripPlan = {
  id: number;
  name: string;
  fromDate: string;
  toDate: string;
  status: string;
  notes: string;
  jobIds: number[];
  truckIds: number[];
  driverIds: number[];
  warnings: string[];
};
export function tripWindowsOverlap(
  a: { fromDate: string; toDate: string },
  b: { fromDate: string; toDate: string }
): boolean {
  return a.fromDate <= b.toDate && b.fromDate <= a.toDate;
}
export function tripResourceWarnings(
  input: Pick<TripPlan, "fromDate" | "toDate" | "truckIds" | "driverIds">,
  others: TripPlan[]
): string[] {
  return others
    .filter(
      trip =>
        !["cancelled", "completed"].includes(trip.status) &&
        tripWindowsOverlap(input, trip)
    )
    .flatMap(trip => [
      ...(input.truckIds.some(id => trip.truckIds.includes(id))
        ? [`Truck overlaps trip: ${trip.name}`]
        : []),
      ...(input.driverIds.some(id => trip.driverIds.includes(id))
        ? [`Driver overlaps trip: ${trip.name}`]
        : []),
    ]);
}
