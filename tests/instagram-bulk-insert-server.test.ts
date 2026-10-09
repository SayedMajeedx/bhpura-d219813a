import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type ServerFn } from "./helpers/server-fn";

// Saving drafts to the store: a post whose product still exists is skipped (never saved twice), a
// post whose product was deleted can be imported again, and each run records which product it made
// from which posts so that stays true later.

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  inserts: [] as { table: string; rows: Row[] }[],
}));

function query(table: string) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    single: async () => ({ data: db.inserts.at(-1)?.rows[0] ?? null, error: null }),
    insert: (rows: Row | Row[]) => {
      const list = Array.isArray(rows) ? rows : [rows];
      if (table === "products") list.forEach((row) => (row.id = `new-${db.inserts.length}`));
      db.inserts.push({ table, rows: list });
      return builder;
    },
    then: (resolve: (value: { data: Row[]; error: null }) => unknown) =>
      resolve({ data: db.tables[table] ?? [], error: null }),
  };
  return builder;
}
const admin = { supabaseAdmin: { from: query } };
vi.mock("../src/integrations/supabase/client.server", () => admin);
vi.mock("@/integrations/supabase/client.server", () => admin);
vi.mock("@tanstack/react-start", async () =>
  (await import("./helpers/server-fn")).serverFnModule(),
);

const { bulkInsertProducts } = (await import("../src/lib/instagram-ai-importer")) as unknown as {
  bulkInsertProducts: ServerFn;
};

const BRAND = "00000000-0000-4000-8000-0000000000b1";
const draft = (id: string, mergedPostIds: string[] = []) => ({
  id,
  url: `https://instagram.com/p/${id}/`,
  isSoldOut: false,
  postType: "image",
  images: [{ url: `${id}.jpg`, r2Url: `r2/${id}.jpg`, isCover: true, status: "success" }],
  coverImageUrl: `r2/${id}.jpg`,
  imageUploadStatus: "all_success",
  title: `Abaya ${id}`,
  price: 28,
  description: "",
  sizes: [],
  colors: [],
  category: null,
  fieldConfidence: { name: 1, price: 1, description: 1, sizes: 1 },
  fieldSources: { name: "ai", price: "ai", description: "ai", sizes: "ai", category: "ai" },
  issues: [],
  mergedPostIds,
});
const save = (products: unknown[]) =>
  bulkInsertProducts({
    data: { brandId: BRAND, products },
    context: fakeSupabase({ rpc: { can_access_brand: true } }),
  }) as Promise<{ successCount: number; skippedCount: number; savedIds: string[] }>;

beforeEach(() => {
  db.tables = {};
  db.inserts = [];
});

describe("bulkInsertProducts: posts imported before", () => {
  it("skips a post whose product is still in the store", async () => {
    db.tables.products = [
      { id: "p-old", created_at: "2026-10-09T06:00:00.000Z", custom_fields: [] },
    ];
    db.tables.import_runs = [
      {
        created_at: "2026-10-09T06:00:01.000Z",
        issues: { imported_post_ids: ["a"], products: [{ product_id: "p-old", post_ids: ["a"] }] },
      },
    ];
    expect(await save([draft("a"), draft("b")])).toEqual({
      successCount: 1,
      skippedCount: 1,
      savedIds: ["b"],
    });
  });

  it("imports a post again once the product made from it was deleted", async () => {
    db.tables.products = [];
    db.tables.import_runs = [
      {
        created_at: "2026-10-09T06:00:01.000Z",
        issues: {
          imported_post_ids: ["a"],
          products: [{ product_id: "p-deleted", post_ids: ["a"] }],
        },
      },
    ];
    expect(await save([draft("a")])).toMatchObject({ successCount: 1, savedIds: ["a"] });
  });

  it("records which product was made from which posts", async () => {
    await save([draft("a", ["b", "c"])]);
    const run = db.inserts.find((entry) => entry.table === "import_runs")?.rows[0] as {
      issues: {
        imported_post_ids: string[];
        products: { product_id: string; post_ids: string[] }[];
      };
    };
    expect(run.issues.imported_post_ids).toEqual(["a", "b", "c"]);
    expect(run.issues.products).toEqual([{ product_id: "new-0", post_ids: ["a", "b", "c"] }]);
  });
});
