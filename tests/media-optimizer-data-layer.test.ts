import { beforeEach, describe, expect, it, vi } from "vitest";

// These tests must never reach a real database: any network call fails loudly.
vi.stubGlobal("fetch", () => {
  throw new Error("Network access is blocked in media optimizer tests");
});

type Request = {
  table: string;
  op: "select" | "update";
  payload?: unknown;
  select?: string;
  filters: Array<[string, ...unknown[]]>;
};
type Reply = { data?: unknown; error: unknown };

const requests: Request[] = [];
let respond: (request: Request) => Reply = () => ({ data: [], error: null });

function builder(table: string) {
  const request: Request = { table, op: "select", filters: [] };
  requests.push(request);
  const record =
    (kind: string) =>
    (...args: unknown[]) => (request.filters.push([kind, ...args]), chain);
  const chain = {
    select(columns: string) {
      request.select = columns;
      return chain;
    },
    update(payload: unknown) {
      request.op = "update";
      request.payload = payload;
      return chain;
    },
    eq: record("eq"),
    order: record("order"),
    single: () => chain,
    then(resolve: (reply: Reply) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve(respond(request)).then(resolve, reject);
    },
  };
  return chain;
}

const client = { supabase: { from: (table: string) => builder(table) } };
vi.mock("../src/integrations/supabase/client", () => client);
vi.mock("@/integrations/supabase/client", () => client);

const optimizer = await import("../src/lib/data/media-optimizer");

const eqs = (request: Request) =>
  request.filters.filter(([k]) => k === "eq").map(([, ...rest]) => rest);
const denied = { message: "denied" };

/** Fixture rows as the sources the list is built from (JSON columns loosely typed). */
const sources = (brands: unknown[], products: unknown[]) =>
  ({ brands, products }) as unknown as import("../src/lib/data/media-optimizer").VideoSources;

beforeEach(() => {
  requests.length = 0;
  respond = () => ({ data: [], error: null });
});

const brand = {
  id: "b1",
  slug: "pura",
  name_en: "Pura",
  name_ar: "بورا",
  hero_media: {
    background: { type: "video", url: "https://cdn/bg.mp4", posterUrl: "https://cdn/bg.jpg" },
    slides: [
      { type: "video", media_url: "https://cdn/s0.mp4", title_en: "Eid" },
      { media_url_ar: "https://cdn/s1-ar.mp4", media_url_en: "https://cdn/s1-en.webm" },
      { media_url: "https://cdn/s2.jpg" },
    ],
  },
};
const product = {
  id: "p1",
  brand_id: "b1",
  name: null,
  name_ar: null,
  name_en: "Silk Abaya",
  media: [
    { type: "image", url: "https://cdn/p.jpg" },
    { type: "video", url: "https://cdn/p.mp4", poster_url: "https://cdn/p.jpg" },
  ],
};

describe("the video sources (bug backlog #26)", () => {
  it("read brands by their real name columns, not a missing `name`", async () => {
    await optimizer.fetchVideoSources();
    const brandsRead = requests.find((r) => r.table === "brands");
    expect(brandsRead?.select).toBe("id, slug, name_en, name_ar, hero_media");
    expect(brandsRead?.select).not.toMatch(/(^|, )name(,|$)/);
    expect(brandsRead?.filters).toEqual([["order", "name_en", { ascending: true }]]);
  });

  it("throw when either read fails", async () => {
    respond = (request) => (request.table === "products" ? { error: denied } : { data: [] });
    await expect(optimizer.fetchVideoSources()).rejects.toBe(denied);
  });
});

describe("listing the videos", () => {
  it("finds hero backgrounds, slide videos per language and product videos", () => {
    const entries = optimizer.listVideoEntries(sources([brand], [product]), "en");
    expect(entries.map((e) => [e.id, e.videoUrl])).toEqual([
      ["brand-b1-bg", "https://cdn/bg.mp4"],
      ["brand-b1-slide-0-def", "https://cdn/s0.mp4"],
      ["brand-b1-slide-1-ar", "https://cdn/s1-ar.mp4"],
      ["brand-b1-slide-1-en", "https://cdn/s1-en.webm"],
      ["prod-p1-media-1", "https://cdn/p.mp4"],
    ]);
    expect(entries[0]).toMatchObject({ brandName: "Pura", brandSlug: "pura" });
    expect(entries[4]).toMatchObject({
      sourceType: "product",
      title: "Product: Silk Abaya (#2)",
      meta: { productId: "p1", mediaIndex: 1 },
    });
  });

  it("names brands in the viewer's language", () => {
    const [first] = optimizer.listVideoEntries(sources([brand], []), "ar");
    expect(first.brandName).toBe("بورا");
    const [fallback] = optimizer.listVideoEntries(sources([{ ...brand, name_ar: null }], []), "ar");
    expect(fallback.brandName).toBe("Pura");
  });
});

describe("replacing a video with its optimized copy", () => {
  const video = { videoUrl: "https://cdn/new.mp4", posterUrl: "https://cdn/new.jpg" };

  it("swaps the right slide field for the slide's language and keeps the rest of the hero", () => {
    const hero = brand.hero_media;
    const next = optimizer.heroWithOptimizedVideo(
      hero,
      { sourceType: "hero_slide", meta: { slideIndex: 1, slideLang: "ar" } },
      video,
    );
    expect(next?.background).toEqual(hero.background);
    expect(next?.slides?.[1]).toEqual({
      ...hero.slides[1],
      media_url: video.videoUrl,
      media_url_ar: video.videoUrl,
      media_poster_url: video.posterUrl,
      media_poster_url_ar: video.posterUrl,
    });
    expect(
      optimizer.heroWithOptimizedVideo(
        hero,
        { sourceType: "hero_slide", meta: { slideIndex: 9 } },
        video,
      ),
    ).toBeNull();
  });

  it("never writes the hero when reading it failed (it used to overwrite the slides)", async () => {
    respond = () => ({ data: null, error: denied });
    const [bg] = optimizer.listVideoEntries(sources([brand], []), "en");
    await expect(optimizer.replaceHeroVideo(bg, video)).rejects.toBe(denied);
    expect(requests.map((r) => r.op)).toEqual(["select"]);
  });

  it("writes the new background into the brand's hero and throws a failed write", async () => {
    respond = (request) =>
      request.op === "select"
        ? { data: { hero_media: brand.hero_media }, error: null }
        : { error: null };
    const [bg] = optimizer.listVideoEntries(sources([brand], []), "en");
    await optimizer.replaceHeroVideo(bg, video);
    const write = requests[1];
    expect(write).toMatchObject({ table: "brands", op: "update" });
    expect(eqs(write)).toEqual([["id", "b1"]]);
    expect(
      (write.payload as { hero_media: { background: unknown; slides: unknown[] } }).hero_media,
    ).toMatchObject({
      background: { type: "video", url: video.videoUrl, posterUrl: video.posterUrl },
      slides: brand.hero_media.slides,
    });

    requests.length = 0;
    respond = (request) =>
      request.op === "select"
        ? { data: { hero_media: brand.hero_media }, error: null }
        : { error: denied };
    await expect(optimizer.replaceHeroVideo(bg, video)).rejects.toBe(denied);
  });

  it("updates a product video within the product's brand", async () => {
    respond = (request) =>
      request.op === "select" ? { data: { media: product.media }, error: null } : { error: null };
    const [entry] = optimizer
      .listVideoEntries(sources([brand], [product]), "en")
      .filter((e) => e.sourceType === "product");
    await optimizer.replaceProductVideo(entry, video);
    expect(eqs(requests[0])).toEqual([
      ["id", "p1"],
      ["brand_id", "b1"],
    ]);
    expect(requests[1]).toMatchObject({ table: "products", op: "update" });
    expect(eqs(requests[1])).toEqual([
      ["id", "p1"],
      ["brand_id", "b1"],
    ]);
    expect((requests[1].payload as { media: unknown[] }).media[1]).toEqual({
      type: "video",
      url: video.videoUrl,
      poster_url: video.posterUrl,
    });
  });
});
