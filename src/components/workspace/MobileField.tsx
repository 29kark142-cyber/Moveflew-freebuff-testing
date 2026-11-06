import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Banknote, Camera, CheckCircle2, ChevronLeft, CreditCard, MapPin, MessageSquare, Phone, RefreshCw, WifiOff } from "lucide-react";
import { crmFetch, getWorkspaceId, sessionAuthorization } from "@/lib/crm";
import { shrinkImage } from "@/lib/photo";
import PreMoveInspection from "./PreMoveInspection";
import TrackingShare from "./TrackingShare";
import TipAndReview from "./TipAndReview";
import type { DamagePhoto, PreMoveInspection as PreMoveRecord } from "@shared/damage";
import type { TipRecord } from "@shared/tipping";
import SignaturePad from "@/components/workspace/SignaturePad";
import { FIELD_PHASES, type FieldPhase, type FieldStatus, type FinalBill, type Timeline } from "@shared/field";
import { fieldStatus,finalBill,billableHours } from '@shared/field';
import { cacheField,readField,queuedField,enqueueField,syncField,queueSummary,queueSyncLabel,queueDetail,type FieldQueueSummary,type FieldScope,type FieldOperation } from '@/lib/field-offline';
import JobInvoicePdfButton from './JobInvoicePdfButton';
import FieldDocuments from './FieldDocuments';
import MoveChecklist from "./MoveChecklist";
import PreTripInspection from "./PreTripInspection";
import { DemoJobButton, ClearDemoButton, isDemoJob } from './BetaTools';
import type { FieldDocument,FieldDocuments as Documents } from '@/shared/field-documents';
import { useLocation } from "@/lib/wouter";
import { Button } from '@/components/ui/button';

type FieldJob = Record<string, unknown> & {
  id: number; title?: string; origin?: string; destination?: string; startHour?: number; customerName?: string; customerPhone?: string;
  timeline?: Timeline; fieldStatus: FieldStatus; nextPhase: FieldPhase | null; bill: FinalBill;
  completedSignature?: string | null; finalPayment?: { method: string; amountCents: number; mode?: string } | null;
  fieldDocuments?:Documents;fieldPdf?:{ready?:boolean;emailStatus:string};fieldDocumentId?:string;
  preMoveInspection?: PreMoveRecord | null; trackingToken?: string;
  tip?: TipRecord | null;
  reviewRequestedAt?: string | null;
  reviewUrl?: string | null;
  moveChecklist?: unknown;
  activity?: unknown;
  driverCheckins?: Array<{ id: string; label: string; at: string; note?: string; crewName?: string }>;
  driverLocation?: { label: string; at: string; crewName: string } | null;
};
type Me = { id: number; name: string; crewRole: string } | null;
type Photo = DamagePhoto;
const OFFICE = ["admin", "office_admin", "dispatcher"];
const CHECKINS = [
  { key: "en_route_origin", label: "En Route" },
  { key: "arrived_pickup", label: "Arrived at Pickup" },
  { key: "in_transit_destination", label: "In Transit" },
  { key: "arrived_unload", label: "Arrived at Unload" },
] as const;

/** Device GPS with clear, phone-friendly failures instead of a silent no-op. */
const locateDevice = () =>
  new Promise<GeolocationPosition>((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("This device cannot share a GPS location."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      resolve,
      (error) => {
        reject(
          new Error(
            error.code === error.PERMISSION_DENIED
              ? "Allow location access to send a check-in."
              : error.code === error.TIMEOUT
                ? "GPS timed out. Move somewhere with a clearer signal and retry."
                : "Could not read your GPS location.",
          ),
        );
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 20_000 },
    );
  });

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const hourLabel = (h = 8) => { const hh = Math.floor(h); const m = Math.round((h - hh) * 60); return new Date(2000, 0, 1, hh, m).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); };
const timeOf = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "");
const post = <T,>(path: string, body: unknown = {}) => crmFetch<T>(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const isOffline = (e: unknown) => !navigator.onLine || (e instanceof TypeError);

const BADGE: Record<FieldStatus, string> = {
  Assigned: "bg-muted text-foreground",
  "In Transit": "bg-accent text-accent-foreground",
  "In Progress": "bg-primary/15 text-primary",
  Completed: "bg-primary text-primary-foreground",
};

export default function MobileField({ role,userId,workspaceId }: { role: string;userId:string;workspaceId:number }) {
  const scope:FieldScope={userId,workspaceId};
  const [date, setDate] = useState(today);
  const [jobs, setJobs] = useState<FieldJob[] | null>(null);
  const [me, setMe] = useState<Me>(null);
  const [, navigate] = useLocation();
  const [openId, setOpenId] = useState<number | null>(() => {
    const value = Number(new URLSearchParams(window.location.search).get("job"));
    return Number.isInteger(value) && value > 0 ? value : null;
  });
  const [offline, setOffline] = useState(false);
  const [queueState, setQueueState] = useState<FieldQueueSummary>({ total: 0, photos: 0, signatures: 0 });
  const pending = queueState.total;
  const [syncError,setSyncError]=useState('');
  const [officeEmail,setOfficeEmail]=useState('');
  const [reviewUrl,setReviewUrl]=useState('');
  const [officeSaving,setOfficeSaving]=useState(false);

  const load = useCallback(async () => {
    try {
      const r = await crmFetch<{ me: Me; jobs: FieldJob[] }>(`/field/jobs?date=${date}`);
      setJobs(r.jobs); setMe(r.me); setOffline(false);
      await cacheField({userId,workspaceId},`jobs:${date}`,r);
    } catch (e) {
      const cached = isOffline(e)?await readField<{jobs:FieldJob[];me:Me}>({userId,workspaceId},`jobs:${date}`):null;
      if (cached) { setJobs(cached.jobs); setMe(cached.me); setOffline(true); }
      else { setJobs([]); toast.error(e instanceof Error ? e.message : "Could not load jobs"); }
    }
  }, [date,userId,workspaceId]);

  const flush = useCallback(async () => {
    const currentScope={userId,workspaceId};
    const q = await queuedField(currentScope);
    setQueueState(queueSummary(q));
    if (!q.length || !navigator.onLine) return;
    await syncField(currentScope);
    const rest=await queuedField(currentScope);
    setQueueState(queueSummary(rest));
    setSyncError(rest.find(x=>x.error)?.error || '');
    if (rest.length < q.length) { toast.success("Offline updates synced"); void load(); }
  }, [load,userId,workspaceId]);

  useEffect(() => { void flush().then(load).catch(e=>toast.error(String(e)));crmFetch<{officeEmail:string;googleReviewUrl?:string}>('/field/settings').then(x=>{setOfficeEmail(x.officeEmail);setReviewUrl(x.googleReviewUrl || '');}).catch(()=>{}); }, [flush, load]);
  useEffect(() => {
    const on = () => {setOffline(false);void flush().then(load);};
    const off = () => setOffline(true);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    const timer=window.setInterval(()=>{if(navigator.onLine)void flush();},30000);
    return () => {window.clearInterval(timer); window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, [flush]);

  const replace = (j: FieldJob) => setJobs(list => {const updated=(list ?? []).map(x => (x.id === j.id ? j : x));void cacheField(scope,`jobs:${date}`,{jobs:updated,me});return updated;});
  const open = jobs?.find(j => j.id === openId) ?? null;

  // The open job sheet is kept in the URL (?job=<id>) so a refresh, window blur
  // or tab switch reopens the same sheet instead of the jobs list.
  const openJob = useCallback(
    (id: number | null) => {
      setOpenId(id);
      if (id) navigate(`/app/field?job=${id}`, { replace: true });
      else navigate("/app/field", { replace: true, search: {} });
    },
    [navigate],
  );

  useEffect(() => {
    if (!openId || !jobs) return;
    if (!jobs.some((j) => j.id === openId)) openJob(null);
  }, [jobs, openId, openJob]);

  return (
    <div className="mx-auto w-full max-w-xl space-y-4 pb-24" data-tour="field-workspace">
      {/* Subtle top banner: offline captures are queued in IndexedDB, never dropped. */}
      {(offline || pending > 0) && (
        <div role="status" aria-live="polite" className="sticky top-0 z-10 flex items-start gap-2 rounded-lg border border-border bg-muted/90 px-3 py-2 text-xs backdrop-blur">
          <WifiOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="font-medium text-foreground">{queueSyncLabel(queueState, !offline)}</p>
            {queueDetail(queueState) ? <p className="text-muted-foreground">{queueDetail(queueState)}</p> : null}
            {syncError ? <p className="text-destructive">{syncError}</p> : null}
          </div>
          {pending > 0 && (
            <Button variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-xs" onClick={() => void flush()}>
              <RefreshCw className="h-3.5 w-3.5" />Retry
            </Button>
          )}
        </div>
      )}
      {open ? (
        <JobSheet key={open.id} job={open} me={me} role={role} scope={scope} onBack={() => openJob(null)} onChange={replace}
          queue={async(jobId,action,body)=>{await enqueueField(scope,jobId,action,body);setQueueState(queueSummary(await queuedField(scope)));setOffline(!navigator.onLine);}} />
      ) : (
        <>
          <header className="flex items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Today's jobs</h1>
              <p className="text-sm text-muted-foreground">{me ? `Signed in as ${me.name}` : OFFICE.includes(role) ? "Showing every crew's jobs" : "Jobs assigned to you"}</p>
            </div>
            <button onClick={() => void load()} aria-label="Refresh" className="rounded-full border border-border p-3 text-foreground active:scale-95"><RefreshCw className="h-5 w-5" /></button>
          </header>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-12 w-full rounded-xl border border-input bg-background px-4 text-base text-foreground" />
          <PreTripInspection />
          {['admin','office_admin'].includes(role) && <form className="space-y-2 border-b border-border pb-4" onSubmit={e=>{e.preventDefault();setOfficeSaving(true);void post('/field/settings',{officeEmail,googleReviewUrl:reviewUrl}).then(()=>toast.success('Company settings saved')).catch(e=>toast.error(e.message)).finally(()=>setOfficeSaving(false));}}><label className="block text-sm font-medium text-foreground" htmlFor="field-office-email">Company office email</label><div className="flex flex-wrap gap-2"><input id="field-office-email" type="email" value={officeEmail} onChange={e=>setOfficeEmail(e.target.value)} className="h-11 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-foreground"/><input id="field-review-url" type="url" value={reviewUrl} onChange={e=>setReviewUrl(e.target.value)} placeholder="https://g.page/r/…/review" aria-label="Google review link" className="h-11 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-foreground"/><Button disabled={officeSaving} type="submit" variant="outline">Save company settings</Button></div></form>}
          {jobs === null ? <p className="text-muted-foreground">Loading…</p> : jobs.length === 0 ? (
            <div className="space-y-3 rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground"><p>No jobs assigned for this day.</p><DemoJobButton role={role} onLoaded={() => { if (date === today()) void load(); else setDate(today()); }} /></div>
          ) : <>{jobs.map(j => <JobCard key={j.id} job={j} onOpen={() => openJob(j.id)} />)}{jobs.some(isDemoJob) && <div className="flex justify-center"><ClearDemoButton role={role} onCleared={() => void load()} /></div>}</>}
        </>
      )}
    </div>
  );
}

function QuickActions({ job }: { job: FieldJob }) {
  const nav = (addr?: string) => (addr ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}` : undefined);
  const apple = (addr?: string) => (addr ? `https://maps.apple.com/?daddr=${encodeURIComponent(addr)}` : undefined);
  const phone = (job.customerPhone ?? "").replace(/[^\d+]/g, "");
  const btn = "flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground active:scale-95 aria-disabled:pointer-events-none aria-disabled:opacity-40";
  return (
    <div className="grid grid-cols-2 gap-2">
      <a className={btn} href={nav(job.origin)} target="_blank" rel="noreferrer" aria-disabled={!job.origin}><MapPin className="h-4 w-4" />Navigate to Pickup</a>
      <a className={btn} href={nav(job.destination)} target="_blank" rel="noreferrer" aria-disabled={!job.destination}><MapPin className="h-4 w-4" />Navigate to Drop-off</a>
      <a className={btn} href={phone ? `tel:${phone}` : undefined} aria-disabled={!phone}><Phone className="h-4 w-4" />Call Customer</a>
      <a className={btn} href={phone ? `sms:${phone}` : undefined} aria-disabled={!phone}><MessageSquare className="h-4 w-4" />SMS Customer</a>
      {(job.origin || job.destination) && (
        <p className="col-span-2 text-center text-xs text-muted-foreground">
          iPhone? Open in <a className="underline" href={apple(job.origin)} target="_blank" rel="noreferrer">Apple Maps (pickup)</a> · <a className="underline" href={apple(job.destination)} target="_blank" rel="noreferrer">Apple Maps (drop-off)</a>
        </p>
      )}
    </div>
  );
}

function JobCard({ job, onOpen }: { job: FieldJob; onOpen: () => void }) {
  return (
    <article className="space-y-3 rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-sm">
      <button onClick={onOpen} className="block w-full text-left" data-tour="field-open-job">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-primary">{hourLabel(job.startHour)}</p>
            <h2 className="text-lg font-semibold">{job.title || job.customerName || `Job #${job.id}`}</h2>
          </div>
          <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${BADGE[job.fieldStatus]}`}>{job.fieldStatus}</span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{job.origin || "No pickup address"} → {job.destination || "No drop-off address"}</p>
      </button>
      <QuickActions job={job} />
      <button onClick={onOpen} className="min-h-12 w-full rounded-xl bg-primary text-base font-semibold text-primary-foreground active:scale-[.98]">Open job sheet</button>
    </article>
  );
}

function JobSheet({ job, me, role, scope,onBack, onChange, queue }: { job: FieldJob; me: Me; role: string;scope:FieldScope; onBack: () => void; onChange: (j: FieldJob) => void; queue: (jobId:number,action:FieldOperation['action'],body:Record<string,unknown>) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [note, setNote] = useState("");
  const [sig, setSig] = useState<string | null>(null);
  const [pay, setPay] = useState<{ url: string; qr: string; env: string } | null>(null);
  const [pdf,setPdf]=useState<{ready?:boolean;emailStatus:string}|null>(job.fieldPdf || null);
  const [checkinNote,setCheckinNote]=useState("");
  const [locating,setLocating]=useState(false);
  const t = job.timeline ?? {};
  const canStage = OFFICE.includes(role) || ["crew_lead", "driver"].includes(me?.crewRole ?? "");
  const done = Boolean(t.complete);

  useEffect(() => { void crmFetch<Photo[]>(`/field/jobs/${job.id}/photos`).then(p=>{setPhotos(p);void cacheField(scope,`photos:${job.id}`,p);}).catch(()=>{void readField<Photo[]>(scope,`photos:${job.id}`).then(p=>{if(p)setPhotos(p);});}); }, [job.id,scope.userId,scope.workspaceId]);
  useEffect(()=>{void readField<string>(scope,`final-signature:${job.id}`).then(s=>{if(s)setSig(s);});},[job.id,scope.userId,scope.workspaceId]);
  // Downloads go through the signed-in field route each time, so removing a worker
  // from the job stops access immediately (no reusable bearer link).
  const downloadPdf=()=>run(async()=>{
    const res=await fetch(`/api/crm/field/jobs/${job.id}/pdf-file`,{headers:{...(await sessionAuthorization()),...(getWorkspaceId()?{'x-workspace-id':String(getWorkspaceId())}:{})}});
    if(!res.ok)throw new Error(res.status===403?'You no longer have access to this job':'Could not download the signed PDF');
    const url=URL.createObjectURL(await res.blob());const a=document.createElement('a');a.href=url;a.download=`BOL-job-${job.id}.pdf`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
  });

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } catch (e) { toast.error(e instanceof Error ? e.message : "Something went wrong"); } finally { setBusy(false); }
  };

  const stage = (phase: FieldPhase) => run(async () => {
    const at = new Date().toISOString();
    try { onChange(await post<FieldJob>(`/field/jobs/${job.id}/phase`, { phase, at })); }
    catch (e) {
      if (!isOffline(e)) throw e;
      await queue(job.id,'phase',{phase,at});
      const tl = { ...t, [phase]: at };
      const idx = FIELD_PHASES.findIndex(p => p.key === phase);
      onChange({ ...job, timeline: tl, nextPhase: FIELD_PHASES[idx + 1]?.key ?? null,fieldStatus:fieldStatus(tl),bill:phase==='complete'?finalBill(job,billableHours(tl)):job.bill });
      toast("Saved on this phone — it will sync when you're back online.");
    }
  });

  const upload = (file?: File) => file && run(async () => {
    const photoData = await shrinkImage(file);
    const body={photoData,note,phase:t.start_loading?'post':'pre',operationId:crypto.randomUUID()};
    try {await post(`/field/jobs/${job.id}/photos`,body);setPhotos(await crmFetch<Photo[]>(`/field/jobs/${job.id}/photos`));}
    catch(e){if(!isOffline(e))throw e;await queue(job.id,'photos',body);const saved=[...photos,{id:-Date.now(),note,phase:body.phase,photoUrl:photoData}];setPhotos(saved);await cacheField(scope,`photos:${job.id}`,saved);}
    setNote("");
    toast.success("Photo saved to the job");
  });
  const saveDocument=async(document:FieldDocument)=>run(async()=>{
    const body={document,operationId:crypto.randomUUID()};
    try{onChange(await post<FieldJob>(`/field/jobs/${job.id}/documents`,body));}
    catch(e){if(!isOffline(e))throw e;await queue(job.id,'documents',body);onChange({...job,fieldDocuments:{...job.fieldDocuments,[document.kind]:{...document,...(document.signature?{signedAt:new Date().toISOString()}: {})}}});toast('Document saved on this device');}
  });
  const signoff=()=>run(async()=>{
    if(!sig)return;
    const body={signature:sig,operationId:crypto.randomUUID()};
    try{const saved=await post<FieldJob>(`/field/jobs/${job.id}/signoff`,body);onChange(saved);setPdf(saved.fieldPdf || null);toast.success('Signed BOL PDF saved');}
    catch(e){if(!isOffline(e))throw e;await queue(job.id,'signoff',body);onChange({...job,completedSignature:sig});toast('Signature saved on this device; PDF will be generated after sync');}
  });

  // Milestone check-ins store the phone's GPS fix on the job; the customer tracker reads it.
  const checkin = (milestone: string, label: string) => run(async () => {
    setLocating(true);
    try {
      const position = await locateDevice();
      const saved = await post<FieldJob>(`/field/jobs/${job.id}/checkin`, {
        milestone,
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
        note: checkinNote,
        operationId: crypto.randomUUID(),
      });
      onChange(saved);
      setCheckinNote("");
      toast.success(`${label} check-in sent`);
    } finally {
      setLocating(false);
    }
  });

  const startCard = () => run(async () => {
    const r = await post<{ url: string; env: string }>(`/field/jobs/${job.id}/checkout`);
    setPay({ ...r, qr: await QRCode.toDataURL(r.url, { margin: 1, width: 260 }) });
  });
  const checkPaid = () => run(async () => {
    const j = await post<FieldJob>(`/field/jobs/${job.id}/checkout-status`);
    onChange(j);
    toast[j.finalPayment ? "success" : "message"](j.finalPayment ? "Card payment received" : "Payment not received yet");
  });

  return (
    <div className="space-y-5" data-tour="field-job-sheet">
      <button onClick={onBack} className="flex min-h-11 items-center gap-1 text-sm font-medium text-primary"><ChevronLeft className="h-4 w-4" />All jobs</button>
      <div className="flex items-start justify-between gap-2">
        <h1 className="text-2xl font-bold text-foreground">{job.title || job.customerName || `Job #${job.id}`}</h1>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${BADGE[job.fieldStatus]}`}>{job.fieldStatus}</span>
      </div>
      <QuickActions job={job} />

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4" data-tour="field-milestones">
        <h2 className="font-semibold text-card-foreground">Timecard</h2>
        <ol className="space-y-2">
          {FIELD_PHASES.map(p => (
            <li key={p.key} className="flex items-center justify-between text-sm">
              <span className={t[p.key] ? "text-foreground" : "text-muted-foreground"}>{t[p.key] ? <CheckCircle2 className="mr-2 inline h-4 w-4 text-primary" /> : null}{p.label}</span>
              <span className="tabular-nums text-muted-foreground">{timeOf(t[p.key])}</span>
            </li>
          ))}
        </ol>
        {job.nextPhase && (canStage ? (
          <button disabled={busy} onClick={() => {const phase=job.nextPhase;if(phase)void stage(phase);}} className="min-h-14 w-full rounded-xl bg-primary text-lg font-semibold text-primary-foreground disabled:opacity-50 active:scale-[.98]">
            {FIELD_PHASES.find(p => p.key === job.nextPhase)?.label}
          </button>
        ) : <p className="text-sm text-muted-foreground">Your crew lead or driver updates the job stage.</p>)}
        {done && <p className="text-sm text-foreground">Billable time: <strong>{job.bill.hours} h</strong> (pickup arrival to completion)</p>}
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4" data-tour="field-checkin">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold text-card-foreground">Driver check-in</h2>
          <span className="text-xs text-muted-foreground">
            {job.driverCheckins?.[0]?.at ? timeOf(job.driverCheckins[0].at) : "Not checked in"}
          </span>
        </div>
        {job.driverCheckins?.[0] ? (
          <p className="rounded-xl bg-muted p-3 text-sm text-foreground">
            <strong>{job.driverCheckins[0].label}</strong>
            {job.driverCheckins[0].note ? ` · ${job.driverCheckins[0].note}` : ""}
            <span className="ml-1 text-muted-foreground">· {job.driverCheckins[0].crewName}</span>
          </p>
        ) : job.driverLocation ? (
          <p className="rounded-xl bg-muted p-3 text-sm text-foreground">
            <strong>{job.driverLocation.label}</strong> · {job.driverLocation.crewName}
          </p>
        ) : null}
        {canStage ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              {CHECKINS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  disabled={busy || locating}
                  onClick={() => void checkin(option.key, option.label)}
                  className="min-h-12 rounded-xl border border-border bg-background px-2 text-sm font-medium text-foreground active:scale-95 disabled:opacity-50"
                >
                  {locating ? "Getting GPS…" : option.label}
                </button>
              ))}
            </div>
            <input
              value={checkinNote}
              onChange={(event) => setCheckinNote(event.target.value.slice(0, 280))}
              placeholder="Note for the office (optional)"
              aria-label="Check-in note"
              className="h-11 w-full rounded-xl border border-input bg-background px-3 text-base text-foreground"
            />
            <p className="text-xs text-muted-foreground">
              Sends this phone&apos;s GPS fix and the milestone to the office and customer tracker.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Your crew lead or driver records milestones.</p>
        )}
      </section>

      <FieldDocuments documents={{...job.fieldDocuments,...(job.completedSignature && !job.fieldDocuments?.bol?.signature?{bol:{kind:'bol' as const,notes:job.fieldDocuments?.bol?.notes || '',items:job.fieldDocuments?.bol?.items || [],signature:job.completedSignature,signedAt:String(job['signedOffAt'] || '')}}:{})}} job={job} scope={scope} locked={Boolean(job.completedSignature)} onSave={saveDocument}/>

      <MoveChecklist
        jobId={job.id}
        saved={job.moveChecklist}
        locked={Boolean(job.completedSignature)}
        crewName={me?.name ?? ""}
        crewId={me?.id ?? null}
        scope={scope}
        queue={queue}
        onSaved={(patch) =>
          onChange({
            ...job,
            moveChecklist: patch.moveChecklist,
            ...(patch.activity ? { activity: patch.activity } : {}),
          } as FieldJob)
        }
      />

      <PreMoveInspection
        jobId={job.id}
        photos={photos}
        setPhotos={setPhotos}
        scope={scope}
        locked={Boolean(job.completedSignature)}
        loadingStarted={Boolean(t.start_loading)}
        saved={job.preMoveInspection ?? null}
        queue={queue}
        onSaved={record => onChange({ ...job, preMoveInspection: record })}
      />

      <TrackingShare jobId={job.id} initialToken={job.trackingToken} />

      {t.start_loading && !job.completedSignature && (
        <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <h2 className="font-semibold text-card-foreground">Post-move condition photos</h2>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note, e.g. new scratch found after delivery" className="h-12 w-full rounded-xl border border-input bg-background px-4 text-base text-foreground" />
          <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-background font-medium text-foreground">
            <Camera className="h-5 w-5" />{busy ? "Saving…" : "Take or upload photo"}
            <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={busy} onChange={e => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          {photos.filter(p => p.phase === "post").length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {photos.filter(p => p.phase === "post").map(p => <figure key={p.id}><img src={p.photoUrl} alt={p.note || "Condition photo"} className="aspect-square w-full rounded-lg object-cover" /><figcaption className="truncate text-xs text-muted-foreground">{p.note}</figcaption></figure>)}
            </div>
          )}
        </section>
      )}

      {done && (
        <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <h2 className="font-semibold text-card-foreground">Final bill</h2>
          <dl className="space-y-1 text-sm">
            {([["Labor", `${job.bill.hours} h`, job.bill.labor], ["Travel fee", "", job.bill.travel], ["Other fees", "", job.bill.fees], ["Deposit paid", "", -job.bill.deposit]] as const).map(([k, extra, v]) => (
              <div key={k} className="flex justify-between text-foreground"><dt>{k} {extra && <span className="text-muted-foreground">({extra})</span>}</dt><dd className="tabular-nums">{money(v)}</dd></div>
            ))}
            <div className="flex justify-between border-t border-border pt-2 text-lg font-bold text-foreground"><dt>Balance due</dt><dd className="tabular-nums">{money(job.bill.due)}</dd></div>
          </dl>

          <JobInvoicePdfButton job={job} className="w-full" />

          {job.completedSignature ? (
            <div><p className="text-sm text-muted-foreground">Customer signed off</p><img src={job.completedSignature} alt="Customer signature" className="h-24 rounded-lg border border-border bg-background" /></div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-foreground">Customer: please confirm the work and times above.</p>
              <SignaturePad onChange={s=>{setSig(s);void cacheField(scope,`final-signature:${job.id}`,s);}} label="Customer signs here" />
              {sig && <img src={sig} alt="Captured final signature" className="h-20 w-full rounded-md border border-border object-contain"/>}
              <Button disabled={!sig || busy} onClick={()=>void signoff()} className="min-h-12 w-full">Save customer sign-off & BOL</Button>
            </div>
          )}
          {job.completedSignature && <div className="space-y-2 border-t border-border pt-3"><Button variant="outline" disabled={busy || !navigator.onLine} onClick={()=>void run(async()=>setPdf(await crmFetch(`/field/jobs/${job.id}/pdf`)))}>Get signed BOL PDF</Button>{pdf && <button type="button" disabled={busy || !navigator.onLine} onClick={()=>void downloadPdf()} className="block text-sm text-primary underline">Download signed Bill of Lading</button>}<p className="text-sm text-muted-foreground">Email delivery awaits sender-domain setup. No emails have been sent.</p></div>}

          {job.completedSignature && (
            <TipAndReview job={job} onChange={j => onChange(j as FieldJob)} queue={queue} />
          )}

          {job.finalPayment ? (
            <p className="rounded-xl bg-muted p-3 text-sm font-medium text-foreground">
              Paid {money(job.finalPayment.amountCents / 100)} by {job.finalPayment.method}{job.finalPayment.mode === "test" ? " (test card)" : ""}.
            </p>
          ) : job.bill.due > 0 && (
            <div className="space-y-2">
              {pay ? (
                <div className="space-y-2 text-center">
                  <img src={pay.qr} alt="Scan to pay" className="mx-auto rounded-lg bg-background p-2" />
                  <p className="text-sm text-muted-foreground">Customer scans to pay {money(job.bill.due)}{pay.env === "sandbox" ? " — test mode, use card 4242 4242 4242 4242" : ""}.</p>
                  <a href={pay.url} target="_blank" rel="noreferrer" className="block text-sm text-primary underline">Open payment page on this phone</a>
                  <button disabled={busy} onClick={() => void checkPaid()} className="min-h-12 w-full rounded-xl border border-border font-semibold text-foreground">Check payment</button>
                </div>
              ) : (
                <button disabled={busy} onClick={() => void startCard()} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground disabled:opacity-50"><CreditCard className="h-5 w-5" />Collect by card (QR code)</button>
              )}
              <div className="grid grid-cols-2 gap-2">
                {(["cash", "check"] as const).map(m => (
                  <button key={m} disabled={busy} onClick={() => { if (confirm(`Mark ${money(job.bill.due)} as paid by ${m}?`)) void run(async () => onChange(await post<FieldJob>(`/field/jobs/${job.id}/pay-offline`, { method: m }))); }}
                    className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border font-medium text-foreground disabled:opacity-50"><Banknote className="h-4 w-4" />Paid in {m === "cash" ? "Cash" : "Check"}</button>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
