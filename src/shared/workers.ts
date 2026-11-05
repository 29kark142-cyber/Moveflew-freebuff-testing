import type { CrewMember, WorkspaceRole } from "./crm";
export type WorkerPeriod = { from: string; to: string };
export type WorkerSummary = CrewMember & {
  approvedMinutes: number | null;
  baseEarnedCents: number | null;
  tipsCents: number | null;
  totalEarnedCents: number | null;
  completedJobs: number;
  paidCents: number | null;
};
export type WorkerCard = {
  id: number;
  jobId: number | null;
  workDate: string;
  minutes: number;
  breakMinutes: number;
  rateCents: number;
  approved: boolean;
  earnedCents: number;
  payoutId: number | null;
  paidMethod: string | null;
};
export type WorkerTip = {
  id: number;
  tipId: number;
  jobId: number;
  tipDate: string;
  amountCents: number;
  payoutId: number | null;
  paidMethod: string | null;
};
export type WorkerPayout = {
  id: number;
  crewMemberId: number;
  workerName: string;
  amountCents: number;
  paidDate: string;
  reference: string;
  method: "zelle";
  timecardIds: number[];
  tipAllocationIds: number[];
  createdAt: string;
};
export type WorkerDetail = {
  worker: WorkerSummary;
  period: WorkerPeriod;
  compensationVisible: boolean;
  timecards: WorkerCard[];
  tipAllocations: WorkerTip[];
  payouts: WorkerPayout[];
  jobs: Array<{ id: number; title: string; moveDate: string; status: string }>;
};
export type ZelleInput = {
  crewMemberId: number;
  amountCents: number;
  paidDate: string;
  reference: string;
  timecardIds: number[];
  tipAllocationIds: number[];
};
export const WORKER_DIRECTORY_ROLES: WorkspaceRole[] = [
  "admin",
  "office_admin",
  "dispatcher",
  "crew",
];
export function smsWorkerUrl(phone: string, body = ""): string | null {
  const clean = phone.trim();
  if (!/^[+\d()\s.-]+$/.test(clean)) return null;
  let digits = clean.replace(/\D/g, "");
  if (digits.length === 10) digits = `1${digits}`;
  if (digits.length < 7 || digits.length > 15) return null;
  return `sms:+${digits}${body ? `?body=${encodeURIComponent(body)}` : ""}`;
}
// GET /api/crm/workers?from=YYYY-MM-DD&to=YYYY-MM-DD -> { period, workers: WorkerSummary[] }
// GET /api/crm/workers/:id?from=...&to=... -> WorkerDetail
// GET /api/crm/workers/payouts?from=...&to=... -> WorkerPayout[] (finance-only)
// POST /api/crm/workers/payouts -> WorkerPayout; exact approved source allocations, no transfer.
