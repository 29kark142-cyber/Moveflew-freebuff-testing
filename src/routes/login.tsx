import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import PublicLayout from "@/components/PublicLayout";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

const title = "Team login — MoveFlew";
const desc = "Sign in to your MoveFlew workspace.";

export const Route = createFileRoute("/login")({
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
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const go = () => {
      const next = sessionStorage.getItem("nwc_next");
      if (next && next.startsWith("/") && !next.startsWith("//")) {
        sessionStorage.removeItem("nwc_next");
        window.location.href = next;
      } else void navigate({ to: "/app/$", params: { _splat: "dashboard" } });
    };
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) go();
    });
    const { data } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) go();
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const { data, error } =
      mode === "in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: `${window.location.origin}/app/dashboard` },
          });
    setBusy(false);
    if (error) return setMsg(error.message);
    if (mode === "up" && !data.session) setMsg("Check your email to confirm your account, then sign in.");
  }

  async function google() {
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/login" });
    if (result.error) setMsg(result.error.message ?? "Google sign-in failed");
  }

  return (
    <PublicLayout>
      <section className="contact-page wrap">
        <div className="contact-info">
          <span className="section-kicker">TEAM LOGIN</span>
          <h1>
            Welcome back.
            <br />
            <span>Let's get moving.</span>
          </h1>
          <p>Sign in to open your leads, estimates, dispatch board and crew.</p>
        </div>
        <div className="contact-form-panel">
          <h2>{mode === "in" ? "Sign in" : "Create your account"}</h2>
          <form onSubmit={submit}>
            <label>
              Email address
              <input name="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {msg && <p role="alert">{msg}</p>}
            <button className="btn btn-blue" disabled={busy}>
              {busy ? "Please wait…" : mode === "in" ? "Sign in" : "Create account"}
            </button>
          </form>
          <button type="button" className="btn btn-navy" onClick={() => void google()} style={{ marginTop: 12, width: "100%" }}>
            Continue with Google
          </button>
          <button type="button" className="text-link" onClick={() => setMode(mode === "in" ? "up" : "in")} style={{ marginTop: 16 }}>
            {mode === "in" ? "New here? Create an account" : "Already have an account? Sign in"}
          </button>
        </div>
      </section>
    </PublicLayout>
  );
}
