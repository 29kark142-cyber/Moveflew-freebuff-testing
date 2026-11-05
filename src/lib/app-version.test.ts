import { describe, expect, it } from "vitest";
import { isChunkLoadError, runReleaseCleanup, VERSION_KEY } from "./app-version";

function memoryStorage(init: Record<string, string>): Storage {
  const m = new Map(Object.entries(init));
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
  };
}

describe("release cleanup", () => {
  it("clears saved app settings on a new release but keeps sign-in, theme and language", () => {
    const s = memoryStorage({
      [VERSION_KEY]: "old",
      "nwcrewcrm.workspace-id": "42",
      "sb-abc-auth-token": "session",
      theme: "dark",
      "northwest-crew-language": "ru",
    });
    expect(runReleaseCleanup(s, "new")).toBe(true);
    expect(s.getItem("nwcrewcrm.workspace-id")).toBeNull();
    expect(s.getItem("sb-abc-auth-token")).toBe("session");
    expect(s.getItem("theme")).toBe("dark");
    expect(s.getItem("northwest-crew-language")).toBe("ru");
    expect(s.getItem(VERSION_KEY)).toBe("new");
  });

  it("runs only once per release", () => {
    const s = memoryStorage({ [VERSION_KEY]: "new", "nwcrewcrm.workspace-id": "42" });
    expect(runReleaseCleanup(s, "new")).toBe(false);
    expect(s.getItem("nwcrewcrm.workspace-id")).toBe("42");
  });

  it("recognizes outdated-tab file loading failures", () => {
    expect(isChunkLoadError(new TypeError("Failed to fetch dynamically imported module: /assets/x.js"))).toBe(true);
    expect(isChunkLoadError(new Error("Network timeout"))).toBe(false);
  });
});
