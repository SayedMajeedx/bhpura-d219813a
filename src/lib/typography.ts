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
          Cairo: "Tajawal",
          "Noto Sans Arabic": "Tajawal",
          "Noto Kufi Arabic": "29LT Bukra",
        }
      : {
          Poppins: "Inter",
          Montserrat: "Inter",
          "Open Sans": "Inter",
          Roboto: "Inter",
          "Playfair Display": "Georgia",
          "Cormorant Garamond": "Georgia",
        };
  return aliases[family] ?? family;
};

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
    "--type-body": `"${body.url ? "BoutqBodyCustom" : body.family}", sans-serif`,
    "--type-display": `"${display.url ? "BoutqDisplayCustom" : display.family}", sans-serif`,
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
