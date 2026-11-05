import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { routeSummaryLabel } from "@shared/route-pricing";

const schema = z.object({
  name: z.string().trim().min(1, "name is required").max(180, "name is too long"),
  email: z.string().trim().max(320).email("email is invalid").or(z.literal("")).default(""),
  phone: z.string().trim().max(40).default(""),
  company: z.string().trim().max(180).default(""),
  message: z.string().trim().min(1, "message is required").max(5000, "message is too long"),
  // Optional move route captured by the quote form's address fields.
  pickupAddress: z.string().trim().max(300).default(""),
  dropoffAddress: z.string().trim().max(300).default(""),
  storageAddress: z.string().trim().max(300).default(""),
  distanceMiles: z.coerce.number().min(0).max(100_000).optional().default(0),
  travelMinutes: z.coerce.number().min(0).max(100_000).optional().default(0),
});

export const submitContact = createServerFn({ method: "POST" })
  .validator((input: unknown) => schema.parse(input))
  .handler(async ({ data }) => {
    if (!data.email && !data.phone) throw new Error("Please add an email or phone number");
    const {
      pickupAddress,
      dropoffAddress,
      storageAddress,
      distanceMiles,
      travelMinutes,
      ...enquiry
    } = data;
    // The enquiry table keeps one message column, so the route details ride along
    // with the note instead of requiring a schema change.
    const routeDetails = [
      pickupAddress && `Pickup: ${pickupAddress}`,
      storageAddress && `Storage: ${storageAddress}`,
      dropoffAddress && `Drop-off: ${dropoffAddress}`,
      distanceMiles > 0 && `Driving route: ${routeSummaryLabel(distanceMiles, travelMinutes)}`,
    ].filter((line): line is string => Boolean(line));
    const message = (
      routeDetails.length ? `${enquiry.message}\n\n${routeDetails.join("\n")}` : enquiry.message
    ).slice(0, 5000);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("contact_enquiries").insert({ ...enquiry, message });
    if (error) throw new Error("Your inquiry could not be saved. Please contact us directly.");
    return { ok: true };
  });
