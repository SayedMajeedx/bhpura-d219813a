import * as React from "react";

export type ImagePixels = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  /** The picture's own width / height. */
  aspect: number;
};

/** Wide enough to tell a light floor from a dark dress, small enough to read at once. */
const SAMPLE_WIDTH = 96;

/**
 * A small copy of a picture's pixels, for the hero's contrast check. The media host lets any page
 * read its files (CORS); a picture that cannot be read leaves the check silent.
 */
export function useImagePixels(url: string | null): ImagePixels | null {
  const [pixels, setPixels] = React.useState<ImagePixels | null>(null);
  React.useEffect(() => {
    setPixels(null);
    if (!url || typeof Image === "undefined") return;
    let cancelled = false;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => {
      if (cancelled || !image.naturalWidth || !image.naturalHeight) return;
      const aspect = image.naturalWidth / image.naturalHeight;
      const width = SAMPLE_WIDTH;
      const height = Math.max(1, Math.round(width / aspect));
      try {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return;
        context.drawImage(image, 0, 0, width, height);
        setPixels({ data: context.getImageData(0, 0, width, height).data, width, height, aspect });
      } catch {
        // A picture served without CORS cannot be read: no check rather than a wrong one.
      }
    };
    image.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);
  return pixels;
}
