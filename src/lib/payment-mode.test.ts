import { describe, expect, it } from "vitest";
import { isPreviewHost } from "./payment-mode";

describe("test deposits book only on preview addresses", () => {
  it("treats preview addresses as preview", () => {
    expect(isPreviewHost("id-preview--460062b7-cfc0-4922-8d98-02dcb2768252.lovable.app")).toBe(true);
    expect(isPreviewHost("project--460062b7-dev.lovable.app")).toBe(true);
  });
  it("treats the published site as production", () => {
    expect(isPreviewHost("manus-to-makeover.lovable.app")).toBe(false);
    expect(isPreviewHost("app.northwestmovingcrew.com")).toBe(false);
  });
});
