import { describe, expect, it } from "vitest";
import {
  PRE_MOVE_REMINDERS,
  reminderActivity,
  reminderArrivalWindow,
  reminderDueAt,
  reminderJobActive,
  reminderPickupAt,
  reminderPlan,
  reminderRecipientLabel,
  reminderScheduleLabel,
  reminderState,
  renderReminder,
  type PreMoveReminderRecord,
  type ReminderContext,
} from "./reminders";

const job = (over: Record<string, unknown> = {}) => ({
  id: 7,
  moveDate: "2026-05-03",
  startHour: 8,
  duration: 3,
  status: "booked",
  customerName: "Jane",
  customerPhone: "+15550102030",
  customerEmail: "jane@example.com",
  origin: "1 Main St",
  destination: "9 Oak Ave",
  crewIds: [3],
  truckId: 2,
  ...over,
});

const context: ReminderContext = {
  customerName: "Jane",
  companyName: "MoveFlew",
  companyPhone: "(555) 010-1000",
  reference: "#M-0007",
  date: "Friday, May 3",
  window: "8:00 AM – 9:00 AM",
  crewLead: "Dana Ruiz · (555) 010-2030",
  origin: "1 Main St",
  destination: "9 Oak Ave",
  truck: "Truck 2 · ABC-123",
  prepUrl: "https://app.example.com/move/trk_abc",
  trackingUrl: "https://app.example.com/move/trk_demo",
};

const record = (over: Partial<PreMoveReminderRecord> = {}): PreMoveReminderRecord => ({
  kind: "pre_move_24h",
  at: "2026-05-02T08:00:00.000Z",
  by: "dispatch@example.com",
  sentAt: "2026-05-02T08:00:00.000Z",
  window: "8:00 AM – 9:00 AM",
  attempts: [
    {
      channel: "sms",
      target: "+15550102030",
      status: "accepted",
      detail: "Twilio accepted the message",
    },
  ],
  ...over,
});

describe("pre-move reminder timing", () => {
  it("derives pickup and both dispatch times from the plain date and start hour", () => {
    expect(reminderPickupAt(job())?.toISOString()).toBe("2026-05-03T08:00:00.000Z");
    expect(reminderDueAt(job(), "pre_move_24h")).toBe("2026-05-02T08:00:00.000Z");
    expect(reminderDueAt(job(), "pre_move_2h")).toBe("2026-05-03T06:00:00.000Z");
  });

  it("returns null for a job without a usable move date", () => {
    expect(reminderPickupAt(job({ moveDate: "soon" }))).toBeNull();
    expect(reminderDueAt(job({ moveDate: "" }), "pre_move_2h")).toBeNull();
  });

  it("only treats booked and deposit-paid moves as active", () => {
    expect(reminderJobActive("booked")).toBe(true);
    expect(reminderJobActive("deposit_paid")).toBe(true);
    expect(reminderJobActive("estimate")).toBe(false);
    expect(reminderJobActive(undefined)).toBe(false);
  });

  it("moves each reminder from scheduled to due to past, and sent once answered", () => {
    const statuses = (now: string, data = job()) =>
      Object.fromEntries(reminderPlan(data, Date.parse(now)).map((e) => [e.kind, e.status]));

    expect(statuses("2026-05-01T08:00:00.000Z")).toEqual({
      pre_move_24h: "scheduled",
      pre_move_2h: "scheduled",
    });
    expect(statuses("2026-05-02T09:00:00.000Z")).toEqual({
      pre_move_24h: "due",
      pre_move_2h: "scheduled",
    });
    expect(statuses("2026-05-03T06:30:00.000Z")).toEqual({
      pre_move_24h: "due",
      pre_move_2h: "due",
    });
    expect(statuses("2026-05-03T08:00:00.000Z")).toEqual({
      pre_move_24h: "past",
      pre_move_2h: "past",
    });
    expect(
      statuses("2026-05-03T06:30:00.000Z", job({ preMoveReminders: { pre_move_24h: record() } })),
    ).toEqual({ pre_move_24h: "sent", pre_move_2h: "due" });
  });

  it("labels the arrival window and the scheduled dispatch day", () => {
    expect(reminderArrivalWindow(8)).toBe("8:00 AM – 9:00 AM");
    expect(reminderArrivalWindow(8.5)).toBe("8:30 AM – 9:30 AM");
    expect(
      reminderScheduleLabel("2026-05-02T08:00:00.000Z", Date.parse("2026-05-01T20:00:00Z")),
    ).toBe("Tomorrow at 8:00 AM");
    expect(
      reminderScheduleLabel("2026-05-02T08:00:00.000Z", Date.parse("2026-05-02T06:00:00Z")),
    ).toBe("Today at 8:00 AM");
    expect(reminderScheduleLabel(null)).toBe("");
  });
});

describe("pre-move reminder copy", () => {
  it("puts the arrival window, crew lead, parking and checklist link in the 24h message", () => {
    const text = renderReminder(PRE_MOVE_REMINDERS.pre_move_24h.sms, context);
    expect(text).toContain("8:00 AM – 9:00 AM");
    expect(text).toContain("Dana Ruiz · (555) 010-2030");
    expect(text).toContain("parking");
    expect(text).toContain("elevator");
    expect(text).toContain("Move-day prep checklist: https://app.example.com/move/trk_abc");
  });

  it("puts the ETA, truck and live tracking link in the 2h message", () => {
    const text = renderReminder(PRE_MOVE_REMINDERS.pre_move_2h.sms, context);
    expect(text).toContain("about 2 hours");
    expect(text).toContain("Truck 2 · ABC-123");
    expect(text).toContain("https://app.example.com/move/trk_demo");
  });

  it("renders the same numbers into the email previews", () => {
    const body = renderReminder(PRE_MOVE_REMINDERS.pre_move_2h.emailBody, context);
    expect(body).toContain("Arrival window (driver ETA): 8:00 AM – 9:00 AM");
    expect(body).toContain("Assigned truck: Truck 2 · ABC-123");
    expect(PRE_MOVE_REMINDERS.pre_move_24h.emailSubject).toContain("{window}");
  });

  it("drops unknown placeholders instead of leaving braces in the message", () => {
    expect(renderReminder("Hi {customerName}{missing}", context)).toBe("Hi Jane");
  });
});

describe("pre-move reminder state and activity", () => {
  it("keeps saved records and ignores malformed ones", () => {
    const state = reminderState({
      pre_move_24h: record(),
      pre_move_2h: { kind: "pre_move_2h" },
      junk: record(),
    });
    expect(Object.keys(state)).toEqual(["pre_move_24h"]);
    expect(state.pre_move_24h?.attempts).toHaveLength(1);
    expect(state.pre_move_24h?.sentAt).toBe("2026-05-02T08:00:00.000Z");
  });

  it("titles an accepted dispatch Sent and a log-only attempt Logged", () => {
    const sent = reminderActivity(record());
    expect(sent.title).toBe("24h Pre-Move Reminder Sent");
    expect(sent.kind).toBe("pre_move_24h_reminder");
    expect(sent.id).toBe("reminder:pre_move_24h:2026-05-02T08:00:00.000Z");
    expect(sent.detail).toContain("8:00 AM – 9:00 AM");
    expect(sent.detail).toContain("+15550102030");
    expect(sent.detail).toContain("sms accepted");

    const logged = reminderActivity(
      record({
        sentAt: null,
        attempts: [
          {
            channel: "email",
            target: "jane@example.com",
            status: "logged",
            detail: "No email sender is configured",
          },
        ],
      }),
    );
    expect(logged.title).toBe("24h Pre-Move Reminder Logged");
    expect(logged.detail).toContain("email logged");
  });

  it("uses distinct activity ids for a resent reminder", () => {
    const first = reminderActivity(record());
    const second = reminderActivity(record({ at: "2026-05-02T09:15:00.000Z" }));
    expect(first.id).not.toBe(second.id);
  });

  it("names the customer contact the reminder will reach", () => {
    expect(reminderRecipientLabel(job())).toBe("+15550102030 · jane@example.com");
    expect(reminderRecipientLabel(job({ customerPhone: "" }))).toBe("jane@example.com");
    expect(reminderRecipientLabel(job({ customerPhone: "", customerEmail: "" }))).toBe("");
  });
});
