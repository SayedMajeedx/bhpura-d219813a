import type { FormatKey } from "@/features/content-studio/engine/scene";
import type { LogoTint } from "@/features/content-studio/engine/brand-mark";
import { FORMATS, THEMES } from "@/features/content-studio/lib/studio-content";
import { OCCASIONS, type OccasionId } from "@/features/content-studio/lib/occasions";

/**
 * What a saved draft keeps of the studio, beyond its template, format and
 * product (their own columns): the copy, the look, the logo, and each
 * template's own choices. Versioned, so later studios can read old drafts.
 */
export type DraftSettings = {
  v: 1;
  theme: keyof typeof THEMES;
  showPrice: boolean;
  imageFit: "cover" | "contain";
  logoScale: number;
  logoTint: LogoTint;
  editionLabel: string;
  headline: string;
  body: string;
  variantId: string | null;
  mediaUrl: string | null;
  lookbookIds: string[];
  detail: { x: number; y: number; label: string; note: string } | null;
  occasion: { id: OccasionId; greeting: string; message: string; offer: string } | null;
};

const TINTS: readonly LogoTint[] = ["auto", "original", "white", "black"];

const text = (value: unknown, fallback = "", max = 400) =>
  typeof value === "string" ? value.slice(0, max) : fallback;
const unit = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/**
 * A draft's settings, read defensively: anything missing or malformed falls
 * back to the studio's default, so an old or hand-edited draft still opens.
 */
export function readDraftSettings(raw: unknown): DraftSettings {
  const s = record(raw) ?? {};
  const detail = record(s.detail);
  const occasion = record(s.occasion);
  const occasionId = OCCASIONS.find((o) => o.id === occasion?.id)?.id;
  const scale = typeof s.logoScale === "number" && Number.isFinite(s.logoScale) ? s.logoScale : 1;
  return {
    v: 1,
    theme:
      typeof s.theme === "string" && s.theme in THEMES
        ? (s.theme as keyof typeof THEMES)
        : "editorial",
    showPrice: typeof s.showPrice === "boolean" ? s.showPrice : true,
    imageFit: s.imageFit === "contain" ? "contain" : "cover",
    logoScale: Math.min(2.2, Math.max(0.6, scale)),
    logoTint: TINTS.includes(s.logoTint as LogoTint) ? (s.logoTint as LogoTint) : "auto",
    editionLabel: text(s.editionLabel),
    headline: text(s.headline),
    body: text(s.body),
    variantId: typeof s.variantId === "string" ? s.variantId : null,
    mediaUrl: typeof s.mediaUrl === "string" ? s.mediaUrl : null,
    lookbookIds: Array.isArray(s.lookbookIds)
      ? s.lookbookIds.filter((id): id is string => typeof id === "string").slice(0, 5)
      : [],
    detail: detail
      ? {
          x: unit(detail.x, 0.5),
          y: unit(detail.y, 0.42),
          label: text(detail.label, "", 40),
          note: text(detail.note, "", 40),
        }
      : null,
    occasion:
      occasion && occasionId
        ? {
            id: occasionId,
            greeting: text(occasion.greeting, "", 40),
            message: text(occasion.message, "", 70),
            offer: text(occasion.offer, "", 40),
          }
        : null,
  };
}

/** The draft's format, or the story when it is not one the studio knows. */
export function readDraftFormat(raw: string): FormatKey {
  return raw in FORMATS ? (raw as FormatKey) : "story";
}

/** A name for a new draft: the template and the product ("Price Drop · Silk Abaya"). */
export function defaultDraftName(templateName: string, subject: string | null): string {
  return (subject ? `${templateName} · ${subject}` : templateName).slice(0, 80);
}
