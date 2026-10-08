import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type ServerFn } from "./helpers/server-fn";

// The server copies a batch of posts' pictures to storage: each picture is checked, a failed one
// is marked (not fatal), a post's pictures are copied together, and only people who can reach the
// brand may do it.

const stubs = vi.hoisted(() => ({ send: vi.fn(), active: 0, most: 0 }));
vi.mock("@tanstack/react-start", async () =>
  (await import("./helpers/server-fn")).serverFnModule(),
);
const r2 = {
  r2Client: () => ({
    client: { send: stubs.send },
    bucket: "bucket",
    publicBaseUrl: "https://media.test",
  }),
};
vi.mock("../src/lib/r2-upload.functions", () => r2);
vi.mock("@/lib/r2-upload.functions", () => r2);

const { batchRehostAllMedia } = (await import("../src/lib/instagram-ai-importer")) as unknown as {
  batchRehostAllMedia: ServerFn;
};

const BRAND = "00000000-0000-4000-8000-0000000000b1";
const JPEG = new Uint8Array(2048).map((_, i) =>
  i === 0 ? 0xff : i === 1 ? 0xd8 : i === 2 ? 0xff : 1,
);

const image = (url: string, over: Record<string, unknown> = {}) => ({
  url,
  r2Url: null,
  isCover: false,
  status: "pending",
  ...over,
});
const post = (id: string, images: ReturnType<typeof image>[]) => ({
  id,
  url: `https://instagram.com/p/${id}/`,
  images,
  coverImageUrl: "",
  caption: "",
  isSoldOut: false,
  date: "2026-10-01",
  postType: "carousel",
});

function serve(answers: Record<string, number>) {
  stubs.active = 0;
  stubs.most = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      stubs.active++;
      stubs.most = Math.max(stubs.most, stubs.active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      stubs.active--;
      const status = answers[url] ?? 200;
      return new Response(status === 200 ? JPEG : "no", {
        status,
        headers: { "content-type": "image/jpeg" },
      });
    }),
  );
}

const caller = (allowed = true) => fakeSupabase({ rpc: { can_access_brand: allowed } });

beforeEach(() => {
  vi.clearAllMocks();
  stubs.send.mockResolvedValue({});
});

describe("batchRehostAllMedia", () => {
  it("copies every picture of a post together, keeps their order, and picks the cover", async () => {
    serve({});
    const { posts } = (await batchRehostAllMedia({
      data: {
        brandId: BRAND,
        posts: [
          post("p1", [
            image("https://cdn.test/a.jpg", { isCover: true }),
            image("https://cdn.test/b.jpg"),
            image("https://cdn.test/c.jpg"),
          ]),
        ],
      },
      context: caller(),
    })) as {
      posts: Array<{
        images: Array<{ url: string; status: string; r2Url: string | null; selected: boolean }>;
        coverImageUrl: string;
      }>;
    };

    expect(posts[0].images.map((i) => i.url)).toEqual([
      "https://cdn.test/a.jpg",
      "https://cdn.test/b.jpg",
      "https://cdn.test/c.jpg",
    ]);
    expect(posts[0].images.every((i) => i.status === "success" && i.selected)).toBe(true);
    expect(posts[0].coverImageUrl).toBe(posts[0].images[0].r2Url);
    expect(posts[0].coverImageUrl).toMatch(
      new RegExp(`^https://media.test/brands/${BRAND}/product/`),
    );
    expect(stubs.send).toHaveBeenCalledTimes(3);
    // They are copied at the same time, not one after another.
    expect(stubs.most).toBe(3);
  });

  it("marks a picture that cannot be copied as failed and not selected, and copies the rest", async () => {
    serve({ "https://cdn.test/bad.jpg": 404 });
    const { posts } = (await batchRehostAllMedia({
      data: {
        brandId: BRAND,
        posts: [
          post("p1", [
            image("https://cdn.test/ok.jpg", { isCover: true }),
            image("https://cdn.test/bad.jpg"),
            image("http://insecure.test/x.jpg"),
          ]),
        ],
      },
      context: caller(),
    })) as {
      posts: Array<{ images: Array<{ status: string; selected: boolean; errorMessage?: string }> }>;
    };
    const [ok, bad, insecure] = posts[0].images;
    expect(ok.status).toBe("success");
    expect(bad).toMatchObject({ status: "failed", selected: false });
    expect(bad.errorMessage).toContain("404");
    expect(insecure.status).toBe("failed");
    expect(stubs.send).toHaveBeenCalledTimes(1);
  });

  it("does not copy a picture that is already in storage", async () => {
    serve({});
    const stored = image("https://cdn.test/a.jpg", {
      r2Url: "https://media.test/a.jpg",
      status: "success",
    });
    await batchRehostAllMedia({
      data: { brandId: BRAND, posts: [post("p1", [stored])] },
      context: caller(),
    });
    expect(stubs.send).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("is only for people who can reach the brand", async () => {
    serve({});
    await expect(
      batchRehostAllMedia({
        data: { brandId: BRAND, posts: [post("p1", [image("https://cdn.test/a.jpg")])] },
        context: caller(false),
      }),
    ).rejects.toThrow("UNAUTHORIZED");
    expect(stubs.send).not.toHaveBeenCalled();
  });
});
