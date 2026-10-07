import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The banner an unverified owner sees: ask for a code, type it, and the account is marked verified.

const stubs = vi.hoisted(() => ({
  profile: { email: "sara@example.com", email_verified_at: null as string | null },
  refreshProfile: vi.fn(async () => undefined),
  sendEmailCode: vi.fn(async (_email: string) => ({ error: null as Error | null })),
  verifyEmailCode: vi.fn(async (_email: string, _token: string) => ({
    error: null as Error | null,
  })),
  confirmOwnerEmail: vi.fn(async () => ({ verified: true })),
  accessToken: null as string | null,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/profile-context", () => ({
  useProfile: () => ({ profile: stubs.profile, refreshProfile: stubs.refreshProfile }),
}));
vi.mock("../src/lib/profile-context", () => ({
  useProfile: () => ({ profile: stubs.profile, refreshProfile: stubs.refreshProfile }),
}));
const signIn = { sendEmailCode: stubs.sendEmailCode, verifyEmailCode: stubs.verifyEmailCode };
vi.mock("@/lib/auth/sign-in", () => signIn);
vi.mock("../src/lib/auth/sign-in", () => signIn);
const session = { getAccessToken: async () => stubs.accessToken };
vi.mock("@/lib/auth/session", () => session);
vi.mock("../src/lib/auth/session", () => session);
const functions = { confirmOwnerEmail: stubs.confirmOwnerEmail };
vi.mock("@/lib/owner-verification.functions", () => functions);
vi.mock("../src/lib/owner-verification.functions", () => functions);

const { OwnerEmailVerificationBanner } =
  await import("../src/components/onboarding/OwnerEmailVerificationBanner");
const { I18nProvider } = await import("../src/lib/i18n");
const { toast } = await import("sonner");

const show = () =>
  render(
    <I18nProvider>
      <OwnerEmailVerificationBanner />
    </I18nProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem("lang", "en");
  stubs.profile = { email: "sara@example.com", email_verified_at: null };
  stubs.accessToken = null;
});

describe("the email verification banner", () => {
  it("is not shown to an account that is verified", () => {
    stubs.profile.email_verified_at = "2026-01-01T00:00:00Z";
    const { container } = show();
    expect(container.textContent).toBe("");
  });

  it("asks for a code, then verifies it and marks the account verified", async () => {
    show();
    expect(screen.getByText(/sara@example.com/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    await waitFor(() => expect(stubs.sendEmailCode).toHaveBeenCalledWith("sara@example.com"));

    const input = await screen.findByLabelText("Verification code");
    expect(screen.getByRole("button", { name: "Verify" })).toBeDisabled();
    fireEvent.change(input, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));

    await waitFor(() => expect(stubs.confirmOwnerEmail).toHaveBeenCalledTimes(1));
    expect(stubs.verifyEmailCode).toHaveBeenCalledWith("sara@example.com", "123456");
    expect(stubs.refreshProfile).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("Your email is verified.");
  });

  it("says so, and marks nothing, when the code is wrong", async () => {
    stubs.verifyEmailCode.mockResolvedValueOnce({ error: new Error("otp_expired") });
    show();
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    fireEvent.change(await screen.findByLabelText("Verification code"), {
      target: { value: "000000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("That code is wrong or has expired."),
    );
    expect(stubs.confirmOwnerEmail).not.toHaveBeenCalled();
  });

  it("confirms by itself when the owner arrives from the emailed link (a fresh emailed session)", async () => {
    const payload = btoa(
      JSON.stringify({ amr: [{ method: "magiclink", timestamp: Math.floor(Date.now() / 1000) }] }),
    );
    stubs.accessToken = `h.${payload}.s`;
    show();
    await waitFor(() => expect(stubs.confirmOwnerEmail).toHaveBeenCalledTimes(1));
    expect(stubs.verifyEmailCode).not.toHaveBeenCalled();
  });
});
