/**
 * A picture's real size and kind, read from its first bytes (no image library on the worker):
 * PNG, JPEG, GIF, WebP and ICO (its largest picture). Used where a size must be told truthfully,
 * as a store's home-screen icon in its manifest (`src/lib/storefront-manifest.ts`). Null when the
 * bytes are not one of these, or are cut before the size.
 */

export type ImageFacts = { width: number; height: number; type: string };

const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u16le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u24le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const u32be = (b: Uint8Array, i: number) =>
  ((b[i] << 24) >>> 0) + ((b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]);
const ascii = (b: Uint8Array, i: number, n: number) =>
  String.fromCharCode(...Array.from(b.subarray(i, i + n)));

function png(b: Uint8Array): ImageFacts | null {
  if (b.length < 24 || b[0] !== 0x89 || ascii(b, 1, 3) !== "PNG" || ascii(b, 12, 4) !== "IHDR") {
    return null;
  }
  return { width: u32be(b, 16), height: u32be(b, 20), type: "image/png" };
}

function gif(b: Uint8Array): ImageFacts | null {
  if (b.length < 10 || ascii(b, 0, 3) !== "GIF") return null;
  return { width: u16le(b, 6), height: u16le(b, 8), type: "image/gif" };
}

function webp(b: Uint8Array): ImageFacts | null {
  if (b.length < 30 || ascii(b, 0, 4) !== "RIFF" || ascii(b, 8, 4) !== "WEBP") return null;
  const chunk = ascii(b, 12, 4);
  if (chunk === "VP8X") {
    return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1, type: "image/webp" };
  }
  if (chunk === "VP8L" && b[20] === 0x2f) {
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
      type: "image/webp",
    };
  }
  if (chunk === "VP8 " && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) {
    return {
      width: u16le(b, 26) & 0x3fff,
      height: u16le(b, 28) & 0x3fff,
      type: "image/webp",
    };
  }
  return null;
}

function jpeg(b: Uint8Array): ImageFacts | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    // Fill bytes and markers with no length.
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    // A start of frame (not DHT, JPG or DAC) carries the size.
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { width: u16be(b, i + 7), height: u16be(b, i + 5), type: "image/jpeg" };
    }
    i += 2 + u16be(b, i + 2);
  }
  return null;
}

function ico(b: Uint8Array): ImageFacts | null {
  if (b.length < 6 || u16le(b, 0) !== 0 || u16le(b, 2) !== 1) return null;
  const count = u16le(b, 4);
  let best: ImageFacts | null = null;
  for (let n = 0; n < count && 6 + n * 16 + 16 <= b.length; n += 1) {
    const at = 6 + n * 16;
    const width = b[at] || 256;
    const height = b[at + 1] || 256;
    if (!best || width > best.width) best = { width, height, type: "image/x-icon" };
  }
  return best;
}

export function imageFacts(bytes: Uint8Array): ImageFacts | null {
  return png(bytes) ?? jpeg(bytes) ?? webp(bytes) ?? gif(bytes) ?? ico(bytes);
}
