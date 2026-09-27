/** The content studio's formats, palettes and the pure helpers its screens share. */
import { CREATIVE_FORMATS } from "@/lib/creative-export";

export type Product = {
  id: string;
  name: string;
  name_ar: string | null;
  name_en: string | null;
  description: string | null;
  description_ar: string | null;
  image_url: string | null;
  media: unknown;
  base_price: number | null;
  fabric_type?: string | null;
  occasion?: string | null;
};

export const FORMATS = CREATIVE_FORMATS;

/**
 * The stage is laid out at this fixed CSS width always, then visually scaled
 * to fit whatever space is actually available (see previewScale below). Every
 * child element's sizing (text, padding, icons) is tuned against this exact
 * reference width, so this is also the width the desktop preview already
 * renders at today (`max-w-[570px]`) — keeping this fixed is what makes the
 * mobile preview a proportionally identical, scaled-down copy of the desktop
 * one instead of a re-flowed, disproportionate one.
 */
export const PREVIEW_BASE_WIDTH = 570;

export const THEMES = {
  editorial: {
    ar: "تحريري",
    en: "Editorial",
    bg: "#f4eee9",
    ink: "#330a0a",
    panel: "rgba(255,255,255,.68)",
  },
  maison: {
    ar: "دار الأزياء",
    en: "Maison",
    bg: "#330a0a",
    ink: "#fffaf6",
    panel: "rgba(51,10,10,.64)",
  },
  minimal: {
    ar: "هادئ",
    en: "Minimal",
    bg: "#e8ddd5",
    ink: "#330a0a",
    panel: "rgba(244,238,233,.7)",
  },
} as const;

export function firstImage(product?: Product) {
  if (!product) return null;
  if (product.image_url) return product.image_url;
  const media = Array.isArray(product.media) ? product.media : [];
  const item = media.find((entry: any) => {
    const url = typeof entry === "string" ? entry : entry?.url;
    return url && !/\.(mp4|webm|mov)(\?|$)/i.test(url);
  });
  return typeof item === "string" ? item : item?.url || null;
}

export function instagramHandle(socials: unknown) {
  if (!Array.isArray(socials)) return null;
  const item = socials.find((social: any) =>
    `${social?.name ?? ""} ${social?.url ?? ""}`.toLowerCase().includes("instagram"),
  ) as any;
  if (!item?.url) return null;
  const handle = item.url
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/[/@]+$/g, "");
  return handle ? `@${handle.replace(/^@/, "")}` : null;
}

export function containsArabic(value: string) {
  return /[\u0600-\u06ff]/.test(value);
}

export function extractSnappySnippet(text: string | null | undefined, fallback: string): string {
  if (!text) return fallback;
  const clean = text.replace(/\r\n/g, "\n").trim();
  const lines = clean
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const firstLine = lines[0] || "";
  if (firstLine.length >= 10 && firstLine.length <= 110) {
    return firstLine;
  }
  const sentenceMatch = clean.match(/^([^.!?؟\n]+[.!?؟]?)/);
  if (
    sentenceMatch &&
    sentenceMatch[1].trim().length >= 10 &&
    sentenceMatch[1].trim().length <= 110
  ) {
    return sentenceMatch[1].trim();
  }
  if (clean.length <= 110) return clean;
  const sliced = clean.slice(0, 105);
  const lastSpace = sliced.lastIndexOf(" ");
  return (lastSpace > 40 ? sliced.slice(0, lastSpace) : sliced).trim() + "...";
}
