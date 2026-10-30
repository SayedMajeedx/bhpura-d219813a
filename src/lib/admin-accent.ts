import { contrastRatio, parseCssColor, type Rgb } from "@/lib/hero-contrast";

const WHITE: Rgb = [255, 255, 255];
/** The dark admin's card colour (--card in .dark, flattened). */
const DARK_SURFACE: Rgb = [30, 32, 42];

export type AdminAccent = { primary: string; foreground: string };

/**
 * The store's own colour on the admin's main buttons, links and highlights, over Boutq's ink:
 * Boutq looks like one platform and each merchant still sees their brand. It is used only when it
 * reads as text and carries its button's words (WCAG 4.5:1): on white with white words in the light
 * admin, on the dark surface with dark words in the dark one. A pale or a mid colour that cannot
 * leaves the ink (null), so no store's admin becomes hard to read.
 */
export function adminAccent(
  color: string | null | undefined,
  theme: "light" | "dark",
): AdminAccent | null {
  const rgb = parseCssColor(color);
  if (!rgb || !color) return null;
  if (theme === "light") {
    return contrastRatio(rgb, WHITE) >= 4.5 ? { primary: color, foreground: "#ffffff" } : null;
  }
  return contrastRatio(rgb, DARK_SURFACE) >= 4.5 ? { primary: color, foreground: "#16171d" } : null;
}
