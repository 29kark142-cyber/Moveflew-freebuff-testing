import { describe, expect, it } from "vitest";
import { DEMO_CREW, demoJob } from "./demo-job";
import { needsDispatch } from "./dispatch";

describe("demo job", () => {
  it("is booked, fully assigned and on the chosen day", () => {
    const job = demoJob("2026-11-02", 7, [8, 9], 10);
    expect(job.status).toBe("booked");
    expect(job.moveDate).toBe("2026-11-02");
    expect(job.crewIds).toEqual([8, 9]);
    expect(needsDispatch({ ...job, id: 1 })).toBe(false);
  });
  it("ships one driver and one helper", () => {
    expect(DEMO_CREW.map(c => c.crewRole)).toEqual(["driver", "helper"]);
  });
});
