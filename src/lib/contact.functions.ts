import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({
  name: z.string().trim().min(1, "name is required").max(180, "name is too long"),
  email: z.string().trim().max(320).email("email is invalid").or(z.literal("")).default(""),
  phone: z.string().trim().max(40).default(""),
  company: z.string().trim().max(180).default(""),
  message: z.string().trim().min(1, "message is required").max(5000, "message is too long"),
});

export const submitContact = createServerFn({ method: "POST" })
  .validator((input: unknown) => schema.parse(input))
  .handler(async ({ data }) => {
    if (!data.email && !data.phone) throw new Error("Please add an email or phone number");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("contact_enquiries").insert(data);
    if (error) throw new Error("Your inquiry could not be saved. Please contact us directly.");
    return { ok: true };
  });
