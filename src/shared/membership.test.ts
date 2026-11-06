import { describe, expect, it } from "vitest";
import {
  isWorkspaceRole,
  memberRoleChangeViolation,
  type MemberRoleChange,
} from "./membership";

const base: MemberRoleChange = {
  actorRole: "admin",
  actorUserId: "admin-1",
  targetUserId: "member-2",
  currentRole: "office_admin",
  nextRole: "crew",
  activeAdminCount: 2,
};

describe("isWorkspaceRole", () => {
  it("accepts known workspace roles", () => {
    expect(isWorkspaceRole("admin")).toBe(true);
    expect(isWorkspaceRole("office_admin")).toBe(true);
  });

  it("rejects unknown roles", () => {
    expect(isWorkspaceRole("owner")).toBe(false);
    expect(isWorkspaceRole(null)).toBe(false);
  });
});

describe("memberRoleChangeViolation", () => {
  it("allows an Admin to change another member's role", () => {
    expect(memberRoleChangeViolation(base)).toBeNull();
  });

  it("rejects non-admin callers", () => {
    expect(memberRoleChangeViolation({ ...base, actorRole: "office_admin" })).toEqual({
      status: 403,
      message: "Only an Admin can change member roles.",
    });
  });

  it("rejects self-demotion even when another Admin remains", () => {
    expect(
      memberRoleChangeViolation({
        ...base,
        targetUserId: "admin-1",
        currentRole: "admin",
        activeAdminCount: 2,
      }),
    ).toEqual({
      status: 403,
      message: "You cannot demote your own admin account.",
    });
  });

  it("allows an Admin to keep their own admin role", () => {
    expect(
      memberRoleChangeViolation({
        ...base,
        targetUserId: "admin-1",
        currentRole: "admin",
        nextRole: "admin",
        activeAdminCount: 1,
      }),
    ).toBeNull();
  });

  it("rejects demoting the last active Admin", () => {
    expect(
      memberRoleChangeViolation({
        ...base,
        currentRole: "admin",
        activeAdminCount: 1,
      }),
    ).toEqual({
      status: 409,
      message: "Workspace must maintain at least one active Admin.",
    });
  });

  it("allows demoting an Admin when another Admin remains", () => {
    expect(
      memberRoleChangeViolation({
        ...base,
        currentRole: "admin",
        activeAdminCount: 2,
      }),
    ).toBeNull();
  });
});
