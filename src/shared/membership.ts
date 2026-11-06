import type { WorkspaceRole } from "./crm";

export const WORKSPACE_ROLES: readonly WorkspaceRole[] = [
  "admin",
  "office_admin",
  "estimator",
  "dispatcher",
  "crew",
];

export function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return typeof value === "string" && (WORKSPACE_ROLES as readonly string[]).includes(value);
}

export type MemberRoleChange = {
  actorRole: string | null;
  actorUserId: string;
  targetUserId: string;
  currentRole: string;
  nextRole: WorkspaceRole;
  activeAdminCount: number;
};

export type MemberRoleChangeViolation = {
  status: 403 | 409;
  message: string;
};

/**
 * Server-side guard for workspace role changes. Every caller must be an Admin,
 * an Admin cannot demote themselves, and a workspace must retain an Admin.
 */
export function memberRoleChangeViolation(
  change: MemberRoleChange,
): MemberRoleChangeViolation | null {
  if (change.actorRole !== "admin") {
    return { status: 403, message: "Only an Admin can change member roles." };
  }
  if (
    change.actorUserId === change.targetUserId &&
    change.currentRole === "admin" &&
    change.nextRole !== "admin"
  ) {
    return { status: 403, message: "You cannot demote your own admin account." };
  }
  if (
    change.currentRole === "admin" &&
    change.nextRole !== "admin" &&
    change.activeAdminCount <= 1
  ) {
    return {
      status: 409,
      message: "Workspace must maintain at least one active Admin.",
    };
  }
  return null;
}
