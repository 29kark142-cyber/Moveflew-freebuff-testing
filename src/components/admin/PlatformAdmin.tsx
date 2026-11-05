import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { effectivePrice, STANDARD_RATES } from "@/shared/tenant-pricing";
import { Textarea } from "@/components/ui/textarea";
import { Activity, Tag, Building2, DollarSign, Eye, FlaskConical, Search, Settings2, ShieldCheck, Truck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  getPlatformAccess, getPlatformLogs, getPlatformOverview, inspectTenantWorkspace, updateTenantWorkspace, updateTenantPricing, TENANT_STATUSES,
} from "@/lib/platform-admin.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Overview = Awaited<ReturnType<typeof getPlatformOverview>>;
type Tenant = Overview["workspaces"][number];

const STATUS_LABEL: Record<string, string> = {
  beta: "Beta", trialing: "Trial", active: "Active", past_due: "Past due", canceled: "Canceled", suspended: "Suspended",
};
const WRITABLE = new Set(["beta", "trialing", "active"]);
const KNOWN_FLAGS = ["ai_copilot", "website_integrations", "field_payments", "route_pricing"];
const KNOWN_LIMITS = ["max_users", "max_trucks", "max_jobs_per_month"];
const money = (c: number) => `$${(c / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export default function PlatformAdmin() {
  const navigate = useNavigate();
  const access = useServerFn(getPlatformAccess);
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return navigate({ to: "/login", replace: true });
      try {
        const r = await access();
        if (!r.isAdmin) return navigate({ to: "/app/$", params: { _splat: "dashboard" }, replace: true });
        setAllowed(true);
      } catch {
        navigate({ to: "/app/$", params: { _splat: "dashboard" }, replace: true });
      }
    })();
  }, [access, navigate]);

  if (!allowed) return <div className="min-h-screen grid place-items-center text-muted-foreground">Checking access…</div>;
  return <Dashboard />;
}

function Dashboard() {
  const overviewFn = useServerFn(getPlatformOverview);
  const { data, isLoading, error } = useQuery({ queryKey: ["platform", "overview"], queryFn: () => overviewFn() });
  const [q, setQ] = useState("");
  const [plan, setPlan] = useState("all");
  const [editing, setEditing] = useState<Tenant | null>(null);
  const [inspecting, setInspecting] = useState<Tenant | null>(null);
  const [pricing, setPricing] = useState<Tenant | null>(null);

  const rows = useMemo(() => (data?.workspaces ?? []).filter(w => {
    const s = q.trim().toLowerCase();
    const matches = !s || [w.name, w.ownerEmail, w.ownerName, w.planName].some(v => v.toLowerCase().includes(s));
    return matches && (plan === "all" || w.planId === plan);
  }), [data, q, plan]);

  const m = data?.metrics;
  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto max-w-7xl px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /><h1 className="text-lg font-semibold">Platform admin</h1></div>
          <Button variant="outline" size="sm" asChild><a href="/app/dashboard">Back to my workspace</a></Button>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 space-y-6">
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <Metric icon={<Building2 className="h-4 w-4" />} label="Total workspaces" value={m?.totalWorkspaces} />
          <Metric icon={<Truck className="h-4 w-4" />} label="Active jobs (all tenants)" value={m?.activeJobs} />
          <Metric icon={<DollarSign className="h-4 w-4" />} label="Live volume processed" value={m ? money(m.volumeCents) : undefined} />
          <Metric icon={<FlaskConical className="h-4 w-4" />} label="Active beta workspaces" value={m?.activeBeta} />
        </div>

        <Tabs defaultValue="tenants">
          <TabsList><TabsTrigger value="tenants">Workspaces</TabsTrigger><TabsTrigger value="health">System health</TabsTrigger></TabsList>
          <TabsContent value="tenants">
            <Card>
              <CardHeader className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between space-y-0">
                <CardTitle className="text-base">Subscriber workspaces</CardTitle>
                <div className="flex gap-2">
                  <div className="relative"><Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input className="pl-8 w-56" placeholder="Company, email or plan" value={q} onChange={e => setQ(e.target.value)} /></div>
                  <Select value={plan} onValueChange={setPlan}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="all">All plans</SelectItem>
                      {data?.plans.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {isLoading ? <p className="text-muted-foreground">Loading…</p> : error ? <p className="text-destructive">Could not load workspaces.</p> : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Company</TableHead><TableHead>Owner</TableHead><TableHead>Signed up</TableHead>
                      <TableHead>Plan</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Jobs</TableHead><TableHead />
                    </TableRow></TableHeader>
                    <TableBody>
                      {rows.map(w => (
                        <TableRow key={w.id}>
                          <TableCell className="font-medium">{w.name}<div className="text-xs text-muted-foreground">#{w.id} · {w.members} members</div></TableCell>
                          <TableCell>{w.ownerName || "—"}<div className="text-xs text-muted-foreground">{w.ownerEmail}</div></TableCell>
                          <TableCell>{new Date(w.createdAt).toLocaleDateString()}</TableCell>
                          <TableCell><Badge variant={w.pricing.isCustomPricing ? "default" : "outline"}>{w.planLabel}</Badge>{w.betaEndsAt && <div className="text-xs text-muted-foreground">Beta until {new Date(w.betaEndsAt).toLocaleDateString()}</div>}</TableCell>
                          <TableCell><Badge variant={w.status === "suspended" || !WRITABLE.has(w.status) ? "destructive" : "secondary"}>{STATUS_LABEL[w.status] ?? w.status}</Badge></TableCell>
                          <TableCell className="text-right">{w.totalJobs}</TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            <Button size="sm" variant="ghost" onClick={() => setInspecting(w)}><Eye className="h-4 w-4 mr-1" />View</Button>
                            <Button size="sm" variant="outline" className="mr-1" onClick={() => setPricing(w)}><Tag className="h-4 w-4 mr-1" />Subscription & Pricing</Button>
                            <Button size="sm" variant="outline" onClick={() => setEditing(w)}><Settings2 className="h-4 w-4 mr-1" />Manage</Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {!rows.length && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No workspaces match.</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="health"><HealthLog /></TabsContent>
        </Tabs>
      </main>
      {editing && data && <ControlsModal tenant={editing} plans={data.plans} onClose={() => setEditing(null)} />}
      {pricing && <PricingModal tenant={pricing} onClose={() => setPricing(null)} />}
      {inspecting && <InspectModal tenant={inspecting} onClose={() => setInspecting(null)} />}
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <Card><CardContent className="p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value ?? "…"}</div>
    </CardContent></Card>
  );
}

function ControlsModal({ tenant, plans, onClose }: { tenant: Tenant; plans: Overview["plans"]; onClose: () => void }) {
  const update = useServerFn(updateTenantWorkspace);
  const qc = useQueryClient();
  const [planId, setPlanId] = useState(tenant.planId);
  const [status, setStatus] = useState(tenant.status);
  const [betaEnds, setBetaEnds] = useState(tenant.betaEndsAt?.slice(0, 10) ?? "");
  const [flags, setFlags] = useState<Record<string, boolean>>(tenant.featureFlags);
  const [limits, setLimits] = useState<Record<string, string>>(Object.fromEntries(Object.entries(tenant.limitOverrides).map(([k, v]) => [k, String(v)])));
  const [busy, setBusy] = useState(false);

  const extendBeta = (days: number) => {
    const base = betaEnds && new Date(betaEnds) > new Date() ? new Date(betaEnds) : new Date();
    base.setDate(base.getDate() + days);
    setBetaEnds(base.toISOString().slice(0, 10));
    setPlanId(plans.find(p => p.id === "beta")?.id ?? planId);
    setStatus("beta");
  };

  const save = async () => {
    setBusy(true);
    try {
      const limitOverrides = Object.fromEntries(Object.entries(limits).filter(([, v]) => v.trim() !== "").map(([k, v]) => [k, Math.max(0, Math.round(Number(v) || 0))]));
      await update({ data: { workspaceId: tenant.id, planId, status: status as (typeof TENANT_STATUSES)[number], betaEndsAt: betaEnds ? new Date(`${betaEnds}T23:59:59Z`).toISOString() : null, featureFlags: flags, limitOverrides } });
      toast.success(`${tenant.name} updated`);
      await qc.invalidateQueries({ queryKey: ["platform"] });
      onClose();
    } catch (e) {
      toast.error((e as Error).message || "Could not save");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Manage {tenant.name}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Plan</Label>
              <Select value={planId} onValueChange={setPlanId}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{plans.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Status</Label>
              <Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TENANT_STATUSES.map(s => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}</SelectContent></Select></div>
          </div>
          {!WRITABLE.has(status) && <p className="text-sm text-destructive">This workspace will be read-only: its team can view data but not change anything.</p>}
          <div className="space-y-1"><Label>Beta access until</Label>
            <div className="flex gap-2"><Input type="date" value={betaEnds} onChange={e => setBetaEnds(e.target.value)} />
              <Button type="button" variant="outline" onClick={() => extendBeta(30)}>+30 days</Button>
              <Button type="button" variant="outline" onClick={() => extendBeta(90)}>+90 days</Button></div></div>
          <div className="flex gap-2">
            {status === "suspended"
              ? <Button type="button" variant="secondary" onClick={() => setStatus("active")}>Reactivate</Button>
              : <Button type="button" variant="destructive" onClick={() => setStatus("suspended")}>Suspend workspace</Button>}
          </div>
          <div className="space-y-2"><Label>Feature overrides</Label>
            {KNOWN_FLAGS.map(f => (
              <div key={f} className="flex items-center justify-between text-sm"><span>{f.replace(/_/g, " ")}</span>
                <Switch checked={flags[f] ?? true} onCheckedChange={v => setFlags(s => ({ ...s, [f]: v }))} /></div>
            ))}</div>
          <div className="space-y-2"><Label>Limit overrides (blank = plan default)</Label>
            {KNOWN_LIMITS.map(l => (
              <div key={l} className="flex items-center justify-between gap-3 text-sm"><span>{l.replace(/_/g, " ")}</span>
                <Input className="w-28" type="number" min={0} value={limits[l] ?? ""} onChange={e => setLimits(s => ({ ...s, [l]: e.target.value }))} /></div>
            ))}</div>
        </div>
        <DialogFooter><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InspectModal({ tenant, onClose }: { tenant: Tenant; onClose: () => void }) {
  const inspect = useServerFn(inspectTenantWorkspace);
  const { data, isLoading, error } = useQuery({ queryKey: ["platform", "inspect", tenant.id], queryFn: () => inspect({ data: { workspaceId: tenant.id } }) });
  const section = (title: string, rows: Record<string, unknown>[], cols: string[]) => (
    <div className="space-y-1"><h3 className="text-sm font-semibold">{title} ({rows.length})</h3>
      <div className="overflow-x-auto"><Table><TableHeader><TableRow>{cols.map(c => <TableHead key={c}>{c}</TableHead>)}</TableRow></TableHeader>
        <TableBody>{rows.slice(0, 25).map((r, i) => <TableRow key={i}>{cols.map(c => <TableCell key={c}>{String(r[c] ?? "") || "—"}</TableCell>)}</TableRow>)}
          {!rows.length && <TableRow><TableCell colSpan={cols.length} className="text-muted-foreground">None</TableCell></TableRow>}</TableBody></Table></div></div>
  );
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2">{tenant.name}<Badge variant="outline"><Eye className="h-3 w-3 mr-1" />Read-only support view</Badge></DialogTitle></DialogHeader>
        {isLoading ? <p className="text-muted-foreground">Loading…</p> : error || !data ? <p className="text-destructive">Could not open this workspace.</p> : (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div>Status: <strong>{STATUS_LABEL[data.workspace.subscription_status] ?? data.workspace.subscription_status}</strong></div>
              <div>Plan: <strong>{data.workspace.plan_id}</strong></div>
              <div>Dispatch base: {data.workspace.dispatch_address || "—"}</div>
              <div>Phone: {data.workspace.company_phone || "—"}</div>
              <div>Travel pricing: {data.workspace.travel_pricing_type}</div>
              <div>Fuel surcharge: {data.workspace.fuel_surcharge_type}</div>
              <div>Setup finished: {data.workspace.onboarding_completed_at ? "Yes" : "No"}</div>
            </div>
            {section("Team", data.members as Record<string, unknown>[], ["name", "email", "role"])}
            {section("Jobs", data.jobs, ["title", "status", "moveDate", "total"])}
            {section("Customers", data.customers, ["name", "email", "phone", "status", "source"])}
            {section("Trucks", data.trucks, ["name", "plate", "status"])}
            {section("Crew", data.crew, ["name", "phone", "status"])}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function HealthLog() {
  const logsFn = useServerFn(getPlatformLogs);
  const { data, isLoading } = useQuery({ queryKey: ["platform", "logs"], queryFn: () => logsFn(), refetchInterval: 30_000 });
  const [source, setSource] = useState("all");
  if (isLoading || !data) return <p className="text-muted-foreground p-4">Loading…</p>;
  const max = Math.max(1, ...data.apiHours.map(h => h.count));
  const events = data.events.filter(e => source === "all" || e.source === source);
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4" />Recent events</CardTitle>
          <Select value={source} onValueChange={setSource}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All sources</SelectItem><SelectItem value="stripe_webhook">Stripe webhooks</SelectItem>
              <SelectItem value="lead_intake">Lead failures</SelectItem><SelectItem value="admin">Admin actions</SelectItem></SelectContent></Select>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table><TableHeader><TableRow><TableHead>When</TableHead><TableHead>Source</TableHead><TableHead>Event</TableHead><TableHead>Workspace</TableHead></TableRow></TableHeader>
            <TableBody>{events.map(e => (
              <TableRow key={e.id}>
                <TableCell className="whitespace-nowrap text-xs">{new Date(e.created_at).toLocaleString()}</TableCell>
                <TableCell><Badge variant={e.level === "error" ? "destructive" : e.level === "warn" ? "outline" : "secondary"}>{e.source.replace("_", " ")}</Badge></TableCell>
                <TableCell>{e.message}</TableCell>
                <TableCell className="text-xs">{e.workspaceName ?? "—"}</TableCell>
              </TableRow>))}
              {!events.length && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No events recorded yet.</TableCell></TableRow>}</TableBody></Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Public API leads (24h)</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-0.5 h-24">{data.apiHours.map(h => (
            <div key={h.hour} title={`${h.hour}:00 — ${h.count}`} className={`flex-1 rounded-sm ${data.spikeHours.includes(h.hour) ? "bg-destructive" : "bg-primary"}`} style={{ height: `${Math.max(3, (h.count / max) * 100)}%` }} />))}</div>
          <p className="text-sm">{data.spikeHours.length ? <span className="text-destructive">Spike detected in {data.spikeHours.length} hour(s).</span> : "No unusual spikes."}</p>
          <div className="space-y-1"><h4 className="text-sm font-semibold">Busiest tenants</h4>
            {data.topTenants.map(t => <div key={t.id} className="flex justify-between text-sm"><span>{t.name}</span><span>{t.leads}</span></div>)}
            {!data.topTenants.length && <p className="text-sm text-muted-foreground">No leads in the last 24 hours.</p>}</div>
        </CardContent>
      </Card>
    </div>
  );
}

function PricingModal({ tenant, onClose }: { tenant: Tenant; onClose: () => void }) {
  const save = useServerFn(updateTenantPricing);
  const qc = useQueryClient();
  const p = tenant.pricing;
  const [planId, setPlanId] = useState<"starter" | "professional">(tenant.planId === "professional" ? "professional" : "starter");
  const [mode, setMode] = useState<"standard" | "flat" | "percent">(p.isCustomPricing ? (p.pricingMode as "flat" | "percent") : "standard");
  const [monthly, setMonthly] = useState(p.customMonthly?.toString() ?? "");
  const [annual, setAnnual] = useState(p.customAnnual?.toString() ?? "");
  const [pct, setPct] = useState(p.discountPercent?.toString() ?? "");
  const [notes, setNotes] = useState(p.notes);
  const [busy, setBusy] = useState(false);
  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  const preview = effectivePrice({ planId, isCustomPricing: mode !== "standard", pricingMode: mode, customMonthly: num(monthly), customAnnual: num(annual), discountPercent: num(pct) });

  const submit = async () => {
    setBusy(true);
    try {
      await save({ data: { workspaceId: tenant.id, planId, pricingMode: mode, customMonthly: num(monthly), customAnnual: num(annual), discountPercent: num(pct), notes } });
      toast.success("Pricing saved");
      qc.invalidateQueries({ queryKey: ["platform", "overview"] });
      onClose();
    } catch (e) {
      toast.error((e as Error).message || "Could not save");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Edit Plan / Set Custom Rate — {tenant.name}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1"><Label>Plan tier (feature access)</Label>
            <Select value={planId} onValueChange={v => setPlanId(v as typeof planId)}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(STANDARD_RATES).map(([id, r]) => <SelectItem key={id} value={id}>{r.label} (${r.monthly}/mo · ${r.annual}/yr)</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label>Pricing mode</Label>
            <Select value={mode} onValueChange={v => setMode(v as typeof mode)}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="standard">Standard Tier Rate</SelectItem><SelectItem value="flat">Custom Flat Rate</SelectItem><SelectItem value="percent">Percentage Discount</SelectItem></SelectContent></Select></div>
          {mode === "flat" && <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Custom monthly rate ($)</Label><Input type="number" min={0} step="0.01" value={monthly} onChange={e => setMonthly(e.target.value)} placeholder="50" /></div>
            <div className="space-y-1"><Label>Custom annual rate ($)</Label><Input type="number" min={0} step="0.01" value={annual} onChange={e => setAnnual(e.target.value)} placeholder="500" /></div>
          </div>}
          {mode === "percent" && <div className="space-y-1"><Label>Discount (%)</Label><Input type="number" min={0} max={100} value={pct} onChange={e => setPct(e.target.value)} placeholder="20" />
            <p className="text-xs text-muted-foreground">100% = free lifetime access.</p></div>}
          <div className="rounded-md border p-3 text-sm">Will be charged: <strong>${preview.monthly}/mo</strong> or <strong>${preview.annual}/yr</strong>
            {preview.custom && <span className="text-muted-foreground"> (standard ${preview.standardMonthly}/mo · ${preview.standardAnnual}/yr)</span>}</div>
          <div className="space-y-1"><Label>Internal admin notes</Label><Textarea value={notes} maxLength={2000} onChange={e => setNotes(e.target.value)} placeholder="Early tester rate for Lena" />
            <p className="text-xs text-muted-foreground">Only platform admins can see this.</p></div>
        </div>
        <DialogFooter><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={busy}>{busy ? "Saving…" : "Save pricing"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
