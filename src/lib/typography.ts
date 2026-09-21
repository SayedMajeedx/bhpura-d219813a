export type TypographyLanguage = "en" | "ar";

export type FontSource = {
  family: string;
  url: string | null;
};

export type FontCapabilities = {
  variable: boolean;
  weight: { min: number; max: number };
  italic: boolean;
  hexp: boolean;
  genericAxes: boolean;
};

export const FONT_LIBRARY = {
  "Plus Jakarta Sans": {
    variable: true,
    weight: { min: 200, max: 800 },
    italic: true,
    hexp: false,
    genericAxes: false,
  },
  "Readex Pro": {
    variable: true,
    weight: { min: 160, max: 700 },
    italic: false,
    hexp: true,
    genericAxes: false,
  },
  Inter: {
    variable: true,
    weight: { min: 100, max: 900 },
    italic: true,
    hexp: false,
    genericAxes: false,
  },
  Tajawal: {
    variable: false,
    weight: { min: 200, max: 900 },
    italic: false,
    hexp: false,
    genericAxes: false,
  },
  Cairo: {
    variable: true,
    weight: { min: 200, max: 900 },
    italic: false,
    hexp: false,
    genericAxes: false,
  },
  Amiri: {
    variable: false,
    weight: { min: 400, max: 700 },
    italic: true,
    hexp: false,
    genericAxes: false,
  },
  "Aref Ruqaa": {
    variable: false,
    weight: { min: 400, max: 700 },
    italic: false,
    hexp: false,
    genericAxes: false,
  },
  Almarai: {
    variable: false,
    weight: { min: 300, max: 800 },
    italic: false,
    hexp: false,
    genericAxes: false,
  },
  Changa: {
    variable: true,
    weight: { min: 200, max: 800 },
    italic: false,
    hexp: false,
    genericAxes: false,
  },
  "Playfair Display": {
    variable: true,
    weight: { min: 400, max: 900 },
    italic: true,
    hexp: false,
    genericAxes: false,
  },
  "Cormorant Garamond": {
    variable: true,
    weight: { min: 300, max: 700 },
    italic: true,
    hexp: false,
    genericAxes: false,
  },
  Montserrat: {
    variable: true,
    weight: { min: 100, max: 900 },
    italic: true,
    hexp: false,
    genericAxes: false,
  },
  Poppins: {
    variable: false,
    weight: { min: 100, max: 900 },
    italic: true,
    hexp: false,
    genericAxes: false,
  },
  Cinzel: {
    variable: true,
    weight: { min: 400, max: 900 },
    italic: false,
    hexp: false,
    genericAxes: false,
  },
  Prata: {
    variable: false,
    weight: { min: 400, max: 400 },
    italic: false,
    hexp: false,
    genericAxes: false,
  },
  Marhey: {
    variable: true,
    weight: { min: 300, max: 700 },
    italic: false,
    hexp: false,
    genericAxes: false,
  },
  Alexandria: {
    variable: true,
    weight: { min: 100, max: 900 },
    italic: false,
    hexp: false,
    genericAxes: false,
  },
} as const satisfies Record<string, FontCapabilities>;

export function fontCapabilities(source: FontSource): FontCapabilities {
  if (source.url) {
    return {
      variable: true,
      weight: { min: 100, max: 900 },
      italic: true,
      hexp: false,
      genericAxes: true,
    };
  }
  return (
    FONT_LIBRARY[source.family as keyof typeof FONT_LIBRARY] ?? {
      variable: false,
      weight: { min: 100, max: 900 },
      italic: false,
      hexp: false,
      genericAxes: false,
    }
  );
}

export type TypographyConfig = {
  body: Record<TypographyLanguage, FontSource>;
  display: Record<TypographyLanguage, FontSource>;
  bodyWeight: number;
  headingWeight: number;
  scale: number;
  bodyLineHeight: number;
  headingLineHeight: number;
  letterSpacing: number;
  opticalSizing: boolean;
  axes: {
    width: number;
    slant: number;
    opticalSize: number;
    hexp: number;
    italic: boolean;
  };
};

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};

const canonicalFamily = (family: string, language: TypographyLanguage) => {
  const aliases: Record<string, string> =
    language === "ar"
      ? {
          "Noto Sans Arabic": "Tajawal",
          "Noto Kufi Arabic": "Cairo",
        }
      : {
          "Open Sans": "Inter",
          Roboto: "Inter",
        };
  return aliases[family] ?? family;
};

/**
 * Families bundled under /public/fonts (see src/fonts.css). These never hit
 * Google Fonts, so the storefront's first paint has no third-party CSS chain.
 */
export const SELF_HOSTED_FAMILIES = new Set([
  "Plus Jakarta Sans",
  "Readex Pro",
  "Inter",
  "Tajawal",
  "Cormorant Garamond",
  "29LT Bukra",
  "29LT Zarid Display",
  "29LT Kaff",
  "29LT Azer",
]);

const isGoogleCandidate = (source?: FontSource) => {
  if (!source || source.url) return false;
  const fam = source.family?.trim();
  return Boolean(
    fam &&
    !fam.startsWith("Custom —") &&
    fam !== "Georgia" &&
    fam !== "sans-serif" &&
    fam !== "serif" &&
    !SELF_HOSTED_FAMILIES.has(fam),
  );
};

/**
 * Builds a Google Fonts stylesheet URL only for merchant-selected families that
 * are not self-hosted, requesting just the weights the storefront renders
 * (body, heading, 400 and 700) instead of every static weight.
 */
export function getGoogleFontsUrl(config?: TypographyConfig | null): string | null {
  if (!config) return null;
  const requested = new Map<string, Set<number>>();
  const add = (source: FontSource | undefined, weight: number) => {
    if (!isGoogleCandidate(source)) return;
    const fam = source!.family.trim();
    const caps = fontCapabilities(source!);
    const set = requested.get(fam) ?? new Set<number>();
    // Static families only guarantee 400/700 instances; asking Google for a
    // missing instance fails the whole stylesheet, so snap to those. Variable
    // families accept any value inside their axis range.
    const candidates = caps.variable ? [weight, 400, 700] : [400, 700];
    for (const w of candidates) {
      const snapped = Math.round(w / 100) * 100;
      if (snapped >= caps.weight.min && snapped <= caps.weight.max) set.add(snapped);
    }
    requested.set(fam, set);
  };
  const bodyWeight = Number(config.bodyWeight) || 400;
  const headingWeight = Number(config.headingWeight) || 600;
  add(config.body?.en, bodyWeight);
  add(config.body?.ar, bodyWeight);
  add(config.display?.en, headingWeight);
  add(config.display?.ar, headingWeight);

  if (requested.size === 0) return null;

  const parts = Array.from(requested.entries()).map(([fam, weights]) => {
    const encoded = encodeURIComponent(fam).replace(/%20/g, "+");
    const sorted = Array.from(weights).sort((a, b) => a - b);
    const variable = FONT_LIBRARY[fam as keyof typeof FONT_LIBRARY]?.variable;
    const axis =
      variable && sorted.length > 1
        ? `${sorted[0]}..${sorted[sorted.length - 1]}`
        : sorted.join(";");
    return `family=${encoded}:wght@${axis}`;
  });

  return `https://fonts.googleapis.com/css2?${parts.join("&")}&display=swap`;
}

/**
 * Self-hosted font files worth preloading for the active language: the body
 * face (most text) and the display face (H1 / LCP text). At most two files.
 */
export function selfHostedFontPreloads(
  config: TypographyConfig | null | undefined,
  language: TypographyLanguage,
): string[] {
  if (!config) return [];
  const nearest = (weight: number, options: number[]) =>
    options.reduce((best, w) => (Math.abs(w - weight) < Math.abs(best - weight) ? w : best));
  const fileFor = (source: FontSource | undefined, weight: number): string | null => {
    if (!source || source.url) return null;
    switch (source.family) {
      case "Tajawal":
        return `/fonts/tajawal/tajawal-${nearest(weight, [400, 500, 700])}-${language === "ar" ? "arabic" : "latin"}.woff2`;
      case "Inter":
        return "/fonts/inter.woff2";
      case "Readex Pro":
        return "/fonts/variable/readex-pro-hexp-wght.woff2";
      case "Plus Jakarta Sans":
        return "/fonts/variable/plus-jakarta-sans-wght.woff2";
      case "Cormorant Garamond":
        return "/fonts/english-font.woff2";
      case "29LT Zarid Display":
        return "/fonts/zariddisplay.woff2";
      case "29LT Bukra":
        return "/fonts/bukramed.woff2";
      case "29LT Kaff":
        return "/fonts/kafflight.woff2";
      case "29LT Azer":
        return "/fonts/azerextralight.woff2";
      default:
        return null;
    }
  };
  const files = [
    fileFor(config.body?.[language], Number(config.bodyWeight) || 400),
    fileFor(config.display?.[language], Number(config.headingWeight) || 600),
  ].filter((f): f is string => Boolean(f));
  return Array.from(new Set(files));
}

export const defaultStorefrontTypography = (): TypographyConfig => ({
  body: {
    en: { family: "Inter", url: null },
    ar: { family: "Tajawal", url: null },
  },
  display: {
    en: { family: "Inter", url: null },
    ar: { family: "29LT Zarid Display", url: null },
  },
  bodyWeight: 400,
  headingWeight: 600,
  scale: 1,
  bodyLineHeight: 1.6,
  headingLineHeight: 1.15,
  letterSpacing: 0,
  opticalSizing: true,
  axes: { width: 100, slant: 0, opticalSize: 14, hexp: 0, italic: false },
});

export const defaultAdminTypography = (): TypographyConfig => ({
  ...defaultStorefrontTypography(),
  display: {
    en: { family: "Inter", url: null },
    ar: { family: "Tajawal", url: null },
  },
  scale: 0.95,
  bodyLineHeight: 1.5,
  headingLineHeight: 1.2,
});

export function normalizeTypography(input: unknown, defaults: TypographyConfig): TypographyConfig {
  const raw = input && typeof input === "object" ? (input as Partial<TypographyConfig>) : {};
  const source = (role: "body" | "display", language: TypographyLanguage): FontSource => {
    const candidate = raw[role]?.[language];
    const candidateUrl =
      candidate && Object.prototype.hasOwnProperty.call(candidate, "url")
        ? candidate.url
        : defaults[role][language].url;
    const url =
      typeof candidateUrl === "string" && /^https:\/\//i.test(candidateUrl) ? candidateUrl : null;
    const requestedFamily =
      typeof candidate?.family === "string" && candidate.family.trim()
        ? candidate.family.trim().slice(0, 100)
        : defaults[role][language].family;
    return {
      family:
        url && !requestedFamily.startsWith("Custom —")
          ? `Custom — ${language === "ar" ? "Arabic" : "English"}`
          : canonicalFamily(requestedFamily, language),
      url,
    };
  };

  const body = { en: source("body", "en"), ar: source("body", "ar") };
  const display = { en: source("display", "en"), ar: source("display", "ar") };
  const supportedRange = (sources: Record<TypographyLanguage, FontSource>) => {
    const capabilities = (Object.values(sources) as FontSource[]).map(fontCapabilities);
    return {
      min: Math.max(...capabilities.map((item) => item.weight.min)),
      max: Math.min(...capabilities.map((item) => item.weight.max)),
    };
  };
  const bodyWeightRange = supportedRange(body);
  const headingWeightRange = supportedRange(display);

  return {
    body,
    display,
    bodyWeight: clamp(
      raw.bodyWeight,
      bodyWeightRange.min,
      bodyWeightRange.max,
      defaults.bodyWeight,
    ),
    headingWeight: clamp(
      raw.headingWeight,
      headingWeightRange.min,
      headingWeightRange.max,
      defaults.headingWeight,
    ),
    scale: clamp(raw.scale, 0.85, 1.25, defaults.scale),
    bodyLineHeight: clamp(raw.bodyLineHeight, 1.2, 2, defaults.bodyLineHeight),
    headingLineHeight: clamp(raw.headingLineHeight, 0.9, 1.6, defaults.headingLineHeight),
    letterSpacing: clamp(raw.letterSpacing, -0.08, 0.2, defaults.letterSpacing),
    opticalSizing: raw.opticalSizing ?? defaults.opticalSizing,
    axes: {
      width: clamp(raw.axes?.width, 75, 125, defaults.axes.width),
      slant: clamp(raw.axes?.slant, -12, 0, defaults.axes.slant),
      opticalSize: clamp(raw.axes?.opticalSize, 8, 72, defaults.axes.opticalSize),
      hexp: clamp(raw.axes?.hexp, 0, 100, defaults.axes.hexp),
      italic: raw.axes?.italic ?? defaults.axes.italic,
    },
  };
}

export function typographyVariables(config: TypographyConfig, language: TypographyLanguage) {
  const body = config.body[language];
  const display = config.display[language];
  const variationFor = (source: FontSource) => {
    const capabilities = fontCapabilities(source);
    if (capabilities.hexp) return `'HEXP' ${config.axes.hexp}`;
    if (capabilities.genericAxes) {
      return `'wdth' ${config.axes.width}, 'slnt' ${config.axes.slant}, 'opsz' ${config.axes.opticalSize}`;
    }
    return "normal";
  };

  return {
    "--type-body": `"${body.url ? "BoutqBodyCustom" : body.family}", "Inter", "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`,
    "--type-display": `"${display.url ? "BoutqDisplayCustom" : display.family}", "Inter", "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`,
    "--type-body-weight": config.bodyWeight,
    "--type-heading-weight": config.headingWeight,
    "--type-scale": config.scale,
    "--type-body-leading": config.bodyLineHeight,
    "--type-heading-leading": config.headingLineHeight,
    "--type-tracking": `${config.letterSpacing}em`,
    "--type-body-variation": variationFor(body),
    "--type-display-variation": variationFor(display),
    "--type-body-style": config.axes.italic && fontCapabilities(body).italic ? "italic" : "normal",
    "--type-display-style":
      config.axes.italic && fontCapabilities(display).italic ? "italic" : "normal",
    "--type-optical-sizing": config.opticalSizing ? "auto" : "none",
    "--font-size-display": `clamp(2rem, calc(1.5rem + 2.5vw * ${config.scale}), 3.5rem)`,
    "--font-size-h1": `clamp(1.75rem, calc(1.25rem + 2vw * ${config.scale}), 2.75rem)`,
    "--font-size-h2": `clamp(1.5rem, calc(1.2rem + 1.2vw * ${config.scale}), 2.25rem)`,
    "--font-size-h3": `clamp(1.25rem, calc(1.1rem + 0.6vw * ${config.scale}), 1.75rem)`,
    "--font-size-body": `clamp(0.9375rem, calc(0.9rem + 0.2vw * ${config.scale}), 1.0625rem)`,
    "--font-size-caption": `clamp(0.75rem, calc(0.72rem + 0.15vw * ${config.scale}), 0.875rem)`,
  } as const;
}

export function customFontFaces(config: TypographyConfig, language: TypographyLanguage) {
  const bodyUrl = config.body[language].url;
  const displayUrl = config.display[language].url;
  const face = (family: string, url: string) =>
    `@font-face{font-family:'${family}';src:url('${url.replace(/["'()\\]/g, "")}');font-weight:100 900;font-stretch:75% 125%;font-style:oblique -12deg 0deg;font-display:swap;}`;

  return [
    bodyUrl ? face("BoutqBodyCustom", bodyUrl) : "",
    displayUrl ? face("BoutqDisplayCustom", displayUrl) : "",
  ].join("");
}
