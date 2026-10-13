import type { BrandKit, StudioTemplate } from "@/features/content-studio/engine/scene";
import type { StudioStyle } from "@/features/content-studio/lib/studio-styles";
import { atelierReveal } from "@/features/content-studio/templates/atelier-reveal";
import { priceDrop } from "@/features/content-studio/templates/price-drop";
import { swatchRun } from "@/features/content-studio/templates/swatch-run";
import { editorialCover } from "@/features/content-studio/templates/editorial-cover";
import { detailZoom } from "@/features/content-studio/templates/detail-zoom";
import { occasionPack } from "@/features/content-studio/templates/occasion-pack";
import { lookbookCarousel } from "@/features/content-studio/templates/lookbook-carousel";

/** The animated templates, in the order the picker shows them after Classic. */
export const ENGINE_TEMPLATES: readonly StudioTemplate[] = [
  atelierReveal,
  editorialCover,
  priceDrop,
  swatchRun,
  detailZoom,
  lookbookCarousel,
  occasionPack,
];

/** "classic" is today's layout (the HTML stage); the rest run on the engine. */
export type TemplateId = "classic" | (typeof ENGINE_TEMPLATES)[number]["id"];

export function templateById(id: TemplateId): StudioTemplate | null {
  return ENGINE_TEMPLATES.find((template) => template.id === id) ?? null;
}

/** A template's palette for one of the studio's colour styles. */
export function paletteFor(style: StudioStyle): BrandKit["palette"] {
  return { ground: style.bg, ink: style.ink, accent: style.accent, muted: style.muted };
}
