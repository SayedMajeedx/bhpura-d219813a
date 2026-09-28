import type { BrandKit, StudioTemplate } from "@/features/content-studio/engine/scene";
import { THEMES } from "@/features/content-studio/lib/studio-content";
import { atelierReveal } from "@/features/content-studio/templates/atelier-reveal";
import { priceDrop } from "@/features/content-studio/templates/price-drop";

/** The animated templates, in the order the picker shows them after Classic. */
export const ENGINE_TEMPLATES: readonly StudioTemplate[] = [atelierReveal, priceDrop];

/** "classic" is today's layout (the HTML stage); the rest run on the engine. */
export type TemplateId = "classic" | (typeof ENGINE_TEMPLATES)[number]["id"];

export function templateById(id: TemplateId): StudioTemplate | null {
  return ENGINE_TEMPLATES.find((template) => template.id === id) ?? null;
}

/**
 * A template's palette for the studio's colour style: the style's ground and
 * ink, a silk accent that reads on that ground, and the ink at low contrast.
 */
export function paletteFor(theme: keyof typeof THEMES): BrandKit["palette"] {
  const { bg, ink } = THEMES[theme];
  const darkGround = theme === "maison";
  return {
    ground: bg,
    ink,
    accent: darkGround ? "#c9a27a" : "#9c6f4c",
    muted: darkGround ? "rgba(255, 250, 246, 0.45)" : "rgba(51, 10, 10, 0.4)",
  };
}
