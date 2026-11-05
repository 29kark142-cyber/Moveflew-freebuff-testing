import { eligibleRevenue } from './revenue';

type ReportJob = { status: string; customerId: number; deletedAt?: unknown; total?: number; finalTotal?: number | null; actualHours?: number | null; estimatedHours?: number; crewIds?: number[] };
type ReportCrew = { id: number; name: string };
export function operationalReport(jobs: ReportJob[], crew: ReportCrew[], customers: { id: number; status: string }[]) {
  const completed = jobs.filter(j => j.status === 'completed' && eligibleRevenue(j, customers.find(c => c.id === j.customerId)));
  const amount = (j: ReportJob) => Math.max(0, Number(j.finalTotal ?? j.total) || 0);
  const revenue = completed.reduce((sum, j) => sum + amount(j), 0);
  return {
    revenue, completedMoves: completed.length, averageOrder: completed.length ? revenue / completed.length : 0,
    crew: crew.map(c => {
      const assigned = completed.filter(j => j.crewIds?.includes(c.id));
      return { id: c.id, name: c.name, moves: assigned.length,
        hours: assigned.reduce((sum, j) => sum + Math.max(0, Number(j.actualHours ?? j.estimatedHours) || 0), 0),
        revenue: assigned.reduce((sum, j) => sum + amount(j) / Math.max(1, new Set(j.crewIds).size), 0) };
    }).sort((a, b) => b.moves - a.moves),
  };
}
// Illustrative only: returned by the UI when there are no workspace jobs; never persisted.
export const SAMPLE_REPORT = {
  revenue: 18600, completedMoves: 24, averageOrder: 775,
  crew: [{ id: -1, name: 'Alex Morgan', moves: 12, hours: 48, revenue: 6900 },
    { id: -2, name: 'Jordan Lee', moves: 10, hours: 41, revenue: 6200 },
    { id: -3, name: 'Taylor Reed', moves: 8, hours: 34, revenue: 5500 }],
};