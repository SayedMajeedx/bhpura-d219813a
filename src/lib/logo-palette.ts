/**
 * logo-palette.ts
 *
 * Client-side color palette extraction and harmonic palette derivation for Boutq OS brands.
 * Pure TypeScript implementation without external dependencies (no ColorThief, no sharp).
 * Works in browser via Canvas and in Node/vitest via pure pixel data.
 */

export type PaletteMood = "dominant" | "muted" | "bold";

export interface ExtractedPalette {
  primary: string;
  secondary: string;
  background: string;
  text: string;
  surface: string;
  accent: string;
  contrastRatio: number;
  mood: PaletteMood;
  swatches: string[];
}

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface HSL {
  h: number; // 0 - 360
  s: number; // 0 - 100
  l: number; // 0 - 100
}

/**
 * Normalizes any hex string into standard #rrggbb format
 */
export function normalizeHex(hex: string): string {
  let clean = hex.trim().replace(/^#/, "");
  if (clean.length === 3) {
    clean = clean
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (clean.length !== 6) {
    return "#000000";
  }
  return `#${clean.toLowerCase()}`;
}

export function hexToRgb(hex: string): RGB {
  const norm = normalizeHex(hex).slice(1);
  return {
    r: parseInt(norm.substring(0, 2), 16) || 0,
    g: parseInt(norm.substring(2, 4), 16) || 0,
    b: parseInt(norm.substring(4, 6), 16) || 0,
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const toHex = (v: number) => clamp(v).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function rgbToHsl(r: number, g: number, b: number): HSL {
  const rNorm = Math.max(0, Math.min(255, r)) / 255;
  const gNorm = Math.max(0, Math.min(255, g)) / 255;
  const bNorm = Math.max(0, Math.min(255, b)) / 255;

  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const delta = max - min;

  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (delta !== 0) {
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    switch (max) {
      case rNorm:
        h = (gNorm - bNorm) / delta + (gNorm < bNorm ? 6 : 0);
        break;
      case gNorm:
        h = (bNorm - rNorm) / delta + 2;
        break;
      case bNorm:
        h = (rNorm - gNorm) / delta + 4;
        break;
    }
    h = Math.round(h * 60);
  }

  return {
    h,
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

export function hslToRgb(h: number, s: number, l: number): RGB {
  const hNorm = ((h % 360) + 360) % 360;
  const sNorm = Math.max(0, Math.min(100, s)) / 100;
  const lNorm = Math.max(0, Math.min(100, l)) / 100;

  if (sNorm === 0) {
    const gray = Math.round(lNorm * 255);
    return { r: gray, g: gray, b: gray };
  }

  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs(((hNorm / 60) % 2) - 1));
  const m = lNorm - c / 2;

  let r1 = 0;
  let g1 = 0;
  let b1 = 0;

  if (hNorm < 60) {
    r1 = c;
    g1 = x;
  } else if (hNorm < 120) {
    r1 = x;
    g1 = c;
  } else if (hNorm < 180) {
    g1 = c;
    b1 = x;
  } else if (hNorm < 240) {
    g1 = x;
    b1 = c;
  } else if (hNorm < 300) {
    r1 = x;
    b1 = c;
  } else {
    r1 = c;
    b1 = x;
  }

  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

export function hslToHex(h: number, s: number, l: number): string {
  const rgb = hslToRgb(h, s, l);
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

/**
 * Calculates WCAG 2.1 relative luminance for an sRGB color.
 */
export function getRelativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const transform = (val: number) => {
    const s = val / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * transform(r) + 0.7152 * transform(g) + 0.0722 * transform(b);
}

/**
 * Calculates WCAG 2.1 contrast ratio between two colors (range: 1.0 - 21.0).
 */
export function getContrastRatio(color1: string, color2: string): number {
  const lum1 = getRelativeLuminance(color1);
  const lum2 = getRelativeLuminance(color2);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  const ratio = (brightest + 0.05) / (darkest + 0.05);
  return Math.round(ratio * 100) / 100;
}

/**
 * Adjusts foreground color lightness until it satisfies minimum WCAG contrast against background (default 4.5:1 for AA body text).
 */
export function ensureContrast(
  foreground: string,
  background: string,
  minRatio: number = 4.5,
): string {
  const currentRatio = getContrastRatio(foreground, background);
  if (currentRatio >= minRatio) {
    return normalizeHex(foreground);
  }

  const bgLum = getRelativeLuminance(background);
  const fgHsl = rgbToHsl(hexToRgb(foreground).r, hexToRgb(foreground).g, hexToRgb(foreground).b);
  const shouldDarken = bgLum > 0.5;

  let bestColor = foreground;
  let bestRatio = currentRatio;

  for (let step = 1; step <= 50; step++) {
    const targetL = shouldDarken
      ? Math.max(0, fgHsl.l - step * 2)
      : Math.min(100, fgHsl.l + step * 2);

    const testHex = hslToHex(fgHsl.h, fgHsl.s, targetL);
    const testRatio = getContrastRatio(testHex, background);

    if (testRatio > bestRatio) {
      bestRatio = testRatio;
      bestColor = testHex;
    }

    if (testRatio >= minRatio) {
      return testHex;
    }

    if (targetL <= 0 || targetL >= 100) {
      break;
    }
  }

  // Fallback if loop ends
  return shouldDarken ? "#1c1917" : "#ffffff";
}

/**
 * Euclidean distance in RGB color space
 */
export function colorDistance(rgb1: RGB, rgb2: RGB): number {
  const dr = rgb1.r - rgb2.r;
  const dg = rgb1.g - rgb2.g;
  const db = rgb1.b - rgb2.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * Modifies an extracted color according to a selected mood
 */
export function adjustMood(hex: string, mood: PaletteMood): string {
  if (mood === "dominant") return normalizeHex(hex);

  const rgb = hexToRgb(hex);
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

  if (mood === "muted") {
    // Reduce saturation by ~20%, slight lightness soften
    const s = Math.max(10, Math.round(hsl.s * 0.75));
    const l = Math.min(90, Math.max(15, Math.round(hsl.l * 1.05)));
    return hslToHex(hsl.h, s, l);
  }

  if (mood === "bold") {
    // Increase saturation by ~15%, slightly deepen lightness for punch
    const s = Math.min(100, Math.round(hsl.s * 1.25) + 5);
    const l = Math.max(15, Math.min(80, Math.round(hsl.l * 0.92)));
    return hslToHex(hsl.h, s, l);
  }

  return normalizeHex(hex);
}

/**
 * Fast histogram-based color quantization from RGBA pixel array
 */
export function quantizePixels(
  pixels: Uint8ClampedArray | number[],
  maxColors: number = 8,
): { color: string; count: number; rgb: RGB }[] {
  const binMap = new Map<number, { rSum: number; gSum: number; bSum: number; count: number }>();
  const totalPixels = pixels.length / 4;

  for (let i = 0; i < pixels.length; i += 4) {
    const a = pixels[i + 3];
    if (a < 128) continue; // Ignore transparent pixels

    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];

    // 5 bits per channel (32 levels per channel, 32768 total buckets)
    const rBin = r >> 3;
    const gBin = g >> 3;
    const bBin = b >> 3;
    const key = (rBin << 10) | (gBin << 5) | bBin;

    const existing = binMap.get(key);
    if (existing) {
      existing.rSum += r;
      existing.gSum += g;
      existing.bSum += b;
      existing.count++;
    } else {
      binMap.set(key, { rSum: r, gSum: g, bSum: b, count: 1 });
    }
  }

  // Convert bins to candidate color list
  const candidates: { rgb: RGB; count: number; hsl: HSL }[] = [];
  for (const bin of binMap.values()) {
    const rgb: RGB = {
      r: Math.round(bin.rSum / bin.count),
      g: Math.round(bin.gSum / bin.count),
      b: Math.round(bin.bSum / bin.count),
    };
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    candidates.push({ rgb, count: bin.count, hsl });
  }

  // Sort descending by frequency
  candidates.sort((a, b) => b.count - a.count);

  // Merge similar colors within threshold
  const merged: { color: string; count: number; rgb: RGB }[] = [];
  const MERGE_THRESHOLD = 30; // RGB Euclidean distance

  for (const candidate of candidates) {
    let absorbed = false;
    for (const group of merged) {
      if (colorDistance(candidate.rgb, group.rgb) < MERGE_THRESHOLD) {
        group.count += candidate.count;
        absorbed = true;
        break;
      }
    }
    if (!absorbed) {
      merged.push({
        color: rgbToHex(candidate.rgb.r, candidate.rgb.g, candidate.rgb.b),
        count: candidate.count,
        rgb: candidate.rgb,
      });
      if (merged.length >= maxColors * 2) break;
    }
  }

  merged.sort((a, b) => b.count - a.count);
  return merged.slice(0, maxColors);
}

/**
 * Derives a full harmonic palette and ensures contrast compliance.
 */
export function derivePalette(
  primaryInput: string,
  secondaryInput?: string,
  mood: PaletteMood = "dominant",
): ExtractedPalette {
  const primary = adjustMood(primaryInput || "#1c1917", mood);
  const primaryRgb = hexToRgb(primary);
  const primaryHsl = rgbToHsl(primaryRgb.r, primaryRgb.g, primaryRgb.b);

  let secondary: string;
  if (secondaryInput && secondaryInput.toLowerCase() !== primary.toLowerCase()) {
    secondary = adjustMood(secondaryInput, mood);
  } else {
    // Generate harmonious accent: complementary or analogous (+30deg hue shift)
    const secHue = (primaryHsl.h + 30) % 360;
    const secSat = Math.max(20, Math.min(80, primaryHsl.s));
    const secLight = primaryHsl.l > 60 ? 35 : 65;
    secondary = hslToHex(secHue, secSat, secLight);
  }

  const background = "#ffffff";
  const surface = "#f9fafb";

  // Text color: dark slate derived with strict contrast >= 4.5:1
  const rawText = primaryHsl.l < 30 ? primary : "#1c1917";
  const text = ensureContrast(rawText, background, 4.5);
  const contrastRatio = getContrastRatio(text, background);

  const accent = secondary;

  return {
    primary,
    secondary,
    background,
    text,
    surface,
    accent,
    contrastRatio,
    mood,
    swatches: [primary, secondary, text, "#78716c", "#e5e7eb", "#ffffff"],
  };
}

/**
 * Extracts palette from raw RGBA image data array.
 * Safe in Node / vitest test runners.
 */
export function extractPaletteFromImageData(
  data: Uint8ClampedArray | number[],
  width: number,
  height: number,
  mood: PaletteMood = "dominant",
): ExtractedPalette {
  const clusters = quantizePixels(data, 10);

  if (clusters.length === 0) {
    return derivePalette("#1c1917", undefined, mood);
  }

  // Filter for candidate primary: prefer non-white, non-black, saturated colors
  const isNeutral = (rgb: RGB) => {
    const { r, g, b } = rgb;
    const isNearWhite = r > 245 && g > 245 && b > 245;
    const isNearBlack = r < 15 && g < 15 && b < 15;
    return isNearWhite || isNearBlack;
  };

  const coloredSwatches = clusters.filter((c) => {
    const hsl = rgbToHsl(c.rgb.r, c.rgb.g, c.rgb.b);
    return !isNeutral(c.rgb) && hsl.s > 10;
  });

  const swatches = clusters.map((c) => c.color);

  let primaryHex: string;
  let secondaryHex: string | undefined;

  if (coloredSwatches.length > 0) {
    primaryHex = coloredSwatches[0].color;
    if (coloredSwatches.length > 1) {
      secondaryHex = coloredSwatches[1].color;
    }
  } else {
    // Pure monochrome / grayscale logo
    const nonWhite = clusters.find((c) => {
      const { r, g, b } = c.rgb;
      return !(r > 245 && g > 245 && b > 245);
    });
    primaryHex = nonWhite ? nonWhite.color : "#1c1917";
  }

  const derived = derivePalette(primaryHex, secondaryHex, mood);
  derived.swatches = swatches.length >= 3 ? swatches : derived.swatches;
  return derived;
}

/**
 * Extracts palette from an image file, blob, URL, or HTMLImageElement in browser environment.
 */
export async function extractLogoPalette(
  source: File | Blob | HTMLImageElement | string,
  mood: PaletteMood = "dominant",
): Promise<ExtractedPalette> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    // SSR / Node fallback
    return derivePalette("#1c1917", undefined, mood);
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    const onImageLoaded = () => {
      try {
        const canvas = document.createElement("canvas");
        const maxDim = 128; // Downsample for fast extraction
        let w = img.naturalWidth || img.width || 128;
        let h = img.naturalHeight || img.height || 128;

        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }

        canvas.width = Math.max(1, w);
        canvas.height = Math.max(1, h);

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(derivePalette("#1c1917", undefined, mood));
          return;
        }

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const palette = extractPaletteFromImageData(
          imageData.data,
          canvas.width,
          canvas.height,
          mood,
        );
        resolve(palette);
      } catch (err) {
        console.warn("Failed to extract palette from image canvas, using fallback:", err);
        resolve(derivePalette("#1c1917", undefined, mood));
      }
    };

    img.onerror = () => {
      resolve(derivePalette("#1c1917", undefined, mood));
    };

    if (typeof source === "string") {
      img.onload = onImageLoaded;
      img.src = source;
    } else if (source instanceof HTMLImageElement) {
      if (source.complete && source.naturalWidth > 0) {
        onImageLoaded();
      } else {
        source.onload = onImageLoaded;
      }
    } else if (source instanceof Blob) {
      const url = URL.createObjectURL(source);
      img.onload = () => {
        onImageLoaded();
        URL.revokeObjectURL(url);
      };
      img.src = url;
    } else {
      resolve(derivePalette("#1c1917", undefined, mood));
    }
  });
}
