import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useBrandSettingsFormContext } from "@/features/settings/use-brand-settings-form";
import { BANNER_SIZES, resolveBannerSize, type BannerSize } from "@/lib/banner-size";

const OPTIONS: Record<
  BannerSize,
  { label: { ar: string; en: string }; hint: { ar: string; en: string }; bar: string }
> = {
  compact: {
    label: { ar: "مضغوطة", en: "Compact" },
    hint: {
      ar: "شريط نحيف: المنتجات تظهر في أول شاشة. الأنسب لمعظم المتاجر.",
      en: "A slim band: the products start in the first screen. Right for most stores.",
    },
    bar: "h-3",
  },
  medium: {
    label: { ar: "متوسطة", en: "Medium" },
    hint: {
      ar: "مساحة تكفي لتُقرأ الصورة، وأقل من نصف الشاشة.",
      en: "Room for the picture to read, under half the screen.",
    },
    bar: "h-5",
  },
  large: {
    label: { ar: "كبيرة", en: "Large" },
    hint: {
      ar: "الحجم القديم: لافتة بارزة، لكنها تدفع المنتجات للأسفل.",
      en: "The original tall band: a statement, but it pushes the products down.",
    },
    bar: "h-8",
  },
};

/**
 * How tall the banners are above a home page section and above a category's products. Only the
 * height changes; the pictures and titles the merchant chose stay as they are.
 */
export function BannerSizeControl() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const { form, setBs } = useBrandSettingsFormContext();
  const size = resolveBannerSize(form.bs.storefront_banner_size);

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-5 shadow-sm">
      <div>
        <h3 className="text-base font-semibold text-foreground">
          {isAr ? "حجم اللافتات" : "Banner size"}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {isAr
            ? "ارتفاع اللافتة فوق أقسام الصفحة الرئيسية وفوق منتجات كل قسم. الصور والعناوين كما وضعتها."
            : "How tall the band is above each home page section and above a category's products. Your pictures and titles stay as they are."}
        </p>
      </div>
      <div
        role="radiogroup"
        aria-label={isAr ? "حجم اللافتات" : "Banner size"}
        className="grid gap-2 sm:grid-cols-3"
      >
        {BANNER_SIZES.map((choice) => {
          const option = OPTIONS[choice];
          const on = size === choice;
          return (
            <Button
              key={choice}
              type="button"
              variant="ghost"
              role="radio"
              aria-checked={on}
              onClick={() => setBs({ storefront_banner_size: choice })}
              className={cn(
                "h-auto flex-col items-stretch gap-2 whitespace-normal rounded-xl border p-3 text-start font-normal",
                on
                  ? "border-primary bg-primary/5 hover:bg-primary/5"
                  : "border-border hover:border-primary/50",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "block w-full rounded-md",
                  option.bar,
                  on ? "bg-primary/70" : "bg-muted-foreground/30",
                )}
              />
              <span className="text-sm font-semibold text-foreground">
                {isAr ? option.label.ar : option.label.en}
              </span>
              <span className="text-xs text-muted-foreground">
                {isAr ? option.hint.ar : option.hint.en}
              </span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
