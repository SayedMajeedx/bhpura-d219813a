import { describe, expect, it } from "vitest";
import { isSafeExternalImageUrl } from "../src/lib/universal-importer";

describe("import center safety", () => {
  it("accepts public HTTPS image URLs", () => {
    expect(isSafeExternalImageUrl("https://cdn.shopify.com/product/image.jpg")).toBe(true);
  });

  it.each([
    "http://cdn.shopify.com/image.jpg",
    "https://localhost/image.jpg",
    "https://127.0.0.1/image.jpg",
    "https://10.0.0.4/image.jpg",
    "https://192.168.1.2/image.jpg",
    "https://172.16.0.2/image.jpg",
    "https://metadata.internal/image.jpg",
  ])("blocks unsafe image destination %s", (url) => {
    expect(isSafeExternalImageUrl(url)).toBe(false);
  });
});
