import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useStorefront } from "@/lib/storefront-context";
import { useStorefrontCategories } from "@/lib/use-storefront-categories";
import { postName } from "@/lib/product-name";

/**
 * Home / the product's category / the piece, small, above the product on a laptop (the product
 * page review of 2026-11-15): a way back to the category in one tap. A phone has the header's
 * menu and its own back, and keeps the room for the photo.
 */
export function ProductBreadcrumb({
  category,
  displayName,
}: {
  category: string | null | undefined;
  displayName: string;
}) {
  const { brand, lang, t } = useStorefront();
  const { data: categories = [] } = useStorefrontCategories();
  const own = category
    ? categories.find((c: { slug?: string | null }) => c.slug === category)
    : undefined;
  const categoryName = own
    ? lang === "ar"
      ? own.name_ar || own.name_en
      : own.name_en || own.name_ar
    : null;
  const Sep = lang === "ar" ? ChevronLeft : ChevronRight;
  const crumb = "transition-opacity duration-(--motion-quick) hover:opacity-100 opacity-70";

  return (
    <nav aria-label={t("مسار التنقل", "Breadcrumb")} className="mb-4 hidden md:block">
      <ol className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <li>
          <Link to="/$slug" params={{ slug: brand.slug }} className={crumb}>
            {t("الرئيسية", "Home")}
          </Link>
        </li>
        {own && categoryName && (
          <li className="flex items-center gap-1.5">
            <Sep aria-hidden className="h-3 w-3 opacity-50" />
            <Link
              to="/$slug/$category"
              params={{ slug: brand.slug, category: own.slug }}
              className={crumb}
            >
              {categoryName}
            </Link>
          </li>
        )}
        <li className="flex min-w-0 items-center gap-1.5">
          <Sep aria-hidden className="h-3 w-3 opacity-50" />
          <span aria-current="page" className="line-clamp-1 break-words text-foreground">
            {postName(displayName).name}
          </span>
        </li>
      </ol>
    </nav>
  );
}
