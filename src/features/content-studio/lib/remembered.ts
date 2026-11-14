/** What the studio keeps on this device per store: the last template and post size. */
export type Remembered = {
  templateId?: string;
  format?: "story" | "portrait" | "square";
};

export const rememberedKey = (brandId: string) => `studio-last:${brandId}`;

/** A stored value read back, keeping only what it should hold. */
export function readRemembered(raw: string | null | undefined): Remembered {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const out: Remembered = {};
    if (typeof value.templateId === "string" && value.templateId.length <= 40)
      out.templateId = value.templateId;
    if (value.format === "story" || value.format === "portrait" || value.format === "square")
      out.format = value.format;
    return out;
  } catch {
    return {};
  }
}
