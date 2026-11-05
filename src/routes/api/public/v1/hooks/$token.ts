import { createFileRoute } from "@tanstack/react-router";
import { normalizeLead, saveLead } from "@/lib/lead-intake.server";

// The unguessable token in the URL is the credential (Typeform, Jotform, etc.).
export const Route = createFileRoute("/api/public/v1/hooks/$token")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const token = params.token;
        if (!/^wh_[a-f0-9]{40}$/.test(token)) return new Response("Not found", { status: 404 });
        const raw = await request.text();
        if (raw.length > 64000) return new Response("Too large", { status: 413 });
        const type = request.headers.get("Content-Type") || "";
        let body: unknown;
        try {
          if (type.includes("application/json")) body = JSON.parse(raw);
          else if (type.includes("multipart/form-data")) {
            const form = await new Response(raw, { headers: { "Content-Type": type } }).formData();
            body = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string"));
          } else body = Object.fromEntries(new URLSearchParams(raw));
        } catch { return new Response("Invalid body", { status: 400 }); }
        const lead = normalizeLead(body);
        // Acknowledge test pings without a name so form builders don't disable the hook.
        if (!lead) return Response.json({ received: true, ignored: "no name found" });
        const b = body as Record<string, any>;
        const id = String(b?.event_id ?? b?.form_response?.token ?? b?.submissionID ?? b?.submission_id ?? (await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw)).then(d => Array.from(new Uint8Array(d), v => v.toString(16).padStart(2, "0")).join("")))).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 100);
        const status = await saveLead(token, id.length >= 8 ? id : `${id}________`.slice(0, 8), lead);
        if (status === 201) return Response.json({ received: true });
        return new Response(status === 401 ? "Unknown or revoked webhook" : "Could not save", { status: status === 401 ? 404 : status });
      },
    },
  },
});
