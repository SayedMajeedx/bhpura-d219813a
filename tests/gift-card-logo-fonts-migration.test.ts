import { beforeAll, describe, expect, it, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { BRAND, OTHER, asRole, giftCardDb } from "./helpers/gift-cards-db";

// The logo's size and the cards' own fonts (migration 20261108100000), run in a real Postgres
// after every gift card migration: the store's choices are cleaned as they are saved (a size from
// a half to twice, a font only from the store's own uploads) and read back by anyone drawing a
// card, beside what migration 20261107100000 already kept.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

let db: PGlite;
const font = (brand: string, ext = "woff2") =>
  `https://media.boutq.store/brands/${brand}/font/0f8e2b8c-7a3d-4e55-9a0b-2c4d6e8f1a3b.${ext}`;

const save = (designs: unknown) =>
  asRole(db, "authenticated", "SELECT public.set_gift_card_designs($1, $2::jsonb) AS r", [
    BRAND,
    JSON.stringify(designs),
  ]);
const read = async () =>
  (await asRole(db, "anon", "SELECT public.storefront_gift_card_designs($1) AS r", [BRAND])).rows[0]
    .r as Record<string, unknown>;

beforeAll(async () => {
  db = await giftCardDb();
  await db.exec(`SET test.staff_of = '${BRAND}'; SET test.perms = 'manage_settings';`);
});

describe("the logo's size", () => {
  it("is as designed until chosen, then kept between a half and twice, in twentieths", async () => {
    expect((await read()).logo_scale).toBe(1);
    expect((await save({ logo_scale: 1.33 })).rows[0].r).toMatchObject({ logo_scale: 1.35 });
    expect((await read()).logo_scale).toBe(1.35);
    expect((await save({ logo_scale: 9 })).rows[0].r).toMatchObject({ logo_scale: 2 });
    expect((await save({ logo_scale: 0.1 })).rows[0].r).toMatchObject({ logo_scale: 0.5 });
    expect((await save({ logo_scale: "big" })).rows[0].r).toMatchObject({ logo_scale: 1 });
  });
});

describe("the cards' fonts", () => {
  it("keep only the store's own font uploads, each language apart, with a clean name", async () => {
    const reply = await save({
      fonts: {
        ar: { url: font(BRAND), name: "  Zain Arabic <b>\n" },
        en: { url: font(OTHER), name: "Someone else's" },
      },
    });
    expect(reply.rows[0].r).toMatchObject({
      fonts: { ar: { url: font(BRAND), name: "Zain Arabic b" } },
    });
    expect((await read()).fonts).toEqual({ ar: { url: font(BRAND), name: "Zain Arabic b" } });
    for (const url of [
      font(BRAND, "exe"),
      `https://media.boutq.store/brands/${BRAND}/logo/0f8e2b8c-7a3d-4e55-9a0b-2c4d6e8f1a3b.woff2`,
      `http://media.boutq.store/brands/${BRAND}/font/0f8e2b8c-7a3d-4e55-9a0b-2c4d6e8f1a3b.woff2`,
      `${font(BRAND)}');} body{background:url(x`,
    ]) {
      expect((await save({ fonts: { en: { url, name: "x" } } })).rows[0].r).toMatchObject({
        fonts: {},
      });
    }
  });

  it("are saved with the other choices, which are kept as before", async () => {
    const reply = await save({
      off: ["block:white"],
      signature: "type:cream",
      logo_scale: 0.8,
      fonts: { en: { url: font(BRAND, "otf"), name: "Brand Serif" } },
    });
    expect(reply.rows[0].r).toEqual({
      off: ["block:white"],
      signature: "type:cream",
      photo_products: [],
      logo_scale: 0.8,
      fonts: { en: { url: font(BRAND, "otf"), name: "Brand Serif" } },
    });
    expect(await read()).toMatchObject({
      off: ["block:white"],
      signature: "type:cream",
      logo_scale: 0.8,
    });
  });
});
