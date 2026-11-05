import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { SHIFT_TOKEN_RE } from "@shared/shift";
import type { PublicShift } from "@/server/shift-response";

export type { PublicShift };

/**
 * Public, read-only shift view for one `shf_` token. Only the crew member's assignment,
 * addresses, truck and dispatch contacts are returned.
 */
export const readShift = createServerFn({ method: "GET" })
  .inputValidator((v: unknown) => z.object({ token: z.string().regex(SHIFT_TOKEN_RE) }).parse(v))
  .handler(async ({ data }): Promise<PublicShift> => {
    const { shiftPortal } = await import("@/server/shift-response");
    return shiftPortal(data.token);
  });
