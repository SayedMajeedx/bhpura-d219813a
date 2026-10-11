import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import migration from "../supabase/migrations/20261012150000_scheduler_sends_the_cron_secret.sql?raw";

// The scheduler's calls to the push functions carry the shared secret (migration
// 20261012150000). Run in a real Postgres (PGlite) with small stand-ins for pg_cron, pg_net
// and Vault: the two jobs as they were written by hand, each then run as the scheduler runs
// it, to read the headers the function would receive.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const CUSTOMER = `select net.http_post(url := 'https://p.test/functions/v1/send-customer-push', headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer sb_publishable_test'), body := '{}'::jsonb);`;
const STAFF = `SELECT net.http_post(url := 'https://p.test/functions/v1/send-mobile-push', headers := '{"Authorization":"Bearer sb_publishable_test","Content-Type":"application/json"}'::jsonb, body := '{}'::jsonb);`;
const OTHER = "SELECT public.reconcile_inventory();";

const SCHEMA = `
  CREATE SCHEMA cron; CREATE SCHEMA net; CREATE SCHEMA vault;
  CREATE TABLE cron.job (jobid serial PRIMARY KEY, jobname text UNIQUE, command text);
  CREATE FUNCTION cron.alter_job(job_id bigint, command text) RETURNS void LANGUAGE sql
    AS $$ UPDATE cron.job SET command = $2 WHERE jobid = $1 $$;
  CREATE TABLE vault.decrypted_secrets (name text PRIMARY KEY, decrypted_secret text);
  CREATE TABLE net.calls (url text, headers jsonb, body jsonb);
  CREATE FUNCTION net.http_post(url text, headers jsonb, body jsonb) RETURNS bigint LANGUAGE sql
    AS $$ INSERT INTO net.calls VALUES ($1, $2, $3); SELECT 1::bigint $$;
`;

let db: PGlite;

const command = async (name: string) =>
  (await db.query<{ command: string }>("SELECT command FROM cron.job WHERE jobname = $1", [name]))
    .rows[0].command;

/** Runs a job as the scheduler does and returns the headers its call carried. */
async function run(name: string) {
  await db.exec("DELETE FROM net.calls");
  await db.exec(await command(name));
  const { rows } = await db.query<{ url: string; headers: Record<string, string> }>(
    "SELECT url, headers FROM net.calls",
  );
  expect(rows).toHaveLength(1);
  return rows[0];
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SCHEMA);
  await db.query("INSERT INTO cron.job (jobname, command) VALUES ($1, $2), ($3, $4), ($5, $6)", [
    "send-customer-push-every-minute",
    CUSTOMER,
    "process-boutq-mobile-push",
    STAFF,
    "inventory_reconciliation_nightly",
    OTHER,
  ]);
  await db.exec(migration);
});

describe("the scheduler's calls to the push functions", () => {
  it("carry an empty secret until the owner stores one, and keep the key the gateway asks for", async () => {
    for (const name of ["send-customer-push-every-minute", "process-boutq-mobile-push"]) {
      const { headers } = await run(name);
      expect(headers["x-cron-secret"]).toBe("");
      expect(headers.Authorization).toBe("Bearer sb_publishable_test");
      expect(headers["Content-Type"]).toBe("application/json");
    }
  });

  it("carry the secret from Vault once it is there, read each time the job runs", async () => {
    await db.exec("INSERT INTO vault.decrypted_secrets VALUES ('cron_secret', 'first-secret')");
    expect((await run("send-customer-push-every-minute")).headers["x-cron-secret"]).toBe(
      "first-secret",
    );
    expect((await run("process-boutq-mobile-push")).headers["x-cron-secret"]).toBe("first-secret");

    // Changing the secret needs no change to the jobs.
    await db.exec("UPDATE vault.decrypted_secrets SET decrypted_secret = 'second-secret'");
    expect((await run("send-customer-push-every-minute")).headers["x-cron-secret"]).toBe(
      "second-secret",
    );
  });

  it("still call the same function", async () => {
    expect((await run("send-customer-push-every-minute")).url).toBe(
      "https://p.test/functions/v1/send-customer-push",
    );
    expect((await run("process-boutq-mobile-push")).url).toBe(
      "https://p.test/functions/v1/send-mobile-push",
    );
  });

  it("never keep the secret in the job itself", async () => {
    for (const name of ["send-customer-push-every-minute", "process-boutq-mobile-push"]) {
      const text = await command(name);
      expect(text).toContain("vault.decrypted_secrets");
      expect(text).not.toContain("second-secret");
    }
  });

  it("leave other jobs alone, and change nothing when run again", async () => {
    expect(await command("inventory_reconciliation_nightly")).toBe(OTHER);
    const before = await command("send-customer-push-every-minute");
    await db.exec(migration);
    expect(await command("send-customer-push-every-minute")).toBe(before);
    expect(before.match(/x-cron-secret/g)).toHaveLength(1);
  });

  it("does nothing on a database with no scheduler", async () => {
    const bare = new PGlite();
    await bare.exec(migration);
    await bare.close();
  });
});
