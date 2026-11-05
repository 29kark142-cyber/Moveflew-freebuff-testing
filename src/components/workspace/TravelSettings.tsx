import { useEffect, useState } from "react";
import { getWorkspaceId } from "@/lib/crm";
import { getTravelSettings, saveTravelSettings } from "@/lib/travel.functions";
import { travelSettingsSchema, type TravelSettings as Settings } from "@/lib/travel-rules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Save } from "lucide-react";

const EMPTY: Settings = {
  dispatchAddress: "", travelPricingType: "none", travelFlatRate: 0, travelMileageRate: 0,
  fuelSurchargeType: "none", fuelFlatRate: 0, fuelPerMileRate: 0, fuelPercentageRate: 0,
};

export default function TravelSettings({ admin }: { admin: boolean }) {
  const [s, setS] = useState<Settings>(EMPTY);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const workspaceId = Number(getWorkspaceId());
    if (workspaceId) getTravelSettings({ data: { workspaceId } }).then(setS).catch(e => toast.error(e.message));
  }, []);
  const set = (p: Partial<Settings>) => setS(c => ({ ...c, ...p }));
  const num = (k: keyof Settings) => (
    <Input type="number" min="0" step=".01" disabled={!admin} value={String(s[k])} onChange={e => set({ [k]: Number(e.target.value) } as Partial<Settings>)} />
  );
  async function save() {
    setBusy(true);
    try {
      await saveTravelSettings({ data: { workspaceId: Number(getWorkspaceId()), settings: travelSettingsSchema.parse(s) } });
      toast.success("Travel and fuel settings saved");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save"); } finally { setBusy(false); }
  }
  return (
    <section className="space-y-4 py-6">
      <h2 className="text-lg font-semibold">Dispatch base, travel & fuel</h2>
      <p className="text-sm text-muted-foreground">Used to calculate drive time from your base to the pickup, and from the drop-off back to base, on new estimates.</p>
      <div className="space-y-2">
        <Label>Dispatch base address</Label>
        <Input disabled={!admin} placeholder="Street, city, state ZIP" value={s.dispatchAddress} onChange={e => set({ dispatchAddress: e.target.value })} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Travel time charge</Label>
          <Select disabled={!admin} value={s.travelPricingType} onValueChange={v => set({ travelPricingType: v as Settings["travelPricingType"] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="hourly">Drive time × crew hourly rate</SelectItem>
              <SelectItem value="flat_fee">Flat fee</SelectItem>
              <SelectItem value="per_mile">Per mile (to and from base)</SelectItem>
              <SelectItem value="none">Don't charge travel</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {s.travelPricingType === "flat_fee" && <div className="space-y-2"><Label>Travel flat fee (USD)</Label>{num("travelFlatRate")}</div>}
        {s.travelPricingType === "per_mile" && <div className="space-y-2"><Label>Travel rate per mile (USD)</Label>{num("travelMileageRate")}</div>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Fuel surcharge</Label>
          <Select disabled={!admin} value={s.fuelSurchargeType} onValueChange={v => set({ fuelSurchargeType: v as Settings["fuelSurchargeType"] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="per_mile">Per mile driven</SelectItem>
              <SelectItem value="percentage">% of estimate</SelectItem>
              <SelectItem value="flat_fee">Flat fee</SelectItem>
              <SelectItem value="none">No fuel surcharge</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {s.fuelSurchargeType === "per_mile" && <div className="space-y-2"><Label>Fuel rate per mile (USD)</Label>{num("fuelPerMileRate")}</div>}
        {s.fuelSurchargeType === "percentage" && <div className="space-y-2"><Label>Fuel percentage (%)</Label>{num("fuelPercentageRate")}</div>}
        {s.fuelSurchargeType === "flat_fee" && <div className="space-y-2"><Label>Fuel flat fee (USD)</Label>{num("fuelFlatRate")}</div>}
      </div>
      {admin ? <Button onClick={() => void save()} disabled={busy}><Save size={15} /> Save travel settings</Button>
        : <p className="text-sm text-muted-foreground">Only workspace admins can change these settings.</p>}
    </section>
  );
}
