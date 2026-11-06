import { createFileRoute } from "@tanstack/react-router";
import { handleCrm } from "@/server/crm-api";

// `/api/field/...` is the field-app alias for `/api/crm/field/...`: same auth, role checks and
// handlers, so the crew phone can use the shorter documented path.
const handler = ({ request, params }: { request: Request; params: { _splat?: string } }) =>
  handleCrm(request, `field/${params._splat ?? ""}`);

export const Route = createFileRoute("/api/field/$")({
  server: {
    handlers: { GET: handler, POST: handler, PATCH: handler, PUT: handler, DELETE: handler },
  },
});
