import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@/lib/wouter";
import { ArrowRight, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import MoveGridBrand from "@/components/MoveGridBrand";

const primary = [
  { href: "/", label: "Home" },
  { href: "/smartmoving-alternative", label: "SmartMoving Alternative" },
  { href: "/pricing", label: "Pricing" },
];
const legal = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms" },
];

export default function SaasLayout({ children, footerNote, light = false }: { children: ReactNode; footerNote?: string; light?: boolean }) {
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);
  const close = () => setMenu(false);
  return <div className={light ? "saas-site mf-home" : "saas-site"}>
    <div className="saas-announcement"><span>Free beta access. Built for moving companies.</span><Link href="/register">Join the beta <ArrowRight size={14} /></Link></div>
    <header className="saas-header">
      <div className="saas-wrap saas-navigation">
        <div className="saas-brand"><MoveGridBrand /><small>MOVING OPERATIONS CRM</small></div>
        <nav aria-label="Main navigation" className="saas-menu">
          {primary.map(l => <Link key={l.href} href={l.href}>{l.label}</Link>)}
          <Link href="/login">Sign In</Link>
        </nav>
        <Button asChild className="saas-nav-cta"><Link href="/register">Get Started <ArrowRight /></Link></Button>
        <Button variant="ghost" size="icon" className="saas-menu-toggle" aria-label="Open navigation" aria-expanded={menu} onClick={() => setMenu(true)}><Menu /></Button>
      </div>
    </header>
    {menu && <div className="saas-drawer-backdrop" onClick={close} />}
    <aside className={menu ? "saas-drawer is-open" : "saas-drawer"} aria-label="Menu" aria-hidden={!menu}>
      <div className="saas-drawer-head"><MoveGridBrand /><Button variant="ghost" size="icon" aria-label="Close navigation" onClick={close}><X /></Button></div>
      <nav className="saas-drawer-links">
        {primary.map(l => <Link key={l.href} href={l.href} onClick={close}>{l.label}</Link>)}
        <hr />
        {legal.map(l => <Link key={l.href} href={l.href} onClick={close}>{l.label}</Link>)}
      </nav>
      <div className="saas-drawer-cta">
        <Button asChild size="lg"><Link href="/register" onClick={close}>Get Started <ArrowRight /></Link></Button>
        <Button asChild size="lg" variant="outline"><Link href="/login" onClick={close}>Sign In</Link></Button>
      </div>
    </aside>
    <main>{children}</main>
    <footer className="saas-footer"><div className="saas-wrap"><div><MoveGridBrand /><p>Moving company software. One connected crew.</p></div><nav aria-label="Legal"><Link href="/privacy">Privacy Policy</Link><Link href="/terms">Terms of Service</Link></nav><small>© {new Date().getFullYear()} MoveFlew</small></div>{footerNote && <p className="saas-wrap saas-comparison-note">{footerNote}</p>}</footer>
  </div>;
}
