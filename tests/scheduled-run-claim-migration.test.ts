import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import migration from "../supabase/migrations/20261013180000_a_scheduled_run_happens_once.sql?raw";
import { claimScheduledRun } from "../src/lib/observability.server";
import { runMinute } from "../src/lib/system-health";

// A scheduled run happens once, however many times it is started (migration 20261013180000).
// Cloudflare has started every run twice, a few seconds apart; the run claims its minute in the
// database first. The claim in a real Postgres (PGlite), then the worker's side of it.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

let db: PGlite;
const claim = async (cron: string, at: string) =>
  (await db.query<{ ok: boolean }>("SELECT public.claim_scheduled_run($1, $2) AS ok", [cron, at]))
    .rows[0].ok;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  `);
  await db.exec(migration);
});

describe("claiming a scheduled run", () => {
  it("is given to the first start of a minute and refused to the second", async () => {
    // The two starts Cloudflare makes: seconds :08 and :24 of the same minute.
    expect(await claim("* * * * *", "2026-10-13T09:20:08Z")).toBe(true);
    expect(await claim("* * * * *", "2026-10-13T09:20:24Z")).toBe(false);
    expect(await claim("* * * * *", "2026-10-13T09:20:59.999Z")).toBe(false);
  });

  it("is given again the next minute, and to another schedule in the same minute", async () => {
    expect(await claim("* * * * *", "2026-10-13T09:21:08Z")).toBe(true);
    expect(await claim("17 2 * * *", "2026-10-13T09:20:12Z")).toBe(true);
    expect(await claim("17 2 * * *", "2026-10-13T09:20:26Z")).toBe(false);
  });

  it("refuses a run that names no schedule or no time", async () => {
    await expect(claim("", "2026-10-13T09:20:08Z")).rejects.toThrow(/SCHEDULED_RUN_NEEDS/);
    await expect(db.query("SELECT public.claim_scheduled_run('* * * * *', NULL)")).rejects.toThrow(
      /SCHEDULED_RUN_NEEDS/,
    );
  });

  it("clears claims older than two days when an hour begins", async () => {
    await db.exec(`
      INSERT INTO public.scheduled_runs (cron, run_minute) VALUES
        ('* * * * *', now() - interval '3 days'), ('* * * * *', now() - interval '1 day');
    `);
    // Not on the hour: nothing is cleared.
    await claim("* * * * *", "2026-10-13T10:07:00Z");
    expect(
      (
        await db.query(
          "SELECT 1 FROM public.scheduled_runs WHERE run_minute < now() - interval '2 days'",
        )
      ).rows,
    ).toHaveLength(1);
    await claim("* * * * *", "2026-10-13T11:00:08Z");
    expect(
      (
        await db.query(
          "SELECT 1 FROM public.scheduled_runs WHERE run_minute < now() - interval '2 days'",
        )
      ).rows,
    ).toHaveLength(0);
    // The day-old claim and today's are kept.
    expect(
      Number(
        (await db.query<{ n: number }>("SELECT count(*)::int AS n FROM public.scheduled_runs"))
          .rows[0].n,
      ),
    ).toBeGreaterThanOrEqual(5);
  });

  it("is the server's only: a browser can neither claim nor read the claims", async () => {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`SET ROLE ${role}`);
      await expect(
        db.query("SELECT public.claim_scheduled_run('* * * * *', now())"),
      ).rejects.toThrow(/permission denied/);
      await expect(db.query("SELECT * FROM public.scheduled_runs")).rejects.toThrow(
        /permission denied/,
      );
      await db.exec("RESET ROLE");
    }
    await db.exec("SET ROLE service_role");
    expect(await claim("* * * * *", "2026-10-13T12:30:00Z")).toBe(true);
    await db.exec("RESET ROLE");
  });

  it("can be applied twice", async () => {
    await db.exec(migration);
    expect(await claim("* * * * *", "2026-10-13T12:30:30Z")).toBe(false);
  });
});

describe("the worker's side of the claim", () => {
  const ENV = { SUPABASE_URL: "https://db.test/", SUPABASE_SERVICE_ROLE_KEY: "service-key" };
  const answer = (body: unknown, status = 200) => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, body: JSON.parse(String(init?.body)) });
        return new Response(JSON.stringify(body), { status });
      }),
    );
    return calls;
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("names the minute, whatever second of it the run was started at", () => {
    const first = Date.parse("2026-10-13T09:20:08Z");
    const second = Date.parse("2026-10-13T09:20:24Z");
    expect(runMinute(first)).toBe("2026-10-13T09:20:00.000Z");
    expect(runMinute(second)).toBe(runMinute(first));
    expect(runMinute(Date.parse("2026-10-13T09:21:00Z"))).toBe("2026-10-13T09:21:00.000Z");
  });

  it("asks the database for the run's schedule and minute, and does what it says", async () => {
    const calls = answer(true);
    expect(await claimScheduledRun(ENV, "* * * * *", Date.parse("2026-10-13T09:20:24Z"))).toBe(
      true,
    );
    expect(calls).toEqual([
      {
        url: "https://db.test/rest/v1/rpc/claim_scheduled_run",
        body: { p_cron: "* * * * *", p_run_minute: "2026-10-13T09:20:00.000Z" },
      },
    ]);
    answer(false);
    expect(await claimScheduledRun(ENV, "* * * * *", Date.now())).toBe(false);
  });

  it("goes ahead when the database cannot be asked: a recovery loop must not stop for its guard", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    // The function is not there yet, the database is down, or it is not configured.
    answer({ message: "function not found" }, 404);
    expect(await claimScheduledRun(ENV, "* * * * *", Date.now())).toBe(true);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    expect(await claimScheduledRun(ENV, "* * * * *", Date.now())).toBe(true);
    expect(await claimScheduledRun({}, "* * * * *", Date.now())).toBe(true);
  });
});
