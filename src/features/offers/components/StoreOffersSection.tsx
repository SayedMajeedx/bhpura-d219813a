import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { catalogQueries } from "@/lib/data/catalog";
import { categoriesQueries } from "@/lib/data/categories";
import {
  createStoreOffer,
  deleteStoreOffer,
  invalidateStoreOffers,
  offersQueries,
  saveOffersCombine,
  updateStoreOffer,
  type OffersCombine,
  type StoreOfferRow,
} from "@/lib/data/offers";
import { formatMoney } from "@/lib/format";
import { assignableCategories } from "@/lib/smart-categories";
import { useStoreCurrency } from "@/hooks/use-store-currency";
import { appliedOfferName, offerEnds, offerTerms } from "@/lib/offers";
import { getFriendlyErrorMessage, cn } from "@/lib/utils";
import { StoreOfferDialog } from "@/features/offers/components/StoreOfferDialog";
import {
  asStoreOffer,
  emptyOfferForm,
  formFromRow,
  offerState,
  rowFromForm,
  type OfferForm,
  type OfferState,
} from "@/features/offers/lib/offer-form";

const COMBINE: Array<{ value: OffersCombine; ar: string; en: string }> = [
  {
    value: "best",
    ar: "الأوفر للعميل: الرمز أو العرض",
    en: "Whichever saves the shopper more: the code or the offer",
  },
  { value: "code_first", ar: "الرمز يلغي العرض", en: "A code replaces the offer" },
  { value: "together", ar: "الرمز والعرض معًا", en: "The code and the offer together" },
];

const STATE_WORDS: Record<OfferState, { ar: string; en: string; tone: string }> = {
  live: { ar: "يعمل الآن", en: "Live", tone: "bg-success/15 text-success" },
  scheduled: { ar: "مجدول", en: "Scheduled", tone: "bg-primary/10 text-primary" },
  ended: { ar: "انتهى", en: "Ended", tone: "bg-muted text-muted-foreground" },
  off: { ar: "متوقف", en: "Off", tone: "bg-muted text-muted-foreground" },
};

/**
 * The Discounts page's automatic offers: the store's offers (a discount with no code, buy X get
 * Y, free delivery over an amount), each switched on and off in place, and how an offer meets a
 * code the shopper typed. The database applies them to every storefront order.
 */
export function StoreOffersSection({ brandId, isAr }: { brandId: string; isAr: boolean }) {
  const qc = useQueryClient();
  const lang = isAr ? "ar" : "en";
  const currency = useStoreCurrency(brandId);
  const money = (n: number) => formatMoney(n, currency, lang);
  const offers = useQuery(offersQueries.list(brandId)).data ?? [];
  const combine = useQuery(offersQueries.combine(brandId)).data ?? "best";
  const productRows = useQuery(catalogQueries.products(brandId)).data;
  const categoryRows = useQuery(categoriesQueries.active(brandId)).data;
  const products = useMemo(
    () =>
      (productRows ?? []).map((p) => ({
        id: p.id,
        name: (isAr ? p.name_ar || p.name : p.name_en || p.name) ?? "",
      })),
    [productRows, isAr],
  );
  const categories = useMemo(
    () =>
      // A product is never filed under an automatic collection, so an offer cannot name one.
      assignableCategories(categoryRows ?? [])
        .filter((c): c is typeof c & { slug: string } => Boolean(c.slug))
        .map((c) => ({
          slug: c.slug,
          name: (isAr ? c.name_ar || c.name_en : c.name_en || c.name_ar) ?? c.slug,
        })),
    [categoryRows, isAr],
  );

  const [editing, setEditing] = useState<{ row: StoreOfferRow | null; form: OfferForm } | null>(
    null,
  );
  const failed = (error: unknown) =>
    toast.error(getFriendlyErrorMessage(error) || (isAr ? "تعذر الحفظ." : "Could not save."));

  const save = useMutation({
    mutationFn: async ({ row, form }: { row: StoreOfferRow | null; form: OfferForm }) => {
      const values = rowFromForm(form);
      if (row) await updateStoreOffer(brandId, row.id, values);
      else await createStoreOffer(brandId, values);
    },
    onSuccess: async () => {
      await invalidateStoreOffers(qc, brandId);
      setEditing(null);
      toast.success(isAr ? "تم حفظ العرض." : "Offer saved.");
    },
    onError: failed,
  });
  const toggle = useMutation({
    mutationFn: (row: StoreOfferRow) =>
      updateStoreOffer(brandId, row.id, { is_active: !row.is_active }),
    onSuccess: () => invalidateStoreOffers(qc, brandId),
    onError: failed,
  });
  const remove = useMutation({
    mutationFn: (row: StoreOfferRow) => deleteStoreOffer(brandId, row.id),
    onSuccess: () => invalidateStoreOffers(qc, brandId),
    onError: failed,
  });
  const setCombine = useMutation({
    mutationFn: (value: OffersCombine) => saveOffersCombine(brandId, value),
    onSuccess: () => invalidateStoreOffers(qc, brandId),
    onError: failed,
  });

  const nameOf = (row: StoreOfferRow) =>
    appliedOfferName(
      {
        id: row.id,
        kind: asStoreOffer(row).kind,
        name_ar: row.name_ar,
        name_en: row.name_en,
        amount: 0,
      },
      lang,
    );

  return (
    <section
      aria-labelledby="store-offers-title"
      className="space-y-3 rounded-2xl border border-border bg-card p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="store-offers-title" className="flex items-center gap-2 text-base font-semibold">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden />
            {isAr ? "العروض التلقائية" : "Automatic offers"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isAr
              ? "تُطبّق على طلبات المتجر دون رمز: خصم، اشترِ واحصل، أو توصيل مجاني."
              : "Applied to the store's orders with no code: a discount, buy X get Y, or free delivery."}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          className="gap-1.5"
          onClick={() => setEditing({ row: null, form: emptyOfferForm("discount") })}
        >
          <Plus className="h-4 w-4" aria-hidden />
          {isAr ? "عرض جديد" : "New offer"}
        </Button>
      </div>

      {offers.length === 0 ? (
        <p className="rounded-xl bg-muted/50 px-3 py-4 text-sm text-muted-foreground">
          {isAr
            ? "لا توجد عروض بعد. أنشئ عرضًا ليراه العميل في صفحة المنتج والسلة ويُخصم عند الدفع."
            : "No offers yet. Create one and shoppers see it on the product page and in the cart, and it comes off at checkout."}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {offers.map((row) => {
            const state = offerState(row);
            const words = STATE_WORDS[state];
            const ends = offerEnds(row, lang);
            return (
              <li key={row.id} className="flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 break-words text-sm font-medium" dir="auto">
                    {nameOf(row)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {offerTerms(asStoreOffer(row), lang, money)}
                    {ends ? ` · ${ends}` : ""}
                  </p>
                </div>
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", words.tone)}>
                  {isAr ? words.ar : words.en}
                </span>
                <Switch
                  checked={row.is_active}
                  onCheckedChange={() => toggle.mutate(row)}
                  aria-label={isAr ? `تشغيل العرض ${nameOf(row)}` : `${nameOf(row)} on`}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={isAr ? `تعديل ${nameOf(row)}` : `Edit ${nameOf(row)}`}
                  onClick={() => setEditing({ row, form: formFromRow(row) })}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={isAr ? `حذف ${nameOf(row)}` : `Delete ${nameOf(row)}`}
                  onClick={async () => {
                    const ok = await confirmDialog({
                      title: isAr ? `حذف ${nameOf(row)}؟` : `Delete ${nameOf(row)}?`,
                      description: isAr
                        ? "الطلبات التي حصلت عليه تبقى كما هي."
                        : "Orders that got it keep it.",
                      destructive: true,
                    });
                    if (ok) remove.mutate(row);
                  }}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">
          {isAr
            ? "إذا أدخل العميل رمز خصم والعرض يشمل سلته"
            : "When a shopper types a code and an offer also fits"}
        </legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {COMBINE.map((option) => (
            <Label
              key={option.value}
              className={cn(
                "flex min-w-0 cursor-pointer items-start gap-2 rounded-xl border border-border p-3 text-sm font-normal",
                combine === option.value && "border-primary bg-primary/10",
              )}
            >
              <input
                type="radio"
                name="offers-combine"
                className="mt-1 accent-primary"
                checked={combine === option.value}
                onChange={() => setCombine.mutate(option.value)}
              />
              <span className="min-w-0">{isAr ? option.ar : option.en}</span>
            </Label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {isAr
            ? "يُطبّق عرض واحد للسعر في الطلب، الأوفر. التوصيل المجاني يُطبّق دائمًا مع غيره."
            : "One price offer applies per order, the one that saves most. Free delivery always applies alongside."}
        </p>
      </fieldset>

      {editing && (
        <StoreOfferDialog
          open
          onOpenChange={(open) => !open && setEditing(null)}
          isNew={!editing.row}
          initial={editing.form}
          isAr={isAr}
          currency={currency}
          products={products}
          categories={categories}
          saving={save.isPending}
          onSave={(form) => save.mutate({ row: editing.row, form })}
        />
      )}
    </section>
  );
}
