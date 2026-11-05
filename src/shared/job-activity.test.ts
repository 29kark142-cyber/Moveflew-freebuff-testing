import { describe, expect, it } from "vitest";
import {
  JOB_ACTIVITY_LIMIT,
  appendJobActivity,
  jobActivity,
  type JobActivityEvent,
} from "./job-activity";

const event = (id: string, at = "2026-05-01T10:00:00.000Z"): JobActivityEvent => ({
  id,
  kind: "phase_completed",
  title: "Phase Completed",
  detail: "Origin Arrival · 3/3 items",
  at,
  by: "Ana",
});

describe("job activity timeline", () => {
  it("prepends new events and keeps them newest first", () => {
    const log = appendJobActivity([event("first"), event("second")], [event("third")]);
    expect(log.map((entry) => entry.id)).toEqual(["third", "first", "second"]);
  });

  it("never duplicates a replayed event", () => {
    const once = appendJobActivity([], [event("phase:origin")]);
    const twice = appendJobActivity(once, [event("phase:origin")]);
    expect(twice).toHaveLength(1);
    expect(twice).toEqual(once);
  });

  it("caps the log so the job record stays small", () => {
    const existing = Array.from({ length: JOB_ACTIVITY_LIMIT }, (_, index) =>
      event(`old-${index}`),
    );
    const log = appendJobActivity(existing, [event("newest")]);
    expect(log).toHaveLength(JOB_ACTIVITY_LIMIT);
    expect(log[0]?.id).toBe("newest");
  });

  it("ignores malformed saved data", () => {
    expect(jobActivity(null)).toEqual([]);
    expect(jobActivity("nope")).toEqual([]);
    expect(
      jobActivity([
        {
          id: "ok",
          kind: "final_signoff",
          title: "Final Sign-off Received",
          at: "2026-05-01T10:00:00.000Z",
        },
        { nope: true },
      ]),
    ).toEqual([
      {
        id: "ok",
        kind: "final_signoff",
        title: "Final Sign-off Received",
        detail: "",
        at: "2026-05-01T10:00:00.000Z",
        by: "",
      },
    ]);
  });
});
