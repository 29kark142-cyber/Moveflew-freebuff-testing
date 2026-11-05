import { describe, expect, it } from "vitest";
import {
  CREW_SHIFT_LIMIT,
  DECLINE_REASONS,
  SHIFT_CONFIRMED_TITLE,
  SHIFT_DECLINED_TITLE,
  SHIFT_TOKEN_RE,
  crewShifts,
  declineReasonLabel,
  declinedCrewNames,
  jobCrewShifts,
  isDeclineReason,
  newCrewShift,
  newShiftToken,
  shiftCounts,
  shiftForToken,
  shiftJobId,
  shiftLink,
  shiftResponseActivity,
  shiftRoleLabel,
  shiftStatusLabel,
  withShiftResponse,
  type CrewShift,
} from "./shift";

const shift = (patch: Partial<CrewShift> = {}): CrewShift => ({
  token: "shf_2j_0123456789abcdef0123456789abcdef",
  crewId: 7,
  name: "Ana",
  role: "Driver",
  status: "pending",
  sentAt: "2026-11-05T08:00:00.000Z",
  ...patch,
});

describe("shift tokens", () => {
  it("mints a token that names only its job", () => {
    const token = newShiftToken(42);
    expect(token).toMatch(SHIFT_TOKEN_RE);
    expect(token.startsWith("shf_")).toBe(true);
    expect(shiftJobId(token)).toBe(42);
    expect(newShiftToken(42)).not.toBe(token);
    expect(shiftJobId("shf_2j_nothex")).toBeNull();
    expect(shiftJobId("qte_0123456789abcdef0123456789abcdef")).toBeNull();
    expect(shiftJobId("")).toBeNull();
  });

  it("builds a public link without a double slash", () => {
    expect(shiftLink("https://app.example.com/", "shf_1_abc")).toBe(
      "https://app.example.com/shift/shf_1_abc",
    );
    expect(shiftLink("", "shf_1_abc")).toBe("/shift/shf_1_abc");
  });
});

describe("saved crew shifts", () => {
  it("keeps well-formed answers and drops everything else", () => {
    const saved = crewShifts([
      shift({ token: newShiftToken(1) }),
      { token: "shf_bad", crewId: 1, status: "pending", sentAt: "now" },
      { token: newShiftToken(1), crewId: "7", status: "pending", sentAt: "now" },
      { token: newShiftToken(1), crewId: 7, status: "maybe", sentAt: "now" },
      null,
    ]);
    expect(saved).toHaveLength(1);
    expect(saved[0]?.status).toBe("pending");
    expect(crewShifts("nope")).toEqual([]);
  });

  it("caps the list so a job record cannot grow forever", () => {
    const many = Array.from({ length: CREW_SHIFT_LIMIT + 5 }, (_, index) =>
      shift({ crewId: index + 1, token: newShiftToken(index + 1) }),
    );
    expect(crewShifts(many)).toHaveLength(CREW_SHIFT_LIMIT);
  });

  it("finds one crew answer by token", () => {
    const first = shift({ crewId: 7, token: newShiftToken(3) });
    const second = shift({ crewId: 8, name: "Luis", token: newShiftToken(3) });
    expect(shiftForToken([first, second], second.token)?.crewId).toBe(8);
    expect(shiftForToken([first], "shf_9_0123456789abcdef0123456789abcdef")).toBeNull();
  });

  it("ignores answers from crew who are no longer assigned", () => {
    const list = [
      shift({ crewId: 7 }),
      shift({ crewId: 8, name: "Luis", token: newShiftToken(2) }),
    ];
    expect(jobCrewShifts(list, [7])).toHaveLength(1);
    expect(jobCrewShifts(list, [])).toEqual([]);
    expect(jobCrewShifts(list, [7, 8])).toHaveLength(2);
  });

  it("counts statuses and names the crew who declined", () => {
    const list = [
      shift({ status: "confirmed" }),
      shift({ status: "declined", name: "Luis", reason: "illness" }),
      shift({ status: "pending", name: "", crewId: 9 }),
    ];
    expect(shiftCounts(list)).toEqual({ pending: 1, confirmed: 1, declined: 1 });
    expect(declinedCrewNames(list)).toEqual(["Luis"]);
    expect(shiftCounts([])).toEqual({ pending: 0, confirmed: 0, declined: 0 });
  });
});

describe("decline reasons", () => {
  it("offers the four documented reasons", () => {
    expect(DECLINE_REASONS.map((reason) => reason.label)).toEqual([
      "Scheduling Conflict",
      "Illness",
      "Transportation Issue",
      "Other",
    ]);
    expect(isDeclineReason("illness")).toBe(true);
    expect(isDeclineReason("vacation")).toBe(false);
    expect(declineReasonLabel("transportation_issue")).toBe("Transportation Issue");
    expect(declineReasonLabel("vacation")).toBe("");
  });

  it("labels crew roles", () => {
    expect(shiftRoleLabel("crew_lead")).toBe("Crew lead");
    expect(shiftRoleLabel("", true)).toBe("Driver");
    expect(shiftRoleLabel(undefined)).toBe("Mover");
    expect(shiftStatusLabel("declined")).toBe("Declined");
  });
});

describe("shift answers", () => {
  it("records a confirmation without touching other crew", () => {
    const token = newShiftToken(5);
    const other = shift({ crewId: 8, token: newShiftToken(5) });
    const next = withShiftResponse([shift({ token }), other], token, {
      status: "confirmed",
      at: "2026-11-05T09:00:00.000Z",
    });
    expect(next[0]?.status).toBe("confirmed");
    expect(next[0]?.respondedAt).toBe("2026-11-05T09:00:00.000Z");
    expect(next[1]).toEqual(other);
  });

  it("keeps the decline reason and note", () => {
    const token = newShiftToken(5);
    const next = withShiftResponse([shift({ token })], token, {
      status: "declined",
      at: "2026-11-05T09:00:00.000Z",
      reason: "illness",
      note: "Doctor's appointment",
    });
    expect(next[0]?.reason).toBe("illness");
    expect(next[0]?.note).toBe("Doctor's appointment");
  });

  it("writes a distinct activity event per answer", () => {
    const base = {
      token: "shf_1_0123456789abcdef0123456789abcdef",
      name: "Ana",
      moveDate: "2026-11-05",
      startHour: 8,
      at: "2026-11-05T09:00:00.000Z",
      by: "Ana",
    };
    const confirmed = shiftResponseActivity({ ...base, status: "confirmed" });
    expect(confirmed.title).toBe(SHIFT_CONFIRMED_TITLE);
    expect(confirmed.kind).toBe("crew_shift_confirmed");
    expect(confirmed.detail).toContain("Ana");
    expect(confirmed.detail).toContain("8:00 AM");
    expect(confirmed.id).toBe(`shift:${base.token}`);

    const declined = shiftResponseActivity({ ...base, status: "declined", reason: "illness" });
    expect(declined.title).toBe(SHIFT_DECLINED_TITLE);
    expect(declined.kind).toBe("crew_shift_declined");
    expect(declined.detail).toContain("Illness");
  });

  it("mints pending assignments with unique tokens", () => {
    const at = "2026-11-05T08:00:00.000Z";
    const first = newCrewShift({ jobId: 11, crewId: 3, name: "Ana", role: "Driver", at });
    const second = newCrewShift({ jobId: 11, crewId: 4, name: "Luis", role: "Helper", at });
    expect(first.status).toBe("pending");
    expect(first.sentAt).toBe(at);
    expect(first.token).not.toBe(second.token);
    expect(shiftJobId(first.token)).toBe(11);
  });
});
