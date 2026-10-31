import { beforeAll, describe, expect, it, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { BRAND, OTHER, STAFF, asRole, giftCardDb } from "./helpers/gift-cards-db";

// Gift card designs (migration 20261107100000), run in a real Postgres after every gift card
// migration: the store chooses which designs it offers, its signature card and the products whose
// photos the photo designs use; anyone drawing a card reads that; a buyer's design is kept on
// the purchase, cleaned, and comes back with the shopper's own cards.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

let db: PGlite;
const as = (role: "anon" | "authenticated" | "service_role", sql: string, params: unknown[] = []) =>
  asRole(db, role, sql, params);
const staff = (perms = "manage_orders,manage_settings") =>
  db.exec(`SET test.staff_of = '${BRAND}'; SET test.perms = '${perms}';`);

const product = async (fields: {
  brand?: string;
  image?: string | null;
  media?: unknown[];
  active?: boolean;
  minutesAgo?: number;
}) =>
  (
    await db.query<{ id: string }>(
      `INSERT INTO public.products (brand_id, image_url, media, is_active, created_at)
       VALUES ($1, $2, $3::jsonb, $4, now() - make_interval(mins => $5)) RETURNING id`,
      [
        fields.brand ?? BRAND,
        fields.image ?? null,
        JSON.stringify(fields.media ?? []),
        fields.active ?? true,
        fields.minutesAgo ?? 0,
      ],
    )
  ).rows[0].id;

const designs = async () =>
  (await as("anon", "SELECT public.storefront_gift_card_designs($1) AS r", [BRAND])).rows[0].r as {
    off: string[];
    signature: string | null;
    photos: string[];
    photo_products: string[];
  };

const buy = (design: unknown) =>
  as(
    "service_role",
    "SELECT public.create_gift_card_purchase('pura', 25, 'card', $1::jsonb, NULL, $2) AS r",
    [JSON.stringify({ name: "Sara", delivery: "email", email: "sara@example.com", design }), STAFF],
  );

beforeAll(async () => {
  db = await giftCardDb();
  await staff();
  await as("authenticated", "SELECT public.set_gift_card_settings($1, true, ARRAY[25, 50], 12)", [
    BRAND,
  ]);
});

describe("the store's photos", () => {
  it("are its six newest products with a photo until it chooses, the main picture first", async () => {
    await product({ image: "https://media.test/old.jpg", minutesAgo: 90 });
    await product({
      media: [
        { type: "video", url: "https://media.test/clip.mp4" },
        { type: "image", url: "https://media.test/gallery.jpg" },
      ],
      minutesAgo: 10,
    });
    await product({ image: null, minutesAgo: 5 });
    await product({ image: "https://media.test/hidden.jpg", active: false, minutesAgo: 1 });
    await product({ brand: OTHER, image: "https://media.test/theirs.jpg" });
    expect((await designs()).photos).toEqual([
      "https://media.test/gallery.jpg",
      "https://media.test/old.jpg",
    ]);
  });
});

describe("what the store chooses", () => {
  it("is cleaned: known designs, no signature it turned off, only its own products", async () => {
    const mine = await product({ image: "https://media.test/chosen.jpg", minutesAgo: 200 });
    const theirs = await product({ brand: OTHER, image: "https://media.test/x.jpg" });
    const saved = await as(
      "authenticated",
      "SELECT public.set_gift_card_designs($1, $2::jsonb) AS r",
      [
        BRAND,
        JSON.stringify({
          off: ["block:white", "block:white", "nonsense", "photo:gold"],
          signature: "block:white",
          photo_products: [theirs, mine, mine],
        }),
      ],
    );
    expect(saved.error).toBeNull();
    expect(saved.rows[0].r).toEqual({
      off: ["block:white"],
      signature: null,
      photo_products: [mine],
    });
    const read = await designs();
    expect(read).toMatchObject({ off: ["block:white"], photos: ["https://media.test/chosen.jpg"] });

    await as("authenticated", "SELECT public.set_gift_card_designs($1, $2::jsonb)", [
      BRAND,
      JSON.stringify({ off: [], signature: "pattern:black", photo_products: [] }),
    ]);
    expect((await designs()).signature).toBe("pattern:black");
  });

  it("is for staff who may change settings", async () => {
    await staff("manage_orders");
    expect(
      (await as("authenticated", "SELECT public.set_gift_card_designs($1, '{}'::jsonb)", [BRAND]))
        .error,
    ).toMatch(/FORBIDDEN/);
    await staff();
    expect(
      (await as("anon", "SELECT public.set_gift_card_designs($1, '{}'::jsonb)", [BRAND])).error,
    ).toMatch(/permission denied/);
    for (const fn of ["gift_card_store_photos($1)", "gift_card_design_clean($1, '{}'::jsonb)"]) {
      expect((await as("anon", `SELECT public.${fn}`, [BRAND])).error).toMatch(/permission denied/);
    }
  });
});

describe("the buyer's design", () => {
  it("is kept on the purchase, cleaned, with only one of the store's own photos", async () => {
    const reply = await buy({
      occasion: "eid_al_fitr",
      design: "pattern:black",
      orientation: "landscape",
      language: "both",
      from: "  Sara and Mona  ",
      photo: "https://evil.test/anything.jpg",
      print: true,
      extra: "dropped",
    });
    expect(reply.error).toBeNull();
    const id = (reply.rows[0].r as { id: string }).id;
    const { design } = (
      await db.query<{ design: unknown }>(
        "SELECT design FROM public.gift_card_purchases WHERE id = $1",
        [id],
      )
    ).rows[0];
    expect(design).toEqual({
      occasion: "eid_al_fitr",
      design: "pattern:black",
      orientation: "landscape",
      language: "both",
      from: "Sara and Mona",
      photo: null,
      print: true,
    });
    // One of the store's own photos is kept.
    const own = await buy({ design: "photo:cream", photo: "https://media.test/chosen.jpg" });
    const ownId = (own.rows[0].r as { id: string }).id;
    expect(
      (
        await db.query<{ photo: string }>(
          "SELECT design ->> 'photo' AS photo FROM public.gift_card_purchases WHERE id = $1",
          [ownId],
        )
      ).rows[0].photo,
    ).toBe("https://media.test/chosen.jpg");
  });

  it("refuses a malformed design, and keeps none when none is sent", async () => {
    for (const bad of [
      { design: "photo:gold" },
      { design: "type:white", orientation: "sideways" },
      { design: "type:white", language: "fr" },
      { design: "type:white", occasion: "Eid!" },
      "pattern:black",
    ]) {
      expect((await buy(bad)).error).toMatch(/GIFT_CARD_DESIGN_INVALID/);
    }
    const none = await buy(null);
    const id = (none.rows[0].r as { id: string }).id;
    expect(
      (
        await db.query<{ design: unknown }>(
          "SELECT design FROM public.gift_card_purchases WHERE id = $1",
          [id],
        )
      ).rows[0].design,
    ).toBeNull();
  });

  it("comes back with the shopper's own cards", async () => {
    const rows = (
      await as("authenticated", "SELECT design FROM public.storefront_my_gift_cards($1)", [BRAND])
    ).rows;
    expect(
      rows.some((r) => (r.design as { design?: string } | null)?.design === "pattern:black"),
    ).toBe(true);
  });
});
