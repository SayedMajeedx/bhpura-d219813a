import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import migration from "../supabase/migrations/20261120100000_post_kit_store.sql?raw";
import stickers from "../supabase/migrations/20261214100000_post_kit_stickers.sql?raw";

// A store's edited posts and own photos (migration 20261120100000), in a real Postgres, as the
// roles a browser really uses: who reads, who writes, and what a row may hold.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const PURA = "00000000-0000-4000-8000-0000000000a1";
const OTHER = "00000000-0000-4000-8000-0000000000b2";
const USER = {
  owner: "00000000-0000-4000-8000-00000000c001",
  noStudio: "00000000-0000-4000-8000-00000000c002",
  courier: "00000000-0000-4000-8000-00000000c003",
  otherOwner: "00000000-0000-4000-8000-00000000c004",
};

let db: PGlite;

const photoUrl = (brand: string, folder = "post", file = "ab12-cd34.jpg") =>
  `https://media.boutq.store/brands/${brand}/${folder}/${file}`;

/** Runs a statement as a signed-in member, or as a visitor with no id. */
async function as<T>(user: string | null, sql: string, params: unknown[] = []) {
  await db.exec(`SET app.member = '${user ?? ""}'; SET ROLE ${user ? "authenticated" : "anon"};`);
  try {
    return await db.query<T>(sql, params);
  } finally {
    await db.exec("RESET ROLE; RESET app.member;");
  }
}

const refused = async (run: Promise<unknown>) => {
  await expect(run).rejects.toThrow();
};

const editInsert =
  "INSERT INTO public.post_kit_edits (brand_id, post_key, post) VALUES ($1, 'bukra-1', $2)";
const post = JSON.stringify({ key: "bukra-1", caption: "كلام" });

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE public.brands (id uuid PRIMARY KEY);
    CREATE TABLE public.profiles (id uuid PRIMARY KEY, brand_id uuid, role text, permissions jsonb);
    CREATE TABLE public.brand_addons (brand_id uuid, addon_id text, status text);
    GRANT SELECT ON public.brand_addons TO authenticated;
    GRANT SELECT ON public.profiles TO authenticated, anon;
    CREATE SCHEMA auth;
    GRANT USAGE ON SCHEMA auth TO authenticated, anon;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT NULLIF(current_setting('app.member', true), '')::uuid $$;
    CREATE FUNCTION public.can_access_brand(_brand_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
        AND p.role IS DISTINCT FROM 'courier' AND p.brand_id = _brand_id) $$;
    CREATE FUNCTION public.has_permission(p_permission text) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
        AND (p.role = 'brand_admin' OR p.permissions ? p_permission)) $$;
    CREATE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS
      $$ BEGIN NEW.updated_at = clock_timestamp(); RETURN NEW; END $$;
    INSERT INTO public.brands VALUES ('${PURA}'), ('${OTHER}');
    INSERT INTO public.profiles VALUES
      ('${USER.owner}', '${PURA}', 'brand_admin', '[]'),
      ('${USER.noStudio}', '${PURA}', 'staff', '["manage_orders"]'),
      ('${USER.courier}', '${PURA}', 'courier', '["manage_inventory"]'),
      ('${USER.otherOwner}', '${OTHER}', 'brand_admin', '[]');
    INSERT INTO public.brand_addons VALUES ('${PURA}', 'post-kit', 'installed');
  `);
  await db.exec(migration);
  await db.exec(stickers);
});

beforeEach(async () => {
  await db.exec("DELETE FROM public.post_kit_edits; DELETE FROM public.post_kit_photos;");
  await db.exec(`UPDATE public.brand_addons SET status = 'installed'`);
});

describe("who may read and write", () => {
  it("lets the store's studio staff write and read their own posts", async () => {
    await as(USER.owner, editInsert, [PURA, post]);
    const { rows } = await as<{ post_key: string }>(
      USER.owner,
      "SELECT post_key FROM public.post_kit_edits",
    );
    expect(rows.map((row) => row.post_key)).toEqual(["bukra-1"]);
  });

  it("shows another store nothing and lets it change nothing", async () => {
    await as(USER.owner, editInsert, [PURA, post]);
    const seen = await as(USER.otherOwner, "SELECT * FROM public.post_kit_edits");
    expect(seen.rows).toEqual([]);
    await refused(as(USER.otherOwner, editInsert, [PURA, post]));
    const { affectedRows } = await as(USER.otherOwner, "DELETE FROM public.post_kit_edits");
    expect(affectedRows).toBe(0);
    const left = await db.query("SELECT 1 FROM public.post_kit_edits");
    expect(left.rows).toHaveLength(1);
  });

  it("refuses a store that does not have the add-on, on its own rows too", async () => {
    await refused(as(USER.otherOwner, editInsert, [OTHER, post]));
    await refused(
      as(
        USER.otherOwner,
        "INSERT INTO public.post_kit_photos (brand_id, name, url) VALUES ($1, 'x', $2)",
        [OTHER, photoUrl(OTHER)],
      ),
    );
  });

  it("keeps a store's work readable but not writable once the add-on is switched off", async () => {
    await as(USER.owner, editInsert, [PURA, post]);
    await db.exec(`UPDATE public.brand_addons SET status = 'disabled'`);
    const seen = await as(USER.owner, "SELECT * FROM public.post_kit_edits");
    expect(seen.rows).toHaveLength(1);
    const { affectedRows } = await as(USER.owner, "DELETE FROM public.post_kit_edits");
    expect(affectedRows).toBe(0);
  });

  it("holds back staff who cannot open the studio, couriers and visitors", async () => {
    await as(USER.owner, editInsert, [PURA, post]);
    for (const user of [USER.noStudio, USER.courier]) {
      const seen = await as(user, "SELECT * FROM public.post_kit_edits");
      expect(seen.rows).toEqual([]);
      await refused(as(user, editInsert, [PURA, post]));
    }
    await refused(as(null, "SELECT * FROM public.post_kit_edits"));
    await refused(as(null, "SELECT * FROM public.post_kit_photos"));
    await refused(as(null, editInsert, [PURA, post]));
  });
});

describe("what a row may hold", () => {
  it("keeps one row per post, and saving again moves its time", async () => {
    const upsert = `${editInsert} ON CONFLICT (brand_id, post_key) DO UPDATE SET post = EXCLUDED.post
      RETURNING updated_at`;
    const first = await as<{ updated_at: Date }>(USER.owner, upsert, [PURA, post]);
    const second = await as<{ updated_at: Date }>(USER.owner, upsert, [PURA, post]);
    expect(second.rows[0].updated_at.getTime()).toBeGreaterThanOrEqual(
      first.rows[0].updated_at.getTime(),
    );
    expect((await db.query("SELECT 1 FROM public.post_kit_edits")).rows).toHaveLength(1);
  });

  it("refuses a post that names another key, is not an object or is too large", async () => {
    await refused(as(USER.owner, editInsert, [PURA, JSON.stringify({ key: "other" })]));
    await refused(as(USER.owner, editInsert, [PURA, "[1]"]));
    const noise = Array.from({ length: 40_000 }, (_, i) => (i * 7919).toString(36)).join("");
    await refused(as(USER.owner, editInsert, [PURA, JSON.stringify({ key: "bukra-1", noise })]));
  });

  it("takes a photo only from the store's own post folder", async () => {
    const insert =
      "INSERT INTO public.post_kit_photos (brand_id, name, url) VALUES ($1, 'صورتي', $2)";
    await as(USER.owner, insert, [PURA, photoUrl(PURA)]);
    for (const url of [
      photoUrl(OTHER),
      photoUrl(PURA, "product"),
      photoUrl(PURA, "post", "a.svg"),
      photoUrl(PURA).replace("https", "http"),
      `https://evil.example/x?u=${photoUrl(PURA)}`,
      `${photoUrl(PURA)}?track=1`,
    ]) {
      await refused(as(USER.owner, insert, [PURA, url]));
    }
    expect((await db.query("SELECT 1 FROM public.post_kit_photos")).rows).toHaveLength(1);
  });

  it("refuses a photo with no name", async () => {
    await refused(
      as(
        USER.owner,
        "INSERT INTO public.post_kit_photos (brand_id, name, url) VALUES ($1, '  ', $2)",
        [PURA, photoUrl(PURA)],
      ),
    );
  });

  it("goes when its store goes", async () => {
    await as(USER.owner, editInsert, [PURA, post]);
    await db.exec(`DELETE FROM public.brands WHERE id = '${PURA}'`);
    expect((await db.query("SELECT 1 FROM public.post_kit_edits")).rows).toEqual([]);
    await db.exec(`INSERT INTO public.brands VALUES ('${PURA}')`);
  });
});

describe("a sticker cut from a photo (migration 20261214100000)", () => {
  const insert = `INSERT INTO public.post_kit_photos (brand_id, name, url, kind, source_id, width, height)
    VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`;
  const photo = async (brand = PURA, user = USER.owner) =>
    (
      await as<{ id: string }>(user, insert, [
        brand,
        "صورة",
        photoUrl(brand),
        "photo",
        null,
        1200,
        900,
      ])
    ).rows[0].id;

  it("keeps a photo as before, a photo by default", async () => {
    await as(
      USER.owner,
      "INSERT INTO public.post_kit_photos (brand_id, name, url) VALUES ($1, 'قديمة', $2)",
      [PURA, photoUrl(PURA)],
    );
    const { rows } = await db.query<{ kind: string; source_id: string | null }>(
      "SELECT kind, source_id FROM public.post_kit_photos",
    );
    expect(rows).toEqual([{ kind: "photo", source_id: null }]);
  });

  it("keeps a sticker with the photo it came from and its size", async () => {
    const source = await photo();
    await as(USER.owner, insert, [
      PURA,
      "ستيكر",
      photoUrl(PURA, "post", "ab12.png"),
      "sticker",
      source,
      640,
      480,
    ]);
    const { rows } = await as<{ kind: string; source_id: string; width: number }>(
      USER.owner,
      "SELECT kind, source_id, width FROM public.post_kit_photos WHERE kind = 'sticker'",
    );
    expect(rows).toEqual([{ kind: "sticker", source_id: source, width: 640 }]);
  });

  it("refuses a sticker that is not a PNG, an unknown kind and a size out of bounds", async () => {
    const png = photoUrl(PURA, "post", "ab12.png");
    await refused(as(USER.owner, insert, [PURA, "x", photoUrl(PURA), "sticker", null, 10, 10]));
    await refused(as(USER.owner, insert, [PURA, "x", png, "meme", null, 10, 10]));
    await refused(as(USER.owner, insert, [PURA, "x", png, "sticker", null, 0, 10]));
    await refused(as(USER.owner, insert, [PURA, "x", png, "sticker", null, 10, 20000]));
  });

  it("never names another store's photo as its source", async () => {
    await db.exec(`INSERT INTO public.brand_addons VALUES ('${OTHER}', 'post-kit', 'installed')`);
    try {
      const theirs = await photo(OTHER, USER.otherOwner);
      await refused(
        as(USER.owner, insert, [
          PURA,
          "x",
          photoUrl(PURA, "post", "ab12.png"),
          "sticker",
          theirs,
          10,
          10,
        ]),
      );
    } finally {
      await db.exec(`DELETE FROM public.brand_addons WHERE brand_id = '${OTHER}'`);
    }
  });

  it("keeps the sticker when its photo is deleted, and forgets the source", async () => {
    const source = await photo();
    await as(USER.owner, insert, [
      PURA,
      "ستيكر",
      photoUrl(PURA, "post", "ab12.png"),
      "sticker",
      source,
      10,
      10,
    ]);
    await as(USER.owner, "DELETE FROM public.post_kit_photos WHERE id = $1", [source]);
    const { rows } = await db.query<{ kind: string; source_id: string | null }>(
      "SELECT kind, source_id FROM public.post_kit_photos",
    );
    expect(rows).toEqual([{ kind: "sticker", source_id: null }]);
  });
});
