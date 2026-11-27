import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import migration from "../supabase/migrations/20261229100000_gift_card_opened.sql?raw";

// When a gift was opened (migration 20261229100000), in a real Postgres (PGlite): the first tap
// on its page is kept, a later one changes nothing, a link on another store's address or of the
// wrong shape opens nothing, and a link given anew is a new gift to open.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const BRAND = "00000000-0000-4000-8000-0000000000b1";
const OTHER = "00000000-0000-4000-8000-0000000000b2";
const TOKEN = "ab".repeat(32);
const NEXT = "cd".repeat(32);

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
    CREATE TABLE public.brands (id uuid PRIMARY KEY, slug text NOT NULL);
    INSERT INTO public.brands VALUES ('${BRAND}', 'pura'), ('${OTHER}', 'other');
    CREATE TABLE public.gift_cards (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL,
      code text NOT NULL, share_token text NOT NULL UNIQUE
    );
    INSERT INTO public.gift_cards (brand_id, code, share_token) VALUES ('${BRAND}', 'ABCD', '${TOKEN}');
  `);
  await db.exec(migration);
});

const open = async (slug: string, token: string) =>
  (
    await db.query<{ at: string | null }>(`SELECT public.mark_gift_card_opened($1, $2) AS at`, [
      slug,
      token,
    ])
  ).rows[0].at;
const openedAt = async () =>
  (await db.query<{ opened_at: string | null }>(`SELECT opened_at FROM public.gift_cards`)).rows[0]
    .opened_at;

describe("a gift's opening", () => {
  it("is nothing until the gift is opened, and nothing for another store's address or a bad token", async () => {
    expect(await openedAt()).toBeNull();
    expect(await open("other", TOKEN)).toBeNull();
    expect(await open("pura", "not-a-token")).toBeNull();
    expect(await open("pura", NEXT)).toBeNull();
    expect(await openedAt()).toBeNull();
  });

  it("keeps the first time it was opened", async () => {
    const first = await open("pura", TOKEN);
    expect(first).not.toBeNull();
    await db.exec(`SELECT pg_sleep(0.01)`);
    expect(await open("pura", TOKEN)).toEqual(first);
    expect(await openedAt()).toEqual(first);
  });

  it("starts again when the gift is given a new link", async () => {
    await db.exec(`UPDATE public.gift_cards SET share_token = '${NEXT}'`);
    expect(await openedAt()).toBeNull();
    expect(await open("pura", TOKEN)).toBeNull();
    expect(await open("pura", NEXT)).not.toBeNull();
    // Any other change keeps it.
    await db.exec(`UPDATE public.gift_cards SET code = 'WXYZ'`);
    expect(await openedAt()).not.toBeNull();
  });

  it("is recorded by the server, never a browser", async () => {
    const rights = await db.query(
      `SELECT 1 FROM information_schema.routine_privileges
        WHERE routine_name = 'mark_gift_card_opened' AND grantee IN ('anon', 'authenticated', 'PUBLIC')`,
    );
    expect(rights.rows).toEqual([]);
  });
});
