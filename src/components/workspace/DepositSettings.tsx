import { useEffect, useState } from 'react';
import { getWorkspaceId } from '@/lib/crm';
import { getDepositRule, saveDepositRule } from '@/lib/proposals.functions';
import { configureQuoteIntake } from '@/lib/quote-intake.functions';
import { depositRuleSchema } from '@/lib/proposal-rules';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Copy, Save, KeyRound } from 'lucide-react';

export default function DepositSettings({ admin }: { admin:boolean }) {
  const [mode,setMode] = useState<'fixed'|'percentage'>('fixed');
  const [value,setValue] = useState('');
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [credential,setCredential] = useState('');
  useEffect(() => {
    const workspaceId=Number(getWorkspaceId());
    if (!workspaceId) return;
    getDepositRule({ data:{workspaceId} }).then(rule=>{ if(rule){setMode(rule.mode);setValue(String(rule.value));} }).catch(e=>setError(e.message));
  },[]);
  async function save() {
    setBusy(true);setError('');
    try {
      if (!value.trim()) throw new Error('Enter a deposit amount or percentage');
      const rule=depositRuleSchema.parse({mode,value:Number(value)});
      await saveDepositRule({data:{workspaceId:Number(getWorkspaceId()),rule}});
      toast.success('Default deposit saved');
    } catch(e) { setError(e instanceof Error?e.message:'Could not save'); } finally {setBusy(false);}
  }
  async function generate() {
    setBusy(true);setError('');
    try { const result=await configureQuoteIntake({data:{workspaceId:Number(getWorkspaceId())}});setCredential(result.token);toast.success('Website credential created; previous credentials are now invalid'); }
    catch(e) {setError(e instanceof Error?e.message:'Could not configure intake');} finally {setBusy(false);}
  }
  return <section className="space-y-6 py-6">
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Default proposal deposit</h2>
      <div className="grid gap-4 sm:grid-cols-2 max-w-lg">
        <div className="space-y-2"><Label>Deposit rule</Label><Select value={mode} onValueChange={v=>setMode(v==='percentage'?'percentage':'fixed')} disabled={!admin}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="fixed">Fixed USD amount</SelectItem><SelectItem value="percentage">Percentage of estimate</SelectItem></SelectContent></Select></div>
        <div className="space-y-2"><Label htmlFor="default-deposit">{mode==='fixed'?'Amount (USD)':'Percentage (%)'}</Label><Input id="default-deposit" type="number" min="0" max={mode==='percentage'?100:100000} step="0.01" value={value} onChange={e=>setValue(e.target.value)} disabled={!admin} /></div>
      </div>
      {admin && <Button onClick={()=>void save()} disabled={busy}><Save />Save deposit rule</Button>}
    </div>
    {admin && <div className="space-y-3 border-t border-border pt-6">
      <h2 className="text-lg font-semibold">Website quote intake</h2>
      <Label htmlFor="quote-endpoint">Endpoint</Label>
      <Input id="quote-endpoint" readOnly value="https://manus-to-makeover.lovable.app/api/public/v1/quotes" className="max-w-full" />
      <Button variant="outline" disabled={busy} onClick={()=>void generate()}><KeyRound />Generate / replace website credential</Button>
      {credential && <div className="space-y-2"><Label htmlFor="website-credential">Credential · shown once</Label><Input id="website-credential" type="password" readOnly value={credential} /><Button variant="outline" onClick={()=>void navigator.clipboard.writeText(credential).then(()=>toast.success('Credential copied')).catch(()=>toast.error('Clipboard unavailable'))}><Copy />Copy credential</Button></div>}
    </div>}
    {error && <p role="alert" className="text-destructive text-sm break-words">{error}</p>}
  </section>;
}