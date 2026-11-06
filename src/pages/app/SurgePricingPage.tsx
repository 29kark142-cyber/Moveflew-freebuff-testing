import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, CircleAlert, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { SectionLoader } from "@/components/loaders/MoveFlewLoader";
import { crm } from "@/lib/crm";
import { money, type Pricing } from "@shared/crm";
import {
  DEFAULT_SURGE_SETTINGS,
  applySurge,
  parseSurgeSettings,
  type SurgeRule,
  type SurgeSettings,
} from "@shared/surge";

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

const newRule = (): SurgeRule => ({
  id: globalThis.crypto?.randomUUID?.() ?? `peak-${Date.now()}`,
  name: "Peak season",
  startDate: today(),
  endDate: addDays(30),
  percent: 10,
  enabled: true,
});

/**
 * Workspace-managed automatic pricing. The server persists these rules inside the
 * existing workspace pricing JSON and applies them from the shared surge evaluator,
 * so the preview here, the CRM quote endpoint and saved customer quotes agree.
 */
export default function SurgePricingPage({
  role,
  navigate,
}: {
  role: string;
  navigate: (to: string) => void;
}) {
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [form, setForm] = useState<Pricing | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [previewDate, setPreviewDate] = useState(today());
  const [previewBase, setPreviewBase] = useState("1000");

  const canEdit = role === "admin";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setPricing(await crm.pricing());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load pricing settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <SectionLoader label="Loading surge pricing…" />;
  }

  if (!pricing) {
    return (
      <section className="ws-settings-section ws-card ws-card-pad space-y-3">
        <div className="ws-error">
          <CircleAlert size={16} /> {error || "Could not load pricing settings."}
        </div>
        <button className="ws-btn" onClick={() => void load()}>
          Try again
        </button>
      </section>
    );
  }

  const value = form ?? pricing;
  const settings = parseSurgeSettings(value.surge);
  const preview = applySurge(
    previewDate,
    Math.max(0, Number(previewBase) || 0),
    settings,
    value.weekendPercent,
  );

  const patchPricing = (change: Partial<Pricing>) =>
    setForm((current) => ({ ...(current ?? value), ...change }));
  const patchSurge = (change: Partial<SurgeSettings>) =>
    patchPricing({ surge: { ...settings, ...change } });
  const patchEndOfMonth = (change: Partial<SurgeSettings["endOfMonth"]>) =>
    patchSurge({ endOfMonth: { ...settings.endOfMonth, ...change } });
  const patchRule = (id: string, change: Partial<SurgeRule>) =>
    patchSurge({
      peakRules: settings.peakRules.map((rule) => (rule.id === id ? { ...rule, ...change } : rule)),
    });

  const save = async () => {
    const invalid = settings.peakRules.find(
      (rule) => !rule.name.trim() || rule.endDate < rule.startDate,
    );
    if (invalid) {
      setError("Every peak range needs a name and an end date on or after its start date.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const saved = await crm.updatePricing({ ...value, surge: settings });
      setPricing(saved);
      setForm(null);
      setMessage("Surge pricing settings saved.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save surge pricing.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="ws-settings-section" style={{ maxWidth: 980 }} data-tour="surge-pricing">
      <div className="ws-card ws-card-pad">
        <div className="ws-card-title">
          <div>
            <h1>Surge &amp; peak-season pricing</h1>
            <p>
              Automatic percentage adjustments for selected dates, weekends and the end of each
              month. Rules apply to the estimate subtotal after any manual discount.
            </p>
          </div>
          <button className="ws-btn" onClick={() => navigate("/app/settings")}>
            <ArrowLeft size={14} /> Settings
          </button>
        </div>
        {error && (
          <div className="ws-error" style={{ marginTop: 12 }}>
            <CircleAlert size={16} /> {error}
          </div>
        )}
        {message && (
          <div className="ws-alert" style={{ marginTop: 12 }}>
            {message}
          </div>
        )}
        {!canEdit && (
          <div className="ws-alert" style={{ marginTop: 12 }}>
            Only workspace admins can change surge pricing. These rules are shown read-only.
          </div>
        )}
      </div>

      <div className="ws-card ws-card-pad" style={{ marginTop: 16 }}>
        <div className="ws-card-title">
          <div>
            <h2>Automatic adjustments</h2>
            <p>
              Weekend pricing uses the workspace&apos;s existing weekend markup. Peak and
              end-of-month rules stack, then the combined cap is enforced.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={settings.enabled}
              disabled={!canEdit || busy}
              onChange={(event) => patchSurge({ enabled: event.target.checked })}
            />
            {settings.enabled ? "On" : "Off"}
          </label>
        </div>
        <div className="ws-form-grid three" style={{ marginTop: 12 }}>
          <label data-tour="surge-weekend">
            <span className="ws-helper">Weekend markup %</span>
            <input
              className="ws-input"
              type="number"
              min="0"
              max="100"
              step="0.5"
              disabled={!canEdit || busy}
              value={value.weekendPercent}
              onChange={(event) =>
                patchPricing({ weekendPercent: Math.max(0, Number(event.target.value) || 0) })
              }
            />
            <span className="ws-helper">Applies to Saturday and Sunday moves.</span>
          </label>
          <label>
            <span className="ws-helper">Combined cap %</span>
            <input
              className="ws-input"
              type="number"
              min="0"
              max="200"
              step="0.5"
              disabled={!canEdit || busy}
              value={settings.maxPercent}
              onChange={(event) =>
                patchSurge({ maxPercent: Math.max(0, Number(event.target.value) || 0) })
              }
            />
            <span className="ws-helper">0 means no cap. Caps the sum of all active rules.</span>
          </label>
        </div>
      </div>

      <div className="ws-card ws-card-pad" style={{ marginTop: 16 }} data-tour="surge-seasonal">
        <div className="ws-card-title">
          <div>
            <h2>Peak season date ranges</h2>
            <p>
              Inclusive dates. If ranges overlap, only the highest matching range applies; the
              weekend and end-of-month rules can still add to it.
            </p>
          </div>
          <button
            className="ws-btn"
            disabled={!canEdit || busy || settings.peakRules.length >= 30}
            onClick={() => patchSurge({ peakRules: [...settings.peakRules, newRule()] })}
          >
            <Plus size={14} /> Add range
          </button>
        </div>
        {settings.peakRules.length === 0 ? (
          <p className="ws-helper" style={{ marginTop: 12 }}>
            No peak-season ranges yet. Add one for holidays, summer, or your busiest week.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
            {settings.peakRules.map((rule) => (
              <div
                key={rule.id}
                style={{
                  border: "1px solid var(--line, #d9e4ee)",
                  borderRadius: 10,
                  padding: 12,
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  gap: 10,
                  alignItems: "end",
                }}
              >
                <label>
                  <span className="ws-helper">Name</span>
                  <input
                    className="ws-input"
                    maxLength={80}
                    disabled={!canEdit || busy}
                    value={rule.name}
                    onChange={(event) => patchRule(rule.id, { name: event.target.value })}
                  />
                </label>
                <label>
                  <span className="ws-helper">Start date</span>
                  <input
                    className="ws-input"
                    type="date"
                    disabled={!canEdit || busy}
                    value={rule.startDate}
                    onChange={(event) => patchRule(rule.id, { startDate: event.target.value })}
                  />
                </label>
                <label>
                  <span className="ws-helper">End date</span>
                  <input
                    className="ws-input"
                    type="date"
                    disabled={!canEdit || busy}
                    value={rule.endDate}
                    onChange={(event) => patchRule(rule.id, { endDate: event.target.value })}
                  />
                </label>
                <label>
                  <span className="ws-helper">Markup %</span>
                  <input
                    className="ws-input"
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    disabled={!canEdit || busy}
                    value={rule.percent}
                    onChange={(event) =>
                      patchRule(rule.id, {
                        percent: Math.min(100, Math.max(0, Number(event.target.value) || 0)),
                      })
                    }
                  />
                </label>
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={rule.enabled}
                    disabled={!canEdit || busy}
                    onChange={(event) => patchRule(rule.id, { enabled: event.target.checked })}
                  />
                  Active
                </label>
                <button
                  className="ws-btn"
                  aria-label={`Remove ${rule.name || "peak range"}`}
                  disabled={!canEdit || busy}
                  onClick={() =>
                    patchSurge({
                      peakRules: settings.peakRules.filter((item) => item.id !== rule.id),
                    })
                  }
                >
                  <Trash2 size={14} /> Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="ws-card ws-card-pad" style={{ marginTop: 16 }}>
        <div className="ws-card-title">
          <div>
            <h2>End-of-month peak</h2>
            <p>Apply an extra percentage during the busiest closing days of every month.</p>
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={settings.endOfMonth.enabled}
              disabled={!canEdit || busy}
              onChange={(event) => patchEndOfMonth({ enabled: event.target.checked })}
            />
            {settings.endOfMonth.enabled ? "On" : "Off"}
          </label>
        </div>
        <div className="ws-form-grid three" style={{ marginTop: 12 }}>
          <label>
            <span className="ws-helper">Starts on day</span>
            <input
              className="ws-input"
              type="number"
              min="1"
              max="31"
              step="1"
              disabled={!canEdit || busy || !settings.endOfMonth.enabled}
              value={settings.endOfMonth.startDay}
              onChange={(event) =>
                patchEndOfMonth({
                  startDay: Math.min(31, Math.max(1, Number(event.target.value) || 1)),
                })
              }
            />
          </label>
          <label>
            <span className="ws-helper">Markup %</span>
            <input
              className="ws-input"
              type="number"
              min="0"
              max="100"
              step="0.5"
              disabled={!canEdit || busy || !settings.endOfMonth.enabled}
              value={settings.endOfMonth.percent}
              onChange={(event) =>
                patchEndOfMonth({
                  percent: Math.min(100, Math.max(0, Number(event.target.value) || 0)),
                })
              }
            />
          </label>
        </div>
      </div>

      <div className="ws-card ws-card-pad" style={{ marginTop: 16 }}>
        <div className="ws-card-title">
          <div>
            <h2>Preview</h2>
            <p>Uses the current form values, including unsaved changes.</p>
          </div>
        </div>
        <div className="ws-form-grid three" style={{ marginTop: 12 }}>
          <label>
            <span className="ws-helper">Move date</span>
            <input
              className="ws-input"
              type="date"
              value={previewDate}
              onChange={(event) => setPreviewDate(event.target.value)}
            />
          </label>
          <label>
            <span className="ws-helper">Estimate subtotal ($)</span>
            <input
              className="ws-input"
              type="number"
              min="0"
              step="1"
              value={previewBase}
              onChange={(event) => setPreviewBase(event.target.value)}
            />
          </label>
        </div>
        {preview.lines.length === 0 ? (
          <p className="ws-helper" style={{ marginTop: 12 }}>
            No surge applies to this date with the current rules.
          </p>
        ) : (
          <div style={{ marginTop: 12 }}>
            {preview.lines.map((line) => (
              <div
                key={line.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "6px 0",
                  borderBottom: "1px solid var(--line, #d9e4ee)",
                }}
              >
                <span>
                  {line.label} <span className="ws-helper">({line.percent}%)</span>
                </span>
                <strong>{money(line.amount)}</strong>
              </div>
            ))}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                paddingTop: 10,
              }}
            >
              <strong>
                Total after {preview.percent}% surge
                {preview.capped ? " (cap applied)" : ""}
              </strong>
              <strong>{money(preview.total)}</strong>
            </div>
          </div>
        )}
      </div>

      {canEdit && (
        <div className="ws-actions" style={{ marginTop: 16 }}>
          <button className="ws-btn primary" data-tour="surge-save" disabled={busy} onClick={() => void save()}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save surge
            pricing
          </button>
          <span className="ws-helper">
            Applies to new and recalculated quotes. Existing signed quotes keep their saved
            snapshot.
          </span>
        </div>
      )}
    </section>
  );
}
