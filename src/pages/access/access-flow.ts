import type { AccessResult, EnrollmentResult } from "@shared/access";
import { setWorkspaceId } from "@/lib/crm";
import { invitationsApi } from "@/lib/access-api";
import { clearBrowserInvite, readInviteIntent } from "@/lib/invite-intent";

export function workspaceDestination(enrollment: EnrollmentResult) {
  return enrollment.role === "crew" ? "/app/field" : "/app/dashboard";
}

export function selectEnrollment(enrollment: EnrollmentResult) {
  // crm.ts owns the actual persisted workspace key (nwcrewcrm.workspace-id).
  setWorkspaceId(enrollment.workspaceId);
  clearBrowserInvite();
}

/**
 * A local/verified auth response may already carry enrollment. Otherwise, only a
 * saved invite intent triggers the explicit public acceptance call.
 */
export async function finishAccess(
  result: AccessResult,
  inviteToken = readInviteIntent()
): Promise<EnrollmentResult | null> {
  const enrollment =
    result.enrollment ??
    (inviteToken ? await invitationsApi.accept(inviteToken) : null);
  if (enrollment) selectEnrollment(enrollment);
  return enrollment;
}

export function navigateAfterAccess(enrollment: EnrollmentResult | null) {
  window.location.assign(
    enrollment ? workspaceDestination(enrollment) : "/app/dashboard"
  );
}
