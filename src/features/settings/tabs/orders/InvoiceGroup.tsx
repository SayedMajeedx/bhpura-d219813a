import { useI18n } from "@/lib/i18n";
import { useBrandSettingsFormContext } from "@/features/settings/use-brand-settings-form";
import { AdvancedOnly } from "@/features/settings/FieldVisibility";
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
import { InvoiceLayoutControls } from "./InvoiceLayoutControls";
import { InvoiceLogoPositioner } from "./InvoiceLogoPositioner";
import { FileText, Sparkles } from "lucide-react";

export function InvoiceGroup() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const { form, setBs } = useBrandSettingsFormContext();
  const bs = form.bs;
  const brand = form.brand;

  const inheritColor = bs.invoice_inherit_brand_color ?? true;
  const inheritFont = bs.invoice_inherit_brand_font ?? true;

  return (
    <div className="space-y-6">
      {/* 1. Basic Invoice Details & Template */}
      <div className="rounded-xl border border-border p-5 bg-card shadow-sm space-y-5">
        <div>
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <FileText className="size-4 text-primary" />
            <span>{isAr ? "تصميم وشروط الفاتورة (Invoice)" : "Invoice Design & Terms"}</span>
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {isAr
              ? "اختر قالب الفاتورة الرسمي واكتب الشروط والأحكام والملاحظة الختامية للعميل."
              : "Select invoice template, write terms and conditions, and configure customer receipts."}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Template Style */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">
              {isAr ? "نمط وقالب الفاتورة" : "Invoice Template Style"}
            </Label>
            <Select
              value={bs.invoice_template || "clean"}
              onValueChange={(val) => setBs({ invoice_template: val })}
            >
              <SelectTrigger className="text-xs h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="clean">{isAr ? "أنيق ومرتب (Clean)" : "Clean"}</SelectItem>
                <SelectItem value="minimal">{isAr ? "بسيط وعصري (Minimal)" : "Minimal"}</SelectItem>
                <SelectItem value="modern">{isAr ? "حديث ومميز (Modern)" : "Modern"}</SelectItem>
                <SelectItem value="classic">
                  {isAr ? "كلاسيكي رسمي (Classic)" : "Classic"}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Show terms switch */}
          <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-3.5 bg-background self-end">
            <div>
              <Label className="cursor-pointer text-xs font-semibold">
                {isAr ? "إظهار الشروط والأحكام" : "Show Terms & Conditions"}
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isAr ? "عرض الشروط أسفل الفاتورة" : "Print terms on bottom of invoice"}
              </p>
            </div>
            <Switch
              checked={bs.invoice_show_terms ?? true}
              onCheckedChange={(checked) => setBs({ invoice_show_terms: checked })}
            />
          </div>
        </div>

        {/* Terms inputs */}
        {bs.invoice_show_terms && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div dir="rtl">
              <Label className="text-xs font-medium">
                {isAr ? "الشروط والأحكام (عربي)" : "Terms & Conditions (Arabic)"}
              </Label>
              <Textarea
                className="mt-1.5 text-end text-xs min-h-[64px]"
                value={bs.invoice_terms_ar ?? ""}
                placeholder={isAr ? "البضاعة المباعة لا ترد بعد 3 أيام..." : "Terms in Arabic..."}
                onChange={(e) => setBs({ invoice_terms_ar: e.target.value || null })}
              />
            </div>

            <div dir="ltr">
              <Label className="text-xs font-medium">
                {isAr ? "الشروط والأحكام (إنجليزي)" : "Terms & Conditions (English)"}
              </Label>
              <Textarea
                className="mt-1.5 text-start text-xs min-h-[64px]"
                value={bs.invoice_terms_en ?? ""}
                placeholder="Goods can be exchanged within 3 days..."
                onChange={(e) => setBs({ invoice_terms_en: e.target.value || null })}
              />
            </div>
          </div>
        )}

        {/* Footer Note */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">
            {isAr ? "الملاحظة الختامية في الفاتورة (Thank You Note)" : "Invoice Footer Note"}
          </Label>
          <Input
            className="text-xs h-9"
            value={bs.footer_note ?? ""}
            placeholder={
              isAr ? "شكراً لتسوقكم معنا ونتطلع لخدمتكم دائماً!" : "Thank you for shopping with us!"
            }
            onChange={(e) => setBs({ footer_note: e.target.value || null })}
          />
        </div>

        {/* Advanced Invoice Styling & Layout Tuning */}
        <AdvancedOnly
          fieldKey="invoice_inherit_brand_color"
          reason={
            isAr
              ? "تخصيص ألوان وتخطيط وشعار الفاتورة بدقة"
              : "Fine-tune invoice layout, colors & typography"
          }
        >
          <div className="rounded-xl border border-border p-4 bg-muted/5 space-y-5">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <h4 className="text-xs font-semibold">
                {isAr
                  ? "تخصيص الألوان والخطوط والأبعاد في الفاتورة"
                  : "Advanced Invoice Typography & Color Customization"}
              </h4>
            </div>

            {/* Inherit Brand Color & Font toggles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-3.5 bg-background">
                <div>
                  <Label className="cursor-pointer text-xs font-semibold">
                    {isAr ? "توريث ألوان المتجر تلقائياً" : "Inherit Brand Accent Color"}
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {isAr
                      ? "استخدام لون العلامة في الفاتورة"
                      : "Syncs with storefront_accent_color"}
                  </p>
                </div>
                <Switch
                  checked={inheritColor}
                  onCheckedChange={(checked) => setBs({ invoice_inherit_brand_color: checked })}
                />
              </div>

              <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-3.5 bg-background">
                <div>
                  <Label className="cursor-pointer text-xs font-semibold">
                    {isAr ? "توريث خطوط المتجر تلقائياً" : "Inherit Brand Fonts"}
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {isAr ? "تطبيق خطوط البراند على الفاتورة" : "Syncs with brand typography"}
                  </p>
                </div>
                <Switch
                  checked={inheritFont}
                  onCheckedChange={(checked) => setBs({ invoice_inherit_brand_font: checked })}
                />
              </div>
            </div>

            {/* Custom Colors if not inheriting */}
            {!inheritColor && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                <ColorField
                  label={isAr ? "لون الفاتورة الأساسي" : "Primary Color"}
                  value={bs.primary_color || brand.primary_color || "#111111"}
                  onChange={(val) => setBs({ primary_color: val || "#111111" })}
                />
                <ColorField
                  label={isAr ? "لون الفاتورة الثانوي" : "Secondary Color"}
                  value={bs.invoice_secondary_color || "#666666"}
                  onChange={(val) => setBs({ invoice_secondary_color: val || "#666666" })}
                />
                <ColorField
                  label={isAr ? "لون الخطوط الفاصلة" : "Divider Lines"}
                  value={bs.invoice_divider_color || "#e5e7eb"}
                  onChange={(val) => setBs({ invoice_divider_color: val || "#e5e7eb" })}
                />
              </div>
            )}

            {/* Status Badge Colors */}
            <div className="space-y-2 pt-2 border-t border-border">
              <Label className="text-xs font-semibold">
                {isAr ? "ألوان شارات حالات الفاتورة" : "Status Badge Accent Colors"}
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <ColorField
                  label={isAr ? "شارة: مدفوعة" : "Paid Badge"}
                  value={bs.invoice_status_paid_color || "#16a34a"}
                  onChange={(val) => setBs({ invoice_status_paid_color: val || "#16a34a" })}
                />
                <ColorField
                  label={isAr ? "شارة: غير مدفوعة" : "Unpaid Badge"}
                  value={bs.invoice_status_unpaid_color || "#dc2626"}
                  onChange={(val) => setBs({ invoice_status_unpaid_color: val || "#dc2626" })}
                />
                <ColorField
                  label={isAr ? "شارة: قيد المعالجة" : "In Progress Badge"}
                  value={bs.invoice_status_progress_color || "#f59e0b"}
                  onChange={(val) => setBs({ invoice_status_progress_color: val || "#f59e0b" })}
                />
              </div>
            </div>

            <InvoiceLayoutControls />
            <InvoiceLogoPositioner />
          </div>
        </AdvancedOnly>
      </div>
    </div>
  );
}
