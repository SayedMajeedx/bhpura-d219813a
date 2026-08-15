/**
 * Returns either '#ffffff' (white) or '#0f172a' (dark slate)
 * based on the relative luminance / ITU-R BT.709 perceived brightness of the given hex color.
 * Ensures smart, dynamic contrast for buttons and header text.
 */
export function getReadableTextColor(hexColor: string | undefined | null): "#ffffff" | "#0f172a" {
  if (!hexColor) return "#ffffff";
  let hex = hexColor.trim().replace(/^#/, "");
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (hex.length !== 6) return "#ffffff";

  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  if (isNaN(r) || isNaN(g) || isNaN(b)) return "#ffffff";

  // Perceived brightness formula (sRGB relative luminance approximation)
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 160 ? "#0f172a" : "#ffffff";
}
