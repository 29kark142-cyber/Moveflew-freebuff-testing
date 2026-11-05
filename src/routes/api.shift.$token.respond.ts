import { createFileRoute } from "@tanstack/react-router";

// Public crew shift answer. The opaque token in the path is the credential; the crew member
// and the job are always resolved server-side from the stored token.
export const Route = createFileRoute("/api/shift/$token/respond")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const headers = { "cache-control": "no-store", "referrer-policy": "no-referrer" };
        try {
          const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
          const forwarded = request.headers.get("x-forwarded-for") ?? "";
          const ip =
            request.headers.get("cf-connecting-ip") ||
            request.headers.get("x-real-ip") ||
            forwarded.split(",")[0]?.trim() ||
            "";
          const { respondToShift, ShiftPortalError } = await import("@/server/shift-response");
          const result = await respondToShift({
            token: params.token,
            response: body["response"] === "accept" ? "accept" : "decline",
            reason: typeof body["reason"] === "string" ? body["reason"] : undefined,
            note: typeof body["note"] === "string" ? body["note"] : undefined,
            ip,
            userAgent: request.headers.get("user-agent") ?? "",
          });
          return Response.json(result, { headers });
        } catch (error) {
          const { ShiftPortalError } = await import("@/server/shift-response");
          if (error instanceof ShiftPortalError)
            return Response.json({ error: error.message }, { status: error.status, headers });
          console.error("Shift response failed", error);
          return Response.json(
            { error: "Could not save your answer. Please try again." },
            { status: 500, headers },
          );
        }
      },
    },
  },
});
