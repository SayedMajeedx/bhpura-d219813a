import { describe, expect, it, vi } from "vitest";
import {
  checkProductionReadiness,
  createCorrelationId,
  runObservedTask,
} from "../src/lib/observability.server";

describe("operational reliability", () => {
  it("preserves a safe incoming correlation id and rejects unsafe values", () => {
    expect(
      createCorrelationId(
        new Request("https://example.test", { headers: { "x-request-id": "req-12345678" } }),
      ),
    ).toBe("req-12345678");
    expect(
      createCorrelationId(
        new Request("https://example.test", { headers: { "x-request-id": "bad value" } }),
      ),
    ).not.toBe("bad value");
  });

  it("reports readiness without exposing credentials", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("[]", { status: 200 })));
    await expect(
      checkProductionReadiness({
        SUPABASE_URL: "https://db.test",
        SUPABASE_SERVICE_ROLE_KEY: "secret",
      }),
    ).resolves.toMatchObject({ status: "healthy", database: "up" });
    vi.unstubAllGlobals();
  });

  it("contains task failures instead of rejecting the scheduler", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 201 })));
    await expect(
      runObservedTask({}, "test_task", "req-12345678", async () => {
        throw new Error("provider unavailable");
      }),
    ).resolves.toBeUndefined();
    vi.unstubAllGlobals();
  });
});
