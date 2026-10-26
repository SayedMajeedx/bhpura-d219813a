import { useEffect, useId, useState } from "react";
import { Gift, Percent, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  PHONE_SHEET,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formatMoney } from "@/lib/format";
import { offerTerms, type OfferKind } from "@/lib/offers";
import { cn } from "@/lib/utils";
import {
  OfferScopeFields,
  type ScopeCategory,
  type ScopeProduct,
} from "@/features/offers/components/OfferScopeFields";
import {
  draftOffer,
  emptyOfferForm,
  offerFormProblem,
  type OfferForm,
} from "@/features/offers/lib/offer-form";

const KINDS: Array<{
  kind: OfferKind;
  icon: typeof Percent;
  ar: string;
  en: string;
  hintAr: string;
  hintEn: string;
}> = [
  {
    kind: "discount",
    icon: Percent,
    ar: "خصم تلقائي",
    en: "Automatic discount",
    hintAr: "نسبة أو مبلغ يُخصم بلا رمز",
    hintEn: "A percentage or amount off, no code",
  },
  {
    kind: "buy_x_get_y",
    icon: Gift,
    ar: "اشترِ واحصل",
    en: "Buy X get Y",
    hintAr: "قطع مجانية أو مخفضة مع الشراء",
    hintEn: "Pieces free or reduced with a purchase",
  },
  {
    kind: "free_delivery",
    icon: Truck,
    ar: "توصيل مجاني",
    en: "Free delivery",
    hintAr: "فوق مبلغ تختاره",
    hintEn: "Over an amount you choose",
  },
];

/** One offer's form: its kind, what it gives, the lines it reaches, what it asks, and when. */
export function StoreOfferDialog({
  open,
  onOpenChange,
  isNew,
  initial,
  isAr,
  currency,
  products,
  categories,
  saving,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isNew: boolean;
  initial: OfferForm;
  isAr: boolean;
  currency: string;
  products: ScopeProduct[];
  categories: ScopeCategory[];
  saving: boolean;
  onSave: (form: OfferForm) => void;
}) {
  const id = useId();
  const [form, setForm] = useState(initial);
  useEffect(() => {
    if (open) setForm(initial);
  }, [open, initial]);
  const patch = (next: Partial<OfferForm>) => setForm((current) => ({ ...current, ...next }));
  const lang = isAr ? "ar" : "en";
  const money = (n: number) => formatMoney(n, currency, lang);
  const problem = offerFormProblem(form, isAr);
  const terms = problem ? null : offerTerms(draftOffer(form), lang, money);
  const field = (name: string) => `${id}-${name}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("max-h-[90dvh] max-w-2xl overflow-y-auto", PHONE_SHEET)}>
        <DialogHeader>
          <DialogTitle>
            {isNew ? (isAr ? "عرض جديد" : "New offer") : isAr ? "تعديل العرض" : "Edit offer"}
          </DialogTitle>
          <DialogDescription>
            {isAr
              ? "يُطبّق العرض تلقائيًا على طلبات المتجر دون رمز."
              : "The offer applies to the store's orders by itself, with no code."}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!problem) onSave(form);
          }}
        >
          {isNew && (
            <div
              role="group"
              aria-label={isAr ? "نوع العرض" : "Kind of offer"}
              className="grid gap-2 sm:grid-cols-3"
            >
              {KINDS.map(({ kind, icon: Icon, ar, en, hintAr, hintEn }) => (
                <Button
                  key={kind}
                  type="button"
                  variant="outline"
                  aria-pressed={form.kind === kind}
                  onClick={() =>
                    setForm({
                      ...emptyOfferForm(kind),
                      name_ar: form.name_ar,
                      name_en: form.name_en,
                    })
                  }
                  className={cn(
                    "h-auto min-w-0 items-start justify-start gap-2 whitespace-normal rounded-xl border-border p-3 text-start font-normal",
                    form.kind === kind ? "border-primary bg-primary/10" : "hover:bg-muted/60",
                  )}
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{isAr ? ar : en}</span>
                    <span className="block text-xs text-muted-foreground">
                      {isAr ? hintAr : hintEn}
                    </span>
                  </span>
                </Button>
              ))}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={field("name-ar")}>{isAr ? "الاسم بالعربية" : "Name (Arabic)"}</Label>
              <Input
                id={field("name-ar")}
                dir="rtl"
                value={form.name_ar}
                maxLength={80}
                onChange={(event) => patch({ name_ar: event.target.value })}
                placeholder={isAr ? "مثال: عرض العيد" : "e.g. عرض العيد"}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={field("name-en")}>
                {isAr ? "الاسم بالإنجليزية" : "Name (English)"}
              </Label>
              <Input
                id={field("name-en")}
                dir="ltr"
                value={form.name_en}
                maxLength={80}
                onChange={(event) => patch({ name_en: event.target.value })}
                placeholder={isAr ? "مثال: Eid offer" : "e.g. Eid offer"}
              />
            </div>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">
            {isAr
              ? "يظهر الاسم للعميل في السلة والدفع. اتركه فارغًا ليظهر وصف العرض."
              : "Shoppers see the name in the cart and at checkout; leave it empty to show the offer's terms."}
          </p>

          {form.kind === "discount" && (
            <fieldset className="space-y-3 rounded-xl border border-border p-3">
              <legend className="px-1 text-xs font-semibold text-muted-foreground">
                {isAr ? "ماذا يخصم" : "What it takes off"}
              </legend>
              <div
                role="group"
                aria-label={isAr ? "نوع الخصم" : "Kind of discount"}
                className="flex gap-2"
              >
                {(["percentage", "fixed"] as const).map((type) => (
                  <Button
                    key={type}
                    type="button"
                    size="sm"
                    variant="chip"
                    aria-pressed={form.discount_type === type}
                    className={cn(
                      "border border-border",
                      form.discount_type === type && "border-primary bg-primary/10 text-foreground",
                    )}
                    onClick={() => patch({ discount_type: type })}
                  >
                    {type === "percentage"
                      ? isAr
                        ? "نسبة %"
                        : "Percentage"
                      : isAr
                        ? "مبلغ ثابت"
                        : "Fixed amount"}
                  </Button>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={field("value")}>
                    {form.discount_type === "percentage"
                      ? isAr
                        ? "النسبة (%)"
                        : "Percentage (%)"
                      : isAr
                        ? "المبلغ"
                        : "Amount"}
                  </Label>
                  <Input
                    id={field("value")}
                    inputMode="decimal"
                    value={form.discount_value}
                    onChange={(event) => patch({ discount_value: event.target.value })}
                  />
                </div>
                {form.discount_type === "percentage" && (
                  <div className="space-y-1.5">
                    <Label htmlFor={field("cap")}>
                      {isAr ? "أقصى خصم (اختياري)" : "Most it takes off (optional)"}
                    </Label>
                    <Input
                      id={field("cap")}
                      inputMode="decimal"
                      value={form.max_discount}
                      onChange={(event) => patch({ max_discount: event.target.value })}
                    />
                  </div>
                )}
              </div>
            </fieldset>
          )}

          {form.kind === "buy_x_get_y" && (
            <fieldset className="space-y-3 rounded-xl border border-border p-3">
              <legend className="px-1 text-xs font-semibold text-muted-foreground">
                {isAr ? "ماذا يُهدي" : "What it gives"}
              </legend>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor={field("buy")}>{isAr ? "عند شراء (قطع)" : "Buy (pieces)"}</Label>
                  <Input
                    id={field("buy")}
                    inputMode="numeric"
                    value={form.buy_quantity}
                    onChange={(event) => patch({ buy_quantity: event.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={field("get")}>{isAr ? "يحصل على (قطع)" : "Get (pieces)"}</Label>
                  <Input
                    id={field("get")}
                    inputMode="numeric"
                    value={form.get_quantity}
                    onChange={(event) => patch({ get_quantity: event.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={field("percent")}>
                    {isAr ? "بخصم (%) — 100 مجانًا" : "At (%) off — 100 is free"}
                  </Label>
                  <Input
                    id={field("percent")}
                    inputMode="decimal"
                    value={form.get_percent}
                    onChange={(event) => patch({ get_percent: event.target.value })}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {isAr
                  ? "تُهدى أرخص القطع، ويتكرر العرض بقدر ما تسمح السلة."
                  : "The cheapest pieces are given, as many times as the cart allows."}
              </p>
              <div className="space-y-1.5 sm:max-w-xs">
                <Label htmlFor={field("sets")}>
                  {isAr ? "أقصى عدد مرات في الطلب (اختياري)" : "Most times per order (optional)"}
                </Label>
                <Input
                  id={field("sets")}
                  inputMode="numeric"
                  value={form.max_sets}
                  onChange={(event) => patch({ max_sets: event.target.value })}
                />
              </div>
              <Label className="flex items-center gap-2 text-sm font-normal">
                <Checkbox
                  checked={form.get_other}
                  onCheckedChange={(checked) => patch({ get_other: checked === true })}
                />
                {isAr
                  ? "القطع المهداة من منتجات أخرى غير المشتراة"
                  : "The pieces given come from other products than the ones bought"}
              </Label>
              {form.get_other && (
                <OfferScopeFields
                  isAr={isAr}
                  legend={isAr ? "من أين تُهدى القطع" : "Pieces given from"}
                  products={products}
                  categories={categories}
                  productIds={form.get_product_ids}
                  categorySlugs={form.get_category_slugs}
                  allowAll={false}
                  onChange={(next) =>
                    patch({
                      get_product_ids: next.product_ids,
                      get_category_slugs: next.category_slugs,
                    })
                  }
                />
              )}
            </fieldset>
          )}

          {form.kind === "free_delivery" && (
            <div className="flex items-start justify-between gap-3 rounded-xl border border-border p-3">
              <Label htmlFor={field("local")} className="min-w-0 text-sm font-normal">
                <span className="block font-medium">
                  {isAr ? "للتوصيل المحلي فقط" : "Local deliveries only"}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {isAr ? "الشحن إلى الخارج يبقى برسومه." : "Shipping abroad keeps its fee."}
                </span>
              </Label>
              <Switch
                id={field("local")}
                checked={form.local_only}
                onCheckedChange={(checked) => patch({ local_only: checked })}
              />
            </div>
          )}

          <OfferScopeFields
            isAr={isAr}
            legend={
              form.kind === "buy_x_get_y"
                ? isAr
                  ? "القطع التي تُشترى"
                  : "Pieces bought"
                : isAr
                  ? "المنتجات التي يشملها"
                  : "Products it covers"
            }
            products={products}
            categories={categories}
            productIds={form.product_ids}
            categorySlugs={form.category_slugs}
            onChange={(next) =>
              patch({ product_ids: next.product_ids, category_slugs: next.category_slugs })
            }
          />
          <Label className="flex items-center gap-2 text-sm font-normal">
            <Checkbox
              checked={form.exclude_sale_items}
              onCheckedChange={(checked) => patch({ exclude_sale_items: checked === true })}
            />
            {isAr ? "لا يشمل القطع المخفضة" : "Leave out pieces already on sale"}
          </Label>

          {form.kind !== "buy_x_get_y" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={field("min")}>
                  {isAr ? "أقل قيمة للطلب (اختياري)" : "Least order amount (optional)"}
                </Label>
                <Input
                  id={field("min")}
                  inputMode="decimal"
                  value={form.min_subtotal}
                  onChange={(event) => patch({ min_subtotal: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={field("min-items")}>
                  {isAr ? "أقل عدد قطع (اختياري)" : "Least pieces (optional)"}
                </Label>
                <Input
                  id={field("min-items")}
                  inputMode="numeric"
                  value={form.min_items}
                  onChange={(event) => patch({ min_items: event.target.value })}
                />
              </div>
              <p className="text-xs text-muted-foreground sm:col-span-2">
                {isAr
                  ? "تُحسب من المنتجات التي يشملها العرض، قبل أي خصم."
                  : "Counted on the products the offer covers, before any discount."}
              </p>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={field("starts")}>
                {isAr ? "يبدأ (اختياري)" : "Starts (optional)"}
              </Label>
              <Input
                id={field("starts")}
                type="datetime-local"
                value={form.starts_at}
                onChange={(event) => patch({ starts_at: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={field("ends")}>{isAr ? "ينتهي (اختياري)" : "Ends (optional)"}</Label>
              <Input
                id={field("ends")}
                type="datetime-local"
                value={form.ends_at}
                onChange={(event) => patch({ ends_at: event.target.value })}
              />
            </div>
          </div>

          <div
            className={cn(
              "rounded-xl px-3 py-2 text-sm",
              problem ? "bg-destructive/10 text-destructive" : "bg-muted/60",
            )}
            role="status"
          >
            {problem ?? (isAr ? `يرى العميل: ${terms}` : `Shoppers read: ${terms}`)}
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button type="submit" disabled={Boolean(problem) || saving}>
              {isAr ? "حفظ العرض" : "Save offer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
