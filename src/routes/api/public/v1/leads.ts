import { createFileRoute } from "@tanstack/react-router";
import { handleIntegrationLead, leadCors } from "@/lib/lead-intake.server";

export const Route = createFileRoute("/api/public/v1/leads")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: leadCors }),
      POST: async ({ request }) => handleIntegrationLead(request),
    },
  },
});
