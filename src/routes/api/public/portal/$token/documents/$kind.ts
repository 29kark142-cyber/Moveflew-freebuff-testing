import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/portal/$token/documents/$kind")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const kind =
            params.kind === "invoice" ? "invoice" : params.kind === "estimate" ? "estimate" : null;
          if (!kind) return Response.json({ error: "Document not found" }, { status: 404 });
          const { readPortal } = await import("@/server/portal-api");
          const { generatePortalPdf } = await import("@/server/portal-pdf.server");
          const portal = await readPortal(params.token);
          const bytes = await generatePortalPdf({
            kind,
            token: params.token,
            company: portal.company,
            customer: portal.customer,
            jobs: portal.jobs,
            invoices: portal.invoices,
          });
          return new Response(bytes as unknown as BodyInit, {
            headers: {
              "content-type": "application/pdf",
              "content-disposition": `attachment; filename="MoveFlew-${kind}.pdf"`,
              "cache-control": "private, no-store",
              "referrer-policy": "no-referrer",
            },
          });
        } catch (error) {
          const { PortalError } = await import("@/server/portal-api");
          if (error instanceof PortalError)
            return Response.json({ error: error.message }, { status: error.status });
          console.error("Portal document failed", error);
          return Response.json({ error: "Could not prepare this document" }, { status: 503 });
        }
      },
    },
  },
});
