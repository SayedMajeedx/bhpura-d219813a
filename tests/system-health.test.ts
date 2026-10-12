import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HEARTBEAT_MINUTES,
  didWork,
  isHeartbeatMinute,
  isSilent,
  latestPerService,
  worthRecording,
} from "../src/lib/system-health";
import { runObservedTask } from "../src/lib/observability.server";

// The health log keeps what says something: a run that did work or went wrong, and one quiet
// run every quarter of an hour so a scheduler that stopped can be seen.

const at = (time: string) => new Date(`2026-10-12T${time}Z`).getTime();
const ENV = { SUPABASE_URL: "https://db.test", SUPABASE_SERVICE_ROLE_KEY: "service-key" };

function recordingFetch() {
  const writes: Array<Record<string, unknown>> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      writes.push(JSON.parse(String(init?.body)));
      return new Response(null, { status: 201 });
    }),
  );
  return writes;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("which runs are written", () => {
  it("has a heartbeat four times an hour", () => {
    expect(HEARTBEAT_MINUTES).toBe(15);
    expect(["10:00:00", "10:15:00", "10:30:02", "10:45:59"].map(at).map(isHeartbeatMinute)).toEqual(
      [true, true, true, true],
    );
    expect(["10:01:00", "10:14:59", "10:16:00", "10:59:00"].map(at).map(isHeartbeatMinute)).toEqual(
      [false, false, false, false],
    );
  });

  it("sees work in any figure above zero, and none in words and switches", () => {
    expect(didWork({ cron: "* * * * *", expired: 0, abandoned: 0 })).toBe(false);
    expect(didWork({ cron: "* * * * *", attempted: 0, configured: true })).toBe(false);
    expect(didWork({ scanned: 3, paid: 0 })).toBe(true);
    expect(didWork({ deleted: 1 })).toBe(true);
  });

  it("always writes a run that went wrong, a run that did work, and a run that is not quiet", () => {
    const idle = { cron: "* * * * *", attempted: 0 };
    expect(worthRecording({ status: "healthy", metrics: idle, quietWhenIdle: true })).toBe(false);
    expect(worthRecording({ status: "healthy", metrics: idle, quietWhenIdle: false })).toBe(true);
    expect(
      worthRecording({ status: "healthy", metrics: { attempted: 2 }, quietWhenIdle: true }),
    ).toBe(true);
    expect(worthRecording({ status: "degraded", metrics: idle, quietWhenIdle: true })).toBe(true);
    expect(worthRecording({ status: "failed", metrics: {}, quietWhenIdle: true })).toBe(true);
  });
});

describe("a scheduled task", () => {
  it("writes nothing for a quiet run between heartbeats, and still returns its result", async () => {
    const writes = recordingFetch();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const result = await runObservedTask(
      ENV,
      "order_email_retry",
      "req-12345678",
      async () => ({ attempted: 0, failed: 0 }),
      { quietWhenIdle: true },
    );
    expect(result).toEqual({ attempted: 0, failed: 0 });
    expect(writes).toEqual([]);
  });

  it("writes the same quiet run on a heartbeat", async () => {
    const writes = recordingFetch();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    await runObservedTask(
      ENV,
      "order_email_retry",
      "req-12345678",
      async () => ({ attempted: 0, failed: 0 }),
      { quietWhenIdle: false },
    );
    expect(writes).toMatchObject([{ service: "order_email_retry", status: "healthy" }]);
  });

  it("writes a run that did work, one that reported failures and one that threw, heartbeat or not", async () => {
    const writes = recordingFetch();
    for (const method of ["log", "warn", "error"] as const) {
      vi.spyOn(console, method).mockImplementation(() => undefined);
    }
    const quiet = { quietWhenIdle: true };
    await runObservedTask(
      ENV,
      "a",
      "req-12345678",
      async () => ({ attempted: 2, failed: 0 }),
      quiet,
    );
    await runObservedTask(
      ENV,
      "b",
      "req-12345678",
      async () => ({ attempted: 2, failed: 2 }),
      quiet,
    );
    await runObservedTask(
      ENV,
      "c",
      "req-12345678",
      async (): Promise<Record<string, unknown>> => {
        throw new Error("provider unavailable");
      },
      quiet,
    );
    expect(writes.map((write) => [write.service, write.status])).toEqual([
      ["a", "healthy"],
      ["b", "degraded"],
      ["c", "failed"],
    ]);
  });

  it("writes every run of a task that is not marked quiet (the daily ones)", async () => {
    const writes = recordingFetch();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    await runObservedTask(ENV, "health_event_retention", "req-12345678", async () => ({
      deleted: 0,
    }));
    expect(writes).toHaveLength(1);
  });
});

describe("how the health page reads the log", () => {
  const row = (service: string, status: string, time: string) => ({
    service,
    status,
    created_at: `2026-10-12T${time}Z`,
  });

  it("takes each service's newest record from a newest-first list", () => {
    const events = [
      row("whatsapp_retry", "failed", "10:30:00"),
      row("order_email_retry", "healthy", "10:30:00"),
      row("whatsapp_retry", "healthy", "10:15:00"),
      row("health_event_retention", "healthy", "02:17:00"),
      row("order_email_retry", "failed", "10:00:00"),
    ];
    expect(latestPerService(events).map((event) => [event.service, event.status])).toEqual([
      ["whatsapp_retry", "failed"],
      ["order_email_retry", "healthy"],
      ["health_event_retention", "healthy"],
    ]);
  });

  it("calls a service silent when its newest record is older than a running scheduler allows", () => {
    const now = at("12:00:00");
    // A task that runs every minute is heard from every 15 minutes; three missed is silence.
    expect(isSilent(row("order_email_retry", "healthy", "11:30:00"), now)).toBe(false);
    expect(isSilent(row("order_email_retry", "healthy", "11:14:00"), now)).toBe(true);
    // A daily task ran this morning: that is as recent as it can be.
    expect(isSilent(row("health_event_retention", "healthy", "02:17:00"), now)).toBe(false);
    expect(
      isSilent(
        {
          service: "benefit_receipt_cleanup",
          status: "healthy",
          created_at: "2026-10-10T02:17:00Z",
        },
        now,
      ),
    ).toBe(true);
  });
});
