import { describe, expect, it } from "vitest";
import {
  MAX_INVOICE_ASSET_BYTES,
  invoiceAssetAllowed,
  invoiceAssetHosts,
  readCapped,
} from "../src/lib/invoice-asset-rules";

// The invoice's picture proxy is a server function anyone can call: it fetches only from where
// the platform keeps pictures, and never more than a picture's worth of bytes.

const hosts = invoiceAssetHosts({
  supabaseUrl: "https://ourproject.supabase.co",
  mediaBaseUrl: "https://media.boutq.store",
});
const allowed = (url: string) => invoiceAssetAllowed(new URL(url), hosts);

describe("where a picture may come from", () => {
  it("is the media host and this project's own storage", () => {
    expect(allowed("https://media.boutq.store/brands/b/logo.png")).toBe(true);
    expect(
      allowed("https://ourproject.supabase.co/storage/v1/object/public/brand-assets/logo.png"),
    ).toBe(true);
    expect(allowed("https://MEDIA.boutq.store/brands/b/logo.png")).toBe(true);
  });

  it("is not another project's storage, another site, or a look-alike host", () => {
    expect(allowed("https://someoneelse.supabase.co/storage/v1/object/public/x/big.png")).toBe(
      false,
    );
    expect(allowed("https://account.r2.cloudflarestorage.com/bucket/file.png")).toBe(false);
    expect(allowed("https://example.com/logo.png")).toBe(false);
    expect(allowed("https://media.boutq.store.example.com/logo.png")).toBe(false);
    expect(allowed("https://evil-media.boutq.store/logo.png")).toBe(false);
    expect(allowed("http://media.boutq.store/logo.png")).toBe(false);
  });

  it("adds a media host the deployment configures, and ignores a setting that is not an address", () => {
    const custom = invoiceAssetHosts({
      supabaseUrl: "not an address",
      mediaBaseUrl: "https://cdn.example.test/base",
    });
    expect([...custom].sort()).toEqual(["cdn.example.test", "media.boutq.store"]);
    expect([...invoiceAssetHosts({})]).toEqual(["media.boutq.store"]);
  });
});

describe("how much of it is read", () => {
  const picture = (bytes: number, headers: Record<string, string> = {}) =>
    new Response(new Uint8Array(bytes), { headers });

  it("returns a picture's bytes whole", async () => {
    const bytes = await readCapped(new Response(new Uint8Array([1, 2, 3, 4])), 10);
    expect(Array.from(bytes)).toEqual([1, 2, 3, 4]);
    expect((await readCapped(new Response(null), 10)).byteLength).toBe(0);
  });

  it("refuses a file that says it is too large, before reading it", async () => {
    await expect(readCapped(picture(8, { "content-length": "999999" }), 100)).rejects.toThrow(
      /too large/,
    );
  });

  it("stops reading a file that turns out too large without having said so", async () => {
    let sent = 0;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += 1;
        controller.enqueue(new Uint8Array(40));
      },
    });
    await expect(readCapped(new Response(endless), 100)).rejects.toThrow(/too large/);
    // It stopped at the limit: three chunks pass 100 bytes, the stream had no end.
    expect(sent).toBeLessThan(10);
  });

  it("allows a picture up to five megabytes", () => {
    expect(MAX_INVOICE_ASSET_BYTES).toBe(5 * 1024 * 1024);
  });
});
