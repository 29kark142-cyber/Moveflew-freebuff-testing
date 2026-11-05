// Public, unauthenticated read of one move for the customer tracking portal.
// The URL token is the credential: no job ids, prices, customer contact details
// or internal notes are ever returned from here.
import {
  jobReference,
  TRACKING_TOKEN_RE,
  type PublicTrackingPayload,
  type TrackingTimeline,
} from "@/shared/tracking";

const PHASES = [
  "start_travel",
  "arrive_pickup",
  "start_loading",
  "in_transit",
  "arrive_dropoff",
  "complete",
] as const;

/** Only the six known field timestamps leave the server, and only when parseable. */
function sanitizeTimeline(value: unknown): TrackingTimeline {
  const out: TrackingTimeline = {};
  if (!value || typeof value !== "object") return out;
  for (const key of PHASES) {
    const raw = (value as Record<string, unknown>)[key];
    if (typeof raw === "string" && Number.isFinite(Date.parse(raw))) out[key] = raw;
  }
  return out;
}

const initials = (value: string): string => {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "MF";
  if (parts.length === 1) return (parts[0] as string).slice(0, 2).toUpperCase();
  return `${(parts[0] as string)[0] ?? ""}${(parts[1] as string)[0] ?? ""}`.toUpperCase();
};

type CrewRow = { id: number; name: string; phone: string; isDriver: boolean; crewRole: string };

export async function readTracking(token: string): Promise<PublicTrackingPayload | null> {
  if (!TRACKING_TOKEN_RE.test(token)) return null;

  // Imported inside the handler: the service-role client must never be bundled for the browser.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: row, error } = await supabaseAdmin
    .from("workspace_records")
    .select("id,data,workspace_id")
    .eq("kind", "job")
    .contains("data", { trackingToken: token })
    .maybeSingle();
  if (error || !row) return null;

  const data = (row.data ?? {}) as Record<string, unknown>;
  const wsId = Number(row.workspace_id);
  const jobId = Number(row.id);

  const [{ data: company }, { data: crewRows }] = await Promise.all([
    supabaseAdmin
      .from("workspaces")
      .select("name,company_phone,office_email")
      .eq("id", wsId)
      .maybeSingle(),
    supabaseAdmin
      .from("workspace_records")
      .select("id,data")
      .eq("workspace_id", wsId)
      .eq("kind", "crew")
      .limit(200),
  ]);

  const crewIds = Array.isArray(data["crewIds"]) ? (data["crewIds"] as unknown[]).map(Number) : [];
  const crew: CrewRow[] = (crewRows ?? [])
    .map((r) => {
      const d = (r.data ?? {}) as Record<string, unknown>;
      return {
        id: Number(r.id),
        name: String(d["name"] ?? ""),
        phone: String(d["phone"] ?? ""),
        isDriver: d["isDriver"] === true,
        crewRole: String(d["crewRole"] ?? ""),
      };
    })
    .filter((member) => crewIds.includes(member.id));

  const foreman =
    crew.find((member) => member.crewRole === "crew_lead") ??
    crew.find((member) => member.isDriver) ??
    crew[0] ??
    null;

  const name = String(company?.name ?? "").trim() || "Your moving company";

  return {
    reference: jobReference(jobId),
    company: {
      name,
      phone: String(company?.company_phone ?? ""),
      email: String(company?.office_email ?? ""),
      monogram: initials(name),
    },
    moveDate: String(data["moveDate"] ?? ""),
    startHour: Number(data["startHour"] ?? 8),
    duration: Number(data["duration"] ?? 4),
    travelMinutes: Number(data["travelMinutes"] ?? 0),
    distanceMiles: Number(data["distanceMiles"] ?? 0),
    origin: String(data["origin"] ?? ""),
    destination: String(data["destination"] ?? ""),
    timeline: sanitizeTimeline(data["timeline"]),
    foreman: foreman
      ? {
          name: foreman.name || "Crew foreman",
          phone: foreman.phone,
          role: foreman.crewRole || (foreman.isDriver ? "driver" : "helper"),
          initials: initials(foreman.name || "Crew foreman"),
        }
      : null,
    updatedAt: new Date().toISOString(),
  };
}
