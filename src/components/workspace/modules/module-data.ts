import type { DashboardData } from '@/lib/crm';
import { INVENTORY } from '@/shared/crm';
export type LedgerRow = { id: string; name: string; category: string; amount: number; status: string; date: string; jobId?: number };
export const sampleExpenses: LedgerRow[] = [
  { id:'EX-1041', name:'Diesel • Truck 02', category:'Fuel', amount:126.40, status:'paid', date:'2026-11-01' },
  { id:'EX-1042', name:'Moving blankets & cartons', category:'Supplies', amount:218, status:'pending', date:'2026-11-01' },
  { id:'EX-1043', name:'Preventive maintenance', category:'Maintenance', amount:385, status:'paid', date:'2026-10-31' },
  { id:'EX-1044', name:'Warehouse utilities', category:'Facilities', amount:142, status:'pending', date:'2026-10-30' },
];
export const sampleInvoices: LedgerRow[] = [
  { id:'INV-2081', name:'Residential relocation', category:'Moving', amount:1280, status:'paid', date:'2026-11-01' },
  { id:'INV-2082', name:'Office relocation', category:'Moving', amount:2460, status:'sent', date:'2026-11-02' },
  { id:'INV-2083', name:'Storage • November', category:'Storage', amount:240, status:'draft', date:'2026-11-03' },
];
export function invoiceRows(data: DashboardData): LedgerRow[] {
  return data.jobs.filter(j => (j.invoiceStatus && j.invoiceStatus !== 'draft') || j.status === 'completed').map(j => ({ id:`INV-${j.id}`, name:j.customerName || j.title, category:'Moving', amount:j.finalTotal ?? j.total, status:j.invoiceStatus || 'draft', date:j.moveDate, jobId:j.id }));
}
export const catalog = INVENTORY.map((item, i) => ({ ...item, id:String(i+1), quantity:1 }));
export const sampleUnits = [ { id:'A-01', name:'Vault A-01', status:'occupied', used:380, capacity:600, customer:'Sample residential shipment' }, { id:'A-02', name:'Vault A-02', status:'available', used:0, capacity:600, customer:'—' }, { id:'B-01', name:'Vault B-01', status:'occupied', used:540, capacity:800, customer:'Sample office shipment' }, { id:'B-02', name:'Vault B-02', status:'maintenance', used:0, capacity:800, customer:'—' } ];
export const sampleMoves = [ { id:-1, title:'Residential relocation', customerName:'Sample customer A', origin:'Chicago, IL', destination:'Evanston, IL', moveDate:'2026-11-01', startHour:8, duration:4, crewSize:3, truckId:-1, crewIds:[], status:'booked', total:1280, inventory:catalog.slice(0,4), completedSignature:null }, { id:-2, title:'Office relocation', customerName:'Sample customer B', origin:'Evanston, IL', destination:'Madison, WI', moveDate:'2026-11-02', startHour:9, duration:6, crewSize:4, truckId:-2, crewIds:[], status:'booked', total:2460, inventory:catalog.slice(5,9), completedSignature:null } ];
export function filteredRows<T extends {name:string; category?:string}>(rows:T[], query:string, category:string) {
  return rows.filter(r => r.name.toLowerCase().includes(query.toLowerCase()) && (category==='all' || r.category===category));
}
export function ledgerTotal(rows:LedgerRow[]) { return rows.reduce((sum,r) => sum+r.amount,0); }
