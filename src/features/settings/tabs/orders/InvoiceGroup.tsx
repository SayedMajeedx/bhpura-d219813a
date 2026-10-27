import { useI18n } from "@/lib/i18n";
import { useBrandSettingsFormContext } from "@/features/settings/use-brand-settings-form";
import { AdvancedOnly } from "@/features/settings/FieldVisibility";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ColorField } from "@/features/settings/shared/ColorField";
import { resolveStorefrontTypography } from "@/lib/typography";
import { InvoiceLayoutControls } from "./InvoiceLayoutControls";
import { InvoiceLogoPositioner } from "./InvoiceLogoPositioner";
import { InvoiceSample } from "./InvoiceSample";
import { OrderNumberField } from "./OrderNumberField";
import { FileText } from "lucide-react";

/**
 * The invoice: its preview (the real invoice, from a sample order), then what every store sets
 * (template, title, the sections shown, terms, the closing note), then three folds for the rest:
 * colours with the status badges, fonts, and the logo's place. All of it sat in one fold behind
 * two "inherit the store's" switches that the invoice never read; the store's colour and fonts
 * are now copied by a tap.
 */
export function InvoiceGroup() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const { form, setBs, brandId } = useBrandSettingsFormContext();
  const bs = form.bs;
  const brand = form.brand;
  const showTerms = bs.invoice_show_terms !== false;
  const storeColor = bs.storefront_accent_color || brand.primary_color || "#111111";
  const storeFonts = resolveStorefrontTypography(bs).body;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border p-5 bg-card shadow-sm space-y-5">
        <div>
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <FileText className="size-4 text-primary" />
            <span>{isAr ? "الفاتورة" : "Invoice"}</span>
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {isAr
              ? "شكل فاتورتك وما تحمله، كما يراها عميلك."
              : "How your invoice looks and what it carries, as your customer sees it."}
          </p>
        </div>

        <InvoiceSample settings={bs as Record<string, unknown>} brandId={brandId} isAr={isAr} />

        <div className="max-w-xs space-y-1.5">
          <Label htmlFor="invoice-template" className="text-xs font-medium">
            {isAr ? "قالب الفاتورة" : "Invoice template"}
          </Label>
          <Select
            value={bs.invoice_template || "modern"}
            onValueChange={(val) => setBs({ invoice_template: val })}
          >
            <SelectTrigger id="invoice-template" className="text-xs h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="clean">{isAr ? "أنيق ومرتب" : "Clean"}</SelectItem>
              <SelectItem value="minimal">{isAr ? "بسيط وعصري" : "Minimal"}</SelectItem>
              <SelectItem value="modern">{isAr ? "حديث ومميز" : "Modern"}</SelectItem>
              <SelectItem value="classic">{isAr ? "كلاسيكي رسمي" : "Classic"}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <OrderNumberField isAr={isAr} />

        <InvoiceLayoutControls part="content" />

        <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-3.5 bg-background">
          <div className="min-w-0">
            <Label htmlFor="invoice-terms" className="cursor-pointer text-xs font-semibold">
              {isAr ? "الشروط والأحكام" : "Terms & conditions"}
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isAr ? "تُطبع أسفل الفاتورة" : "Printed at the foot of the invoice"}
            </p>
          </div>
          <Switch
            id="invoice-terms"
            checked={showTerms}
            onCheckedChange={(checked) => setBs({ invoice_show_terms: checked })}
          />
        </div>

        {/* Shown whenever the switch is on: it was on by default with its fields hidden. */}
        {showTerms && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div dir="rtl" className="min-w-0">
              <Label htmlFor="invoice-terms-ar" className="text-xs font-medium">
                {isAr ? "الشروط (عربي)" : "Terms (Arabic)"}
              </Label>
              <Textarea
                id="invoice-terms-ar"
                className="mt-1.5 text-xs min-h-[64px]"
                value={bs.invoice_terms_ar ?? ""}
                placeholder="البضاعة المباعة تُستبدل خلال 3 أيام..."
                onChange={(e) => setBs({ invoice_terms_ar: e.target.value || null })}
              />
            </div>
            <div dir="ltr" className="min-w-0">
              <Label htmlFor="invoice-terms-en" className="text-xs font-medium">
                {isAr ? "الشروط (إنجليزي)" : "Terms (English)"}
              </Label>
              <Textarea
                id="invoice-terms-en"
                className="mt-1.5 text-xs min-h-[64px]"
                value={bs.invoice_terms_en ?? ""}
                placeholder="Goods can be exchanged within 3 days..."
                onChange={(e) => setBs({ invoice_terms_en: e.target.value || null })}
              />
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="invoice-footer-note" className="text-xs font-medium">
            {isAr ? "الملاحظة الختامية" : "Closing note"}
          </Label>
          <Input
            id="invoice-footer-note"
            className="text-xs h-9"
            value={bs.footer_note ?? ""}
            placeholder={
              isAr ? "شكراً لتسوقكم معنا ونتطلع لخدمتكم دائماً!" : "Thank you for shopping with us!"
            }
            onChange={(e) => setBs({ footer_note: e.target.value || null })}
          />
        </div>
      </div>

      <AdvancedOnly
        fieldKey="invoice_secondary_color"
        reason={isAr ? "ألوان الفاتورة وشارات الحالة" : "Invoice colours and status badges"}
      >
        <div className="rounded-xl border border-border p-5 bg-card shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h4 className="text-sm font-semibold">{isAr ? "الألوان" : "Colours"}</h4>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setBs({ primary_color: storeColor })}
            >
              {isAr ? "استخدم لون المتجر" : "Use the store's colour"}
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <ColorField
              label={isAr ? "اللون الأساسي" : "Main colour"}
              value={bs.primary_color || null}
              // The column holds a colour always: clearing it takes the store's.
              onChange={(val) => setBs({ primary_color: val ?? storeColor })}
            />
            <ColorField
              label={isAr ? "اللون الثانوي" : "Secondary colour"}
              value={bs.invoice_secondary_color || null}
              onChange={(val) => setBs({ invoice_secondary_color: val })}
            />
            <ColorField
              label={isAr ? "الخطوط الفاصلة" : "Divider lines"}
              value={bs.invoice_divider_color || null}
              onChange={(val) => setBs({ invoice_divider_color: val })}
            />
          </div>
          <InvoiceLayoutControls part="colours" />
          <div className="space-y-2 pt-2 border-t border-border">
            <Label className="text-xs font-semibold">
              {isAr ? "شارات حالة الفاتورة" : "Status badges"}
            </Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <ColorField
                label={isAr ? "مدفوعة" : "Paid"}
                value={bs.invoice_status_paid_color || null}
                onChange={(val) => setBs({ invoice_status_paid_color: val })}
              />
              <ColorField
                label={isAr ? "غير مدفوعة" : "Unpaid"}
                value={bs.invoice_status_unpaid_color || null}
                onChange={(val) => setBs({ invoice_status_unpaid_color: val })}
              />
              <ColorField
                label={isAr ? "قيد المعالجة" : "In progress"}
                value={bs.invoice_status_progress_color || null}
                onChange={(val) => setBs({ invoice_status_progress_color: val })}
              />
            </div>
          </div>
        </div>
      </AdvancedOnly>

      <AdvancedOnly
        fieldKey="invoice_arabic_font_family"
        reason={isAr ? "خطوط الفاتورة" : "Invoice fonts"}
      >
        <div className="rounded-xl border border-border p-5 bg-card shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h4 className="text-sm font-semibold">{isAr ? "الخطوط" : "Fonts"}</h4>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setBs({
                  invoice_arabic_font_family: storeFonts.ar.family,
                  font_family: storeFonts.en.family,
                })
              }
            >
              {isAr ? "استخدم خطوط المتجر" : "Use the store's fonts"}
            </Button>
          </div>
          <InvoiceLayoutControls part="fonts" />
        </div>
      </AdvancedOnly>

      <AdvancedOnly
        fieldKey="logo_x"
        reason={isAr ? "مكان الشعار وحجمه في الفاتورة" : "The logo's place and size"}
      >
        <InvoiceLogoPositioner />
      </AdvancedOnly>
    </div>
  );
}
