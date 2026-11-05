import { describe, expect, it } from 'vitest';
import { operationalReport } from './workspace-reports';
describe('operational reports', () => {
  it('counts completed moves and uses final revenue, excluding cancelled and declined moves', () => {
    const r = operationalReport([
      { status: 'completed', customerId: 1, total: 900, finalTotal: 1000 },
      { status: 'completed', customerId: 1, total: 500 },
      { status: 'cancelled', customerId: 1, total: 6000 },
      { status: 'declined', customerId: 1, total: 7000 },
      { status: 'booked', customerId: 1, total: 8000 },
    ], [], []);
    expect(r.revenue).toBe(1500); expect(r.completedMoves).toBe(2); expect(r.averageOrder).toBe(750);
  });
  it('splits attributed revenue between assigned crew without double counting', () => {
    const r = operationalReport([{ status: 'completed', customerId: 1, total: 800, crewIds: [1, 2], actualHours: 4 }], [{ id: 1, name: 'A' }, { id: 2, name: 'B' }], []);
    expect(r.crew.map(c => c.revenue)).toEqual([400, 400]); expect(r.crew[0].hours).toBe(4);
  });
  it('returns zero metrics for no records', () => {
    expect(operationalReport([], [], [])).toEqual({ revenue: 0, completedMoves: 0, averageOrder: 0, crew: [] });
  });
});