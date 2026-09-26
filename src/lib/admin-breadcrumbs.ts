/**
 * The admin menu bar's breadcrumbs: "Boutq OS" (home), the current section,
 * then the record open in it (an order by invoice number, a customer by name,
 * a known sub-page by its label). The last crumb has no link.
 */

export type Breadcrumb = { label: string; href?: string };

const SUB_PAGES: Record<string, { ar: string; en: string }> = {
  sales: { ar: "المبيعات", en: "Sales" },
  products: { ar: "المنتجات", en: "Products" },
  customers: { ar: "العملاء", en: "Customers" },
  export: { ar: "التصدير", en: "Export" },
  new: { ar: "طلب جديد", en: "New order" },
};

export function buildBreadcrumbs(args: {
  pathname: string;
  activeSlug: string | null;
  lang: "ar" | "en";
  /** The current section's label and its own URL (when a nav item is active). */
  section: { label: string; href: string } | null;
  /** The first path segment after the section, if any (an id or a sub-page). */
  trailingSegment: string | undefined;
  isOrderRoute: boolean;
  isCustomerRoute: boolean;
  invoiceNumber?: string | number | null;
  customerName?: string | null;
}): Breadcrumb[] {
  const { pathname, lang, trailingSegment } = args;
  const home = args.activeSlug ? `/admin/b/${args.activeSlug}/dashboard` : "/admin/brands";
  const items: Breadcrumb[] = [{ label: "Boutq OS", href: pathname === home ? undefined : home }];

  if (args.section && pathname !== home) {
    items.push({
      label: args.section.label,
      href: pathname !== args.section.href ? args.section.href : undefined,
    });
  }

  if (!trailingSegment) return items;
  const subPage = SUB_PAGES[trailingSegment];
  if (subPage) {
    items.push({ label: subPage[lang] });
  } else if (args.isOrderRoute) {
    const order = lang === "ar" ? "الطلب" : "Order";
    items.push({ label: `${order} #${args.invoiceNumber || trailingSegment.slice(0, 8)}` });
  } else if (args.isCustomerRoute) {
    items.push({ label: args.customerName || decodeURIComponent(trailingSegment.slice(0, 8)) });
  } else {
    items.push({ label: decodeURIComponent(trailingSegment) });
  }
  return items;
}
