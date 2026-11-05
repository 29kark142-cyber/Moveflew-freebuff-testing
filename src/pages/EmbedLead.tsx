import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, Loader2 } from "lucide-react";

const BEDROOMS = ["Studio", "1 bedroom", "2 bedrooms", "3 bedrooms", "4+ bedrooms"];

/** Public iframe form for the embeddable lead widget. Posts straight to the public intake API. */
export default function EmbedLeadPage() {
  const [key, setKey] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    moveDate: "",
    moveSize: "",
    originZip: "",
    destinationZip: "",
    message: "",
  });

  useEffect(() => {
    setKey(new URLSearchParams(window.location.search).get("key") ?? "");
  }, []);

  const origin = useMemo(() => (typeof window === "undefined" ? "" : window.location.origin), []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const id = (
        crypto.randomUUID?.() ?? `${Date.now()}${Math.random().toString(16).slice(2)}`
      ).replace(/-/g, "");
      const response = await fetch(`${origin}/api/public/v1/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Widget-Key": key, "Idempotency-Key": id },
        body: JSON.stringify({
          ...form,
          origin: form.originZip ? `Pickup ZIP ${form.originZip}` : "",
          destination: form.destinationZip ? `Drop-off ZIP ${form.destinationZip}` : "",
          source: "Website widget",
        }),
      });
      if (!response.ok)
        throw new Error("We couldn't send this request. Please try again or call us.");
      setSent(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  if (!key) {
    return (
      <main
        style={{
          maxWidth: 520,
          margin: "40px auto",
          padding: 20,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ display: "flex", gap: 10, alignItems: "center", color: "#b91c1c" }}>
          <CircleAlert size={20} /> This form is missing its website key.
        </div>
        <p>Ask the moving company for a fresh embed snippet.</p>
      </main>
    );
  }

  if (sent) {
    return (
      <main
        style={{
          maxWidth: 520,
          margin: "40px auto",
          padding: 20,
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <CheckCircle2 size={32} color="#15803d" />
        <h1 style={{ fontSize: 20, margin: "10px 0" }}>Thank you!</h1>
        <p>We received your move details and will be in touch shortly.</p>
      </main>
    );
  }

  const field = {
    width: "100%",
    padding: 10,
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    fontSize: 14,
  } as const;
  const label = { display: "grid", gap: 4, fontSize: 13, fontWeight: 600 } as const;

  return (
    <main
      style={{
        maxWidth: 520,
        margin: "24px auto",
        padding: 20,
        fontFamily: "system-ui, sans-serif",
        color: "#0f172a",
      }}
    >
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Get a free moving quote</h1>
      <p style={{ marginTop: 0, fontSize: 14, color: "#475569" }}>
        Tell us about the move and we'll send an estimate.
      </p>
      <form onSubmit={submit} style={{ display: "grid", gap: 12, marginTop: 16 }}>
        <label style={label}>
          Full name
          <input
            style={field}
            required
            maxLength={180}
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <label style={label}>
            Email
            <input
              style={field}
              type="email"
              required
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
            />
          </label>
          <label style={label}>
            Phone
            <input
              style={field}
              type="tel"
              value={form.phone}
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
            />
          </label>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <label style={label}>
            Origin ZIP
            <input
              style={field}
              inputMode="numeric"
              pattern="[0-9]{5}"
              required
              value={form.originZip}
              onChange={(event) => setForm({ ...form, originZip: event.target.value })}
            />
          </label>
          <label style={label}>
            Destination ZIP
            <input
              style={field}
              inputMode="numeric"
              pattern="[0-9]{5}"
              required
              value={form.destinationZip}
              onChange={(event) => setForm({ ...form, destinationZip: event.target.value })}
            />
          </label>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <label style={label}>
            Move date
            <input
              style={field}
              type="date"
              value={form.moveDate}
              onChange={(event) => setForm({ ...form, moveDate: event.target.value })}
            />
          </label>
          <label style={label}>
            Bedrooms
            <select
              style={field}
              value={form.moveSize}
              onChange={(event) => setForm({ ...form, moveSize: event.target.value })}
            >
              <option value="">Choose…</option>
              {BEDROOMS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label style={label}>
          Anything else?
          <textarea
            style={{ ...field, minHeight: 72 }}
            rows={3}
            value={form.message}
            onChange={(event) => setForm({ ...form, message: event.target.value })}
          />
        </label>
        {error && (
          <p style={{ color: "#b91c1c", fontSize: 13 }} role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          style={{
            padding: 12,
            border: 0,
            borderRadius: 8,
            background: "#1d4ed8",
            color: "#fff",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : "Request my quote"}
        </button>
        <p style={{ fontSize: 11, color: "#64748b", margin: 0 }}>
          Your details go straight to the moving company. No payment is collected on this form.
        </p>
      </form>
    </main>
  );
}
