import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The onboarding page asks "are you a person" before it launches a store, and sends the answer
// with the sign-up. The widget itself is Cloudflare's: here it is a stand-in with a button.

const stubs = vi.hoisted(() => ({
  registerInstantTrial: vi.fn(),
  onVerify: null as null | ((token: string | null) => void),
}));
vi.mock("../src/lib/onboarding.functions", () => ({
  registerInstantTrial: stubs.registerInstantTrial,
  getPublicOnboardingPlans: async () => [],
  getOnboardingTrialDays: async () => 3,
}));
vi.mock("@/lib/onboarding.functions", () => ({
  registerInstantTrial: stubs.registerInstantTrial,
  getPublicOnboardingPlans: async () => [],
  getOnboardingTrialDays: async () => 3,
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({ options }),
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), loading: vi.fn(), info: vi.fn(), dismiss: vi.fn() },
}));
const preview = { StorefrontLivePreview: () => null };
vi.mock("../src/components/onboarding/StorefrontLivePreview", () => preview);
vi.mock("@/components/onboarding/StorefrontLivePreview", () => preview);
const brands = { isBrandSlugTaken: async () => false };
vi.mock("../src/lib/data/brands", () => brands);
vi.mock("@/lib/data/brands", () => brands);
const signIn = { signInWithPassword: async () => ({ error: null }) };
vi.mock("../src/lib/auth/sign-in", () => signIn);
vi.mock("@/lib/auth/sign-in", () => signIn);
const widget = {
  TurnstileWidget: ({ onVerify }: { onVerify: (token: string | null) => void }) => {
    stubs.onVerify = onVerify;
    return (
      <button type="button" onClick={() => onVerify("widget-token")}>
        I am a person
      </button>
    );
  },
};
vi.mock("../src/components/TurnstileWidget", () => widget);
vi.mock("@/components/TurnstileWidget", () => widget);

const { Route } = (await import("../src/routes/onboard")) as unknown as {
  Route: { options: { component: React.ComponentType } };
};
const { I18nProvider } = await import("../src/lib/i18n");
const { toast } = await import("sonner");

const launchButton = () => screen.getByRole("button", { name: /Launch Store/ });

async function fillTheForm(container: HTMLElement, password = "a-long-secret") {
  fireEvent.click(await screen.findByRole("button", { name: /Abayas/ }));
  const type = (selector: string, value: string) =>
    fireEvent.change(container.querySelector(selector)!, { target: { value } });
  type("#brandName", "Noor");
  type("#slug", "noor");
  type("#ownerName", "Sara Ali");
  type("#contactNumber", "39001122");
  type("#email", "sara@example.com");
  type("#password", password);
  await waitFor(() => expect(launchButton()).toBeTruthy());
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem("lang", "en");
  stubs.registerInstantTrial.mockResolvedValue({ alreadyRegistered: true, message: "Sign in." });
});

describe("launching a store from the onboarding page", () => {
  it("cannot be launched until the person check is passed, and then sends its token", async () => {
    const Onboard = Route.options.component;
    const { container } = render(
      <I18nProvider>
        <Onboard />
      </I18nProvider>,
    );
    await fillTheForm(container);
    expect(launchButton()).toBeDisabled();

    fireEvent.submit(container.querySelector("form")!);
    expect(stubs.registerInstantTrial).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      "Complete the check below to show you are not a robot, then try again.",
    );

    fireEvent.click(screen.getByRole("button", { name: "I am a person" }));
    await waitFor(() => expect(launchButton()).not.toBeDisabled());
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(stubs.registerInstantTrial).toHaveBeenCalledTimes(1));
    expect(stubs.registerInstantTrial.mock.calls[0][0].data).toMatchObject({
      slug: "noor",
      email: "sara@example.com",
      turnstileToken: "widget-token",
    });
  });

  it("asks for a password of at least eight characters before it asks the server", async () => {
    const Onboard = Route.options.component;
    const { container } = render(
      <I18nProvider>
        <Onboard />
      </I18nProvider>,
    );
    await fillTheForm(container, "1234567");
    fireEvent.click(screen.getByRole("button", { name: "I am a person" }));
    fireEvent.submit(container.querySelector("form")!);
    expect(toast.error).toHaveBeenCalledWith("Password must be at least 8 characters.");
    expect(stubs.registerInstantTrial).not.toHaveBeenCalled();
  });
});
