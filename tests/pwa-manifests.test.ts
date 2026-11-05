import { describe, expect, it } from "vitest";
import { imageFacts } from "../src/lib/image-size";
import { manifestIcon, storefrontManifest } from "../src/lib/storefront-manifest";
import adminManifestText from "../public/admin-app/manifest.webmanifest?raw";

// The PWA review of 2026-11-05: a store's manifest declared a 512px icon that was 192px (Pura's),
// started outside its own scope, had no identity, locked tablets to portrait, gave every store
// Pura's maroon when it chose no colour, and named the store in Arabic for English readers; the
// admin's maskable icon was its plain icon, its corner touching Android's circle crop.

const png = (w: number, h: number) => {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, w);
  new DataView(b.buffer).setUint32(20, h);
  return b;
};
const jpeg = (w: number, h: number) =>
  new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xe0,
    0x00,
    0x04,
    0x4a,
    0x46,
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    h >> 8,
    h & 255,
    w >> 8,
    w & 255,
    0x03,
    0,
    0,
    0,
    0,
    0,
    0,
  ]);
const gif = (w: number, h: number) =>
  new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, w & 255, w >> 8, h & 255, h >> 8]);
const webpX = (w: number, h: number) => {
  const b = new Uint8Array(30);
  b.set([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBPVP8X")]);
  const put24 = (at: number, v: number) => b.set([v & 255, (v >> 8) & 255, (v >> 16) & 255], at);
  put24(24, w - 1);
  put24(27, h - 1);
  return b;
};
const ico = (...sizes: number[]) => {
  const b = new Uint8Array(6 + sizes.length * 16);
  b.set([0, 0, 1, 0, sizes.length, 0]);
  sizes.forEach((s, n) => b.set([s % 256, s % 256], 6 + n * 16));
  return b;
};

describe("a picture's real size", () => {
  it("is read from its first bytes", () => {
    expect(imageFacts(png(192, 192))).toEqual({ width: 192, height: 192, type: "image/png" });
    expect(imageFacts(jpeg(512, 400))).toEqual({ width: 512, height: 400, type: "image/jpeg" });
    expect(imageFacts(gif(64, 64))).toEqual({ width: 64, height: 64, type: "image/gif" });
    expect(imageFacts(webpX(1024, 1024))).toEqual({
      width: 1024,
      height: 1024,
      type: "image/webp",
    });
    // An icon file: its largest picture (0 is 256).
    expect(imageFacts(ico(16, 48, 0))).toEqual({ width: 256, height: 256, type: "image/x-icon" });
    expect(imageFacts(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(imageFacts(png(192, 192).subarray(0, 20))).toBeNull();
  });
});

describe("a store's home-screen icon", () => {
  const tile = "https://media.boutq.store/favicon.png";
  const wordmark = "https://media.boutq.store/logo.png";

  it("says its real size and kind, never one it does not have", () => {
    expect(
      manifestIcon([{ src: tile, facts: { width: 192, height: 192, type: "image/png" } }]),
    ).toEqual({ src: tile, sizes: "192x192", type: "image/png", purpose: "any" });
  });

  it("is the first square picture big enough to install, else the best there is", () => {
    const small = { src: tile, facts: { width: 32, height: 32, type: "image/x-icon" } };
    const wide = { src: wordmark, facts: { width: 800, height: 200, type: "image/png" } };
    const big = {
      src: "https://media.boutq.store/b.webp",
      facts: { width: 512, height: 512, type: "image/webp" },
    };
    expect(manifestIcon([small, wide, big]).src).toBe(big.src);
    expect(manifestIcon([wide, small]).src).toBe(small.src);
    expect(manifestIcon([wide]).sizes).toBe("800x200");
    // Nothing could be read: the platform's own picture.
    expect(manifestIcon([{ src: tile, facts: null }]).src).toBe(
      "https://boutq.store/placeholder.svg",
    );
  });
});

describe("a store's manifest", () => {
  const icon = manifestIcon([]);
  const brand = { slug: "pura", name_ar: "بيورا لاين", name_en: "Pura Line" };

  it("has an identity and a scope its start lies in, and no orientation lock", () => {
    const m = storefrontManifest({ brand, settings: null, icon, lang: "ar" });
    expect(m.id).toBe("/pura");
    expect(m.scope).toBe("/pura");
    expect(m.start_url.startsWith(m.scope)).toBe(true);
    expect(m).not.toHaveProperty("orientation");
  });

  it("speaks the page's language", () => {
    const ar = storefrontManifest({ brand, settings: null, icon, lang: "ar" });
    expect([ar.name, ar.short_name, ar.lang, ar.dir]).toEqual([
      "بيورا لاين",
      "بيورا لاين",
      "ar",
      "rtl",
    ]);
    const en = storefrontManifest({ brand, settings: null, icon, lang: "en" });
    expect([en.name, en.lang, en.dir, en.start_url]).toEqual([
      "Pura Line",
      "en",
      "ltr",
      "/pura?lang=en",
    ]);
  });

  it("wears the store's own header colour, and no other store's when it chose none", () => {
    expect(
      storefrontManifest({ brand, settings: { header_bg: "#330a0a" }, icon, lang: "ar" })
        .theme_color,
    ).toBe("#330a0a");
    const plain = storefrontManifest({ brand, settings: null, icon, lang: "ar" });
    expect(plain.theme_color).toBe("#ffffff");
    expect(plain.background_color).toBe("#ffffff");
  });
});

describe("the admin's manifest", () => {
  const manifest = JSON.parse(adminManifestText) as {
    icons: Array<{ src: string; purpose: string }>;
  };

  it("has a maskable icon of its own, drawn inside the safe circle", () => {
    const maskable = manifest.icons.find((i) => i.purpose === "maskable");
    expect(maskable?.src).toBe("/admin-app/icon-maskable-512.png");
    expect(manifest.icons.filter((i) => i.purpose === "any").map((i) => i.src)).not.toContain(
      maskable?.src,
    );
  });
});
