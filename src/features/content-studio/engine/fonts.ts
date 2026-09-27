/**
 * The typefaces templates draw with. They are the app's own self-hosted fonts
 * (src/fonts.css), so a canvas can use them once they are loaded; each stack
 * ends in a system face so a frame never draws blank.
 */
export const STUDIO_FONTS = {
  /** Headlines in English: the brand's display serif. */
  displayLatin: '"Cormorant Garamond", "Iowan Old Style", Georgia, serif',
  /** Headlines in Arabic: the app's Arabic face. */
  displayArabic: '"Readex Pro", "Tajawal", Tahoma, sans-serif',
  /** Body copy, prices and labels in either language. */
  body: '"Readex Pro", "Plus Jakarta Sans", "Segoe UI", system-ui, sans-serif',
} as const;

/** The display stack for a headline in `lang`. */
export function displayFont(lang: "ar" | "en") {
  return lang === "ar" ? STUDIO_FONTS.displayArabic : STUDIO_FONTS.displayLatin;
}

const FACES = [
  '600 64px "Cormorant Garamond"',
  '400 64px "Readex Pro"',
  '600 64px "Readex Pro"',
  '500 64px "Tajawal"',
];

/**
 * Loads the studio's faces before the first frame is drawn (a canvas does not
 * wait for web fonts). Missing fonts are skipped: the stacks fall back.
 */
export async function loadStudioFonts(fonts: FontFaceSet | undefined = globalThis.document?.fonts) {
  if (!fonts) return;
  await Promise.all(FACES.map((face) => fonts.load(face).catch(() => [])));
}
