import 'fake-indexeddb/auto';
import {beforeEach,describe,expect,it,vi} from 'vitest';
const {session,send}=vi.hoisted(()=>({session:vi.fn(),send:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getSession:session}}}));
vi.mock('./crm',()=>({getWorkspaceId:()=>localStorage.getItem('test-workspace')}));
import {cacheField,readField,enqueueField,queuedField,syncField,queueSummary,queueSyncLabel,queueDetail} from './field-offline';
const s={userId:'user-a',workspaceId:10};
describe('scoped field offline operations',()=>{
 beforeEach(()=>{send.mockReset();vi.stubGlobal('fetch',send);session.mockResolvedValue({data:{session:{user:{id:'user-a'},access_token:'test-session-token'}}});localStorage.setItem('test-workspace','10');});
 it('does not expose cached data across users or workspaces',async()=>{await cacheField(s,'jobs',[{id:5}]);expect(await readField(s,'jobs')).toEqual([{id:5}]);expect(await readField({...s,userId:'user-b'},'jobs')).toBeUndefined();expect(await readField({...s,workspaceId:11},'jobs')).toBeUndefined();});
 it('keeps photos, checklists and signatures durable and replays in order',async()=>{
  const scope={...s,workspaceId:20};localStorage.setItem('test-workspace','20');
  await enqueueField(scope,5,'photos',{photoData:'photo'});await enqueueField(scope,5,'documents',{document:{kind:'inspection'}});await enqueueField(scope,5,'signoff',{signature:'signature'});
  send.mockResolvedValue({ok:true});await syncField(scope);
  expect(send.mock.calls.map(c=>c[0])).toEqual(['/api/crm/field/jobs/5/photos','/api/crm/field/jobs/5/documents','/api/crm/field/jobs/5/signoff']);expect(await queuedField(scope)).toEqual([]);
 });
 it('never replays another user’s writes',async()=>{const scope={...s,workspaceId:30};await enqueueField(scope,5,'photos',{});session.mockResolvedValue({data:{session:{user:{id:'user-b'}}}});await syncField(scope);expect(send).not.toHaveBeenCalled();expect((await queuedField(scope)).length).toBe(1);});
 it('retains rejected operations and stops before later sign-off',async()=>{const scope={...s,workspaceId:40};localStorage.setItem('test-workspace','40');await enqueueField(scope,5,'photos',{});await enqueueField(scope,5,'signoff',{});send.mockRejectedValue(new Error('Job no longer assigned'));await syncField(scope);expect(send).toHaveBeenCalledTimes(1);expect((await queuedField(scope)).map(x=>x.action)).toEqual(['photos','signoff']);expect((await queuedField(scope))[0].error).toBe('Job no longer assigned');});
});
describe('offline queue banner', () => {
 it('names exactly what is waiting to upload', () => {
  const operations = [
   { id: '1', scope: 'a', jobId: 5, action: 'photos' as const, body: {}, at: 1 },
   { id: '2', scope: 'a', jobId: 5, action: 'photos' as const, body: {}, at: 2 },
   { id: '3', scope: 'a', jobId: 5, action: 'pre-move' as const, body: {}, at: 3 },
   { id: '4', scope: 'a', jobId: 5, action: 'phase' as const, body: {}, at: 4 },
  ];
  const summary = queueSummary(operations);
  expect(summary).toEqual({ total: 4, photos: 2, signatures: 1 });
  expect(queueSyncLabel(summary, false)).toBe('Syncing 4 items when back online');
  expect(queueSyncLabel(summary, true)).toBe('Syncing 4 items…');
  expect(queueDetail(summary)).toBe('2 damage photos · 1 signature · 1 stage update');
 });
 it('never claims work is syncing when the queue is empty', () => {
  const empty = queueSummary([]);
  expect(queueSyncLabel(empty, false)).toBe('Offline — showing saved jobs and photos');
  expect(queueSyncLabel(empty, true)).toBe('');
  expect(queueDetail(empty)).toBe('');
  expect(queueSyncLabel(queueSummary([{ id: 'x', scope: 'a', jobId: 1, action: 'signoff' as const, body: {}, at: 1 }]), false)).toBe('Syncing 1 item when back online');
 });
});
