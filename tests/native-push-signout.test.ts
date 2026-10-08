import { beforeEach, describe, expect, it, vi } from "vitest";

// Inside the merchant app, signing out of the admin turns the phone's notifications off for that
// person first. On a plain browser (no token ever sent) nothing extra happens.

const stubs = vi.hoisted(() => ({
  calls: [] as string[],
  register: vi.fn(),
  signOut: vi.fn(),
}));
const push = { registerMobilePushDevice: stubs.register };
vi.mock("../src/lib/data/push", () => push);
vi.mock("@/lib/data/push", () => push);
const client = { supabase: { auth: { signOut: stubs.signOut } } };
vi.mock("../src/integrations/supabase/client", () => client);
vi.mock("@/integrations/supabase/client", () => client);

const { rememberNativePushDevice, releaseNativePushDevice } =
  await import("../src/lib/native-push");
const { signOut } = await import("../src/lib/auth/session");

const TOKEN = "ExponentPushToken[abc123]";

beforeEach(() => {
  window.localStorage.clear();
  stubs.calls = [];
  stubs.register.mockReset().mockImplementation(async () => void stubs.calls.push("register"));
  stubs.signOut.mockReset().mockImplementation(async () => void stubs.calls.push("signOut"));
});

describe("signing out inside the merchant app", () => {
  it("turns the remembered device off for the person, then signs out", async () => {
    rememberNativePushDevice({ token: TOKEN, enabled: true, platform: "ios" });
    await signOut();
    expect(stubs.register).toHaveBeenCalledWith(
      expect.objectContaining({
        token: TOKEN,
        enabled: false,
        platform: "ios",
        preferences: null,
      }),
    );
    // It needs the session, so it must come before the sign-out.
    expect(stubs.calls).toEqual(["register", "signOut"]);
  });

  it("does nothing extra on a plain browser, where no token was ever sent", async () => {
    await signOut();
    expect(stubs.register).not.toHaveBeenCalled();
    expect(stubs.signOut).toHaveBeenCalledTimes(1);
  });

  it("forgets a device the app turned off, so a later sign-out does not touch it", async () => {
    rememberNativePushDevice({ token: TOKEN, enabled: true, platform: "android" });
    rememberNativePushDevice({ token: TOKEN, enabled: false });
    await signOut();
    expect(stubs.register).not.toHaveBeenCalled();
  });

  it("still signs out when turning the device off fails", async () => {
    rememberNativePushDevice({ token: TOKEN, enabled: true });
    stubs.register.mockRejectedValue(new Error("network"));
    await expect(signOut()).resolves.toBeUndefined();
    expect(stubs.signOut).toHaveBeenCalledTimes(1);
  });

  it("ignores a message without a usable token and a corrupted memory", async () => {
    rememberNativePushDevice({ enabled: true });
    rememberNativePushDevice({ token: 42 });
    window.localStorage.setItem("boutq.native-push-device", "{not json");
    await releaseNativePushDevice();
    expect(stubs.register).not.toHaveBeenCalled();
  });
});
