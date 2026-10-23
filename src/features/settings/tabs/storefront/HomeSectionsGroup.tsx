import * as React from "react";
import {
  BadgeCheck,
  BadgePercent,
  BookOpen,
  Clock3,
  Flame,
  History,
  LayoutTemplate,
  Rows3,
  Sparkles,
  Star,
  type LucideIcon,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { Json } from "@/integrations/supabase/types";
import { useBrandSettingsFormContext } from "@/features/settings/use-brand-settings-form";
import { SettingsNavContext } from "@/features/settings/GroupNavigator";
import { AdvancedOnly } from "@/features/settings/FieldVisibility";
import { isStorefrontV2 } from "@/lib/storefront-engine";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { BannerSizeControl } from "./BannerSizeControl";
import { BannerMotionFields } from "./BannerMotionFields";
import { EditorialSectionFields, useEditorialSections } from "./EditorialSectionFields";
import { HomeSectionRow } from "./HomeSectionRow";
import {
  BrandStoryFields,
  CategoryBannerField,
  SectionTitleFields,
  TrustBarFields,
} from "./HomeSectionFields";
import { PromoCardsEditor } from "./PromoCardsEditor";
import { ServicesHomeSectionsGroup } from "./ServicesHomeSectionsGroup";
import { useBrand } from "@/lib/brand-context";
import { useAdminStoreProfile } from "@/hooks/use-store-profile";
import { isServicesProfile } from "@/lib/store-profile";
import {
  filledPromoCards,
  startedPromoCards,
  homePageSections,
  homeSectionOn,
  type HomeSectionId,
} from "./home-page-sections";

const SECTION_META: Record<
  HomeSectionId,
  { icon: LucideIcon; ar: string; en: string; hintAr: string; hintEn: string }
> = {
  hero: {
    icon: LayoutTemplate,
    ar: "الواجهة",
    en: "Hero",
    hintAr: "أول ما يراه الزائر: الشرائح والعنوان المتحرك",
    hintEn: "The first thing a visitor sees: slides and animated headline",
  },
  trust_bar: {
    icon: BadgeCheck,
    ar: "شريط الثقة",
    en: "Trust bar",
    hintAr: "شارات مثل الدفع الآمن والتوصيل السريع",
    hintEn: "Badges such as secure payment and fast delivery",
  },
  promo_cards: {
    icon: Rows3,
    ar: "البطاقات الترويجية",
    en: "Promo cards",
    hintAr: "",
    hintEn: "",
  },
  new: {
    icon: Sparkles,
    ar: "وصل حديثاً",
    en: "New arrivals",
    hintAr: "أحدث المنتجات",
    hintEn: "The latest products",
  },
  best: {
    icon: Star,
    ar: "الأكثر مبيعاً",
    en: "Best sellers",
    hintAr: "المنتجات الأكثر طلباً",
    hintEn: "The most ordered products",
  },
  sale: {
    icon: BadgePercent,
    ar: "التنزيلات",
    en: "On sale",
    hintAr: "يظهر عند وجود منتجات مخفّضة",
    hintEn: "Shows when products are discounted",
  },
  trending: {
    icon: Flame,
    ar: "الرائج الآن",
    en: "Trending now",
    hintAr: "الأكثر مشاهدة هذا الأسبوع",
    hintEn: "Most viewed this week",
  },
  brand_story: {
    icon: BookOpen,
    ar: "قصة المتجر",
    en: "Brand story",
    hintAr: "صورة وقصة متجرك",
    hintEn: "Your store's picture and story",
  },
  recently_viewed: {
    icon: History,
    ar: "شوهد مؤخراً",
    en: "Recently viewed",
    hintAr: "ما تصفحه الزائر من قبل",
    hintEn: "What the visitor looked at before",
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
 * The home page, section by section in the order a shopper scrolls it (`homePageSections`): each
 * section is one row with its switch, and opens to everything about it. Before, its settings were
 * spread over this group, the "new look" options, the footer and the hero.
 */
export function HomeSectionsGroup() {
  const brand = useBrand();
  const { profile } = useAdminStoreProfile(brand.id);
  // A services store's home page is ServicesHome: its own sections, not the shop's.
  return isServicesProfile(profile.modules) ? (
    <ServicesHomeSectionsGroup />
  ) : (
    <ShopHomeSectionsGroup />
  );
}

function ShopHomeSectionsGroup() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const { form, setBs } = useBrandSettingsFormContext();
  const bs = form.bs;
  const isV2 = isStorefrontV2(bs);
  const editorial = useEditorialSections();
  const { setActiveGroup } = React.useContext(SettingsNavContext);
  const [open, setOpen] = React.useState<HomeSectionId | null>(null);
  const settings = bs as unknown as Record<string, unknown>;

  const toggle = (id: HomeSectionId, on: boolean) => {
    if (id === "trust_bar") {
      // One switch for the bar: turning it on also clears the badges' older flag.
      const badges: { [key: string]: Json | undefined } =
        bs.trust_badges && typeof bs.trust_badges === "object" && !Array.isArray(bs.trust_badges)
          ? bs.trust_badges
          : {};
      setBs({
        trust_bar_enabled: on,
        ...(on ? { trust_badges: { items: [], ...badges, enabled: true } } : {}),
      });
    } else if (id === "new") setBs({ show_new_arrivals: on });
    else if (id === "best" || id === "sale" || id === "trending") {
      editorial.patchSection(id, { enabled: on });
    } else if (id === "brand_story") setBs({ brand_story_enabled: on });
    else if (id === "recently_viewed") setBs({ recently_viewed_enabled: on });
  };

  const summary = (id: HomeSectionId): string => {
    const meta = SECTION_META[id];
    const on = homeSectionOn(id, settings);
    if (on === false) return isAr ? "مخفي" : "Hidden";
    if (id === "promo_cards") {
      const filled = filledPromoCards(settings);
      const started = startedPromoCards(settings);
      if (filled === 0 && started > 0) {
        return isAr
          ? `${started} بطاقات لها رابط بلا صورة ولا عنوان: لا تظهر`
          : `${started} cards have a link but no picture or title: they do not show`;
      }
      return filled === 0
        ? isAr
          ? "لا بطاقات بعد: لا يظهر القسم"
          : "No cards yet: the section does not show"
        : isAr
          ? `${filled} من 4 بطاقات`
          : `${filled} of 4 cards`;
    }
    return isAr ? meta.hintAr : meta.hintEn;
  };

  const body = (id: HomeSectionId): React.ReactNode => {
    switch (id) {
      case "trust_bar":
        return <TrustBarFields isAr={isAr} />;
      case "promo_cards":
        return <PromoCardsEditor isAr={isAr} />;
      case "new":
        return (
          <SectionTitleFields
            isAr={isAr}
            idPrefix="home-new-title"
            valueAr={bs.new_arrivals_title_ar}
            valueEn={bs.new_arrivals_title_en}
            defaultAr="وصل حديثاً"
            defaultEn="New arrivals"
            onChange={(patch) =>
              setBs({
                ...("ar" in patch ? { new_arrivals_title_ar: patch.ar } : {}),
                ...("en" in patch ? { new_arrivals_title_en: patch.en } : {}),
              })
            }
          />
        );
      case "best":
        return (
          <>
            <SectionTitleFields
              isAr={isAr}
              idPrefix="home-best-title"
              valueAr={bs.best_sellers_title_ar}
              valueEn={bs.best_sellers_title_en}
              defaultAr="الأكثر مبيعاً"
              defaultEn="Best sellers"
              onChange={(patch) =>
                setBs({
                  ...("ar" in patch ? { best_sellers_title_ar: patch.ar } : {}),
                  ...("en" in patch ? { best_sellers_title_en: patch.en } : {}),
                })
              }
            />
            <EditorialSectionFields kind="best" editorial={editorial} isAr={isAr} />
          </>
        );
      case "sale":
        return (
          <>
            <EditorialSectionFields kind="sale" editorial={editorial} isAr={isAr} />
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
              <div className="min-w-0">
                <Label htmlFor="sale-badges">
                  {isAr ? "شارة الخصم على بطاقات المنتجات" : "Discount badge on product cards"}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {isAr ? "في كل صفحات المتجر" : "On every page of the store"}
                </p>
              </div>
              <Switch
                id="sale-badges"
                checked={bs.global_sale_badges_enabled ?? true}
                onCheckedChange={(checked) => setBs({ global_sale_badges_enabled: checked })}
              />
            </div>
          </>
        );
      case "trending":
        return <EditorialSectionFields kind="trending" editorial={editorial} isAr={isAr} />;
      case "brand_story":
        return <BrandStoryFields isAr={isAr} />;
      case "category_pages":
        return <CategoryBannerField isAr={isAr} />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-foreground">
          {isAr ? "الصفحة الرئيسية" : "Home page"}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {isAr
            ? "أقسام صفحتك الرئيسية بترتيب ظهورها للزائر. افتح القسم لتعديله، والمفتاح يظهره أو يخفيه."
            : "Your home page's sections in the order a visitor sees them. Open a section to edit it; its switch shows or hides it."}
        </p>
      </div>

      <ol className="space-y-2">
        {homePageSections(isV2).map((id) => {
          const meta = SECTION_META[id];
          const title = isAr ? meta.ar : meta.en;
          if (id === "hero") {
            return (
              <li key={id}>
                <HomeSectionRow
                  id={id}
                  icon={meta.icon}
                  title={title}
                  summary={summary(id)}
                  on={null}
                  open={false}
                  onOpen={() => undefined}
                  isAr={isAr}
                  action={
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => setActiveGroup("home_hero")}
                    >
                      {isAr ? "إعدادات الواجهة" : "Hero settings"}
                    </Button>
                  }
                />
              </li>
            );
          }
          return (
            <li key={id}>
              <HomeSectionRow
                id={id}
                icon={meta.icon}
                title={title}
                summary={summary(id)}
                on={homeSectionOn(id, settings)}
                onToggle={(on) => toggle(id, on)}
                open={open === id}
                onOpen={(next) => setOpen(next ? id : null)}
                isAr={isAr}
              >
                {body(id)}
              </HomeSectionRow>
            </li>
          );
        })}
      </ol>

      <div className="space-y-3 border-t border-border pt-4">
        <BannerSizeControl />
        <AdvancedOnly
          fieldKey="secondary_banner_parallax_enabled"
          reason={isAr ? "حركة اللافتات مع التمرير" : "Banner motion while scrolling"}
        >
          <BannerMotionFields isAr={isAr} />
        </AdvancedOnly>
      </div>
    </div>
  );
}
