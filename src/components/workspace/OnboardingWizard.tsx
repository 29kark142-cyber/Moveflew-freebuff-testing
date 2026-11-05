import { useState } from "react";
import { toast } from "sonner";
import { MapPin, Fuel, Wallet, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import TravelSettings from "@/components/workspace/TravelSettings";
import DepositSettings from "@/components/workspace/DepositSettings";
import { saveTravelSettings } from "@/lib/travel.functions";
import { saveDepositRule } from "@/lib/proposals.functions";
import { SKIP_DEFAULTS } from "@/lib/onboarding";

const STEPS = [
  { icon: MapPin, title: "Dispatch base address", text: "Where your trucks start and end each day. Used to measure drive time and miles. Enter it in the address field below and save." },
  { icon: Fuel, title: "Travel & fuel charges", text: "Choose how travel time and fuel are billed on new estimates, then save." },
  { icon: Wallet, title: "Deposit rule", text: "Set the default deposit customers pay when they accept a proposal, then save." },
];

export default function OnboardingWizard({ workspaceId, onDone }: { workspaceId: number; onDone: () => Promise<void> | void }) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  async function finish(skip: boolean) {
    setBusy(true);
    try {
      if (skip) {
        await saveTravelSettings({ data: { workspaceId, settings: SKIP_DEFAULTS.travel } });
        await saveDepositRule({ data: { workspaceId, rule: SKIP_DEFAULTS.deposit } });
      }
      const { error } = await supabase.rpc("complete_workspace_onboarding", { _ws: workspaceId });
      if (error) throw new Error(error.message);
      toast.success(skip ? "Setup skipped — all fees are off for now." : "Setup complete");
      await onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not finish setup");
    } finally {
      setBusy(false);
    }
  }

  const S = STEPS[step]!;
  return (
    <div className="ws-onboard-wizard">
      <div className="ws-steps">
        {STEPS.map((s, i) => (
          <span key={s.title} className={i === step ? "active" : i < step ? "done" : ""}>
            {i < step ? <Check size={14} /> : i + 1} {s.title}
          </span>
        ))}
      </div>
      <h1><S.icon size={20} /> Step {step + 1} of 3: {S.title}</h1>
      <p>{S.text}</p>
      {step < 2 ? <TravelSettings admin /> : <DepositSettings admin />}
      <div className="ws-row-actions" style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {step > 0 && <button className="ws-btn" disabled={busy} onClick={() => setStep(step - 1)}>Back</button>}
        {step < 2
          ? <button className="ws-btn primary" disabled={busy} onClick={() => setStep(step + 1)}>Next</button>
          : <button className="ws-btn primary" disabled={busy} onClick={() => void finish(false)}>Finish setup</button>}
        <button className="ws-btn" disabled={busy} onClick={() => void finish(true)}>Skip for now</button>
      </div>
      <p style={{ fontSize: 13, opacity: 0.75, marginTop: 12 }}>
        Skipping turns travel fees, fuel surcharges and required deposits off ($0). You can change them anytime in Settings → Pricing, and staff can still add them on any estimate.
      </p>
    </div>
  );
}
