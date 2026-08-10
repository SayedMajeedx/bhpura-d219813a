import { describe, expect, it, vi } from "vitest";
import { verifyOnboardingTurnstile } from "../src/lib/turnstile.server";

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("onboarding Turnstile verification", () => {
  it("accepts a valid token bound to the onboarding action and production hostname", async () => {
    const fetchImpl = vi.fn(async () =>
      response({ success: true, action: "turnstile-spin-v2", hostname: "boutq.store" }),
    );

    await expect(
      verifyOnboardingTurnstile({ token: "valid-token", secret: "secret", fetchImpl }),
    ).resolves.toBe(true);

    const request = fetchImpl.mock.calls[0]?.[1];
    const body = new URLSearchParams(String(request?.body));
    expect(body.get("secret")).toBe("secret");
    expect(body.get("response")).toBe("valid-token");
  });

  it.each(["boutq.store", "www.boutq.store", "pura.boutq.store"])(
    "accepts the configured production hostname %s",
    async (hostname) => {
      const fetchImpl = vi.fn(async () =>
        response({ success: true, action: "turnstile-spin-v2", hostname }),
      );
      await expect(
        verifyOnboardingTurnstile({ token: "valid-token", secret: "secret", fetchImpl }),
      ).resolves.toBe(true);
    },
  );

  it.each([
    [{ success: false }, "failed challenge"],
    [{ success: true, action: "different", hostname: "pura.boutq.store" }, "wrong action"],
    [{ success: true, action: "turnstile-spin-v2", hostname: "evil.example" }, "wrong host"],
  ])("rejects %s (%s)", async (payload) => {
    const fetchImpl = vi.fn(async () => response(payload));
    await expect(
      verifyOnboardingTurnstile({ token: "token", secret: "secret", fetchImpl }),
    ).resolves.toBe(false);
  });

  it("fails closed when the secret is missing or Siteverify is unavailable", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network failure");
    });
    await expect(
      verifyOnboardingTurnstile({ token: "token", secret: undefined, fetchImpl }),
    ).resolves.toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
    await expect(
      verifyOnboardingTurnstile({ token: "token", secret: "secret", fetchImpl }),
    ).resolves.toBe(false);
  });
});
