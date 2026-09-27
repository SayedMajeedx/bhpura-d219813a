/** The content studio's social formats, at the size each platform expects. */
export const CREATIVE_FORMATS = {
  story: { ar: "ستوري", en: "Story", width: 1080, height: 1920, ratio: "aspect-[9/16]" },
  portrait: { ar: "بوست 4:5", en: "Post 4:5", width: 1080, height: 1350, ratio: "aspect-[4/5]" },
  square: { ar: "مربع", en: "Square", width: 1080, height: 1080, ratio: "aspect-square" },
} as const;

export type CreativeFormat = keyof typeof CREATIVE_FORMATS;

/** `<brand>-<product>-<format>.<ext>`, lower-case, spaces as dashes. */
export function creativeFileName(
  brandSlug: string,
  productName: string | null | undefined,
  format: CreativeFormat,
  extension: string,
): string {
  return `${brandSlug}-${productName || "creative"}-${format}.${extension}`
    .replace(/\s+/g, "-")
    .toLowerCase();
}

/**
 * Hands an exported creative to the merchant: the phone's share sheet when it
 * can take files (so it can go straight to Instagram or the photo library),
 * otherwise a download. A share the merchant cancels is not a failure.
 */
export async function deliverCreativeFile(
  blob: Blob,
  fileName: string,
  mimeType: string,
  title: string,
): Promise<"shared" | "downloaded" | "cancelled"> {
  const file = new File([blob], fileName, { type: mimeType });
  const isMobileDevice = window.matchMedia("(pointer: coarse)").matches && window.innerWidth < 900;
  const canShareFile =
    isMobileDevice &&
    typeof navigator.share === "function" &&
    navigator.canShare?.({ files: [file] });

  if (canShareFile) {
    try {
      await navigator.share({ files: [file], title });
      return "shared";
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === "AbortError") {
        return "cancelled";
      }
      console.warn("Native file sharing was unavailable; using download fallback", shareError);
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = fileName;
  link.href = url;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return "downloaded";
}
