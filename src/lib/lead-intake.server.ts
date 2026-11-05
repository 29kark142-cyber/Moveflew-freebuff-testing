import { z } from "zod";
import { enforceIntakeLimit } from './intake-limit.server';

export const leadSchema = z.object({
  name: z.string().trim().min(1).max(180),
  email: z.string().trim().email().max(320).or(z.literal("")).default(""),
  phone: z.string().trim().max(40).default(""),
  origin: z.string().trim().max(500).default(""),
  destination: z.string().trim().max(500).default(""),
  moveDate: z.string().trim().max(40).default(""),
  moveSize: z.string().trim().max(100).default(""),
  message: z.string().trim().max(5000).default(""),
});
export type Lead = z.infer<typeof leadSchema>;

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), v => v.toString(16).padStart(2, "0")).join("");
}

const MATCHERS: [keyof Lead, RegExp][] = [
  ["email", /e-?mail/i],
  ["phone", /phone|mobile|tel/i],
  ["origin", /pick.?up|origin|from|moving.?from|current.?address/i],
  ["destination", /drop.?off|destination|deliver|moving.?to|\bto\b|new.?address/i],
  ["moveDate", /date|when/i],
  ["moveSize", /size|bedroom|rooms|home.?type/i],
  ["message", /message|notes?|comments?|details|description/i],
  ["name", /name/i],
];

/** Flattens any form-builder payload into label → value pairs. */
function pairs(input: unknown): [string, string][] {
  const out: [string, string][] = [];
  const obj = input as Record<string, any>;
  // Typeform: form_response.answers with field ids, titles in definition.fields
  const tf = obj?.form_response;
  if (tf?.answers && Array.isArray(tf.answers)) {
    const titles = new Map<string, string>((tf.definition?.fields ?? []).map((f: any) => [f.id, f.title || f.ref || ""]));
    for (const a of tf.answers) {
      const label = `${titles.get(a.field?.id) ?? ""} ${a.field?.ref ?? ""} ${a.type === "email" ? "email" : a.type === "phone_number" ? "phone" : a.type === "date" ? "date" : ""}`;
      const value = a.email ?? a.phone_number ?? a.text ?? a.date ?? a.number ?? a.choice?.label ?? a.choices?.labels?.join(", ") ?? a.url;
      if (value != null) out.push([label, String(value)]);
    }
    return out;
  }
  // Jotform sends the answers as JSON in rawRequest
  if (typeof obj?.rawRequest === "string") {
    try { return pairs(JSON.parse(obj.rawRequest)); } catch { /* fall through */ }
  }
  const walk = (value: unknown, path: string) => {
    if (value == null) return;
    if (typeof value === "object") {
      const entries = Object.entries(value as Record<string, unknown>);
      // Name objects like { first, last }
      if (entries.every(([, v]) => typeof v === "string") && entries.some(([k]) => /first|last/i.test(k))) {
        out.push([path, entries.map(([, v]) => v).join(" ").trim()]);
        return;
      }
      for (const [k, v] of entries) walk(v, `${path} ${k}`);
      return;
    }
    out.push([path, String(value)]);
  };
  walk(input, "");
  return out;
}

export function normalizeLead(input: unknown): Lead | null {
  const lead: Record<string, string> = {};
  const extra: string[] = [];
  for (const [label, value] of pairs(input)) {
    const v = value.trim();
    if (!v) continue;
    const key = label.replace(/^q\d+_/, "");
    const match = MATCHERS.find(([, re]) => re.test(key));
    if (match && !lead[match[0]]) lead[match[0]] = v.slice(0, 5000);
    else if (extra.length < 30 && !/^(?:form_?id|submission_?id|ip|event|token|signature)/i.test(key.trim())) extra.push(`${key.trim()}: ${v.slice(0, 200)}`);
  }
  if (!lead.name && lead.email) lead.name = lead.email.split("@")[0];
  if (lead.email && !z.string().email().safeParse(lead.email).success) delete lead.email;
  if (extra.length) lead.message = [lead.message, ...extra].filter(Boolean).join("\n").slice(0, 5000);
  const parsed = leadSchema.safeParse(lead);
  return parsed.success ? parsed.data : null;
}

export async function saveLead(credential: string, requestId: string, lead: Lead) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const notes = [
    lead.moveDate && `Move date: ${lead.moveDate}`,
    lead.origin && `Pickup: ${lead.origin}`,
    lead.destination && `Delivery: ${lead.destination}`,
    lead.moveSize && `Move size: ${lead.moveSize}`,
    lead.message,
  ].filter(Boolean).join("\n");
  const { error } = await supabaseAdmin.rpc("receive_integration_lead", {
    _hash: await sha256(credential), _request_id: requestId, _data: { ...lead, notes },
  });
  if (!error) return 201;
  const status = error.message.includes("credential") ? 401 : error.message.includes("rate limit") ? 429 : error.message.includes("Invalid quote") ? 400 : 503;
  if (status === 503) console.error("Lead intake failed:", error.message);
  const { logPlatformEvent } = await import("./platform-events.server");
  await logPlatformEvent("lead_intake", status === 503 ? "error" : "warn", `Inbound lead rejected (${status})`, { status, prefix: credential.slice(0, 10), reason: error.message.slice(0, 200) });
  return status;
}

// Accepts either a secret API key (server-to-server) or a public widget key.
export const leadCors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Widget-Key, Idempotency-Key",
  "Cache-Control": "no-store",
};
const reply = (status: number, body: unknown) => Response.json(body, { status, headers: leadCors });
const MESSAGES: Record<number, string> = {
  401: "Invalid or revoked key", 429: "Too many submissions; retry shortly", 400: "Check the submitted fields", 503: "The lead could not be saved; retry",
};


// Shared by /api/public/v1/leads and API-key calls to /api/v1/public/quotes.
export async function handleIntegrationLead(request: Request): Promise<Response> {
        const limited = await enforceIntakeLimit(request, leadCors);
        if (limited) return limited;
        const bearer = request.headers.get("Authorization")?.replace(/^Bearer /, "");
        const widget = request.headers.get("X-Widget-Key");
        const credential = bearer && /^(nw_pub|sk)_[a-f0-9]{48}$/.test(bearer) ? bearer : widget && /^pk_[a-f0-9]{32}$/.test(widget) ? widget : null;
        if (!credential) return reply(401, { error: "An API key or widget key is required" });
        const requestId = z.string().min(8).max(100).regex(/^[a-zA-Z0-9_-]+$/).safeParse(request.headers.get("Idempotency-Key"));
        if (!requestId.success) return reply(400, { error: "Provide an Idempotency-Key header" });
        const raw = await request.text();
        if (raw.length > 16000) return reply(413, { error: "Submission too large" });
        let body: unknown;
        try { body = JSON.parse(raw); } catch { return reply(400, { error: "Invalid JSON" }); }
        if ((body as { website?: string })?.website) return reply(201, { received: true }); // honeypot
        const lead = normalizeLead(body);
        if (!lead) return reply(400, { error: "A name is required" });
        const status = await saveLead(credential, requestId.data, lead);
        return status === 201 ? reply(201, { received: true }) : reply(status, { error: MESSAGES[status] });
}
