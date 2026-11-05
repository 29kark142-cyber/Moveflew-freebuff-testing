import { useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Link } from "@/lib/wouter";
import { ArrowRight, Check, ChevronRight, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import SaasLayout from "@/components/SaasLayout";
import { DispatchPreview, FieldPreview, RoutingPreview, SmallProductPreview } from "@/components/HomeProductPreview";

export default function Home() {
  const [email, setEmail] = useState("");
  const navigate = useNavigate();
  function startBeta(event: FormEvent) {
    event.preventDefault();
    void navigate({ to: "/register", search: { email: email.trim() } });
  }
  return <SaasLayout light>
    <section className="mf-hero saas-wrap">
      <div className="mf-hero-copy">
        <span className="mf-beta"><i /> Built for moving operations <span> / </span> Free beta</span>
        <h1>Precision Moving CRM &amp; Conflict-Free Dispatch <span>— Without the Enterprise Price Tag.</span></h1>
        <p>A clearer day for your office. A smoother move for your crew. Meet MoveFlew, your connected moving operations workspace.</p>
        <ul className="mf-value-list"><li><Check /> Assign crews and trucks without double-booking.</li><li><Check /> Turn route distance into accurate estimates.</li><li><Check /> Keep proposals, payments and sign-offs connected.</li></ul>
        <form className="mf-signup" onSubmit={startBeta}><label><Mail size={18} /><input aria-label="Work email" type="email" placeholder="Your work email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} /></label><Button type="submit" size="lg">Start Free Beta <ArrowRight /></Button></form>
        <div className="mf-signup-note"><span>No credit card required.</span><span>Free during beta.</span></div>
        <Link className="mf-comparison-link" href="/vs-smartmoving">Compare vs. SmartMoving <ChevronRight size={14} /></Link>
      </div>
      <DispatchPreview />
    </section>
    <section className="mf-workflow"><div className="saas-wrap"><span>ONE WORKSPACE. EVERY STAGE.</span><div>{["Capture", "Price", "Book", "Dispatch", "Complete"].map((stage, i) => <span key={stage}><small>0{i+1}</small>{stage}{i < 4 && <ArrowRight size={16} />}</span>)}</div></div></section>
    <section className="mf-features saas-wrap"><div className="mf-section-heading"><div><span className="mf-eyebrow">BUILT AROUND YOUR WORKDAY</span><h2>Every detail handled.<br />Every team connected.</h2></div><p>From the first inquiry to the last signature.<br />Less switching tabs. More moving forward.</p></div>
      <div className="mf-bento-top"><article className="mf-bento mf-routing"><div className="mf-bento-copy"><span className="mf-eyebrow">01 / PLAN &amp; DISPATCH</span><h3>The right crew. The right route.<br />No crossed wires.</h3><p>Visual dispatch catches overlapping assignments. Google Maps calculates distance and drive time, with travel and fuel priced by your rules.</p></div><RoutingPreview /></article><article className="mf-bento mf-field"><div className="mf-bento-copy"><span className="mf-eyebrow">02 / MOVE DAY</span><h3>Your office, in their pocket.</h3><p>Jobs, photos and signed BOLs. Connected online. Ready offline.</p></div><FieldPreview /></article></div>
      <div className="mf-bento-bottom">{[{ kind: "invoices" as const, title: "From completed to collected.", text: "Keep invoices and payment status together, from deposit to final bill.", label: "03 / INVOICING" }, { kind: "storage" as const, title: "A place for every piece.", text: "Keep storage inventory organized and customer items accounted for.", label: "04 / INVENTORY & STORAGE" }, { kind: "proposals" as const, title: "Make it easy to say yes.", text: "Share clear proposals. Collect digital signatures and Stripe deposits.", label: "05 / AUTOMATED PROPOSALS" }].map(item => <article className="mf-bento" key={item.kind}><div className="mf-bento-copy"><span className="mf-eyebrow">{item.label}</span><h3>{item.title}</h3><p>{item.text}</p></div><SmallProductPreview kind={item.kind} /></article>)}</div>
    </section>
    <section className="mf-closing"><div className="saas-wrap"><div><span className="mf-eyebrow">A BETTER WAY TO MOVE</span><h2>Your next chapter starts here.</h2><p>Bring your team into MoveFlew. Free during beta.</p></div><Button asChild size="lg"><Link href="/register">Start Free Beta <ArrowRight /></Link></Button></div></section>
  </SaasLayout>;
}
