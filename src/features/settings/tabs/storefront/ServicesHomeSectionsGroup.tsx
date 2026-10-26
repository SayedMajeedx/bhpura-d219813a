import * as React from "react";
import { Link } from "@tanstack/react-router";
import {
  CalendarDays,
  Clock3,
  Gem,
  HelpCircle,
  Images,
  LayoutTemplate,
  ShieldCheck,
  Star,
  type LucideIcon,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useBrand } from "@/lib/brand-context";
import { SettingsNavContext } from "@/features/settings/GroupNavigator";
import { Button } from "@/components/ui/button";
import { StoreContentDialog } from "@/features/store-content/components/StoreContentDialog";
import { HomeSectionRow } from "./HomeSectionRow";
import { CategoryBannerField, TrustBarFields } from "./HomeSectionFields";
import { useBrandSettingsFormContext } from "@/features/settings/use-brand-settings-form";
import { BannerSizeControl } from "./BannerSizeControl";
import {
  SERVICES_HOME_SECTIONS,
  homeSectionOn,
  trustBadgesTurnedOn,
  type ServicesHomeSectionId,
} from "./home-page-sections";

const SECTION_META: Record<
  ServicesHomeSectionId,
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
    icon: ShieldCheck,
    ar: "شريط الثقة",
    en: "Trust bar",
    hintAr: "تحت الواجهة: كيف يُدفع، وأين تُقدَّم الخدمة، وما تعد به",
    hintEn: "Under the hero: how a booking is paid, where you serve, what you promise",
  },
  booking_invite: {
    icon: CalendarDays,
    ar: "دعوة للحجز",
    en: "Invitation to book",
    hintAr: "تحت الواجهة ومرة أخرى قبل الأسئلة: طريق إلى الأيام المتاحة",
    hintEn: "Under the hero and again before the questions: a way to the free dates",
  },
  offers: {
    icon: Gem,
    ar: "الباقات والتأجير والخدمات",
    en: "Packages, rentals and services",
    hintAr: "من خدماتك: الباقات أولاً ثم التأجير والخدمات، بأسعارها ومددها",
    hintEn:
      "From your services: packages first, then rentals and services, with prices and lengths",
  },
  gallery: {
    icon: Images,
    ar: "المعرض",
    en: "Gallery",
    hintAr: "صور من أعمالك السابقة",
    hintEn: "Pictures of your past work",
  },
  reviews: {
    icon: Star,
    ar: "آراء العملاء",
    en: "What customers said",
    hintAr: "تظهر حين يقيّم العملاء، وتختار في صفحة التقييمات ما يظهر من كلماتهم",
    hintEn: "Shows once customers review; you choose which of their words show on the Reviews page",
  },
  faq: {
    icon: HelpCircle,
    ar: "الأسئلة الشائعة",
    en: "Questions",
    hintAr: "أجوبة لما يسأله العملاء قبل الحجز",
    hintEn: "Answers to what customers ask before booking",
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
 * A services store's home page, section by section in the order a shopper scrolls it
 * (`SERVICES_HOME_SECTIONS`, drawn by `ServicesHome`). The page has no switches of its own: each
 * row says what shows and opens where it is edited (the hero group, the services list, the
 * gallery and questions here, the Reviews page); the trust bar has its switch and badges here.
 * The shop's other sections (new arrivals, best sellers) are not listed: a services home never
 * draws them.
 */
export function ServicesHomeSectionsGroup() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const brand = useBrand();
  const { setActiveGroup } = React.useContext(SettingsNavContext);
  const [open, setOpen] = React.useState<ServicesHomeSectionId | null>(null);
  const [contentOpen, setContentOpen] = React.useState(false);
  const { form, setBs } = useBrandSettingsFormContext();
  const settings = form.bs as unknown as Record<string, unknown>;

  const linkButton = (to: string, label: string) => (
    <Button asChild type="button" variant="outline" size="sm" className="shrink-0">
      <Link to={to} params={{ slug: brand.slug }}>
        {label}
      </Link>
    </Button>
  );

  const action = (id: ServicesHomeSectionId): React.ReactNode => {
    switch (id) {
      case "hero":
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
      case "offers":
        return linkButton("/admin/b/$slug/inventory", isAr ? "إدارة الخدمات" : "Manage services");
      case "gallery":
      case "faq":
        return (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => setContentOpen(true)}
          >
            {isAr ? "تعديل" : "Edit"}
          </Button>
        );
      case "reviews":
        return linkButton("/admin/b/$slug/reviews", isAr ? "التقييمات" : "Reviews");
      default:
        return undefined;
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
            ? "صفحة متجر الخدمات بترتيب ظهورها للزائر، وأين يُعدَّل كل قسم."
            : "Your services home page in the order a visitor sees it, and where each part is edited."}
        </p>
      </div>

      <ol className="space-y-2">
        {SERVICES_HOME_SECTIONS.map((id) => {
          const meta = SECTION_META[id];
          return (
            <li key={id}>
              <HomeSectionRow
                id={id}
                icon={meta.icon}
                title={isAr ? meta.ar : meta.en}
                summary={isAr ? meta.hintAr : meta.hintEn}
                on={id === "trust_bar" ? homeSectionOn("trust_bar", settings) : null}
                onToggle={
                  id === "trust_bar"
                    ? (on) =>
                        setBs({
                          trust_bar_enabled: on,
                          ...(on ? { trust_badges: trustBadgesTurnedOn(settings) } : {}),
                        })
                    : undefined
                }
                open={open === id}
                onOpen={(next) => setOpen(next ? id : null)}
                isAr={isAr}
                action={action(id)}
              >
                {id === "category_pages" ? (
                  <CategoryBannerField isAr={isAr} />
                ) : id === "trust_bar" ? (
                  <TrustBarFields isAr={isAr} />
                ) : null}
              </HomeSectionRow>
            </li>
          );
        })}
      </ol>

      <div className="border-t border-border pt-4">
        <BannerSizeControl />
      </div>

      {contentOpen && (
        <StoreContentDialog
          brandId={brand.id}
          isAr={isAr}
          open={contentOpen}
          onOpenChange={setContentOpen}
        />
      )}
    </div>
  );
}
