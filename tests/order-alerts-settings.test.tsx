import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Order alerts on the installed admin, on screen: which devices can take them (an iPhone only
// from the app on its home screen), and the account settings' card turning them on, testing and
// off for this device. The database's rule is tests/web-push-alerts-migration.test.ts; the
// encryption, tests/web-push-crypto.test.ts.

const state = vi.hoisted(() => ({
  device: {
    serviceWorker: true,
    pushManager: true,
    notification: true,
    ios: false,
    standalone: false,
  },
  subscribed: false,
  on: vi.fn(async (_brand: string): Promise<"on" | "blocked"> => "on"),
  off: vi.fn(async () => undefined),
  test: vi.fn(async (_title: string, _body: string) => undefined),
}));

const webPush = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  thisDevice: () => state.device,
  currentAlertSubscription: async () => (state.subscribed ? { endpoint: "x" } : null),
  turnOnOrderAlerts: state.on,
  turnOffOrderAlerts: state.off,
  showTestAlert: state.test,
});
vi.mock("../src/lib/web-push", (io) => webPush(io));
vi.mock("@/lib/web-push", (io) => webPush(io));
vi.mock("../src/lib/data/push", () => ({}));
vi.mock("@/lib/data/push", () => ({}));
vi.mock("../src/lib/i18n", () => ({ useI18n: () => ({ lang: "en" }) }));
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ lang: "en" }) }));
vi.mock("../src/lib/brand-context", () => ({ useBrand: () => ({ id: "brand-1" }) }));
vi.mock("@/lib/brand-context", () => ({ useBrand: () => ({ id: "brand-1" }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { alertsAvailability } = await import("../src/lib/web-push");
const { OrderAlertsSettings } =
  await import("../src/features/settings/tabs/account/OrderAlertsSettings");

afterEach(() => {
  state.device = {
    serviceWorker: true,
    pushManager: true,
    notification: true,
    ios: false,
    standalone: false,
  };
  state.subscribed = false;
  vi.clearAllMocks();
});

describe("which devices can take order alerts", () => {
  const device = {
    serviceWorker: true,
    pushManager: true,
    notification: true,
    ios: false,
    standalone: false,
  };
  it("an iPhone only from the app on its home screen", () => {
    expect(alertsAvailability({ ...device, ios: true, pushManager: false })).toBe("needs-install");
    expect(alertsAvailability({ ...device, ios: true, standalone: true })).toBe("supported");
  });
  it("any browser with service workers, push and notifications", () => {
    expect(alertsAvailability(device)).toBe("supported");
    expect(alertsAvailability({ ...device, pushManager: false })).toBe("unsupported");
    expect(alertsAvailability({ ...device, serviceWorker: false })).toBe("unsupported");
  });
});

describe("the order alerts card", () => {
  it("turns alerts on for the store being looked at, then offers a test and a way off", async () => {
    Object.defineProperty(window, "Notification", {
      value: { permission: "default" },
      configurable: true,
    });
    render(<OrderAlertsSettings />);
    fireEvent.click(await screen.findByRole("button", { name: "Turn on alerts" }));
    await waitFor(() => expect(state.on).toHaveBeenCalledWith("brand-1"));
    fireEvent.click(await screen.findByRole("button", { name: "Send a test" }));
    expect(state.test).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Turn off" }));
    await waitFor(() => expect(state.off).toHaveBeenCalled());
    expect(await screen.findByRole("button", { name: "Turn on alerts" })).toBeTruthy();
  });

  it("tells an iPhone in Safari how to add the app first, and offers no button", async () => {
    state.device = { ...state.device, ios: true, pushManager: false };
    render(<OrderAlertsSettings />);
    expect(await screen.findByText(/Add to Home Screen/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("says where to unblock when the person said no", async () => {
    Object.defineProperty(window, "Notification", {
      value: { permission: "denied" },
      configurable: true,
    });
    render(<OrderAlertsSettings />);
    expect(await screen.findByText(/blocked for Boutq/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows a device already subscribed as on", async () => {
    Object.defineProperty(window, "Notification", {
      value: { permission: "granted" },
      configurable: true,
    });
    state.subscribed = true;
    render(<OrderAlertsSettings />);
    expect(await screen.findByRole("button", { name: "Send a test" })).toBeTruthy();
  });
});
