import { describe, expect, it } from "vitest";
import {
  adjustMood,
  derivePalette,
  ensureContrast,
  extractPaletteFromImageData,
  getContrastRatio,
  getRelativeLuminance,
  hexToRgb,
  normalizeHex,
  quantizePixels,
  rgbToHex,
  rgbToHsl,
} from "../src/lib/logo-palette";

describe("Logo Palette & Color Utility", () => {
  it("normalizes hex colors correctly", () => {
    expect(normalizeHex("#fff")).toBe("#ffffff");
    expect(normalizeHex("1a2b3c")).toBe("#1a2b3c");
    expect(normalizeHex("#FFAA00")).toBe("#ffaa00");
    expect(normalizeHex("invalid")).toBe("#000000");
  });

  it("converts hex to rgb and back accurately", () => {
    const rgb = hexToRgb("#8c6d58");
    expect(rgb).toEqual({ r: 140, g: 109, b: 88 });
    expect(rgbToHex(rgb.r, rgb.g, rgb.b)).toBe("#8c6d58");
  });

  it("calculates WCAG 2.1 relative luminance and contrast ratio accurately", () => {
    const blackOnWhite = getContrastRatio("#000000", "#ffffff");
    expect(blackOnWhite).toBe(21);

    const whiteOnWhite = getContrastRatio("#ffffff", "#ffffff");
    expect(whiteOnWhite).toBe(1);

    const ratio = getContrastRatio("#1c1917", "#ffffff");
    expect(ratio).toBeGreaterThan(15);
  });

  it("guarantees WCAG AA minimum contrast >= 4.5:1 via ensureContrast", () => {
    // Light yellow text on white has very low contrast naturally (~1.07)
    const lowContrastYellow = "#fef08a";
    const naturalRatio = getContrastRatio(lowContrastYellow, "#ffffff");
    expect(naturalRatio).toBeLessThan(4.5);

    // ensureContrast darkens it until it satisfies >= 4.5
    const adjusted = ensureContrast(lowContrastYellow, "#ffffff", 4.5);
    const adjustedRatio = getContrastRatio(adjusted, "#ffffff");
    expect(adjustedRatio).toBeGreaterThanOrEqual(4.5);
  });

  it("derives complete harmonic palette with guaranteed contrast", () => {
    const palette = derivePalette("#8c6d58", undefined, "dominant");
    expect(palette.primary).toBe("#8c6d58");
    expect(palette.background).toBe("#ffffff");
    expect(palette.text).toBeDefined();
    expect(palette.contrastRatio).toBeGreaterThanOrEqual(4.5);
    expect(palette.swatches.length).toBeGreaterThanOrEqual(4);
  });

  it("handles mood adjustments for dominant, muted, and bold", () => {
    const baseColor = "#3b82f6"; // Vibrant blue
    const dominant = adjustMood(baseColor, "dominant");
    const muted = adjustMood(baseColor, "muted");
    const bold = adjustMood(baseColor, "bold");

    expect(dominant).toBe(baseColor);
    expect(muted).not.toBe(baseColor);
    expect(bold).not.toBe(baseColor);

    const mutedHsl = rgbToHsl(hexToRgb(muted).r, hexToRgb(muted).g, hexToRgb(muted).b);
    const boldHsl = rgbToHsl(hexToRgb(bold).r, hexToRgb(bold).g, hexToRgb(bold).b);
    const baseHsl = rgbToHsl(hexToRgb(baseColor).r, hexToRgb(baseColor).g, hexToRgb(baseColor).b);

    expect(mutedHsl.s).toBeLessThan(baseHsl.s);
    expect(boldHsl.s).toBeGreaterThanOrEqual(baseHsl.s);
  });

  it("quantizes pixel clusters from simulated image data", () => {
    // Create synthetic 10x10 image: 50 purple pixels, 30 gold pixels, 20 white pixels
    const pixels = new Uint8ClampedArray(10 * 10 * 4);
    for (let i = 0; i < 50; i++) {
      pixels[i * 4] = 128; // R
      pixels[i * 4 + 1] = 0; // G
      pixels[i * 4 + 2] = 128; // B (Purple)
      pixels[i * 4 + 3] = 255;
    }
    for (let i = 50; i < 80; i++) {
      pixels[i * 4] = 212; // R
      pixels[i * 4 + 1] = 175; // G
      pixels[i * 4 + 2] = 55; // B (Gold)
      pixels[i * 4 + 3] = 255;
    }
    for (let i = 80; i < 100; i++) {
      pixels[i * 4] = 255; // White
      pixels[i * 4 + 1] = 255;
      pixels[i * 4 + 2] = 255;
      pixels[i * 4 + 3] = 255;
    }

    const clusters = quantizePixels(pixels, 4);
    expect(clusters.length).toBeGreaterThanOrEqual(2);

    const extracted = extractPaletteFromImageData(pixels, 10, 10, "dominant");
    expect(extracted.primary).toBeDefined();
    expect(extracted.contrastRatio).toBeGreaterThanOrEqual(4.5);
  });

  it("handles monochrome and grayscale images gracefully without crashing", () => {
    // Pure black and white pixels
    const pixels = new Uint8ClampedArray(20 * 4);
    for (let i = 0; i < 10; i++) {
      pixels[i * 4] = 0;
      pixels[i * 4 + 1] = 0;
      pixels[i * 4 + 2] = 0;
      pixels[i * 4 + 3] = 255;
    }
    for (let i = 10; i < 20; i++) {
      pixels[i * 4] = 255;
      pixels[i * 4 + 1] = 255;
      pixels[i * 4 + 2] = 255;
      pixels[i * 4 + 3] = 255;
    }

    const extracted = extractPaletteFromImageData(pixels, 20, 1, "dominant");
    expect(extracted.primary).toBeDefined();
    expect(extracted.contrastRatio).toBeGreaterThanOrEqual(4.5);
  });
});
