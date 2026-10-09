import type { PublicSettings } from "@/lib/storefront-context";

/**
 * The classic footer's page links, split into "company" and "help": the
 * page's own group when set, else "company" for about/contact/company pages
 * (by English or Arabic title, or slug). Pages without a title are left out.
 */
export function footerPageGroups(pages: PublicSettings["pages"], isAr: boolean) {
  const pageLinks = pages
    .map((p, idx) => {
      const titleEn = p.title_en || p.title_ar || "";
      const titleAr = p.title_ar || p.title_en || "";
      const title = isAr ? titleAr : titleEn;
      const slug = p.slug;

      const isCompanyKeyword =
        titleEn.toLowerCase().includes("about") ||
        titleEn.toLowerCase().includes("contact") ||
        titleEn.toLowerCase().includes("company") ||
        titleAr.includes("من نحن") ||
        titleAr.includes("تواصل") ||
        titleAr.includes("الشركة") ||
        slug.toLowerCase().includes("about") ||
        slug.toLowerCase().includes("contact");

      const group =
        p.group === "company" || p.group === "help"
          ? p.group
          : isCompanyKeyword
            ? "company"
            : "help";

      return {
        idx: idx + 1,
        slug,
        title,
        group,
        hasContent: Boolean(p.title_ar || p.title_en),
      };
    })
    .filter((p) => p.hasContent && p.title);

  const companyPages = pageLinks.filter((p) => p.group === "company");
  const helpPages = pageLinks.filter((p) => p.group === "help");

  return { pageLinks, companyPages, helpPages };
}

/** The two footer group headings the store chose (Pages & Policies), with the defaults. */
export function footerGroupTitles(
  settings: Pick<
    PublicSettings,
    | "footer_company_title_en"
    | "footer_company_title_ar"
    | "footer_help_title_en"
    | "footer_help_title_ar"
  >,
  isAr: boolean,
) {
  return {
    company: isAr
      ? settings.footer_company_title_ar?.trim() || "الشركة"
      : settings.footer_company_title_en?.trim() || "Company",
    help: isAr
      ? settings.footer_help_title_ar?.trim() || "المساعدة"
      : settings.footer_help_title_en?.trim() || "Help",
  };
}
