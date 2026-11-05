export type RevenueJob = {
  status: string;
  deletedAt?: unknown;
  customerId: number;
};
export type RevenueCustomer = { id: number; status: string };
/** Forecasts are opportunities, not cash. Archived, cancelled, draft and lost records never contribute. */
export function eligibleRevenue(
  job: RevenueJob,
  customer?: RevenueCustomer
): boolean {
  if (job.deletedAt) return false;
  const status = job.status.trim().toLowerCase();
  if (!["estimate", "booked", "completed"].includes(status)) return false;
  if (
    customer &&
    ["draft", "lost", "cancelled", "canceled", "declined", "inactive", "closed"].includes(
      customer.status.trim().toLowerCase()
    )
  )
    return false;
  return true;
}
export function eligibleEstimateRevenue(
  job: RevenueJob,
  customer?: RevenueCustomer
): boolean {
  return job.status === "estimate" && eligibleRevenue(job, customer);
}
