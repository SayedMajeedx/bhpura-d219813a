import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

// Two-factor sign-in for staff on screen: the gate asks a member who has it on for the code before
// the admin opens (and never asks one who has not), and the account settings turn it on (scan,
// then a first code) and off. The database's rule is tests/staff-two-factor-migration.test.ts.

const state = vi.hoisted(() => ({
  status: { enabled: false, factorId: null as string | null, needsCode: false },
  give: vi.fn(async (_code: string) => undefined),
  start: vi.fn(async () => ({
    factorId: "f1",
    qrCode: "data:image/svg+xml;utf8,<svg/>",
    secret: "ABCD EFGH",
  })),
  confirm: vi.fn(async (_id: string, _code: string) => undefined),
  off: vi.fn(async (_id: string) => undefined),
}));

const mfa = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  twoFactorStatus: async () => state.status,
  giveSignInCode: state.give,
  startTwoFactorSetup: state.start,
  confirmTwoFactor: state.confirm,
  turnOffTwoFactor: state.off,
});
vi.mock("../src/lib/auth/mfa", (io) => mfa(io));
vi.mock("@/lib/auth/mfa", (io) => mfa(io));
vi.mock("../src/lib/auth/session", () => ({ signOut: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ signOut: vi.fn() }));
vi.mock("../src/lib/i18n", () => ({ useI18n: () => ({ lang: "en" }) }));
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ lang: "en" }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("../src/components/ui/confirm-dialog", () => ({ confirmDialog: async () => true }));
vi.mock("@/components/ui/confirm-dialog", () => ({ confirmDialog: async () => true }));

const { TwoFactorGate } = await import("../src/components/auth/TwoFactorGate");
const { TwoFactorSettings } = await import("../src/components/auth/TwoFactorSettings");
const { isCode } = await import("../src/lib/auth/mfa");

const withQuery = (node: React.ReactNode) =>
  render(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>);

afterEach(() => {
  state.give.mockClear();
  state.confirm.mockClear();
  state.off.mockClear();
});

describe("the code gate", () => {
  it("opens the admin straight away for a member without two-factor", async () => {
    state.status = { enabled: false, factorId: null, needsCode: false };
    withQuery(
      <TwoFactorGate>
        <p>The admin</p>
      </TwoFactorGate>,
    );
    expect(await screen.findByText("The admin")).toBeTruthy();
  });

  it("asks a member with it on for the code, and opens once it is right", async () => {
    state.status = { enabled: true, factorId: "f1", needsCode: true };
    withQuery(
      <TwoFactorGate>
        <p>The admin</p>
      </TwoFactorGate>,
    );
    const field = await screen.findByLabelText("Code");
    expect(screen.queryByText("The admin")).toBeNull();
    fireEvent.change(field, { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(state.give).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: "123 456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    await waitFor(() => expect(state.give).toHaveBeenCalledWith("123 456"));
    expect(await screen.findByText("The admin")).toBeTruthy();
  });

  it("stays closed on a wrong code", async () => {
    state.status = { enabled: true, factorId: "f1", needsCode: true };
    state.give.mockRejectedValueOnce(new Error("invalid"));
    withQuery(
      <TwoFactorGate>
        <p>The admin</p>
      </TwoFactorGate>,
    );
    fireEvent.change(await screen.findByLabelText("Code"), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    expect(await screen.findByText(/wrong or expired/)).toBeTruthy();
    expect(screen.queryByText("The admin")).toBeNull();
  });
});

describe("the account settings", () => {
  it("turns it on: the QR code and key, then the first code", async () => {
    state.status = { enabled: false, factorId: null, needsCode: false };
    render(<TwoFactorSettings />);
    fireEvent.click(await screen.findByRole("button", { name: "Turn on two-factor sign-in" }));
    expect(await screen.findByAltText("QR code for the authenticator app")).toBeTruthy();
    expect(screen.getByText("ABCD EFGH")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Code"), { target: { value: "654321" } });
    state.status = { enabled: true, factorId: "f1", needsCode: false };
    fireEvent.click(screen.getByRole("button", { name: "Turn on" }));
    await waitFor(() => expect(state.confirm).toHaveBeenCalledWith("f1", "654321"));
    expect(await screen.findByText("On for this account")).toBeTruthy();
  });

  it("turns it off after asking", async () => {
    state.status = { enabled: true, factorId: "f1", needsCode: false };
    render(<TwoFactorSettings />);
    fireEvent.click(await screen.findByRole("button", { name: "Turn off" }));
    await waitFor(() => expect(state.off).toHaveBeenCalledWith("f1"));
  });

  it("knows a code is six digits", () => {
    expect(isCode("123456")).toBe(true);
    expect(isCode("123 456")).toBe(true);
    expect(isCode("12345")).toBe(false);
  });
});
