import type {
  WorkerDetail,
  WorkerPayout,
  WorkerPeriod,
  WorkerSummary,
  ZelleInput,
} from "@shared/workers";
import { crmFetch } from "./crm";

export type WorkerDirectoryResponse = {
  period: WorkerPeriod;
  workers: WorkerSummary[];
};

function periodQuery(period: WorkerPeriod) {
  const query = new URLSearchParams({ from: period.from, to: period.to });
  return query.toString();
}

/** Worker and payout records are always scoped by crmFetch's selected workspace. */
export const workersApi = {
  directory: (period: WorkerPeriod) =>
    crmFetch<WorkerDirectoryResponse>(`/workers?${periodQuery(period)}`),
  detail: (workerId: number, period: WorkerPeriod) =>
    crmFetch<WorkerDetail>(`/workers/${workerId}?${periodQuery(period)}`),
  payouts: (period: WorkerPeriod) =>
    crmFetch<WorkerPayout[]>(`/workers/payouts?${periodQuery(period)}`),
  recordZellePayout: (input: ZelleInput) =>
    crmFetch<WorkerPayout>("/workers/payouts", {
      method: "POST",
      body: JSON.stringify(input),
    }),
};
