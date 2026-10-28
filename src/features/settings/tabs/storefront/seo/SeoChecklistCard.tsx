import { useQuery } from "@tanstack/react-query";
import { Check, Circle } from "lucide-react";
import { catalogInsightQueries } from "@/lib/data/catalog";
import { countOf } from "@/lib/arabic-count";
import { seoChecklist, type SeoChecklistItem } from "@/features/settings/lib/seo-checklist";

type Brand = Parameters<typeof seoChecklist>[0]["brand"];

export function checklistWords(item: SeoChecklistItem, isAr: boolean): string {
  const count = item.count ?? 0;
  switch (item.id) {
    case "home_ar":
      return isAr
        ? "عنوان ووصف الصفحة الرئيسية بالعربية"
        : "Arabic home page title and description";
    case "home_en":
      return isAr
        ? "عنوان ووصف الصفحة الرئيسية بالإنجليزية"
        : "English home page title and description";
    case "verified":
      return isAr
        ? "ربط المتجر بـ Google Search Console"
        : "Store connected to Google Search Console";
    case "descriptions":
      if (item.done) return isAr ? "لكل منتج وصف" : "Every product has a description";
      return isAr
        ? `${countOf(count, "product", "ar")} بلا وصف`
        : `${countOf(count, "product", "en")} without a description`;
    case "photos":
      if (item.done) return isAr ? "لكل منتج صورة" : "Every product has a photo";
      return isAr
        ? `${countOf(count, "product", "ar")} بلا صورة`
        : `${countOf(count, "product", "en")} without a photo`;
  }
}

/** What is left to do for Google to show the store well: written, connected, described. */
export function SeoChecklistCard({
  brandId,
  isAr,
  brand,
}: {
  brandId: string;
  isAr: boolean;
  brand: Brand;
}) {
  const withoutDescription = useQuery(catalogInsightQueries.withoutDescription(brandId)).data;
  const withoutPhoto = useQuery(catalogInsightQueries.withoutPhoto(brandId)).data;
  const items = seoChecklist({
    brand,
    productsWithoutDescription: withoutDescription ?? 0,
    productsWithoutPhoto: withoutPhoto ?? 0,
  });
  const todo = items.filter((item) => !item.done).length;

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">
          {isAr ? "قائمة تحسين الظهور في Google" : "Google visibility checklist"}
        </h3>
        <span className="text-xs text-muted-foreground">
          {todo === 0 ? (isAr ? "اكتملت" : "All done") : isAr ? `${todo} متبقية` : `${todo} left`}
        </span>
      </div>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-2 text-xs">
            {item.done ? (
              <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
            ) : (
              <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
            <span className={item.done ? "text-muted-foreground" : "text-foreground"}>
              {checklistWords(item, isAr)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
