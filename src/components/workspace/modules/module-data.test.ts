import { describe, it, expect } from 'vitest';
import { invoiceRows, sampleExpenses, filteredRows, ledgerTotal } from './module-data';
import type { DashboardData } from '@/lib/crm';
describe('workspace view records', () => {
  it('never inserts illustrative invoices into a live empty ledger', () => { expect(invoiceRows({jobs:[]} as unknown as DashboardData)).toEqual([]); });
  it('does not turn an unissued job into an invoice', () => { expect(invoiceRows({jobs:[{id:12,status:'lead'}]} as unknown as DashboardData)).toEqual([]); });
  it('search and category narrow the expense log', () => { expect(filteredRows(sampleExpenses,'diesel','Fuel').map(r=>r.id)).toEqual(['EX-1041']); expect(filteredRows(sampleExpenses,'diesel','Supplies')).toEqual([]); });
  it('derives category totals from the displayed rows', () => { expect(ledgerTotal(filteredRows(sampleExpenses,'','Fuel'))).toBe(126.4); });
});
