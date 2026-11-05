import type { WorkspaceRole } from "./crm";
export type ModuleProps = {
  role: WorkspaceRole;
  path: string;
  navigate: (path: string) => void;
};
export type Row = { id: number; [key: string]: any };
export type Facility = Row & { name: string; address: string; notes: string };
export type Vault = Row & {
  facilityId: number;
  name: string;
  kind: string;
  capacityCuft: number;
  occupiedCuft: number;
  status: string;
};
export type StorageAccount = Row & {
  customerId: number;
  customerName: string;
  kind: string;
  startDate: string;
  endDate: string | null;
  monthlyRateCents: number;
  dueDay: number;
  status: string;
  autoInvoice: boolean;
  notes: string;
};
export type StorageItem = Row & {
  accountId: number;
  vaultId: number;
  name: string;
  quantity: number;
  cuft: number;
  weightLbs: number;
  status: string;
  notes: string;
};
export type Invoice = Row & {
  customerId: number;
  customerName: string;
  jobId: number | null;
  accountId: number | null;
  kind: string;
  invoiceNumber: string;
  period: string | null;
  dueDate: string;
  totalCents: number;
  paidCents: number;
  balanceCents: number;
  status: string;
  notes: string;
  items: Array<{ name: string; quantity: number; unitCents: number }>;
};
export type Claim = Row & {
  jobId: number;
  customerId: number;
  customerName: string;
  type: string;
  status: string;
  description: string;
  claimedCents: number;
  approvedCents: number;
  dueDate: string | null;
  resolution: string;
};
export type Timecard = Row & {
  crewMemberId: number;
  crewName: string;
  jobId: number | null;
  workDate: string;
  minutes: number;
  breakMinutes: number;
  rateCents: number;
  approved: boolean;
  payoutId?: number | null;
  paidMethod?: "zelle" | null;
  notes: string;
};
export type Expense = Row & {
  jobId: number | null;
  category: string;
  amountCents: number;
  incurredDate: string;
  vendor: string;
  notes: string;
};
export type Tip = Row & {
  jobId: number;
  amountCents: number;
  method: string;
  allocations: Array<{
    crewMemberId: number;
    amountCents: number;
    payoutId?: number | null;
    paidMethod?: "zelle" | null;
  }>;
};
export type Communication = Row & {
  customerId: number;
  customerName: string;
  channel: string;
  direction: string;
  body: string;
  status: string;
  createdAt: string;
};
export type Campaign = Row & {
  name: string;
  source: string;
  startDate: string;
  endDate: string;
  spendCents: number;
  notes: string;
};
export type ReviewRequest = Row & {
  customerId: number;
  jobId: number | null;
  customerName: string;
  status: string;
  rating: number | null;
  feedback: string;
  createdAt: string;
};
export type AccessKey = Row & {
  name: string;
  kind: string;
  prefix: string;
  scopes: string[];
  customerId: number | null;
  expiresAt: string | null;
  revoked: boolean;
  createdAt: string;
};
export type Webhook = Row & {
  url: string;
  events: string[];
  enabled: boolean;
  createdAt: string;
};
export const PIPELINE_STAGES = [
  "lead",
  "qualified",
  "estimate",
  "booked",
  "won",
  "lost",
] as const;
export const CLAIM_STATUSES = [
  "open",
  "investigating",
  "offered",
  "resolved",
  "rejected",
] as const;
export const cents = (amount: number) => Math.round(amount * 100);
export const dollars = (amountCents: number) => amountCents / 100;
