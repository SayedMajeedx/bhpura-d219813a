import * as React from "react";
import { Link } from "@tanstack/react-router";
import {
  Clock3,
  History,
  LayoutTemplate,
  ListOrdered,
  ShoppingBag,
  type LucideIcon,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useBrand } from "@/lib/brand-context";
import { SettingsNavContext } from "@/features/settings/GroupNavigator";
import { Button } from "@/components/ui/button";
import { HomeSectionRow } from "./HomeSectionRow";
import { CategoryBannerField } from "./HomeSectionFields";

type MenuSectionId = "hero" | "order_again" | "menu" | "basket" | "category_pages";

const MENU_HOME_SECTIONS: readonly MenuSectionId[] = [
  "hero",
  "order_again",
  "menu",
  "basket",
  "category_pages",
];

const SECTION_META: Record<
  MenuSectionId,
  { icon: LucideIcon; ar: string; en: string; hintAr: string; hintEn: string }
> = {
  hero: {
    icon: LayoutTemplate,
    ar: "الواجهة",
    en: "Hero",
    hintAr: "أول ما يراه الزائر: الشرائح والعنوان المتحرك",
    hintEn: "The first thing a visitor sees: slides and animated headline",
  },
  order_again: {
    icon: History,
    ar: "اطلب مرة أخرى",
    en: "Order again",
    hintAr: "للعميل المسجّل: ما طلبه من قبل، بنفس الوزن أو النكهة، بضغطة واحدة",
    hintEn: "For a signed-in customer: what they ordered before, as they had it, in one tap",
  },
  menu: {
    icon: ListOrdered,
    ar: "القائمة",
    en: "The menu",
    hintAr: "أقسامك كتبويبات بترتيبها، وكل صنف بصورته وسعره وزر إضافة",
    hintEn: "Your categories as tabs in their order, each item with its photo, price and Add",
  },
  basket: {
    icon: ShoppingBag,
    ar: "السلة",
    en: "Basket",
    hintAr: "شريط أسفل الشاشة بعدد القطع والمجموع وإتمام الطلب",
    hintEn: "A bar at the foot of the screen with the items, the total and checkout",
  },
  category_pages: {
    icon: Clock3,
    ar: "صفحات الأقسام",
    en: "Category pages",
    hintAr: "اللافتة أعلى صفحة كل قسم",
    hintEn: "The banner at the top of each category page",
  },
};

/**
 * A quick-order store's home page (`MenuHome`), part by part in the order a shopper scrolls it,
 * each saying where it is edited: the hero group, the store's categories (their order is the
 * tabs'), and nothing for what follows the shopper (order again, the basket). The shop's rails
 * are not listed: a menu does not draw them.
 */
export function MenuHomeSectionsGroup({ layoutField }: { layoutField: React.ReactNode }) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const brand = useBrand();
  const { setActiveGroup } = React.useContext(SettingsNavContext);
  const [open, setOpen] = React.useState<MenuSectionId | null>(null);

  const action = (id: MenuSectionId): React.ReactNode => {
    if (id === "hero") {
      return (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => setActiveGroup("home_hero")}
        >
          {isAr ? "إعدادات الواجهة" : "Hero settings"}
        </Button>
      );
    }
    if (id === "menu") {
      return (
        <Button asChild type="button" variant="outline" size="sm" className="shrink-0">
          <Link to="/admin/b/$slug/categories" params={{ slug: brand.slug }}>
            {isAr ? "الأقسام" : "Categories"}
          </Link>
        </Button>
      );
    }
    return undefined;
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-foreground">
          {isAr ? "الصفحة الرئيسية" : "Home page"}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {isAr
            ? "قائمة طلب سريع بترتيب ظهورها للزائر، وأين يُعدَّل كل جزء."
            : "Your quick-order menu in the order a visitor sees it, and where each part is edited."}
        </p>
      </div>
      {layoutField}
      <ol className="space-y-2">
        {MENU_HOME_SECTIONS.map((id) => {
          const meta = SECTION_META[id];
          return (
            <li key={id}>
              <HomeSectionRow
                id={id}
                icon={meta.icon}
                title={isAr ? meta.ar : meta.en}
                summary={isAr ? meta.hintAr : meta.hintEn}
                on={null}
                open={open === id}
                onOpen={(next) => setOpen(next ? id : null)}
                isAr={isAr}
                action={action(id)}
              >
                {id === "category_pages" ? <CategoryBannerField isAr={isAr} /> : null}
              </HomeSectionRow>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
