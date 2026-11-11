import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { BRAND, OTHER, asRole, giftCardDb } from "./helpers/gift-cards-db";

// A gift card's own link (migration 20261201100000), run in a real Postgres after every gift card
// migration: each card has a long token of its own, cards that existed before get one each, and
// only the store's order staff give a card a new one.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

let db: PGlite;
const as = (role: "anon" | "authenticated" | "service_role", sql: string, params: unknown[] = []) =>
  asRole(db, role, sql, params);
const staff = (brand = BRAND, perms = "manage_orders") =>
  db.exec(`SET test.staff_of = '${brand}'; SET test.perms = '${perms}';`);
const issue = async () =>
  (
    await as(
      "authenticated",
      `SELECT id, share_token FROM public.issue_gift_card('${BRAND}', 25, NULL, NULL, NULL, NULL, NULL, 'cash')`,
    )
  ).rows[0] as { id: string; share_token: string };

beforeAll(async () => {
  db = await giftCardDb();
  await staff();
});

describe("a card's gift link token", () => {
  it("is long, random and the card's own", async () => {
    const [one, two] = [await issue(), await issue()];
    expect(one.share_token).toMatch(/^[a-f0-9]{64}$/);
    expect(two.share_token).toMatch(/^[a-f0-9]{64}$/);
    expect(one.share_token).not.toBe(two.share_token);
  });

  it("is given to each card that existed before, a different one each", async () => {
    const old = new PGlite();
    await old.exec(`
      CREATE TABLE gift_cards (id int PRIMARY KEY);
      INSERT INTO gift_cards VALUES (1), (2), (3);
      ALTER TABLE gift_cards ADD COLUMN IF NOT EXISTS share_token text NOT NULL
        DEFAULT (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''));
      CREATE UNIQUE INDEX gift_cards_share_token ON gift_cards (share_token);
    `);
    const { rows } = await old.query<{ n: number }>(
      "SELECT count(DISTINCT share_token)::int AS n FROM gift_cards",
    );
    expect(rows[0].n).toBe(3);
  });

  it("is replaced by the store's order staff, and the card keeps its code and balance", async () => {
    const card = await issue();
    const before = (
      await db.query("SELECT code, balance FROM public.gift_cards WHERE id = $1", [card.id])
    ).rows[0];
    const reply = await as(
      "authenticated",
      "SELECT share_token FROM public.reset_gift_card_share_link($1)",
      [card.id],
    );
    expect(reply.error).toBeNull();
    expect(reply.rows[0].share_token).toMatch(/^[a-f0-9]{64}$/);
    expect(reply.rows[0].share_token).not.toBe(card.share_token);
    const after = (
      await db.query("SELECT code, balance FROM public.gift_cards WHERE id = $1", [card.id])
    ).rows[0];
    expect(after).toEqual(before);
  });

  it("is not replaced by another store's staff, staff without orders, or a visitor", async () => {
    const card = await issue();
    await staff(OTHER);
    expect(
      (await as("authenticated", "SELECT public.reset_gift_card_share_link($1)", [card.id])).error,
    ).toMatch(/GIFT_CARD_NOT_FOUND/);
    await staff(BRAND, "manage_settings");
    expect(
      (await as("authenticated", "SELECT public.reset_gift_card_share_link($1)", [card.id])).error,
    ).toMatch(/GIFT_CARD_NOT_FOUND/);
    expect(
      (await as("anon", "SELECT public.reset_gift_card_share_link($1)", [card.id])).error,
    ).toMatch(/permission denied/);
    await staff();
    const kept = (
      await db.query("SELECT share_token FROM public.gift_cards WHERE id = $1", [card.id])
    ).rows[0];
    expect(kept).toEqual({ share_token: card.share_token });
  });
});
