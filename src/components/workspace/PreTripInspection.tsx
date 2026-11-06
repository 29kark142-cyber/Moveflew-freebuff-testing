import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, CircleAlert, Loader2, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { crmFetch } from "@/lib/crm";
import type { Truck as FleetTruck } from "@shared/crm";
import { inspectionItems, type VehicleInspection, type VehicleInspectionItem } from "@shared/fleet";

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

/**
 * Driver pre-trip checklist. The server requires every item, records the signed
 * result on the workspace, and the office fleet page shows the latest inspection.
 */
export default function PreTripInspection() {
  const [trucks, setTrucks] = useState<FleetTruck[]>([]);
  const [truckId, setTruckId] = useState("");
  const [items, setItems] = useState<VehicleInspectionItem[]>(() => inspectionItems());
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState<VehicleInspection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    crmFetch<FleetTruck[]>("/field/trucks")
      .then((rows) => {
        if (!live) return;
        setTrucks(rows);
        setTruckId((current) => current || String(rows[0]?.id ?? ""));
      })
      .catch(() => {
        if (live) setTrucks([]);
      });
    return () => {
      live = false;
    };
  }, []);

  const toggle = (key: string) =>
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ok: !item.ok } : item)),
    );

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!truckId) {
      setError("Select the truck you are taking out.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await crmFetch<VehicleInspection>(
        `/field/trucks/${truckId}/inspection`,
        json({ items, notes }),
      );
      setSaved(result);
      toast.success(result.passed ? "Pre-trip inspection passed" : "Pre-trip issues recorded");
      setNotes("");
      setItems(inspectionItems());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the inspection.");
    } finally {
      setBusy(false);
    }
  };

  const failures = items.filter((item) => !item.ok);

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-2xl border border-border bg-card p-4 text-card-foreground"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Truck className="h-4 w-4" /> Pre-trip vehicle inspection
          </h2>
          <p className="text-sm text-muted-foreground">
            Complete this before your first shift of the day. Uncheck anything that needs attention
            and tell the office before departure.
          </p>
        </div>
        {failures.length > 0 && (
          <span className="flex shrink-0 items-center gap-1 text-xs text-destructive">
            <CircleAlert className="h-3.5 w-3.5" /> {failures.length} issue
            {failures.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <label className="block text-sm font-medium">
        Truck
        <select
          className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-foreground"
          value={truckId}
          onChange={(event) => setTruckId(event.target.value)}
          disabled={busy || !trucks.length}
        >
          {!trucks.length && <option value="">No trucks configured</option>}
          {trucks.map((truck) => (
            <option key={truck.id} value={truck.id}>
              {truck.name} · {truck.plate || "no plate"} · {truck.status}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <label
            key={item.key}
            className="flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm"
          >
            <input
              type="checkbox"
              checked={item.ok}
              disabled={busy}
              onChange={() => toggle(item.key)}
            />
            <span className={item.ok ? "" : "font-medium text-destructive"}>{item.label}</span>
          </label>
        ))}
      </div>

      <label className="block text-sm font-medium">
        Notes for the office
        <textarea
          className="mt-1 min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-foreground"
          maxLength={2000}
          value={notes}
          disabled={busy}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Low tire, damaged ramp, warning light…"
        />
      </label>

      {error && (
        <p className="flex items-start gap-2 text-sm text-destructive">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </p>
      )}
      {saved && (
        <p
          className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
            saved.passed ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"
          }`}
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          Saved for {saved.truckName}.{" "}
          {saved.passed
            ? "All checks passed."
            : "Issues are on the fleet record; contact the office before driving."}
        </p>
      )}

      <Button type="submit" disabled={busy || !trucks.length} className="w-full">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
        {busy ? "Saving inspection…" : "Submit pre-trip inspection"}
      </Button>
    </form>
  );
}
