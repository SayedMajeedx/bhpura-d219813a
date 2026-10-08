/**
 * Checks on a picture before it is copied to our storage: a safe address, a size within limits, and
 * real image bytes (not an error page that was sent with an image header).
 */

export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MIN_IMAGE_BYTES = 1024; // Must be at least 1KB to ensure it's not a corrupt empty stub or placeholder

export function isSafeRemoteImageUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:") return false;
    if (host === "localhost" || host.endsWith(".local")) return false;
    if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.)/.test(host)) return false;
    const match = host.match(/^172\.(\d+)\./);
    if (match && Number(match[1]) >= 16 && Number(match[1]) <= 31) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates image integrity by checking content-type and magic bytes.
 * Prevents saving HTML error pages or empty placeholders as images.
 */
export function verifyImageIntegrity(
  buffer: Buffer,
  contentType: string,
): { ok: boolean; error?: string; extension: "jpg" | "png" | "webp" } {
  if (buffer.byteLength < MIN_IMAGE_BYTES) {
    return {
      ok: false,
      error: `حجم الملف صغير جداً (${buffer.byteLength} بايت)، قد يكون فارغاً أو تالفاً`,
      extension: "jpg",
    };
  }

  // Check magic bytes
  // JPEG: FF D8 FF
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  // PNG: 89 50 4E 47
  const isPng =
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  // WEBP: RIFF ... WEBP (0x52 0x49 0x46 0x46 ... 0x57 0x45 0x42 0x50)
  const isWebp =
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer.toString("ascii", 8, 12) === "WEBP";

  // Check if buffer starts with '<!doctype' or '<html' (HTML error page disguised as image)
  const headerText = buffer.slice(0, 100).toString("utf8").toLowerCase();
  if (
    headerText.includes("<!doctype") ||
    headerText.includes("<html") ||
    headerText.includes("accessdenied") ||
    headerText.includes("<error>")
  ) {
    return {
      ok: false,
      error: "الملف المستلم هو صفحة HTML أو رسالة خطأ وليس ملف صورة صالح",
      extension: "jpg",
    };
  }

  if (isJpeg) return { ok: true, extension: "jpg" };
  if (isPng) return { ok: true, extension: "png" };
  if (isWebp) return { ok: true, extension: "webp" };

  // Fallback to content-type if magic bytes are slightly off but acceptable
  if (contentType.includes("jpeg") || contentType.includes("jpg")) {
    return { ok: true, extension: "jpg" };
  }
  if (contentType.includes("png")) {
    return { ok: true, extension: "png" };
  }
  if (contentType.includes("webp")) {
    return { ok: true, extension: "webp" };
  }

  return {
    ok: false,
    error: `تنسيق الصورة غير مدعوم (${contentType})`,
    extension: "jpg",
  };
}
