import { z } from "zod";

export const crewRegistrationSchema = z.object({
  name: z.string().trim().min(2, "Please enter your full name."),
  phone: z.string().trim(),
  email: z.email("Please enter a valid email address.").max(254).transform((email) => email.trim().toLowerCase()),
  role: z.enum(["helper", "driver", "crew_lead"]),
});

export type CrewRegistration = z.infer<typeof crewRegistrationSchema>;
type RegistrationResult = { data: number | null; error: { message: string } | null };

export async function completeCrewRegistration(
  token: string,
  fields: CrewRegistration,
  register: (args: { _token: string; _name: string; _phone: string; _email: string; _crew_role: string }) => PromiseLike<RegistrationResult>,
  selectWorkspace: (id: number) => void,
  redirect: (path: string) => void,
) {
  const values = crewRegistrationSchema.parse(fields);
  const { data, error } = await register({
    _token: token, _name: values.name, _phone: values.phone, _email: values.email, _crew_role: values.role,
  });
  if (error) throw new Error(error.message);
  if (typeof data !== "number" || !Number.isSafeInteger(data) || data <= 0) {
    throw new Error("We couldn’t confirm your workspace. Please try again.");
  }
  selectWorkspace(data);
  redirect("/app/field");
}