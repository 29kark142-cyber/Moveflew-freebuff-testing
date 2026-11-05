import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import PublicLayout from "@/components/PublicLayout";
import { supabase } from "@/integrations/supabase/client";

const title = "Start your moving company workspace — MoveFlew";
const desc = "Register your moving company and get a free beta workspace for leads, estimates, dispatch and crews.";

export const Route = createFileRoute("/register")({
  validateSearch: (search: Record<string, unknown>) => ({ email: typeof search.email === "string" && z.string().email().safeParse(search.email).success ? search.email : undefined }),
  head: () => ({
    meta: [
      { title },
      { name: "description", content: desc },
      { property: "og:title", content: title },
      { property: "og:description", content: desc },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RegisterPage,
});

const schema = z.object({
  company: z.string().trim().min(2, "Enter your company name").max(120),
  owner: z.string().trim().min(1, "Enter your name").max(120),
  email: z.string().trim().email("Enter a valid email"),
  phone: z.string().trim().min(7, "Enter a phone number").max(40),
  password: z.string().min(8, "Password needs at least 8 characters").max(72),
});

function RegisterPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [form, setForm] = useState({ company: "", owner: "", email: search.email ?? "", phone: "", password: "" });
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) return setMsg(parsed.error.issues[0]?.message ?? "Check the form");
    setBusy(true);
    setMsg("");
    const v = parsed.data;
    const { data, error } = await supabase.auth.signUp({
      email: v.email,
      password: v.password,
      options: {
        emailRedirectTo: `${window.location.origin}/login`,
        data: { company_name: v.company, owner_name: v.owner, phone: v.phone, full_name: v.owner },
      },
    });
    setBusy(false);
    if (error) return setMsg(error.message);
    if (data.session) return void navigate({ to: "/app/$", params: { _splat: "onboarding" } });
    setDone(true);
  }

  return (
    <PublicLayout>
      <section className="contact-page wrap">
        <div className="contact-info">
          <span className="section-kicker">FREE BETA</span>
          <h1>Run your moving company<br /><span>from one workspace.</span></h1>
          <p>Create your company account. Every workspace gets full access free during the beta — no card needed.</p>
        </div>
        {done ? (
          <div className="contact-form-panel">
            <h2>Check your email</h2>
            <p>We sent a confirmation link to {form.email}. After confirming, sign in and your workspace will be ready.</p>
            <Link to="/login">Go to sign in</Link>
          </div>
        ) : (
          <form className="contact-form-panel" onSubmit={submit} noValidate>
            <label>Company name<input required value={form.company} onChange={set("company")} placeholder="Acme Movers LLC" /></label>
            <label>Owner name<input required value={form.owner} onChange={set("owner")} placeholder="Jane Smith" autoComplete="name" /></label>
            <label>Email<input type="email" required value={form.email} onChange={set("email")} autoComplete="email" /></label>
            <label>Phone number<input type="tel" required value={form.phone} onChange={set("phone")} autoComplete="tel" /></label>
            <label>Password<input type="password" required minLength={8} value={form.password} onChange={set("password")} autoComplete="new-password" /></label>
            {msg && <p role="alert">{msg}</p>}
            <button className="btn btn-blue" disabled={busy}>{busy ? "Creating…" : "Create company workspace"}</button>
            <p style={{ fontSize: 14 }}>Already have an account? <Link to="/login">Sign in</Link></p>
          </form>
        )}
      </section>
    </PublicLayout>
  );
}
