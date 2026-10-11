import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type ServerFn } from "./helpers/server-fn";

// A stored picture is never left dangling. A file can be pointed at from a product's main
// picture, its gallery, a video's poster and a variant: the server keeps a file that anything
// still points at, and removing a gallery picture clears the variants that were given it.

const stubs = vi.hoisted(() => ({
  storage: vi.fn(async () => new Response(null, { status: 204 })),
  clearVariantPictures: vi.fn(async () => undefined),
  deletePublicMediaUrl: vi.fn(async () => undefined),
  uploadPublicMedia: vi.fn(async () => "https://media.test/brands/b/product/new.jpg"),
}));
vi.mock("@tanstack/react-start", async () =>
  (await import("./helpers/server-fn")).serverFnModule(),
);
vi.mock("aws4fetch", () => ({
  AwsClient: class {
    fetch = stubs.storage;
    sign = vi.fn();
  },
}));
const authMiddleware = { requireSupabaseAuth: {} };
vi.mock("../src/integrations/supabase/auth-middleware", () => authMiddleware);
vi.mock("@/integrations/supabase/auth-middleware", () => authMiddleware);
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const BRAND = "00000000-0000-4000-8000-0000000000b1";
const BASE = "https://media.test";
const key = (file: string, kind = "product") => `brands/${BRAND}/${kind}/${file}`;
const url = (file: string, kind = "product") => `${BASE}/${key(file, kind)}`;

// Test storage settings; nothing here reaches a real bucket.
(globalThis as Record<string, unknown>).__CLOUDFLARE_ENV__ = {
  R2_ACCOUNT_ID: "test-account",
  R2_ACCESS_KEY_ID: "test-key",
  R2_SECRET_ACCESS_KEY: "test-secret",
  R2_BUCKET_NAME: "bucket",
  R2_PUBLIC_BASE_URL: BASE,
};

const { productPictureInUse, isProductPictureKey } = await import("../src/lib/product-picture-use");
const { deleteR2Object } = (await vi.importActual("../src/lib/r2-upload.functions")) as unknown as {
  deleteR2Object: ServerFn;
};

type Filters = Array<[string, unknown]>;
/** A store where `used` says who points at a picture: its variants, main pictures, galleries. */
function store(used: {
  variant?: string[];
  main?: string[];
  gallery?: string[];
  poster?: string[];
}) {
  const has = (list: string[] | undefined, value: unknown) => (list ?? []).includes(String(value));
  return fakeSupabase({
    rpc: { can_access_brand: true },
    rows: {
      product_variants: (filters: Filters) =>
        filters.some(([column, value]) => column === "image_url" && has(used.variant, value))
          ? [{ id: "v1" }]
          : [],
      products: (filters: Filters) =>
        filters.some(([column, value]) => {
          if (column === "image_url") return has(used.main, value);
          if (column !== "media") return false;
          const [entry] = value as Array<{ url?: string; poster_url?: string }>;
          return has(used.gallery, entry.url) || has(used.poster, entry.poster_url);
        })
          ? [{ id: "p1" }]
          : [],
    },
  });
}

beforeEach(() => Object.values(stubs).forEach((stub) => stub.mockClear()));

describe("whether a picture is still used", () => {
  const file = url("a.jpg");

  it("by a variant, a product's main picture, its gallery, or a video's poster", async () => {
    expect(await productPictureInUse(store({ variant: [file] }).supabase, BRAND, file)).toBe(true);
    expect(await productPictureInUse(store({ main: [file] }).supabase, BRAND, file)).toBe(true);
    expect(await productPictureInUse(store({ gallery: [file] }).supabase, BRAND, file)).toBe(true);
    expect(await productPictureInUse(store({ poster: [file] }).supabase, BRAND, file)).toBe(true);
  });

  it("not when nothing points at it", async () => {
    expect(
      await productPictureInUse(store({ gallery: [url("b.jpg")] }).supabase, BRAND, file),
    ).toBe(false);
  });

  it("only looks inside the store it belongs to", async () => {
    const { supabase, queries } = store({});
    await productPictureInUse(supabase, BRAND, file);
    expect(queries).toHaveLength(4);
    for (const query of queries) expect(query.filters).toContainEqual(["brand_id", BRAND]);
  });

  it("counts as used when the lookup fails: a kept file costs storage, a deleted one breaks a page", async () => {
    const failing = {
      from: () => {
        throw new Error("network");
      },
    };
    expect(await productPictureInUse(failing, BRAND, file)).toBe(true);
    const erroring = {
      from: () => {
        const chain = {
          select: () => chain,
          eq: () => chain,
          contains: () => chain,
          limit: () => chain,
          then: (resolve: (value: unknown) => unknown) =>
            resolve({ data: null, error: { message: "denied" } }),
        };
        return chain;
      },
    };
    expect(await productPictureInUse(erroring, BRAND, file)).toBe(true);
  });

  it("knows a product picture by where it is stored", () => {
    expect(isProductPictureKey(key("a.jpg"))).toBe(true);
    expect(isProductPictureKey(key("a.pdf", "expense-receipt"))).toBe(false);
    expect(isProductPictureKey("product/a.jpg")).toBe(false);
  });
});

describe("deleting a stored file", () => {
  const remove = (file: string, supabase: unknown, kind = "product") =>
    deleteR2Object({ data: { brandId: BRAND, key: key(file, kind) }, context: { supabase } });

  it("keeps a product picture a variant still points at", async () => {
    const result = await remove("a.jpg", store({ variant: [url("a.jpg")] }).supabase);
    expect(result).toEqual({ deleted: false, inUse: true });
    expect(stubs.storage).not.toHaveBeenCalled();
  });

  it("keeps a picture another product's gallery still shows (a duplicated product)", async () => {
    const result = await remove("a.jpg", store({ gallery: [url("a.jpg")] }).supabase);
    expect(result).toEqual({ deleted: false, inUse: true });
    expect(stubs.storage).not.toHaveBeenCalled();
  });

  it("deletes a product picture nothing points at", async () => {
    const result = await remove("a.jpg", store({}).supabase);
    expect(result).toEqual({ deleted: true, inUse: false });
    expect(stubs.storage).toHaveBeenCalledTimes(1);
    expect(stubs.storage.mock.calls[0]).toEqual([
      expect.stringContaining(`/bucket/brands/${BRAND}/product/a.jpg`),
      { method: "DELETE" },
    ]);
  });

  it("does not ask about other kinds of file", async () => {
    const { supabase, queries } = store({});
    await remove("receipt.pdf", supabase, "expense-receipt");
    expect(queries).toHaveLength(0);
    expect(stubs.storage).toHaveBeenCalledTimes(1);
  });

  it("refuses a file of another store, and a caller who cannot reach the store", async () => {
    const other = "00000000-0000-4000-8000-0000000000b2";
    await expect(
      deleteR2Object({
        data: { brandId: BRAND, key: `brands/${other}/product/a.jpg` },
        context: { supabase: store({}).supabase },
      }),
    ).rejects.toThrow("INVALID_OBJECT_KEY");
    const stranger = fakeSupabase({ rpc: { can_access_brand: false } }).supabase;
    await expect(remove("a.jpg", stranger)).rejects.toThrow("FORBIDDEN");
    expect(stubs.storage).not.toHaveBeenCalled();
  });
});

describe("removing a gallery picture in the product editor", () => {
  const catalog = { clearVariantPictures: stubs.clearVariantPictures };
  vi.doMock("../src/lib/data/catalog", () => catalog);
  vi.doMock("@/lib/data/catalog", () => catalog);
  const storageClient = {
    deletePublicMediaUrl: stubs.deletePublicMediaUrl,
    uploadPublicMedia: stubs.uploadPublicMedia,
  };
  vi.doMock("../src/lib/r2-upload", () => storageClient);
  vi.doMock("@/lib/r2-upload", () => storageClient);

  const A = url("a.jpg");
  const B = url("b.jpg");
  async function editor() {
    const { useProductMedia } = await import("../src/features/inventory/hooks/use-product-media");
    return renderHook(() => {
      const [form, setForm] = useState({
        media: [
          { type: "image", url: A },
          { type: "image", url: B },
        ],
      });
      return useProductMedia(BRAND, form as never, setForm as never, false);
    });
  }

  it("clears the variants that were given the picture, then deletes the file, after the save", async () => {
    const { result } = await editor();
    act(() => result.current.removeMedia(0));
    // Nothing happens until the product is saved.
    expect(stubs.clearVariantPictures).not.toHaveBeenCalled();
    expect(stubs.deletePublicMediaUrl).not.toHaveBeenCalled();

    await act(() => result.current.commitMedia("p1"));
    expect(stubs.clearVariantPictures).toHaveBeenCalledWith(BRAND, "p1", [A]);
    expect(stubs.deletePublicMediaUrl).toHaveBeenCalledWith(BRAND, A);
    expect(stubs.clearVariantPictures.mock.invocationCallOrder[0]).toBeLessThan(
      stubs.deletePublicMediaUrl.mock.invocationCallOrder[0],
    );
  });

  it("touches nothing when no picture was removed", async () => {
    const { result } = await editor();
    await act(() => result.current.commitMedia("p1"));
    expect(stubs.clearVariantPictures).not.toHaveBeenCalled();
    expect(stubs.deletePublicMediaUrl).not.toHaveBeenCalled();
  });

  it("still asks for the file to be deleted when clearing the variants fails (the server decides)", async () => {
    stubs.clearVariantPictures.mockRejectedValueOnce(new Error("offline"));
    const { result } = await editor();
    act(() => result.current.removeMedia(1));
    await act(() => result.current.commitMedia("p1"));
    expect(stubs.deletePublicMediaUrl).toHaveBeenCalledWith(BRAND, B);
  });
});
