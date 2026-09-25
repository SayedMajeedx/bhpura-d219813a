import { Link } from "@tanstack/react-router";
import { formatPrice } from "@/lib/storefront-context";
import { displayVariantParts } from "@/lib/variant-sku-utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Coins, Sparkles, Share2 } from "lucide-react";
import { ShareCartModal } from "@/components/storefront/ShareCartModal";
import { ResponsiveImage } from "@/components/responsive-media";
import { Checkbox } from "@/components/ui/checkbox";
import { formatCustomFieldsList } from "@/lib/addons/custom-fields";
import type { Dispatch, SetStateAction } from "react";
import type { Storefront } from "@/features/checkout/types";
import type { useCheckoutFulfillment } from "@/features/checkout/hooks/use-checkout-fulfillment";
import type { useCheckoutLoyalty } from "@/features/checkout/hooks/use-checkout-loyalty";
import type { usePlaceOrder } from "@/features/checkout/hooks/use-place-order";
import type { usePromoCode } from "@/features/checkout/hooks/use-promo-code";

/** The cart lines, promo code, loyalty points, totals, terms and the Place order button. */
export function OrderSummaryCard({
  acceptedTerms,
  appliedPromo,
  applyPromo,
  availableMethods,
  benefitReceipt,
  brand,
  cart,
  cartTotal,
  checkingPromo,
  currency,
  estimatedDeliveryText,
  estimatedPointsToEarn,
  fulfillment,
  fulfillmentOptions,
  grandTotal,
  handleApplyPoints,
  handleRemovePoints,
  lang,
  loyaltyAccount,
  loyaltyDiscount,
  loyaltyProgram,
  marketingConsent,
  method,
  pointsToRedeemInput,
  promoDiscount,
  promoInput,
  redeemedPoints,
  setAcceptedTerms,
  setAppliedPromo,
  setMarketingConsent,
  setPointsToRedeemInput,
  setPromoInput,
  setShareOpen,
  shareOpen,
  shipping,
  submit,
  submitting,
  t,
}: {
  acceptedTerms: boolean;
  appliedPromo: ReturnType<typeof usePromoCode>["appliedPromo"];
  applyPromo: ReturnType<typeof usePromoCode>["applyPromo"];
  availableMethods: ReturnType<typeof useCheckoutFulfillment>["availableMethods"];
  benefitReceipt: File | null;
  brand: Storefront["brand"];
  cart: Storefront["cart"];
  cartTotal: number;
  checkingPromo: ReturnType<typeof usePromoCode>["checkingPromo"];
  currency: Storefront["currency"];
  estimatedDeliveryText: ReturnType<typeof useCheckoutFulfillment>["estimatedDeliveryText"];
  estimatedPointsToEarn: ReturnType<typeof useCheckoutLoyalty>["estimatedPointsToEarn"];
  fulfillment: ReturnType<typeof useCheckoutFulfillment>["fulfillment"];
  fulfillmentOptions: ReturnType<typeof useCheckoutFulfillment>["fulfillmentOptions"];
  grandTotal: number;
  handleApplyPoints: ReturnType<typeof useCheckoutLoyalty>["handleApplyPoints"];
  handleRemovePoints: ReturnType<typeof useCheckoutLoyalty>["handleRemovePoints"];
  lang: Storefront["lang"];
  loyaltyAccount: ReturnType<typeof useCheckoutLoyalty>["loyaltyAccount"];
  loyaltyDiscount: ReturnType<typeof useCheckoutLoyalty>["loyaltyDiscount"];
  loyaltyProgram: ReturnType<typeof useCheckoutLoyalty>["loyaltyProgram"];
  marketingConsent: boolean;
  method: ReturnType<typeof useCheckoutFulfillment>["method"];
  pointsToRedeemInput: ReturnType<typeof useCheckoutLoyalty>["pointsToRedeemInput"];
  promoDiscount: number;
  promoInput: ReturnType<typeof usePromoCode>["promoInput"];
  redeemedPoints: ReturnType<typeof useCheckoutLoyalty>["redeemedPoints"];
  setAcceptedTerms: Dispatch<SetStateAction<boolean>>;
  setAppliedPromo: ReturnType<typeof usePromoCode>["setAppliedPromo"];
  setMarketingConsent: Dispatch<SetStateAction<boolean>>;
  setPointsToRedeemInput: ReturnType<typeof useCheckoutLoyalty>["setPointsToRedeemInput"];
  setPromoInput: ReturnType<typeof usePromoCode>["setPromoInput"];
  setShareOpen: Dispatch<SetStateAction<boolean>>;
  shareOpen: boolean;
  shipping: number;
  submit: ReturnType<typeof usePlaceOrder>["submit"];
  submitting: ReturnType<typeof usePlaceOrder>["submitting"];
  t: Storefront["t"];
}) {
  return (
    <Card className="p-5 sticky top-20 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl">{t("ملخّص الطلب", "Order summary")}</h2>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 rounded-lg border-border text-xs"
          onClick={() => setShareOpen(true)}
        >
          <Share2 className="h-3.5 w-3.5 text-primary" />
          <span>{t("مشاركة السلة", "Share cart")}</span>
        </Button>
      </div>
      <div className="space-y-2 max-h-72 overflow-auto">
        {cart.map((c) => (
          <div key={c.cart_line_id} className="flex justify-between gap-3 text-sm">
            <div className="flex min-w-0 flex-1 items-start gap-3 me-2">
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border bg-muted/30">
                {c.image ? (
                  <ResponsiveImage
                    src={c.image}
                    alt={c.name}
                    preset="thumb"
                    sizes="56px"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center px-1 text-center text-xs text-muted-foreground">
                    {t("لا توجد صورة", "No image")}
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <div className="truncate">
                  {c.name} × {c.qty}
                </div>
                {(() => {
                  const parts = displayVariantParts(
                    {
                      size: c.size,
                      size_unit: c.size_unit,
                      color: c.color,
                      fabric: c.fabric,
                    },
                    lang,
                  );
                  return parts.length > 0 ? (
                    <div className="truncate text-xs text-muted-foreground">
                      {parts.join(" · ")}
                    </div>
                  ) : null;
                })()}
                {(() => {
                  const formattedFields = formatCustomFieldsList(c.custom_fields, lang);
                  if (formattedFields.length === 0) return null;
                  return (
                    <div className="mt-2 rounded-lg bg-secondary/40 border border-border-subtle p-2 space-y-1">
                      <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                        <span>✨</span>
                        <span>
                          {lang === "ar" ? "خيارات ومقاسات مخصصة" : "Custom Options & Sizing"}
                        </span>
                      </p>
                      <div className="grid grid-cols-1 gap-1 text-xs">
                        {formattedFields.map((field) => (
                          <div
                            key={field.key}
                            className="flex items-center justify-between gap-2 text-muted-foreground"
                          >
                            <span>{field.label}:</span>
                            {field.isUrl ? (
                              <a
                                href={field.value}
                                target="_blank"
                                rel="noreferrer"
                                className="text-primary hover:underline font-semibold inline-flex items-center gap-0.5"
                              >
                                📎 {lang === "ar" ? "عرض الملف" : "View File"}
                              </a>
                            ) : (
                              <span className="font-medium text-foreground dir-ltr text-end">
                                {field.value}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
            <span className="flex flex-col items-end">
              <span>{formatPrice(c.price * c.qty, currency, lang)}</span>
              {Number(c.original_price || 0) > c.price && (
                <span className="text-xs text-muted-foreground line-through">
                  {formatPrice(Number(c.original_price) * c.qty, currency, lang)}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
      <div className="border-t pt-3 space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("المجموع الفرعي", "Subtotal")}</span>
          <span>{formatPrice(cartTotal, currency, lang)}</span>
        </div>
        {fulfillment === "delivery" && (
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">
              {t("التوصيل المتوقع", "Estimated delivery")}
            </span>
            <span className="font-medium text-foreground text-end">{estimatedDeliveryText}</span>
          </div>
        )}
        {fulfillment === "pickup" && (
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">{t("موعد الاستلام", "Pickup timing")}</span>
            <span className="font-medium text-foreground text-end">{estimatedDeliveryText}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("رسوم التوصيل", "Delivery fee")}</span>
          <span>{shipping > 0 ? formatPrice(shipping, currency, lang) : t("مجانًا", "Free")}</span>
        </div>
        {promoDiscount > 0 && (
          <div className="flex justify-between font-medium text-emerald-700 dark:text-emerald-400">
            <span>
              {t("الخصم الترويجي", "Promo Discount")} ({appliedPromo?.code})
            </span>
            <span>− {formatPrice(promoDiscount, currency, lang)}</span>
          </div>
        )}
        {loyaltyDiscount > 0 && (
          <div className="flex justify-between font-medium text-amber-700 dark:text-amber-400">
            <span>
              {t("خصم النقاط والمكافآت", "Points Discount")} ({redeemedPoints} {t("نقطة", "pts")})
            </span>
            <span>− {formatPrice(loyaltyDiscount, currency, lang)}</span>
          </div>
        )}
      </div>

      {/* Promo Code Box */}
      <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
        <Label htmlFor="promo-code">{t("هل لديك رمز خصم؟", "Have a promo code?")}</Label>
        <div className="flex gap-2">
          <Input
            id="promo-code"
            name="promo-code"
            autoComplete="off"
            className="h-11 uppercase"
            value={promoInput}
            onChange={(e) => {
              const value = e.target.value.toUpperCase();
              setPromoInput(value);
              if (appliedPromo && value !== appliedPromo.code) setAppliedPromo(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyPromo();
              }
            }}
            placeholder="EID20"
          />
          <Button type="button" variant="outline" onClick={applyPromo} disabled={checkingPromo}>
            {checkingPromo && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            {t("تطبيق", "Apply")}
          </Button>
        </div>
      </div>

      {/* Loyalty Points Redemption Widget */}
      {loyaltyProgram?.is_enabled && (loyaltyAccount?.active_points ?? 0) > 0 && (
        <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Coins className="h-4 w-4 text-amber-500" />
              <span>{t("استخدام نقاط المكافآت", "Redeem Loyalty Points")}</span>
            </div>
            <span className="text-xs font-mono text-muted-foreground">
              {t("متاح:", "Available:")} {loyaltyAccount?.active_points} {t("نقطة", "pts")}
            </span>
          </div>

          {redeemedPoints > 0 ? (
            <div className="flex items-center justify-between p-2 rounded bg-amber-500/10 border border-amber-500/20 text-xs">
              <span className="font-semibold text-foreground">
                {redeemedPoints} {t("نقطة مطبقة", "points applied")} (−
                {formatPrice(loyaltyDiscount, currency, lang)})
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleRemovePoints}
                className="h-7 text-xs text-rose-600 hover:text-rose-700 p-0 hover:bg-transparent"
              >
                {t("إلغاء", "Remove")}
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                type="number"
                min="1"
                max={loyaltyAccount?.active_points}
                placeholder={t("أدخل عدد النقاط...", "Enter points to redeem...")}
                className="h-11 font-mono text-sm bg-background"
                value={pointsToRedeemInput}
                onChange={(e) => setPointsToRedeemInput(e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleApplyPoints}
                className="h-11 border-amber-500/30 text-amber-700 dark:text-amber-400"
              >
                {t("استخدام", "Redeem")}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Estimated Points Earned Badge */}
      {estimatedPointsToEarn > 0 && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-primary/10 border border-primary/20 text-xs text-primary font-medium">
          <Sparkles className="h-4 w-4 shrink-0" />
          <span>
            {t(
              `ستكسب +${estimatedPointsToEarn} نقطة مكافأة فور إتمام هذا الطلب!`,
              `You will earn +${estimatedPointsToEarn} loyalty points on this order!`,
            )}
          </span>
        </div>
      )}

      <div className="border-t pt-3 flex justify-between font-semibold text-lg">
        <span>{t("الإجمالي", "Total")}</span>
        <span className="text-primary font-bold">{formatPrice(grandTotal, currency, lang)}</span>
      </div>
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border-strong bg-muted/20 p-3">
        <Checkbox
          className="mt-0.5"
          checked={acceptedTerms}
          onCheckedChange={(checked) => setAcceptedTerms(checked === true)}
        />
        <span className="text-xs leading-relaxed text-muted-foreground">
          {t("أوافق على", "I agree to the")}{" "}
          <Link
            to="/$slug/$category"
            params={{ slug: brand.slug, category: "terms-conditions" }}
            className="font-semibold text-foreground underline underline-offset-2"
          >
            {t("الشروط والأحكام", "terms and conditions")}
          </Link>{" "}
          {t(
            "وسياسة الخصوصية المعروضة ضمن خيارات الخصوصية.",
            "and the privacy policy available in Privacy Preferences.",
          )}
        </span>
      </label>

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border-strong bg-muted/20 p-3">
        <Checkbox
          className="mt-0.5"
          checked={marketingConsent}
          onCheckedChange={(checked) => setMarketingConsent(checked === true)}
        />
        <span className="text-xs leading-relaxed text-muted-foreground">
          {t(
            "أوافق على استلام إشعارات وعروض خاصة ورسائل تذكير بالسلة عبر واتساب والبريد.",
            "Keep me updated with cart reminders, points balance, and exclusive offers via WhatsApp & Email.",
          )}
        </span>
      </label>

      <Button
        className="w-full h-12 bg-primary text-primary-foreground rounded-lg"
        disabled={
          submitting ||
          availableMethods.length === 0 ||
          fulfillmentOptions.length === 0 ||
          !acceptedTerms ||
          (method === "benefit" && !benefitReceipt)
        }
        onClick={submit}
      >
        {submitting && <Loader2 className="h-4 w-4 me-2 animate-spin" />}
        {t("تأكيد الطلب", "Place order")}
      </Button>
      <ShareCartModal open={shareOpen} onOpenChange={setShareOpen} />
    </Card>
  );
}
