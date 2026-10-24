import { useId } from "react";
import { LayoutGrid, ListOrdered, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  HOME_LAYOUTS,
  verticalHomeLayout,
  type HomeLayout,
} from "@/lib/brand-templates/design-presets";

const LAYOUTS: Record<
  HomeLayout,
  { icon: LucideIcon; ar: string; en: string; hintAr: string; hintEn: string }
> = {
  shop: {
    icon: LayoutGrid,
    ar: "متجر",
    en: "Shop",
    hintAr: "واجهة، وأقسام مثل وصل حديثاً والأكثر مبيعاً، وكل المنتجات للتصفح",
    hintEn: "A hero, rails such as new arrivals and best sellers, and everything to browse",
  },
  menu: {
    icon: ListOrdered,
    ar: "قائمة طلب سريع",
    en: "Quick-order menu",
    hintAr: "أقسامك كتبويبات، وكل صنف بزر إضافة، واطلب مرة أخرى، والسلة في متناول اليد",
    hintEn:
      "Your categories as tabs, each item with an Add button, order again, the basket in reach",
  },
};

/**
 * How the home page sells: a shop's, or a quick-order menu's (a bakery, a roastery). Until the
 * store picks one it follows its kind of goods (`verticalHomeLayout`: the menu for food and
 * coffee), and the first choice says which; picking it again hands the layout back (null).
 */
export function HomeLayoutField({
  value,
  vertical,
  isAr,
  onChange,
}: {
  value: string | null | undefined;
  vertical: string | null | undefined;
  isAr: boolean;
  onChange: (value: HomeLayout | null) => void;
}) {
  const labelId = useId();
  const fallback = verticalHomeLayout(vertical);
  const chosen = HOME_LAYOUTS.includes(value as HomeLayout) ? (value as HomeLayout) : null;
  const options: Array<{ value: HomeLayout | null; layout: HomeLayout; title: string }> = [
    {
      value: null,
      layout: fallback,
      title: isAr
        ? `حسب نوع متجرك (${LAYOUTS[fallback].ar})`
        : `Your kind of store (${LAYOUTS[fallback].en})`,
    },
    ...HOME_LAYOUTS.map((layout) => ({
      value: layout,
      layout,
      title: isAr ? LAYOUTS[layout].ar : LAYOUTS[layout].en,
    })),
  ];

  return (
    <div className="space-y-2">
      <p id={labelId} className="text-sm font-semibold text-foreground">
        {isAr ? "طريقة عرض الصفحة الرئيسية" : "Home page layout"}
      </p>
      <div role="radiogroup" aria-labelledby={labelId} className="grid gap-2 sm:grid-cols-3">
        {options.map((option) => {
          const selected = option.value === chosen;
          const meta = LAYOUTS[option.layout];
          const Icon = meta.icon;
          const key = option.value ?? "vertical";
          return (
            <Button
              key={key}
              type="button"
              variant="outline"
              role="radio"
              aria-checked={selected}
              aria-labelledby={`${labelId}-${key}`}
              aria-describedby={`${labelId}-${key}-hint`}
              onClick={() => onChange(option.value)}
              className={cn(
                "h-auto items-start justify-start gap-2.5 whitespace-normal rounded-lg p-3 text-start font-normal shadow-none",
                selected
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border bg-background hover:border-primary/40 hover:bg-background",
              )}
            >
              <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              <span className="min-w-0 break-words">
                <span
                  id={`${labelId}-${key}`}
                  className="block text-sm font-semibold text-foreground"
                >
                  {option.title}
                </span>
                <span id={`${labelId}-${key}-hint`} className="block text-xs text-muted-foreground">
                  {isAr ? meta.hintAr : meta.hintEn}
                </span>
              </span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
