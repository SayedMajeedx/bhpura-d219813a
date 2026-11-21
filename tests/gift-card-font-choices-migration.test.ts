import { beforeAll, describe, expect, it, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { BRAND, OTHER, asRole, giftCardDb } from "./helpers/gift-cards-db";
import { CARD_FACE_LIST } from "../src/features/gift-card-design/lib/card-faces";

// Card fonts chosen, never uploaded again (migration 20261215100000, the owner's request of
// 2026-11-21), run in a real Postgres after every gift card migration: a gift card's font is one
// of the store's uploads or one of the platform's faces, a gift message card has its own (or the
// cards' own faces, or the gift cards'), and the store's uploads are kept in a list to choose again.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

let db: PGlite;
const font = (brand: string, n = 0, ext = "woff2") =>
  `https://media.boutq.store/brands/${brand}/font/0f8e2b8c-7a3d-4e55-9a0b-2c4d6e8f1a3${n.toString(16)}.${ext}`;

const save = async (designs: unknown) =>
  (
    await asRole(db, "authenticated", "SELECT public.set_gift_card_designs($1, $2::jsonb) AS r", [
      BRAND,
      JSON.stringify(designs),
    ])
  ).rows[0].r as Record<string, unknown>;
const read = async () =>
  (await asRole(db, "anon", "SELECT public.storefront_gift_card_designs($1) AS r", [BRAND])).rows[0]
    .r as Record<string, unknown>;

beforeAll(async () => {
  db = await giftCardDb();
  await db.exec(`SET test.staff_of = '${BRAND}'; SET test.perms = 'manage_settings';`);
});

describe("a gift card's font", () => {
  it("is one of the platform's faces offered for its language, or the store's own upload", async () => {
    expect((await save({ fonts: { ar: { face: "zarid" }, en: { face: "inter" } } })).fonts).toEqual(
      { ar: { face: "zarid" }, en: { face: "inter" } },
    );
    // Inter has no Arabic letters; a face not offered, the cards' own and a stray shape keep nothing.
    expect(
      (
        await save({
          fonts: { ar: { face: "inter" }, en: { face: "comic" } },
          message_fonts: { ar: { face: "Kaff" }, en: "tajawal" },
        })
      ).fonts,
    ).toEqual({});
    expect((await save({ fonts: { ar: { face: "own" } } })).fonts).toEqual({});
    expect((await save({ fonts: { en: { url: font(BRAND), name: "Serif" } } })).fonts).toEqual({
      en: { url: font(BRAND), name: "Serif" },
    });
  });

  it("offers the faces the database takes, Inter in English only", () => {
    const ids = CARD_FACE_LIST.map((face) => face.id).sort();
    expect(ids).toEqual(["bukra", "inter", "kaff", "readex", "tajawal", "zarid"]);
    expect(CARD_FACE_LIST.find((face) => face.id === "inter")?.scripts).toEqual(["en"]);
  });
});

describe("a gift message card's font", () => {
  it("is its own, the cards' own faces, or (nothing chosen) the gift cards'", async () => {
    const reply = await save({
      fonts: { ar: { face: "kaff" } },
      message_fonts: { ar: { face: "own" }, en: { url: font(BRAND, 1), name: "Hand" } },
    });
    expect(reply.message_fonts).toEqual({
      ar: { face: "own" },
      en: { url: font(BRAND, 1), name: "Hand" },
    });
    expect(await read()).toMatchObject({
      fonts: { ar: { face: "kaff" } },
      message_fonts: { ar: { face: "own" }, en: { url: font(BRAND, 1), name: "Hand" } },
    });
    expect((await save({ fonts: { ar: { face: "kaff" } } })).message_fonts).toEqual({});
  });
});

describe("the store's uploaded fonts", () => {
  it("are kept to choose again, each once, the store's own only, at most twelve sent", async () => {
    const library = [
      { url: font(BRAND, 2), name: "Two" },
      { url: font(BRAND, 2), name: "Two again" },
      { url: font(OTHER, 3), name: "Someone else's" },
      { face: "kaff" },
      ...Array.from({ length: 13 }, (_, i) => ({ url: font(BRAND, i + 3), name: `F${i + 3}` })),
    ];
    const kept = (await save({ font_library: library })).font_library as Array<{ url: string }>;
    expect(kept).toHaveLength(12);
    expect(kept[0]).toEqual({ url: font(BRAND, 2), name: "Two" });
    expect(kept.map((f) => f.url)).not.toContain(font(OTHER, 3));
    expect(new Set(kept.map((f) => f.url)).size).toBe(12);
  });

  it("hold every upload chosen, even one the list did not send", async () => {
    const kept = (
      await save({
        fonts: { en: { url: font(BRAND, 9), name: "Chosen" } },
        message_fonts: { ar: { url: font(BRAND, 9), name: "Chosen" } },
        font_library: [{ url: font(BRAND, 4), name: "Four" }],
      })
    ).font_library;
    expect(kept).toEqual([
      { url: font(BRAND, 4), name: "Four" },
      { url: font(BRAND, 9), name: "Chosen" },
    ]);
  });

  it("are read by the store's staff from its settings, and never by a visitor", async () => {
    const staff = await asRole(
      db,
      "authenticated",
      "SELECT card_designs -> 'font_library' AS l FROM public.gift_card_settings WHERE brand_id = $1",
      [BRAND],
    );
    expect(staff.rows[0].l).toHaveLength(2);
    expect(await read()).not.toHaveProperty("font_library");
  });

  it("are cleaned by a helper no browser can call", async () => {
    const call = await asRole(
      db,
      "authenticated",
      "SELECT public.gift_card_font_choice($1, '{\"face\":\"kaff\"}'::jsonb, 'ar', false)",
      [BRAND],
    );
    expect(call.error).toMatch(/permission denied/);
  });
});
