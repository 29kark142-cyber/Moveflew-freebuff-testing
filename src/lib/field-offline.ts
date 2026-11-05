import { openDB } from 'idb';
import { supabase } from '@/integrations/supabase/client';
import { getWorkspaceId } from './crm';

export type FieldScope = { userId: string; workspaceId: number };
export type FieldOperation = { id: string; scope: string; jobId: number; action: 'phase'|'photos'|'documents'|'signoff'|'pre-move'|'tip'; body: Record<string, unknown>; at: number; error?: string };
export const scopeKey = (s: FieldScope) => `${s.userId}:${s.workspaceId}`;
const db = () => openDB('moveflew-field-v1', 1, { upgrade(d) { d.createObjectStore('queue', { keyPath: 'id' }); d.createObjectStore('cache'); } });
export async function cacheField(scope: FieldScope, key: string, value: unknown) { const d = await db(); await d.put('cache', value, `${scopeKey(scope)}:${key}`); }
export async function readField<T>(scope: FieldScope, key: string): Promise<T | undefined> { return (await db()).get('cache', `${scopeKey(scope)}:${key}`); }
export async function queuedField(scope: FieldScope): Promise<FieldOperation[]> { return ((await (await db()).getAll('queue')) as FieldOperation[]).filter(x => x.scope === scopeKey(scope)).sort((a,b) => a.at-b.at); }
export async function enqueueField(scope: FieldScope, jobId: number, action: FieldOperation['action'], body: Record<string, unknown>) {
  const d=await db();const tx=d.transaction('queue','readwrite');
  const existing=(await tx.store.getAll()) as FieldOperation[];
  const last=existing.filter(x=>x.scope===scopeKey(scope)).reduce((max,x)=>Math.max(max,x.at),0);
  const op: FieldOperation = { id: String(body.operationId || crypto.randomUUID()), scope: scopeKey(scope), jobId, action, body, at: Math.max(Date.now(),last+1) };
  op.body.operationId = op.id;
  await tx.store.put(op);await tx.done;
  return op;
}
async function activeScope(scope: FieldScope) {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id === scope.userId && Number(getWorkspaceId()) === scope.workspaceId ? data.session.access_token : null;
}
async function replayField(scope: FieldScope) {
  if (!navigator.onLine || !await activeScope(scope)) return;
  const operations = await queuedField(scope);
  for (const op of operations) {
    const token=await activeScope(scope);
    if (!navigator.onLine || !token) break;
    try {
      const response=await fetch(`/api/crm/field/jobs/${op.jobId}/${op.action}`, {method:'POST',body:JSON.stringify(op.body),headers:{'Authorization':`Bearer ${token}`,'x-workspace-id':String(scope.workspaceId),'Content-Type':'application/json'}});
      if(!response.ok){const result=await response.json().catch(()=>({}));throw new Error(result.error || `Sync refused (${response.status})`);}
      await (await db()).delete('queue', op.id);
    } catch (e) {
      await (await db()).put('queue', { ...op, error: e instanceof Error ? e.message : 'Sync failed' });
      break; // Never lose refused writes or replay a later signature ahead of photos/checklists.
    }
  }
}
export async function syncField(scope:FieldScope) {
  if(navigator.locks)return navigator.locks.request(`moveflew-field-sync:${scopeKey(scope)}`,()=>replayField(scope));
  return replayField(scope);
}