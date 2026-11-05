import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, BriefcaseBusiness, CircleAlert, LoaderCircle, Mail, Phone, ShieldCheck, User, UsersRound } from "lucide-react";
import Brand from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { setWorkspaceId } from "@/lib/crm";
import { completeCrewRegistration, crewRegistrationSchema, type CrewRegistration } from "@/lib/crew-onboarding";

type InviteInfo = { workspace_name: string; crew_role: string; valid: boolean; email: string };
const inputClass = "h-12 rounded-lg border-input bg-background pl-11 pr-4 text-base shadow-none transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-primary md:text-base";
const iconClass = "pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground";

export default function CrewOnboarding({ token }: { token: string }) {
  const navigate = useNavigate();
  const [info, setInfo] = useState<InviteInfo | null>();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [fields, setFields] = useState<CrewRegistration>({ name: "", phone: "", email: "", role: "helper" });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    setInfo(undefined);
    setMessage("");
    async function load() {
      try {
        const [invite, auth] = await Promise.all([
          supabase.rpc("crew_onboarding_info", { _token: token }),
          supabase.auth.getUser(),
        ]);
        if (!active) return;
        if (invite.error) throw new Error("We couldn’t check your invitation. Please refresh and try again.");
        const row = invite.data as InviteInfo | null;
        setInfo(row);
        setSignedIn(Boolean(auth.data.user));
        const role = row?.crew_role;
        setFields({
          name: auth.data.user?.user_metadata?.full_name ?? "",
          phone: auth.data.user?.phone ?? "",
          email: row?.email || auth.data.user?.email || "",
          role: role === "driver" || role === "crew_lead" ? role : "helper",
        });
      } catch (error) {
        if (active) { setInfo(null); setMessage(error instanceof Error ? error.message : "Unable to load your invitation."); }
      }
    }
    void load();
    return () => { active = false; };
  }, [token]);

  function goLogin() {
    sessionStorage.setItem("nwc_next", `/join-crew?token=${encodeURIComponent(token)}`);
    void navigate({ to: "/login" });
  }

  async function accept(event: FormEvent) {
    event.preventDefault();
    if (busy || !signedIn || !info?.valid) return;
    const parsed = crewRegistrationSchema.safeParse(fields);
    if (!parsed.success) { setMessage(parsed.error.issues[0]?.message ?? "Please check your details."); return; }
    setBusy(true);
    setMessage("");
    try {
      await completeCrewRegistration(token, parsed.data,
        (args) => supabase.rpc("register_crew_invite", args),
        setWorkspaceId, (path) => window.location.assign(path));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "We couldn’t complete registration. Please try again.");
      setBusy(false);
    }
  }

  return (
    <main className="crew-onboarding min-h-screen px-4 py-8 text-foreground sm:py-12">
      <div className="mx-auto w-full max-w-md">
        <section className="crew-onboarding-card rounded-2xl border border-border bg-card p-6 sm:p-8" aria-labelledby="join-title">
          <div className="mb-8 flex justify-center"><Brand /></div>
          <header className="mb-7 text-center">
            <span className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-primary/15 bg-accent px-3 py-1 text-xs font-semibold text-primary"><UsersRound className="size-3.5" aria-hidden="true" />Crew invitation</span>
            <h1 id="join-title" className="mb-3 text-3xl font-semibold">Join the Team</h1>
            {info?.valid && <p className="mb-0 text-sm leading-6 text-muted-foreground">You've been invited to join <strong className="font-semibold text-foreground">{info.workspace_name}</strong> as a crew member.</p>}
          </header>

          {info === undefined && <div role="status" className="flex min-h-32 items-center justify-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-5 animate-spin motion-reduce:animate-none" />Checking your invitation…</div>}
          {info !== undefined && !info?.valid && <div className="space-y-5 text-center">
            <CircleAlert className="mx-auto size-9 text-muted-foreground" aria-hidden="true" />
            <p role="alert" className="text-sm leading-6 text-muted-foreground">{message || (info ? "This invitation has expired, was revoked, or has already been used. Ask your manager for a new link." : "This invitation link is not valid. Ask your manager for a new one.")}</p>
            <Button asChild variant="outline" className="h-11 w-full"><Link to="/">Back to home</Link></Button>
          </div>}
          {info?.valid && <form onSubmit={accept} className="space-y-5">
            <fieldset disabled={busy} className="m-0 min-w-0 space-y-5 border-0 p-0">
              <div><label htmlFor="crew-name" className="mb-2 block text-sm font-medium">Full Name</label><div className="relative"><User className={iconClass} aria-hidden="true" /><Input id="crew-name" name="name" autoComplete="name" required minLength={2} placeholder="e.g. John Smith" value={fields.name} onChange={(e) => setFields({ ...fields, name: e.target.value })} className={inputClass} /></div></div>
              <div><label htmlFor="crew-phone" className="mb-2 block text-sm font-medium">Phone Number</label><div className="relative"><Phone className={iconClass} aria-hidden="true" /><Input id="crew-phone" name="phone" type="tel" autoComplete="tel" placeholder="(555) 000-0000" value={fields.phone} onChange={(e) => setFields({ ...fields, phone: e.target.value })} className={inputClass} /></div></div>
              <div><label htmlFor="crew-email" className="mb-2 block text-sm font-medium">Email Address</label><div className="relative"><Mail className={iconClass} aria-hidden="true" /><Input id="crew-email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" value={fields.email} onChange={(e) => setFields({ ...fields, email: e.target.value })} className={inputClass} /></div></div>
              <div><label htmlFor="crew-role" className="mb-2 block text-sm font-medium">Assigned Role</label><div className="relative"><BriefcaseBusiness className={`${iconClass} z-10`} aria-hidden="true" /><Select value={fields.role} disabled><SelectTrigger id="crew-role" className={inputClass}><SelectValue /></SelectTrigger><SelectContent className="crew-onboarding-menu border-border bg-popover text-popover-foreground"><SelectItem value="helper">Helper</SelectItem><SelectItem value="driver">Driver</SelectItem><SelectItem value="crew_lead">Crew Lead</SelectItem></SelectContent></Select></div><p className="mb-0 mt-2 text-xs text-muted-foreground">Your manager assigns this role. Contact them to request a change.</p></div>
            </fieldset>
            {message && <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive"><CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{message}</p>}
            {signedIn === false && <div className="border-t border-border pt-4"><p className="mb-3 text-sm text-muted-foreground">Sign in or create an account to accept your invitation.</p><Button type="button" variant="outline" className="h-11 w-full" onClick={goLogin}>Sign in or create account<ArrowRight aria-hidden="true" /></Button></div>}
            <Button type="submit" disabled={busy || signedIn !== true} aria-busy={busy} className="crew-onboarding-submit h-auto min-h-12 w-full whitespace-normal rounded-lg px-3 py-3.5 font-semibold leading-5 transition-all">
              {busy ? <><LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" />Joining your crew…</> : "Complete Registration & Join Crew"}
            </Button>
            <p className="mb-0 flex items-center justify-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="size-3.5" aria-hidden="true" />Secure team registration</p>
          </form>}
        </section>
        <p className="mt-6 text-center text-xs text-muted-foreground">MoveFlew · Moving Operations CRM</p>
      </div>
    </main>
  );
}