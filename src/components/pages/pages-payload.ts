import { sanitizeRichTextHtml } from "@/lib/rich-text";
import {
  META_DESCRIPTION_LIMIT,
  META_TITLE_LIMIT,
  sanitizeMetaText,
  uniquePageSlug,
} from "@/lib/seo";
import type { FooterTitles } from "./FooterGroupTitlesCard";

export type EditablePage = {
  slug: string;
  title_ar: string;
  title_en: string;
  content_ar: string;
  content_en: string;
  image_url: string | null;
  menu_icon_url: string | null;
  image_position: "top" | "bottom";
  meta_title: string;
  meta_description: string;
  group?: "company" | "help";
};

/**
 * What `business_settings.pages` stores: the cleaned pages (each keeping the
 * footer group it was put in, which both footers read) and the two footer
 * group headings.
 */
export function buildPagesPayload(pages: EditablePage[], titles: FooterTitles) {
  const usedSlugs = new Set<string>();
  const items = pages.map((page, index) => ({
    slug: uniquePageSlug(
      page.slug || page.title_en || page.title_ar || `page-${index + 1}`,
      usedSlugs,
    ),
    title_ar: page.title_ar.trim() || null,
    title_en: page.title_en.trim() || null,
    content_ar: sanitizeRichTextHtml(page.content_ar) || null,
    content_en: sanitizeRichTextHtml(page.content_en) || null,
    image_url: page.image_url || null,
    menu_icon_url: page.menu_icon_url || null,
    image_position: page.image_position,
    group: page.group === "company" ? "company" : "help",
    meta_title: sanitizeMetaText(page.meta_title, META_TITLE_LIMIT) || null,
    meta_description: sanitizeMetaText(page.meta_description, META_DESCRIPTION_LIMIT) || null,
  }));
  return {
    items,
    footer_titles: {
      company_en: titles.companyEn.trim() || "Company",
      company_ar: titles.companyAr.trim() || "الشركة",
      help_en: titles.helpEn.trim() || "Help",
      help_ar: titles.helpAr.trim() || "المساعدة",
    },
  };
}
