import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { offerTerms, offerWording } from "@/lib/offers";
import { draftOffer, OWN_WORDING_MAX, type OfferForm } from "@/features/offers/lib/offer-form";
import { cn } from "@/lib/utils";

/**
 * What shoppers read about the offer on a product's page, in each language: the store's own words,
 * or, left empty, the system's from its terms (shown as each field's placeholder). The line under
 * it says what a shopper reads now, and the system's words beside the store's, so a wording that
 * no longer matches the offer (a percentage changed later) is seen before saving.
 */
export function OfferWordingField({
  form,
  patch,
  isAr,
  money,
  problem,
}: {
  form: OfferForm;
  patch: (next: Partial<OfferForm>) => void;
  isAr: boolean;
  money: (n: number) => string;
  problem: string | null;
}) {
  const id = useId();
  const lang = isAr ? "ar" : "en";
  const draft = problem ? null : draftOffer(form);
  const automatic = (l: "ar" | "en") => (draft ? offerTerms(draft, l, money) : "");
  const own = (isAr ? form.terms_ar : form.terms_en).trim();

  return (
    <fieldset className="space-y-2 rounded-xl border border-border p-3">
      <legend className="px-1 text-xs font-semibold text-muted-foreground">
        {isAr ? "ما يقرأه العميل في صفحة المنتج" : "What shoppers read on the product page"}
      </legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {(["ar", "en"] as const).map((l) => (
          <div key={l} className="min-w-0 space-y-1.5">
            <Label htmlFor={`${id}-${l}`}>
              {l === "ar" ? (isAr ? "بالعربية" : "Arabic") : isAr ? "بالإنجليزية" : "English"}
            </Label>
            <Input
              id={`${id}-${l}`}
              dir={l === "ar" ? "rtl" : "ltr"}
              maxLength={OWN_WORDING_MAX}
              value={l === "ar" ? form.terms_ar : form.terms_en}
              placeholder={automatic(l)}
              onChange={(event) =>
                patch(
                  l === "ar" ? { terms_ar: event.target.value } : { terms_en: event.target.value },
                )
              }
            />
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {isAr
          ? "اتركه فارغًا لتظهر شروط العرض كما يكتبها النظام. لا يغيّر النص قيمة الخصم."
          : "Leave it empty to show the offer's terms as the system writes them. The words never change what the offer takes off."}
      </p>
      <div
        className={cn(
          "rounded-lg px-3 py-2 text-sm",
          problem ? "bg-destructive/10 text-destructive" : "bg-muted/60",
        )}
        role="status"
      >
        {problem ??
          (isAr
            ? `يرى العميل: ${offerWording(draft!, lang, money)}`
            : `Shoppers read: ${offerWording(draft!, lang, money)}`)}
        {!problem && own && (
          <span className="block text-xs text-muted-foreground">
            {isAr ? `شروط العرض: ${automatic(lang)}` : `The offer's terms: ${automatic(lang)}`}
          </span>
        )}
      </div>
    </fieldset>
  );
}
