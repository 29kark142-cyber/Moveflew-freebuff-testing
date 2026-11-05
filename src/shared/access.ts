import type { WorkspaceRole } from "./crm";
export type ContactProof = {
  email: string | null;
  phone: string | null;
  emails?: string[];
};
export type EnrollmentResult = {
  workspaceId: number;
  role: WorkspaceRole;
  workerId: number | null;
};
export type AuthCapabilities = {
  password: boolean;
  email: boolean;
  google: boolean;
  phone: boolean;
  reasons: { email: string; google: string; phone: string };
};
export type AccessResult = {
  user: { id: number; name: string | null; email: string | null };
  enrollment: EnrollmentResult | null;
  emailVerificationRequired?: boolean;
  message?: string;
};
export type WorkerInvitation = {
  id: number;
  kind: "link" | "email";
  email: string | null;
  role: WorkspaceRole;
  hourlyRateCents: number;
  workerId: number | null;
  status: string;
  expiresAt: string;
  createdAt: string;
  acceptedAt: string | null;
  acceptedByUserId: number | null;
  sendStatus: string;
  lastSentAt: string | null;
  sendError: string | null;
};
export type InvitationPreview = {
  workspaceName: string;
  role: WorkspaceRole;
  kind: "link" | "email";
  requiresVerifiedEmail: boolean;
  expiresAt: string;
};
export type InvitationCreation = {
  invitation: WorkerInvitation;
  inviteUrl: string;
  emailSubmitted: boolean;
};
// Auth mounted /api/auth: GET capabilities; POST register {name,email,password,inviteToken?}; POST login {email,password,inviteToken?}; POST magic-link {email,inviteToken?}; POST verify-email {token}; POST request-email-verification {email?}; POST phone/start {phone,inviteToken?}; POST phone/verify {phone,code,name?,inviteToken?}; GET google/start?inviteToken=; GET google/callback; POST logout. Responses login/register/verify: AccessResult. Magic-link/phone/start: {message}. OAuth callback fixed /auth/complete.
// Invites staff /api/crm/invitations: GET -> WorkerInvitation[]; POST {kind,email?,role?,hourlyRateCents,workerId?,publicOrigin?} -> InvitationCreation; POST /:id/resend {publicOrigin?} -> InvitationCreation; POST /:id/revoke -> {revoked:true}.
// Public /api/invitations: GET /preview?token= -> InvitationPreview; POST /intent {token} -> {ok:true}; POST /accept {token?} -> EnrollmentResult. Session required for acceptance; email ownership required for email-bound invites.
// server/access/session exports readLocalSession(req): Promise<User|null|undefined> (undefined=no cookie, null=invalid), establishLocalSession(req,res,userId), revokeLocalSession(req,res). COOKIE='__Host-nw_session'.
// server/access/identity exports verifiedContacts(userId, db?): Promise<ContactProof>. Only proven contacts, never users.email alone.
// server/invitations/enrollment exports enrollAfterAuthentication(userId, proofs:ContactProof, token?:string|null): Promise<EnrollmentResult|null>; server/invitations/intent exports readInviteIntent(req):string|null; clearInviteIntent(res).
