import { THEMES } from "@/features/content-studio/lib/studio-content";

/**
 * The content studio's colour styles: two made from the store's own colours
 * (the ones its storefront wears), then the studio's three editorial looks.
 * Pure, so the colours a store gets can be checked without a screen.
 */

/** One colour style: the ground, the ink set on it, a detail colour and the HTML stage's panel. */
export type StudioStyle = {
  ar: string;
  en: string;
  bg: string;
  ink: string;
  /** Rules, small labels and badges: visible on the ground, never body text. */
  accent: string;
  /** The ink at low contrast. */
  muted: string;
  /** The classic stage's text panel over a photo. */
  panel: string;
};

export type StyleKey = "store" | "store-bold" | keyof typeof THEMES;

/** The order the picker shows them: the store's own first. */
export const STYLE_KEYS: readonly StyleKey[] = [
  "store",
  "store-bold",
  "editorial",
  "maison",
  "minimal",
];

export const DEFAULT_STYLE: StyleKey = "store";

export function isStyleKey(value: unknown): value is StyleKey {
  return typeof value === "string" && (STYLE_KEYS as readonly string[]).includes(value);
}

/** The store's colours as its storefront sets them; any may be missing. */
export type StoreColours = {
  accent: string | null | undefined;
  background: string | null | undefined;
  text: string | null | undefined;
};

/** The storefront's own fallback when a store has chosen no colour. */
const FALLBACK_ACCENT = "#3f121a";
/** Text must reach this contrast with its ground (WCAG AA). */
const READABLE = 4.5;
/** A rule or badge must at least be seen against its ground. */
const VISIBLE = 1.6;

type Rgb = [number, number, number];

function parse(color: string | null | undefined): Rgb | null {
  const hex = (color ?? "").trim().replace(/^#/, "");
  if (!/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) return null;
  const full = hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as Rgb;
}

function hex(rgb: Rgb): string {
  return `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

function rgba(color: string, alpha: number): string {
  const rgb = parse(color) ?? [0, 0, 0];
  return `rgba(${rgb.join(", ")}, ${alpha})`;
}

/** `a` moved towards `b` by `amount` (0 keeps `a`, 1 gives `b`), as #rrggbb. */
export function mixColours(a: string, b: string, amount: number): string {
  const from = parse(a) ?? [0, 0, 0];
  const to = parse(b) ?? [0, 0, 0];
  return hex(from.map((v, i) => v + (to[i] - v) * amount) as Rgb);
}

function relativeLuminance(color: string): number {
  const rgb = parse(color) ?? [0, 0, 0];
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The WCAG contrast ratio of two colours, from 1 (the same) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

const isLight = (color: string) => relativeLuminance(color) > 0.4;

/**
 * The first candidate that reads on `ground`; failing all, the store's colour
 * deepened (or lightened, on a dark ground) step by step until it does.
 */
function readableInk(ground: string, candidates: Array<string | null>, base: string): string {
  for (const candidate of candidates) {
    if (candidate && contrastRatio(candidate, ground) >= READABLE) return candidate;
  }
  const towards = isLight(ground) ? "#000000" : "#ffffff";
  for (let step = 1; step <= 10; step += 1) {
    const ink = mixColours(base, towards, step / 10);
    if (contrastRatio(ink, ground) >= READABLE) return ink;
  }
  return towards;
}

/**
 * The two styles made from a store's colours.
 *
 * "store": the storefront's own ground (a near-white one becomes a soft tint
 * of the store colour, so a post is never a blank white page) with the store
 * colour as ink where it reads, else the storefront's text colour, else the
 * store colour deepened.
 *
 * "store-bold": the store colour as the ground, with the light ground or
 * white or near-black set on it, whichever reads first.
 */
export function storeStyles(colours: StoreColours): Record<"store" | "store-bold", StudioStyle> {
  const accent = parse(colours.accent) ? (colours.accent as string).trim() : FALLBACK_ACCENT;
  const background = parse(colours.background) ? (colours.background as string).trim() : null;
  const text = parse(colours.text) ? (colours.text as string).trim() : null;

  const tint = mixColours("#ffffff", accent, 0.08);
  const ground = background && relativeLuminance(background) < 0.95 ? background : tint;
  const ink = readableInk(ground, [accent, text], accent);
  const detail = contrastRatio(accent, ground) >= VISIBLE ? accent : ink;

  const boldInk = readableInk(
    accent,
    [isLight(ground) ? ground : null, "#ffffff", "#111111"],
    accent,
  );
  const boldDetailCandidate = mixColours(accent, isLight(accent) ? "#000000" : "#ffffff", 0.5);
  const boldDetail =
    contrastRatio(boldDetailCandidate, accent) >= VISIBLE ? boldDetailCandidate : boldInk;

  return {
    store: {
      ar: "ألوان متجري",
      en: "Store colours",
      bg: ground,
      ink,
      accent: detail,
      muted: rgba(ink, 0.4),
      panel: rgba(ground, 0.68),
    },
    "store-bold": {
      ar: "متجري · جريء",
      en: "Store · bold",
      bg: accent,
      ink: boldInk,
      accent: boldDetail,
      muted: rgba(boldInk, 0.45),
      panel: rgba(accent, 0.64),
    },
  };
}

/** The studio's own editorial looks, with the silk accent each has always drawn. */
function editorialStyles(): Record<keyof typeof THEMES, StudioStyle> {
  const style = (key: keyof typeof THEMES): StudioStyle => {
    const theme = THEMES[key];
    const darkGround = key === "maison";
    return {
      ar: theme.ar,
      en: theme.en,
      bg: theme.bg,
      ink: theme.ink,
      accent: darkGround ? "#c9a27a" : "#9c6f4c",
      muted: darkGround ? "rgba(255, 250, 246, 0.45)" : "rgba(51, 10, 10, 0.4)",
      panel: theme.panel,
    };
  };
  return { editorial: style("editorial"), maison: style("maison"), minimal: style("minimal") };
}

/** Every style the studio offers a store, by key. */
export function studioStyles(colours: StoreColours): Record<StyleKey, StudioStyle> {
  return { ...storeStyles(colours), ...editorialStyles() };
}

/**
 * The store's colours as its storefront reads them: the accent from the
 * storefront settings, else the brand's colour (`public-settings.ts`).
 */
export function storeColoursFrom(
  settings:
    | {
        storefront_accent_color?: string | null;
        storefront_background_color?: string | null;
        storefront_text_color?: string | null;
      }
    | null
    | undefined,
  brand: { primary_color?: string | null } | null | undefined,
): StoreColours {
  return {
    accent: settings?.storefront_accent_color ?? brand?.primary_color ?? null,
    background: settings?.storefront_background_color ?? null,
    text: settings?.storefront_text_color ?? null,
  };
}
