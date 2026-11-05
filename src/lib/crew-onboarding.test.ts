import { describe, expect, it, vi } from "vitest";
import { completeCrewRegistration, crewRegistrationSchema } from "./crew-onboarding";

const fields = { name: "John Smith", phone: "(555) 000-0000", email: "john@example.com", role: "helper" as const };

describe("crew registration", () => {
  it.each(["helper", "driver", "crew_lead"])("accepts the requested %s worker role", (role) => {
    expect(crewRegistrationSchema.parse({ ...fields, role }).role).toBe(role);
  });
  it("rejects workspace permission roles as crew roles", () => {
    expect(crewRegistrationSchema.safeParse({ ...fields, role: "admin" }).success).toBe(false);
  });
  it("saves the worker before selecting the workspace and redirecting to /app/field", async () => {
    const actions: string[] = [];
    const register = vi.fn(async () => { actions.push("save"); return { data: 42, error: null }; });
    const select = vi.fn(() => actions.push("select"));
    const redirect = vi.fn(() => actions.push("redirect"));
    await completeCrewRegistration("invitation-token", fields, register, select, redirect);
    expect(register).toHaveBeenCalledWith({ _token: "invitation-token", _name: "John Smith", _phone: "(555) 000-0000", _email: "john@example.com", _crew_role: "helper" });
    expect(select).toHaveBeenCalledWith(42);
    expect(redirect).toHaveBeenCalledWith("/app/field");
    expect(actions).toEqual(["save", "select", "redirect"]);
  });
  it("stays on registration when saving fails", async () => {
    const redirect = vi.fn();
    const select = vi.fn();
    await expect(completeCrewRegistration("expired", fields, async () => ({ data: null, error: { message: "Expired invite" } }), select, redirect)).rejects.toThrow("Expired invite");
    expect(select).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
});