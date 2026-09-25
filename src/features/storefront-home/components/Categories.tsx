import { Link } from "@tanstack/react-router";
import { useStorefront } from "@/lib/storefront-context";
import { Button } from "@/components/ui/button";
import { useMemo } from "react";
import { ChevronDown, FileText, Grid2X2 } from "lucide-react";
import { ResponsiveImage } from "@/components/responsive-media";
import { type ProductRow, type StorefrontCategory } from "@/lib/data/storefront";
import { getDescendantCategories } from "@/features/storefront-home/lib/home-products";

/** The category chips (with sub-categories) that filter the home page product grid. */
export function Categories({
  products,
  categories,
  activeCategorySlugs,
  setActiveCategorySlugs,
  navigation = false,
}: {
  products: ProductRow[];
  categories: StorefrontCategory[];
  activeCategorySlugs: string[];
  setActiveCategorySlugs: (path: string[]) => void;
  navigation?: boolean;
}) {
  const { t, lang, brand, settings } = useStorefront();
  const menuBackground = settings.menu_bg || settings.background_color || "#ffffff";
  const menuText = settings.menu_fg || settings.text_color || "#111111";

  const merged = useMemo(() => {
    const known = new Map<
      string,
      { id: string; key: string; label: string; image: string | null }
    >();
    // Pre-filter to only parent categories (no parent_id)
    const parents = categories.filter((c) => !c.parent_id);
    for (const c of parents) {
      const key = c.slug || c.name_en;
      const label = (lang === "ar" ? c.name_ar : c.name_en) || c.name_en;
      known.set(key, { id: c.id, key, label, image: c.image_url });
    }
    for (const p of products) {
      if (p.category && !known.has(p.category)) {
        // Subcategories with no parent_id match get treated as parents (unchanged behavior for flat catalogs)
        const isSub = categories.some(
          (c) => c.parent_id && (c.slug === p.category || c.name_en === p.category),
        );
        if (!isSub) {
          known.set(p.category, { id: "", key: p.category, label: p.category, image: null });
        }
      }
    }
    return Array.from(known.values());
  }, [categories, products, lang]);

  // Construct dynamic rows of pills recursively for each active level
  const rows = useMemo(() => {
    if (navigation) return []; // The side category navigation dropdown is static list of parent links

    const rowsList = [];
    let currentParentId: string | null = null;
    let levelIndex = 0;

    // Loop to build subcategory rows
    while (true) {
      let levelCategories: StorefrontCategory[] = [];

      if (levelIndex === 0) {
        // Level 0 is special because we use merged. We don't need a row for level 0 here as we render it explicitly.
      } else {
        // Fetch subcategories under currentParentId
        if (currentParentId) {
          levelCategories = categories.filter((c) => c.parent_id === currentParentId);
        }
      }

      if (levelIndex > 0 && levelCategories.length > 0) {
        // Filter out empty subcategory chips that do not have active products in their subtree
        const activeLevelCategories = levelCategories.filter((cat) => {
          const descendants = getDescendantCategories(cat.id, categories);
          const matchValues = new Set(
            [
              cat.slug,
              cat.name_en,
              ...descendants.map((d) => d.slug).filter(Boolean),
              ...descendants.map((d) => d.name_en).filter(Boolean),
            ].filter(Boolean),
          );
          return products.some((p) => p.category && matchValues.has(p.category));
        });

        if (activeLevelCategories.length > 0) {
          rowsList.push({
            levelIndex,
            categories: activeLevelCategories,
            activeSlug: activeCategorySlugs[levelIndex] || null,
          });
        } else {
          break;
        }
      }

      // Move to the next level down the active path
      const selectedSlugForLevel = activeCategorySlugs[levelIndex];
      if (selectedSlugForLevel) {
        let selectedCategoryItem;
        if (levelIndex === 0) {
          const mergedItem = merged.find((m) => m.key === selectedSlugForLevel);
          if (mergedItem && mergedItem.id) {
            selectedCategoryItem = categories.find((c) => c.id === mergedItem.id);
          }
        } else {
          selectedCategoryItem = levelCategories.find(
            (c) => c.slug === selectedSlugForLevel || c.name_en === selectedSlugForLevel,
          );
        }

        if (selectedCategoryItem) {
          currentParentId = selectedCategoryItem.id;
          levelIndex++;
        } else {
          break;
        }
      } else {
        break;
      }
    }

    return rowsList;
  }, [categories, products, activeCategorySlugs, merged, navigation]);

  if (merged.length === 0) return null;

  return (
    <div className="w-full space-y-4">
      {/* Level 0 Row */}
      <div
        dir={lang === "ar" ? "rtl" : "ltr"}
        className={`${navigation ? "my-2 min-h-16 w-full items-center justify-start border-b py-2 sm:justify-center" : "justify-center"} flex flex-wrap gap-3`}
      >
        {navigation && (
          <details className="group relative shrink-0">
            <summary className="flex h-11 cursor-pointer list-none items-center gap-2 rounded-xl border border-dashed px-5 font-semibold shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md [&::-webkit-details-marker]:hidden">
              <Grid2X2 className="h-5 w-5" />
              <span>{t("القائمة", "Menu")}</span>
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
            </summary>
            <div
              className="absolute start-0 top-full z-50 mt-2 w-[min(92vw,620px)] rounded-2xl border p-5 shadow-2xl"
              style={{ backgroundColor: menuBackground, color: menuText }}
            >
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                <Grid2X2 className="h-4 w-4" />
                {t("الأقسام", "Categories")}
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {merged.map((item) => (
                  <Link
                    key={`menu-${item.key}`}
                    to="/$slug/$category"
                    params={{ slug: brand.slug, category: item.key }}
                    className="flex min-h-14 items-center gap-3 rounded-xl border p-3 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-secondary"
                  >
                    <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted">
                      {item.image ? (
                        <ResponsiveImage
                          src={item.image}
                          preset="thumb"
                          sizes="40px"
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Grid2X2 className="h-4 w-4 opacity-50" />
                      )}
                    </div>
                    <span className="font-medium">{item.label}</span>
                  </Link>
                ))}
              </div>
              {settings.menu_show_pages &&
                settings.pages.some((page) => page.title_ar || page.title_en) && (
                  <>
                    <div className="my-5 border-t" />
                    <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                      <FileText className="h-4 w-4" />
                      {t("الصفحات", "Pages")}
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {settings.pages.map((page, index) => {
                        const title =
                          lang === "ar"
                            ? page.title_ar || page.title_en
                            : page.title_en || page.title_ar;
                        return title ? (
                          <Link
                            key={`page-${index}`}
                            to="/$slug/$category"
                            params={{ slug: brand.slug, category: page.slug }}
                            className="flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-secondary"
                          >
                            <FileText className="h-4 w-4 shrink-0 opacity-60" />
                            <span className="truncate">{title}</span>
                          </Link>
                        ) : null;
                      })}
                    </div>
                  </>
                )}
            </div>
          </details>
        )}
        {merged.map((c) => {
          const active = activeCategorySlugs[0] === c.key;
          return (
            <Button
              key={c.key}
              type="button"
              variant={active ? "default" : "outline"}
              onClick={() => {
                if (active) {
                  setActiveCategorySlugs([]);
                } else {
                  setActiveCategorySlugs([c.key]);
                }
              }}
              className={`shrink-0 px-4 py-2.5 ${navigation ? "hidden sm:inline-flex" : "inline-flex"} rounded-full gap-2 min-h-[44px]`}
            >
              {c.image && (
                <ResponsiveImage
                  src={c.image}
                  preset="thumb"
                  sizes="20px"
                  alt=""
                  className="h-5 w-5 rounded-full object-cover"
                />
              )}
              {c.label}
            </Button>
          );
        })}
      </div>

      {/* Dynamic Subcategory Rows (rendered recursively for each active sub-level) */}
      {rows.map((row) => (
        <div
          key={`row-level-${row.levelIndex}`}
          className="w-full flex justify-center border-t border-border pt-3 animate-in fade-in slide-in-from-top-1 duration-200"
        >
          <div className="flex flex-wrap gap-2 justify-center">
            <Button
              type="button"
              variant={row.activeSlug === null ? "default" : "secondary"}
              size="sm"
              onClick={() => {
                setActiveCategorySlugs(activeCategorySlugs.slice(0, row.levelIndex));
              }}
              className="min-h-[34px] px-3.5 py-1.5 rounded-full text-xs shrink-0"
            >
              {t("الكل", "All")}
            </Button>
            {row.categories.map((sub) => {
              const subSlug = sub.slug || sub.name_en;
              const subLabel =
                lang === "ar" ? sub.name_ar || sub.name_en : sub.name_en || sub.name_ar;
              const active = row.activeSlug === subSlug;
              const hasSubSubs = categories.some((c) => c.parent_id === sub.id);

              return (
                <Button
                  key={sub.id}
                  type="button"
                  variant={active ? "default" : "secondary"}
                  size="sm"
                  onClick={() => {
                    if (active) {
                      setActiveCategorySlugs(activeCategorySlugs.slice(0, row.levelIndex));
                    } else {
                      setActiveCategorySlugs([
                        ...activeCategorySlugs.slice(0, row.levelIndex),
                        subSlug,
                      ]);
                    }
                  }}
                  className="min-h-[34px] px-3.5 py-1.5 rounded-full text-xs shrink-0 flex items-center gap-1.5"
                >
                  <span>{subLabel}</span>
                  {hasSubSubs && (
                    <ChevronDown
                      className={`h-3 w-3 transition-transform duration-200 ${active ? "rotate-180" : ""}`}
                    />
                  )}
                </Button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
