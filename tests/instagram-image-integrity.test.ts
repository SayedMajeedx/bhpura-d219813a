import { describe, expect, it } from "vitest";
import {
  MAX_IMAGE_BYTES,
  isSafeRemoteImageUrl,
  verifyImageIntegrity,
} from "../src/features/instagram-import/lib/image-integrity";

// A picture is only copied to storage when its address is safe and its bytes are really an image.

const bytes = (head: number[], length = 2048, text = "") => {
  const buffer = Buffer.alloc(length, 1);
  Buffer.from(head).copy(buffer);
  if (text) buffer.write(text, 0, "utf8");
  return buffer;
};
const JPEG = [0xff, 0xd8, 0xff];
const PNG = [0x89, 0x50, 0x4e, 0x47];

describe("verifyImageIntegrity", () => {
  it("accepts a JPEG, a PNG and a WebP by their first bytes", () => {
    expect(verifyImageIntegrity(bytes(JPEG), "image/jpeg")).toEqual({ ok: true, extension: "jpg" });
    expect(verifyImageIntegrity(bytes(PNG), "image/png")).toEqual({ ok: true, extension: "png" });
    const webp = bytes([0x52, 0x49, 0x46, 0x46]);
    webp.write("WEBP", 8, "ascii");
    expect(verifyImageIntegrity(webp, "image/webp")).toEqual({ ok: true, extension: "webp" });
  });

  it("refuses a file that is too small to be a picture", () => {
    const result = verifyImageIntegrity(bytes(JPEG, 100), "image/jpeg");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("صغير جداً");
  });

  it("refuses an error page sent with an image header", () => {
    for (const body of [
      "<!DOCTYPE html><html>",
      "<html><body>no",
      "<Error><Code>AccessDenied</Code>",
    ]) {
      const result = verifyImageIntegrity(bytes([], 2048, body), "image/jpeg");
      expect(result.ok).toBe(false);
      expect(result.error).toContain("HTML");
    }
  });

  it("goes by the declared type when the bytes are unfamiliar, and refuses an unknown type", () => {
    expect(verifyImageIntegrity(bytes([0, 0, 0, 0]), "image/jpeg")).toMatchObject({
      ok: true,
      extension: "jpg",
    });
    expect(verifyImageIntegrity(bytes([0, 0, 0, 0]), "image/png")).toMatchObject({
      ok: true,
      extension: "png",
    });
    expect(verifyImageIntegrity(bytes([0, 0, 0, 0]), "image/webp")).toMatchObject({
      ok: true,
      extension: "webp",
    });
    const result = verifyImageIntegrity(bytes([0, 0, 0, 0]), "application/pdf");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("application/pdf");
  });

  it("allows up to twelve megabytes", () => {
    expect(MAX_IMAGE_BYTES).toBe(12 * 1024 * 1024);
  });
});

describe("isSafeRemoteImageUrl", () => {
  it("accepts a public https address", () => {
    expect(isSafeRemoteImageUrl("https://scontent.cdninstagram.com/v/t51/a.jpg?x=1")).toBe(true);
  });

  it("refuses plain http, local and private addresses, and text that is not an address", () => {
    for (const url of [
      "http://scontent.cdninstagram.com/a.jpg",
      "https://localhost/a.jpg",
      "https://printer.local/a.jpg",
      "https://127.0.0.1/a.jpg",
      "https://10.0.0.5/a.jpg",
      "https://192.168.1.9/a.jpg",
      "https://169.254.169.254/latest/meta-data",
      "https://172.16.0.1/a.jpg",
      "https://172.31.255.1/a.jpg",
      "not a url",
      "",
    ]) {
      expect(isSafeRemoteImageUrl(url), url).toBe(false);
    }
    // 172.15 and 172.32 are public.
    expect(isSafeRemoteImageUrl("https://172.15.0.1/a.jpg")).toBe(true);
    expect(isSafeRemoteImageUrl("https://172.32.0.1/a.jpg")).toBe(true);
  });
});
