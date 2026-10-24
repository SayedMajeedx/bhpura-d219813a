import { BellRing, Hourglass, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { promoOffer } from "@/features/content-studio/lib/moments";
import type { ContentStudio } from "@/features/content-studio/hooks/use-content-studio";
import { arNounOblique } from "@/lib/arabic-count";

/** "No code" in the code picker (a Select item needs a value). */
const NO_CODE = "none";

/** The box each moment's choices sit in, under the product picker. */
export function MomentBox({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: typeof Star;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3 rounded-2xl border border-border-strong bg-muted/20 p-3.5 sm:p-4 min-w-0">
      <div className="flex items-center gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-3.5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 className="text-xs font-bold text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

export function SwitchRow({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border-strong bg-card/60 px-3.5 py-2.5">
      <Label htmlFor={id} className="text-xs font-bold text-foreground cursor-pointer">
        {label}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

/**
 * The choices of the templates made for a moment: Last Chance's last day and
 * code, Back in Stock's products that are back with shoppers waiting, and
 * Customer Favourite's reviews. Nothing for the other templates.
 */
export function MomentPanel({ studio }: { studio: ContentStudio }) {
  const { isAr, templateId, currencySymbol } = studio;
  const lang = isAr ? "ar" : "en";

  if (templateId === "last-chance") {
    const { deadlineDay, setDeadlineDay, promos, promoId, choosePromo } = studio;
    return (
      <MomentBox
        icon={Hourglass}
        title={isAr ? "آخر يوم للعرض" : "When it ends"}
        hint={
          isAr
            ? "يظهر الكود فقط إن كان لأكثر من عميل ولم ينتهِ بعد."
            : "Only codes open to more than one shopper, and not yet over, can be shown."
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 min-w-0">
            <Label htmlFor="studio-deadline" className="text-xs font-medium text-muted-foreground">
              {isAr ? "آخر يوم" : "Last day"}
            </Label>
            <Input
              id="studio-deadline"
              type="date"
              dir="ltr"
              value={deadlineDay}
              onChange={(event) => setDeadlineDay(event.target.value)}
              className="h-10 rounded-xl text-xs"
            />
          </div>
          <div className="space-y-1.5 min-w-0">
            <Label htmlFor="studio-promo" className="text-xs font-medium text-muted-foreground">
              {isAr ? "كود الخصم (اختياري)" : "Discount code (optional)"}
            </Label>
            <Select
              value={promoId ?? NO_CODE}
              onValueChange={(value) => choosePromo(value === NO_CODE ? null : value)}
            >
              <SelectTrigger id="studio-promo" className="h-10 rounded-xl text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CODE}>{isAr ? "بدون كود" : "No code"}</SelectItem>
                {promos.map((promo) => (
                  <SelectItem key={promo.id} value={promo.id}>
                    {promo.code} · {promoOffer(promo, lang, currencySymbol).join(" ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {promos.length === 0 && (
          <p className="text-xs text-muted-foreground">
            {isAr
              ? "لا توجد أكواد عامة سارية بتاريخ انتهاء. أضف واحداً من صفحة الخصومات، أو اكتب العرض في النص."
              : "No public code with an end date is running. Add one on the Discounts page, or write the offer in the copy."}
          </p>
        )}
      </MomentBox>
    );
  }

  if (templateId === "back-in-stock") {
    const { asked, showAsked, setShowAsked, backNowIds, products, selected, setProductId } = studio;
    const backNow = backNowIds
      .map((id) => products.find((product) => product.id === id))
      .filter((product): product is (typeof products)[number] => Boolean(product))
      .slice(0, 6);
    return (
      <MomentBox
        icon={BellRing}
        title={isAr ? "رجعت للمخزون" : "Back on the shelf"}
        hint={
          backNow.length > 0
            ? isAr
              ? "منتجات رجعت وفيه عملاء ينتظرونها:"
              : "Back now, with shoppers waiting for them:"
            : isAr
              ? "المقاسات المتوفرة تظهر من المخزون مباشرة."
              : "The sizes shown are the ones in stock now."
        }
      >
        {backNow.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {backNow.map((product) => {
              const picked = product.id === selected?.id;
              return (
                <Button
                  key={product.id}
                  type="button"
                  variant="chip"
                  size="sm"
                  aria-pressed={picked}
                  onClick={() => setProductId(product.id)}
                  className={cn(
                    "max-w-full rounded-full border-border",
                    picked && "border-primary bg-primary/10 text-primary hover:bg-primary/10",
                  )}
                >
                  <span className="truncate">
                    {isAr ? product.name_ar || product.name : product.name_en || product.name}
                  </span>
                </Button>
              );
            })}
          </div>
        )}
        <SwitchRow
          id="studio-show-asked"
          label={
            asked >= 3
              ? isAr
                ? `إظهار عدد من طلبوها (${asked})`
                : `Show how many asked for it (${asked})`
              : isAr
                ? "إظهار عدد من طلبوها (يظهر من ٣ طلبات)"
                : "Show how many asked for it (shows from 3)"
          }
          checked={showAsked}
          onChange={setShowAsked}
        />
      </MomentBox>
    );
  }

  if (templateId === "customer-favourite") {
    const { reviewSummary, reviewsLoading, showHighlights, setShowHighlights } = studio;
    return (
      <MomentBox
        icon={Star}
        title={isAr ? "تقييمات المتجر" : "The store's reviews"}
        hint={
          reviewsLoading
            ? isAr
              ? "جارٍ قراءة التقييمات…"
              : "Reading the reviews…"
            : reviewSummary
              ? isAr
                ? `${reviewSummary.average} من 5، من ${arNounOblique(reviewSummary.count, "review")}. لا يظهر اسم أي عميل.`
                : `${reviewSummary.average} out of 5, from ${reviewSummary.count} reviews. No customer is named.`
              : isAr
                ? "لا توجد تقييمات بعد: تظهر القطعة بدون نجوم."
                : "No reviews yet: the piece shows without stars."
        }
      >
        {reviewSummary && reviewSummary.highlights.length > 0 && (
          <SwitchRow
            id="studio-show-highlights"
            label={isAr ? "إظهار أكثر ما يمدحه العملاء" : "Show what customers praise most"}
            checked={showHighlights}
            onChange={setShowHighlights}
          />
        )}
      </MomentBox>
    );
  }

  return null;
}
