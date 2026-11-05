import { createFileRoute } from "@tanstack/react-router";
import { handleCrm } from "@/server/crm-api";

const handler = ({ request, params }: { request: Request; params: { _splat?: string } }) =>
  handleCrm(request, params._splat ?? "");

export const Route = createFileRoute("/api/crm/$")({
  server: { handlers: { GET: handler, POST: handler, PATCH: handler, PUT: handler, DELETE: handler } },
});
