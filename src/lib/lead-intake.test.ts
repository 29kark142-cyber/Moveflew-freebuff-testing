import { expect, it } from "vitest";
import { normalizeLead } from "./lead-intake.server";
it("typeform", () => {
  const l = normalizeLead({ form_response: { token: "abc", definition: { fields: [{ id: "a", title: "Your name" }, { id: "b", title: "Email address" }, { id: "c", title: "Moving from" }] }, answers: [{ field: { id: "a" }, type: "text", text: "Jane" }, { field: { id: "b" }, type: "email", email: "j@x.com" }, { field: { id: "c" }, type: "text", text: "Portland" }] } });
  expect(l).toMatchObject({ name: "Jane", email: "j@x.com", origin: "Portland" });
});
it("jotform", () => {
  const l = normalizeLead({ rawRequest: JSON.stringify({ q3_fullName: { first: "Bob", last: "Lee" }, q4_email: "b@x.com", q5_phoneNumber: "555" }) });
  expect(l).toMatchObject({ name: "Bob Lee", email: "b@x.com", phone: "555" });
});
