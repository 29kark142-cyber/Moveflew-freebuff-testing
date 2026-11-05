import { useEffect,useState } from 'react';
import { cacheField,readField,type FieldScope } from '@/lib/field-offline';
import { Check, FileCheck, Plus, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import SignaturePad from './SignaturePad';
import { BOL_TERMS,DAMAGE_TERMS,DOCUMENT_TITLES,type DocumentKind,type FieldDocument,type FieldDocuments as Documents } from '@/shared/field-documents';

export default function FieldDocuments({documents,job,scope,locked,onSave}:{documents:Documents;job:Record<string,unknown>;scope:FieldScope;locked:boolean;onSave:(d:FieldDocument)=>Promise<void>}) {
  const [kind,setKind]=useState<DocumentKind>('bol');
  return <section className="space-y-4 border-y border-border py-5">
    <h2 className="text-lg font-semibold text-foreground">Move-day documents</h2>
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Field documents">
      {(Object.keys(DOCUMENT_TITLES) as DocumentKind[]).map(k=><Button key={k} role="tab" aria-selected={kind===k} variant={kind===k?'default':'outline'} size="sm" onClick={()=>setKind(k)}>{documents[k]?.signature?<Check/>:<FileCheck/>}{k==='bol'?'BOL':k==='damage'?'Damage waiver':'Inspection'}</Button>)}
    </div>
    <DocumentEditor key={`${kind}-${documents[kind]?.signedAt || ''}`} scope={scope} kind={kind} doc={documents[kind]} job={job} locked={locked} onSave={onSave}/>
  </section>;
}
function DocumentEditor({kind,doc,job,scope,locked,onSave}:{kind:DocumentKind;doc?:FieldDocument;job:Record<string,unknown>;scope:FieldScope;locked:boolean;onSave:(d:FieldDocument)=>Promise<void>}) {
  const [notes,setNotes]=useState(doc?.notes || '');
  const [items,setItems]=useState(doc?.items || []);
  const [sig,setSig]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  const [restored,setRestored]=useState(false);
  const signed=Boolean(doc?.signature); const readonly=locked || signed;
  const draftKey=`document-draft:${job['id']}:${kind}`;
  useEffect(()=>{let active=true;void readField<FieldDocument>(scope,draftKey).then(d=>{if(!active)return;if(d && !readonly){setNotes(d.notes);setItems(d.items);setSig(d.signature);}setRestored(true);});return()=>{active=false;};},[scope.userId,scope.workspaceId,draftKey]);
  useEffect(()=>{if(restored && !readonly)void cacheField(scope,draftKey,{kind,notes,items,signature:sig});},[restored,readonly,notes,items,sig]);
  const save=async(sign:boolean)=>{setBusy(true);try{await onSave({kind,notes,items,signature:sign?sig:null});}finally{setBusy(false);}};
  return <div className="space-y-3 text-foreground">
    <h3 className="font-semibold">{DOCUMENT_TITLES[kind]}</h3>
    {kind==='bol' && <dl className="grid gap-2 text-sm"><div><dt className="text-muted-foreground">Customer</dt><dd>{String(job['customerName'] || job['title'] || '')}</dd></div><div><dt className="text-muted-foreground">Pickup → delivery</dt><dd>{String(job['origin'] || '')} → {String(job['destination'] || '')}</dd></div><div><dt className="text-muted-foreground">Move date</dt><dd>{String(job['moveDate'] || '')}</dd></div></dl>}
    <p className="text-sm text-muted-foreground">{kind==='damage'?DAMAGE_TERMS:kind==='bol'?BOL_TERMS:'Record furniture condition before loading and note any changes at delivery.'}</p>
    <label className="block space-y-1 text-sm"><span>{kind==='damage'?'Pre-existing conditions':'Document notes'}</span><textarea aria-label={`${DOCUMENT_TITLES[kind]} notes`} value={notes} disabled={readonly} onChange={e=>setNotes(e.target.value)} maxLength={5000} className="min-h-24 w-full rounded-md border border-input bg-background p-3 text-base"/></label>
    {kind==='inspection' && <>
      {items.map((item,i)=><fieldset key={item.id} className="space-y-2 border-b border-border pb-3"><legend className="text-sm font-medium">Item {i+1}</legend>
        <input aria-label={`Furniture item ${i+1}`} value={item.item} disabled={readonly} placeholder="Furniture item" maxLength={120} className="h-11 w-full rounded-md border border-input bg-background px-3" onChange={e=>setItems(items.map(x=>x.id===item.id?{...x,item:e.target.value}:x))}/>
        <div className="flex gap-2"><select aria-label={`Condition ${i+1}`} value={item.condition} disabled={readonly} className="h-11 flex-1 rounded-md border border-input bg-background px-3" onChange={e=>setItems(items.map(x=>x.id===item.id?{...x,condition:e.target.value as typeof item.condition}:x))}><option value="good">Good</option><option value="scratched">Scratched</option><option value="dented">Dented</option><option value="other">Other</option></select><Button variant="ghost" size="icon" aria-label={`Remove item ${i+1}`} disabled={readonly} onClick={()=>setItems(items.filter(x=>x.id!==item.id))}><Trash2/></Button></div>
        <input aria-label={`Condition notes ${i+1}`} value={item.notes} disabled={readonly} placeholder="Condition notes" maxLength={1000} className="h-11 w-full rounded-md border border-input bg-background px-3" onChange={e=>setItems(items.map(x=>x.id===item.id?{...x,notes:e.target.value}:x))}/>
      </fieldset>)}
      {!readonly && <Button variant="outline" disabled={items.length>=200} onClick={()=>setItems([...items,{id:crypto.randomUUID(),item:'',condition:'good',notes:''}])}><Plus/>Add furniture item</Button>}
    </>}
    {signed?<div className="space-y-1"><p className="text-sm font-medium">Signed {doc?.signedAt?new Date(doc.signedAt).toLocaleString():'on this device'}</p><img src={doc?.signature || ''} alt={`${DOCUMENT_TITLES[kind]} customer signature`} className="max-h-32 w-full rounded-md border border-border object-contain"/></div>:readonly?<p className="text-sm text-muted-foreground">Document locked at final sign-off.</p>:<>
      <SignaturePad onChange={setSig} label={`Sign ${DOCUMENT_TITLES[kind]}`}/>
      {sig && <img src={sig} alt="Captured document signature" className="h-20 w-full rounded-md border border-border object-contain"/>}
      <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy || items.some(x=>!x.item.trim())} onClick={()=>void save(false)}><Save/>Save draft</Button><Button disabled={!sig || busy || items.some(x=>!x.item.trim())} onClick={()=>void save(true)}><Check/>Complete & sign document</Button></div>
    </>}
  </div>;
}