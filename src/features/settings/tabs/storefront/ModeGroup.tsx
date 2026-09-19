import * as React from "react";
import { useRef } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  ShoppingBag,
  MessageCircle,
  Info,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AdvancedOnly } from "../../FieldVisibility";
import { useBrandSettingsFormContext } from "../../use-brand-settings-form";
import { useI18n } from "@/lib/i18n";
import {
  DEFAULT_CATALOG_INQUIRY_MESSAGE_AR,
  DEFAULT_CATALOG_INQUIRY_MESSAGE_EN,
  renderInquiryMessage,
} from "@/lib/storefront-mode";

export function ModeGroup({ onNavigateTab }: { onNavigateTab?: (tab: string) => void }) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const { bs, brand, setBs } = useBrandSettingsFormContext();

  const inquiryArRef = useRef<HTMLTextAreaElement>(null);
  const inquiryEnRef = useRef<HTMLTextAreaElement>(null);

  const storefrontMode = bs.storefront_mode === "catalog" ? "catalog" : "shop";
  const isCatalog = storefrontMode === "catalog";
  const catalogShowPrices = bs.catalog_show_prices !== false;
  const whatsappEnabled = bs.whatsapp_enabled ?? false;
  const whatsappNumber = bs.whatsapp_number ?? "";
  const hasWhatsApp = Boolean(
    whatsappNumber && whatsappNumber.replace(/\D/g, "").length >= 8
  );

  const injectToken = (
    ref: React.RefObject<HTMLTextAreaElement | null>,
    field: "catalog_inquiry_message_ar" | "catalog_inquiry_message_en",
    token: string
  ) => {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const text = el.value;
    const before = text.substring(0, start);
    const after = text.substring(end);
    const newValue = before + token + after;
    setBs(field, newValue);

    setTimeout(() => {
      el.focus();
      const newCursorPos = start + token.length;
      el.setSelectionRange(newCursorPos, newCursorPos);
    }, 50);
  };

  const tokens = [
    { value: "{brand_name}", label: isAr ? "اسم المتجر" : "Brand Name" },
    { value: "{product_name}", label: isAr ? "اسم المنتج" : "Product Name" },
    { value: "{product_url}", label: isAr ? "رابط المنتج" : "Product Link" },
    { value: "{variant}", label: isAr ? "الخيار" : "Variant" },
    { value: "{price}", label: isAr ? "السعر" : "Price" },
  ];

  const renderPills = (
    ref: React.RefObject<HTMLTextAreaElement | null>,
    field: "catalog_inquiry_message_ar" | "catalog_inquiry_message_en"
  ) => (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {tokens.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => injectToken(ref, field, t.value)}
          className="inline-flex items-center rounded-full bg-secondary/80 hover:bg-secondary border border-border px-2.5 py-1 text-xs font-medium text-foreground transition-colors shadow-xs cursor-pointer select-none"
        >
          <span className="text-muted-foreground">{t.label}:</span>
          <span className="ms-1 font-mono text-primary font-semibold">{t.value}</span>
        </button>
      ))}
    </div>
  );

  const brandDisplayName =
    (isAr ? brand?.name_ar : brand?.name_en) || brand?.name_en || brand?.slug || "Boutique";
  const sampleProductAr = "فستان سهرة كلاسيكي";
  const sampleProductEn = "Classic Evening Dress";
  const sampleVariantAr = "المقاس: M / اللون: أسود";
  const sampleVariantEn = "Size: M / Color: Black";
  const samplePrice = "38.000 BHD";
  const sampleUrl = `https://boutq.app/${brand.slug}/p/sample-123`;

  const previewAr = renderInquiryMessage(
    bs.catalog_inquiry_message_ar || DEFAULT_CATALOG_INQUIRY_MESSAGE_AR,
    {
      brandName: brandDisplayName,
      productName: sampleProductAr,
      productUrl: sampleUrl,
      variantLabel: sampleVariantAr,
      priceLabel: catalogShowPrices ? samplePrice : "",
    }
  );

  const previewEn = renderInquiryMessage(
    bs.catalog_inquiry_message_en || DEFAULT_CATALOG_INQUIRY_MESSAGE_EN,
    {
      brandName: brandDisplayName,
      productName: sampleProductEn,
      productUrl: sampleUrl,
      variantLabel: sampleVariantEn,
      priceLabel: catalogShowPrices ? samplePrice : "",
    }
  );

  return (
    <Card className="p-6 rounded-2xl border-border bg-card space-y-6">
      <div className="flex items-center gap-2">
        <ShoppingBag className="h-5 w-5 text-primary" />
        <div>
          <h3 className="font-display text-lg font-semibold">
            {isAr ? "وضع المتجر ونموذج البيع" : "Storefront Mode & Selling Model"}
          </h3>
          <p className="text-xs text-muted-foreground">
            {isAr
              ? "اختر بين نموذج البيع المباشر مع الدفع الإلكتروني، أو وضع الكتالوج واستقبال الطلبات عبر الواتساب."
              : "Choose between direct online checkout or a catalog showcase with WhatsApp inquiries."}
          </p>
        </div>
      </div>

      {/* Mode selection radio cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Direct Sale (Shop) */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setBs("storefront_mode", "shop")}
          onKeyDown={(e) => {
            if (e.key === " " || e.key === "Enter") {
              setBs("storefront_mode", "shop");
            }
          }}
          className={cn(
            "relative flex flex-col p-4 rounded-xl border cursor-pointer transition-all min-h-[44px]",
            !isCatalog
              ? "border-primary bg-primary/5 ring-1 ring-primary"
              : "border-border hover:border-muted-foreground/40 bg-card"
          )}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2.5">
              <div
                className={cn(
                  "p-2 rounded-lg",
                  !isCatalog
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                <ShoppingBag className="h-4 w-4" />
              </div>
              <span className="font-semibold text-sm text-foreground">
                {isAr ? "متجر بيع مباشر (Shop)" : "Direct E-Commerce Store (Shop)"}
              </span>
            </div>
            <div
              className={cn(
                "h-4 w-4 rounded-full border flex items-center justify-center",
                !isCatalog
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border"
              )}
            >
              {!isCatalog && <div className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
            </div>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {isAr
              ? "سلة تسوق ودفع إلكتروني مباشر عبر المتجر مع تتبع تلقائي للطلبات والشحن وأكواد الخصم."
              : "Full e-commerce checkout with cart, online payments, discount codes, and order tracking."}
          </p>
        </div>

        {/* Catalog Mode */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setBs("storefront_mode", "catalog")}
          onKeyDown={(e) => {
            if (e.key === " " || e.key === "Enter") {
              setBs("storefront_mode", "catalog");
            }
          }}
          className={cn(
            "relative flex flex-col p-4 rounded-xl border cursor-pointer transition-all min-h-[44px]",
            isCatalog
              ? "border-primary bg-primary/5 ring-1 ring-primary"
              : "border-border hover:border-muted-foreground/40 bg-card"
          )}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2.5">
              <div
                className={cn(
                  "p-2 rounded-lg",
                  isCatalog
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                <MessageCircle className="h-4 w-4" />
              </div>
              <span className="font-semibold text-sm text-foreground">
                {isAr
                  ? "كتالوج واستفسارات واتساب (Catalog)"
                  : "Catalog & WhatsApp Inquiries (Catalog)"}
              </span>
            </div>
            <div
              className={cn(
                "h-4 w-4 rounded-full border flex items-center justify-center",
                isCatalog
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border"
              )}
            >
              {isCatalog && <div className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
            </div>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {isAr
              ? "عرض المنتجات ككتالوج أنيق مع زر استفسار وطلب مباشر عبر الواتساب بدون سلة أو دفع إلكتروني."
              : "Showcase products in an elegant catalog with direct WhatsApp inquiry buttons instead of checkout."}
          </p>
        </div>
      </div>

      {/* WhatsApp Floating Button Toggle (Single place) */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-xl border border-border p-4 bg-muted/10">
        <div>
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-emerald-500" />
            <p className="text-sm font-semibold">
              {isAr ? "زر واتساب العائم في المتجر" : "Storefront WhatsApp Floating Button"}
            </p>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isAr
              ? "إظهار زر واتساب ثابت أسفل الشاشة للعملاء للتواصل الفوري."
              : "Show a floating WhatsApp action button on all storefront pages."}
          </p>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span>{isAr ? "الرقم المعتمد: " : "Configured number: "}</span>
            <span className="font-mono font-medium text-foreground">
              {whatsappNumber || (isAr ? "غير محدد" : "Not set")}
            </span>
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs text-primary"
              onClick={() => onNavigateTab?.("identity")}
            >
              {isAr ? "تعديل في هوية المتجر" : "Edit in Identity tab"}
              <ExternalLink className="ms-1 h-3 w-3" />
            </Button>
          </div>
        </div>
        <Switch
          checked={whatsappEnabled}
          onCheckedChange={(checked) => setBs("whatsapp_enabled", checked)}
        />
      </div>

      {/* Catalog Mode Options */}
      {isCatalog && (
        <div className="space-y-4 pt-2 border-t border-border">
          {/* Info callout */}
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-muted/60 border border-border text-muted-foreground text-xs">
            <Info className="h-4 w-4 shrink-0 text-primary mt-0.5" />
            <div>
              <span className="font-medium text-foreground block">
                {isAr ? "ميزات وضع الكتالوج" : "Catalog Mode Features"}
              </span>
              <span>
                {isAr
                  ? "يتم إخفاء سلة الشراء وصفحة الدفع وأكواد الخصم ونقاط الولاء في متجرك، واستبدال زر الشراء بزر تواصل عبر الواتساب."
                  : "Cart, checkout, and coupon codes are hidden on your storefront, replaced with direct WhatsApp inquiry."}
              </span>
            </div>
          </div>

          {/* WhatsApp phone warning if missing */}
          {!hasWhatsApp && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div>
                <span className="font-semibold block">
                  {isAr ? "رقم الواتساب غير مضبوط" : "WhatsApp number not configured"}
                </span>
                <span>
                  {isAr
                    ? "يتطلب وضع الكتالوج وجود رقم واتساب فعال لربط زر استفسار المنتجات وتوجيه الزبائن إليك مباشرة."
                    : "Catalog mode requires an active WhatsApp phone number so customer inquiry buttons can connect."}
                </span>
              </div>
            </div>
          )}

          {/* Show prices switch */}
          <div className="flex items-center justify-between rounded-xl border border-border p-3.5 bg-card">
            <div className="space-y-0.5">
              <Label className="text-sm font-semibold text-foreground">
                {isAr ? "إظهار أسعار المنتجات في الكتالوج" : "Show Product Prices in Catalog"}
              </Label>
              <p className="text-xs text-muted-foreground">
                {isAr
                  ? "عند التفعيل، تظهر الأسعار مع زر الاستفسار. عند التعطيل، تظهر المنتجات بدون أسعار."
                  : "When enabled, product prices are visible. When disabled, products are displayed without prices."}
              </p>
            </div>
            <Switch
              checked={catalogShowPrices}
              onCheckedChange={(checked) => setBs("catalog_show_prices", checked)}
            />
          </div>

          {/* Advanced Inquiry Templates */}
          <AdvancedOnly fieldName="storefront.mode.inquiry_templates">
            <div className="space-y-4 rounded-xl border border-border p-4 bg-muted/10">
              <div>
                <h4 className="text-sm font-semibold text-foreground">
                  {isAr ? "قوالب رسائل استفسار الواتساب" : "WhatsApp Inquiry Message Templates"}
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isAr
                    ? "انقر على المتغيرات أدناه لإدراجها في نص الرسالة عند موضع المؤشر:"
                    : "Click on any token below to insert it into the message template at cursor position:"}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">
                    {isAr ? "الرسالة بالعربية" : "Arabic Message"}
                  </Label>
                  <Textarea
                    ref={inquiryArRef}
                    dir="rtl"
                    rows={3}
                    value={bs.catalog_inquiry_message_ar || DEFAULT_CATALOG_INQUIRY_MESSAGE_AR}
                    onChange={(e) => setBs("catalog_inquiry_message_ar", e.target.value)}
                  />
                  {renderPills(inquiryArRef, "catalog_inquiry_message_ar")}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">
                    {isAr ? "الرسالة بالإنجليزية" : "English Message"}
                  </Label>
                  <Textarea
                    ref={inquiryEnRef}
                    dir="ltr"
                    rows={3}
                    value={bs.catalog_inquiry_message_en || DEFAULT_CATALOG_INQUIRY_MESSAGE_EN}
                    onChange={(e) => setBs("catalog_inquiry_message_en", e.target.value)}
                  />
                  {renderPills(inquiryEnRef, "catalog_inquiry_message_en")}
                </div>
              </div>

              {/* Live Message Preview */}
              <div className="space-y-2 rounded-xl border border-border bg-card p-3.5 mt-3">
                <div className="flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-xs font-semibold text-foreground">
                    {isAr ? "معاينة حية لشكل الرسالة على الواتساب" : "Live WhatsApp Message Preview"}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1">
                    <span className="text-xs font-medium text-muted-foreground block">
                      {isAr ? "المعاينة بالعربية" : "Arabic Preview"}
                    </span>
                    <p className="whitespace-pre-wrap font-sans text-foreground leading-relaxed text-xs" dir="rtl">
                      {previewAr}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1">
                    <span className="text-xs font-medium text-muted-foreground block">
                      {isAr ? "المعاينة بالإنجليزية" : "English Preview"}
                    </span>
                    <p className="whitespace-pre-wrap font-sans text-foreground leading-relaxed text-xs" dir="ltr">
                      {previewEn}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </AdvancedOnly>
        </div>
      )}
    </Card>
  );
}
