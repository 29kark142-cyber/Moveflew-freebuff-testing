import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CrewInvitations from "./CrewInvitations";

const api = vi.hoisted(() => ({ list: vi.fn(), revoke: vi.fn(), resend: vi.fn() }));
const notifications = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/access-api", () => ({ invitationsApi: api }));
vi.mock("@/lib/crm", () => ({ crmFetch: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ tx: (en: string) => en, locale: "en" }) }));
vi.mock("sonner", () => ({ toast: notifications }));
vi.mock("./WorkspaceUI", () => ({ LoadingBlock: () => <span>Loading</span>, formatDate: (value: string) => value }));
const invite = (id: number, status = "pending") => ({ id, status, kind: "link", role: "crew", token: `token-${id}`, expiresAt: "2026-11-10", sendStatus: "link" });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Invitation activity", () => {
  it("only allows revocation of pending invitations", async () => {
    api.list.mockResolvedValue([invite(1), invite(2, "accepted"), invite(3, "revoked")]);
    render(<CrewInvitations role="admin" />);
    expect(await screen.findAllByRole("button", { name: "Revoke invitation" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Resend (extends 14 days)" })).toHaveLength(1);
  });
  it("removes the revoked row immediately and shows success", async () => {
    api.list.mockResolvedValue([invite(1), invite(2, "accepted")]);
    api.revoke.mockResolvedValue({ revoked: true, status: "revoked" });
    render(<CrewInvitations role="admin" />);
    fireEvent.click(await screen.findByRole("button", { name: "Revoke invitation" }));
    await waitFor(() => expect(api.revoke).toHaveBeenCalledWith(1));
    await waitFor(() => expect(screen.queryByText("pending")).not.toBeInTheDocument());
    expect(screen.getByText("accepted")).toBeInTheDocument();
    expect(notifications.success).toHaveBeenCalled();
  });
  it("keeps activity visible when revocation fails", async () => {
    api.list.mockResolvedValue([invite(1)]);
    api.revoke.mockRejectedValue(new Error("This invitation is no longer pending"));
    render(<CrewInvitations role="admin" />);
    fireEvent.click(await screen.findByRole("button", { name: "Revoke invitation" }));
    await waitFor(() => expect(notifications.error).toHaveBeenCalled());
    expect(screen.getByText("pending")).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
  });
  it("reflects an accepted invitation from a concurrent update without removing the table", async () => {
    api.list.mockResolvedValue([invite(1)]);
    api.revoke.mockResolvedValue({ revoked: false, status: "accepted" });
    render(<CrewInvitations role="admin" />);
    fireEvent.click(await screen.findByRole("button", { name: "Revoke invitation" }));
    expect(await screen.findByText("accepted")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Revoke invitation" })).not.toBeInTheDocument();
  });
});