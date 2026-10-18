import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DeliveryInfoDetails } from "@/components/storefront/DeliveryInfoDetails";
import { deliveryInfo, type DeliveryInfoSettings } from "@/lib/delivery-info";
import { storedPages } from "@/lib/cms-pages";
import { returnsQueries } from "@/lib/data/returns";
import { formatMoney } from "@/lib/format";

/**
 * What a shopper reads under "Shipping & Returns" on a product page, as the settings stand in
 * the form right now (saved or not). It is drawn by the same function and the same component as
 * the product page, so what is shown here is what will be shown there: the delivery time, the
 * fee, each shipping zone, pickup, the return window from the return policy, the store's own
 * words, and its policy pages.
 */
export function DeliveryShopperPreview({
  brandId,
  settings,
  pages,
  isAr,
}: {
  brandId: string;
  settings: DeliveryInfoSettings;
  pages: unknown;
  isAr: boolean;
}) {
  const [lang, setLang] = useState<"ar" | "en">(isAr ? "ar" : "en");
  const returnPolicyQ = useQuery(returnsQueries.policy(brandId));
  const info = deliveryInfo({
    settings,
    lang,
    returnPolicy: returnPolicyQ.data ?? null,
    pages: storedPages(pages),
    formatMoney: (amount) => formatMoney(amount, settings.currency || "BHD", lang),
  });

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3.5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-foreground">
          <Eye className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="break-words">
            {isAr ? "ما يقرؤه المتسوق في صفحة المنتج" : "What a shopper reads on a product page"}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {(["ar", "en"] as const).map((code) => (
            <Button
              key={code}
              type="button"
              size="sm"
              variant={lang === code ? "default" : "outline"}
              className="h-7 px-2.5 text-xs"
              onClick={() => setLang(code)}
            >
              {code === "ar" ? "عربي" : "English"}
            </Button>
          ))}
        </div>
      </div>
      <div
        className="rounded-lg border border-border bg-background p-3"
        dir={lang === "ar" ? "rtl" : "ltr"}
      >
        {info.hasAnything ? (
          <DeliveryInfoDetails info={info} />
        ) : (
          <p className="text-xs text-muted-foreground">
            {isAr
              ? "لا شيء يُعرض الآن: فعّل التوصيل أو الاستلام، أو اكتب نص الشحن والاسترجاع."
              : "Nothing is shown right now: switch on delivery or pickup, or write your shipping and returns text."}
          </p>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {isAr
          ? "كل سطر هنا مأخوذ من إعداداتك: مدة التوصيل والرسوم ومناطق الشحن من هذه الصفحة، ومدة الاسترجاع من سياسة الاسترجاع. لا يُعرض للمتسوق أي وعد لم تكتبه."
          : "Every line here comes from your own settings: the delivery time, fee and shipping zones from this page, and the return window from your return policy. A shopper is shown no promise you did not write."}
      </p>
    </div>
  );
}
