import { describe, expect, it } from "vitest";
import {
  appendNotificationEntry,
  isJobNotificationKind,
  JOB_NOTIFICATION_KINDS,
  jobNotificationState,
  notificationDueAt,
  notificationStatuses,
  renderNotificationText,
  type JobNotificationContext,
} from "./notifications";

const context: JobNotificationContext = {
  companyName: "Northwest Moving Crew",
  customerName: "Alex Morgan",
  moveDate: "2026-11-05",
  reference: "MF-0042",
  trackingUrl: "https://example.test/move/trk_abc",
  reviewUrl: "https://g.page/r/xyz/review",
};

describe("job notification triggers", () => {
  it("renders the catalogued tokens and blanks unknown ones", () => {
    expect(renderNotificationText("Hi {customerName} from {companyName} · {nope}", context)).toBe(
      "Hi Alex Morgan from Northwest Moving Crew · ",
    );
    expect(renderNotificationText("{trackingUrl}", context)).toBe(context.trackingUrl);
    expect(renderNotificationText("{ reviewUrl }", context)).toBe(context.reviewUrl);
  });

  it("schedules the three lifecycle messages from the job's own schedule", () => {
    const job = { moveDate: "2026-11-05", timeline: { complete: "2026-11-05T19:00:00.000Z" } };
    const threeDays = notificationDueAt("pre_move_3d", job);
    const morning = notificationDueAt("move_day_morning", job);
    const post = notificationDueAt("post_move_2h", job);
    expect(Date.parse(threeDays!)).toBeLessThan(Date.parse(morning!));
    expect(new Date(threeDays!).getDate()).toBe(2);
    expect(new Date(morning!).getDate()).toBe(5);
    expect(post).toBe("2026-11-05T21:00:00.000Z");
  });

  it("has no due time when the job has no schedule or completion yet", () => {
    expect(notificationDueAt("pre_move_3d", {})).toBeNull();
    expect(notificationDueAt("post_move_2h", { timeline: {} })).toBeNull();
  });

  it("reports due, sent and last-attempt state per trigger", () => {
    const job = {
      moveDate: "2026-11-05",
      timeline: { complete: "2026-11-05T19:00:00.000Z" },
      notifications: {
        sentAt: { pre_move_3d: "2026-11-02T09:00:00.000Z" },
        entries: [
          {
            kind: "pre_move_3d",
            channel: "sms",
            status: "accepted",
            at: "2026-11-02T09:00:00.000Z",
            by: "user",
            detail: "Twilio accepted the message",
          },
        ],
      },
    };
    const statuses = notificationStatuses(job, Date.parse("2026-11-05T22:30:00.000Z"));
    expect(statuses.map((s) => s.kind)).toEqual([...JOB_NOTIFICATION_KINDS]);
    expect(statuses[0]?.sentAt).toBe("2026-11-02T09:00:00.000Z");
    expect(statuses[0]?.last?.status).toBe("accepted");
    expect(statuses[1]?.due).toBe(true);
    expect(statuses[2]?.due).toBe(true);
  });

  it("only records a sent time for accepted deliveries and keeps the log bounded", () => {
    const accepted = appendNotificationEntry(
      {},
      {
        kind: "move_day_morning",
        channel: "sms",
        status: "accepted",
        at: "2026-11-05T07:00:00.000Z",
        by: "user",
        detail: "Twilio accepted the message",
      },
    );
    expect(accepted.sentAt["move_day_morning"]).toBe("2026-11-05T07:00:00.000Z");

    const blocked = appendNotificationEntry(
      {},
      {
        kind: "move_day_morning",
        channel: "in_app",
        status: "blocked_not_configured",
        at: "2026-11-05T07:00:00.000Z",
        by: "user",
        detail: "No SMS or email provider is configured",
      },
    );
    expect(blocked.sentAt["move_day_morning"]).toBeUndefined();

    let job: Record<string, unknown> = {};
    for (let i = 0; i < 20; i += 1) {
      job = {
        notifications: appendNotificationEntry(job, {
          kind: "post_move_2h",
          channel: "in_app",
          status: "failed",
          at: new Date(Date.UTC(2026, 10, 5, 0, i)).toISOString(),
          by: "user",
          detail: `attempt ${i}`,
        }),
      };
    }
    expect(jobNotificationState(job).entries).toHaveLength(12);
    expect(jobNotificationState({}).entries).toEqual([]);
    expect(isJobNotificationKind("post_move_2h")).toBe(true);
    expect(isJobNotificationKind("nope")).toBe(false);
  });
});
