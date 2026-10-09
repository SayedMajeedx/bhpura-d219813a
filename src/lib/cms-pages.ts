/**
 * `business_settings.pages` is a plain list (the older shape) or
 * `{ items, footer_titles }` (what the Pages & Policies screen saves). Every
 * reader goes through these two functions so none of them can miss a shape.
 */

export type StoredFooterTitles = {
  company_en?: string;
  company_ar?: string;
  help_en?: string;
  help_ar?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The stored pages as a list, whichever shape they were saved in. */
export function storedPageItems(raw: unknown): Record<string, unknown>[] {
  const list = Array.isArray(raw)
    ? raw
    : isRecord(raw) && Array.isArray(raw.items)
      ? raw.items
      : [];
  return list.filter(isRecord);
}

/** The footer group headings the store wrote, or null when it wrote none. */
export function storedFooterTitles(raw: unknown): StoredFooterTitles | null {
  if (!isRecord(raw) || !isRecord(raw.footer_titles)) return null;
  const titles: StoredFooterTitles = {};
  for (const key of ["company_en", "company_ar", "help_en", "help_ar"] as const) {
    const value = raw.footer_titles[key];
    if (typeof value === "string" && value.trim()) titles[key] = value.trim();
  }
  return titles;
}

export type StoredPage = {
  slug: string | null;
  title_ar: string | null;
  title_en: string | null;
  content_ar: string | null;
  content_en: string | null;
  image_url: string | null;
  menu_icon_url: string | null;
  image_position: "top" | "bottom";
  meta_title: string | null;
  meta_description: string | null;
  group: "company" | "help";
};

const text = (value: unknown) => (typeof value === "string" ? value : null);

/** The stored pages with every field typed and defaulted (top image, help group). */
export function storedPages(raw: unknown): StoredPage[] {
  return storedPageItems(raw).map((page) => ({
    slug: text(page.slug),
    title_ar: text(page.title_ar),
    title_en: text(page.title_en),
    content_ar: text(page.content_ar),
    content_en: text(page.content_en),
    image_url: text(page.image_url),
    menu_icon_url: text(page.menu_icon_url),
    image_position: page.image_position === "bottom" ? "bottom" : "top",
    meta_title: text(page.meta_title),
    meta_description: text(page.meta_description),
    group: page.group === "company" ? "company" : "help",
  }));
}
