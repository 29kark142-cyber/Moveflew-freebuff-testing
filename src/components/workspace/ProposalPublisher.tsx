import { useState } from 'react';
import { publishProposal } from '@/lib/proposals.functions';
import { getWorkspaceId } from '@/lib/crm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Copy, FileCheck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function ProposalPublisher({jobId,onPublished}:{jobId:number;onPublished:()=>void}) {
  const [override,setOverride]=useState(false);
  const [amount,setAmount]=useState('');
  const [busy,setBusy]=useState(false);
  const [url,setUrl]=useState('');
  const [error,setError]=useState('');
  const [deposit,setDeposit]=useState<number|null>(null);
  async function create() {
    setBusy(true);setError('');
    try {
      if(override && !amount.trim()) throw new Error('Enter the proposal deposit');
      const result=await publishProposal({data:{workspaceId:Number(getWorkspaceId()),jobId,depositOverride:override?Number(amount):null}});
      const link=`${window.location.origin}/proposal/${result.token}`;
      setUrl(link);setDeposit(result.depositCents);
      try {await navigator.clipboard.writeText(link);toast.success('Proposal created and link copied');} catch {toast.success('Proposal created');}
    } catch(e) {setError(e instanceof Error?e.message:'Could not create proposal');} finally {setBusy(false);}
  }
  return <section className="space-y-4 border-y border-border py-6 mb-6">
    <h2 className="text-lg font-semibold">Customer proposal</h2>
    <div className="flex items-center gap-2"><Checkbox id="deposit-override" checked={override} onCheckedChange={v=>setOverride(v===true)} /><Label htmlFor="deposit-override">Override workspace deposit</Label></div>
    {override && <div className="max-w-xs space-y-2"><Label htmlFor="proposal-deposit">Required deposit (USD)</Label><Input id="proposal-deposit" type="number" min="0" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} /></div>}
    <Button disabled={busy} onClick={()=>void create()}>{busy?<Loader2 className="animate-spin"/>:<FileCheck/>}Create proposal link</Button>
    {deposit!==null && <p className="text-sm">Required deposit: {new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(deposit/100)}</p>}
    {url && <div className="flex flex-wrap gap-2"><a className="break-all text-primary underline" href={url} target="_blank" rel="noreferrer">{url}</a><Button variant="outline" size="icon" aria-label="Copy proposal link" title="Copy proposal link" onClick={()=>void navigator.clipboard.writeText(url).then(()=>toast.success('Link copied')).catch(()=>toast.error('Clipboard unavailable'))}><Copy/></Button><Button variant="outline" onClick={onPublished}>Refresh job</Button></div>}
    {error && <p role="alert" className="text-destructive break-words">{error}</p>}
  </section>;
}