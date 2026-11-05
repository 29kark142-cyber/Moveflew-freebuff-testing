import { z } from 'zod';

export const depositRuleSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('fixed'), value: z.number().finite().min(0).max(100000) }),
  z.object({ mode: z.literal('percentage'), value: z.number().finite().min(0).max(100) }),
]);
export type DepositRule = z.infer<typeof depositRuleSchema>;
export function requiredDeposit(total: number, rule: DepositRule | null, override?: number | null) {
  if (!Number.isFinite(total) || total < 0) throw new Error('Invalid estimate total');
  const amount = override ?? (rule ? rule.mode === 'fixed' ? rule.value : total * rule.value / 100 : null);
  if (amount === null) throw new Error('Configure a workspace deposit rule or enter a proposal deposit');
  if (!Number.isFinite(amount) || amount < 0 || amount > total) throw new Error('Deposit must be between zero and the estimate total');
  return Math.round(amount * 100);
}
export const proposalTokenSchema = z.string().regex(/^[a-f0-9]{32}$/);
export const signatureSchema = z.string().min(100).max(300000).regex(/^data:image\/png;base64,iVBOR[A-Za-z0-9+/=]+$/);
export const quoteSchema = z.object({
  name: z.string().trim().min(1).max(180),
  email: z.string().trim().email().max(320),
  phone: z.string().trim().min(7).max(40),
  origin: z.string().trim().min(1).max(500),
  destination: z.string().trim().min(1).max(500),
  moveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !Number.isNaN(Date.parse(v))),
  moveSize: z.string().trim().max(100).default(''),
  message: z.string().trim().max(5000).default(''),
});