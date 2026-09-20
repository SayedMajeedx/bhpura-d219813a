import { useRef, useState } from "react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { uploadPublicMedia } from "@/lib/r2-upload";
import { useBrandSettingsFormContext } from "@/features/settings/use-brand-settings-form";
import { ColorField } from "@/features/settings/shared/ColorField";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Type, Upload, X } from "lucide-react";

const CUSTOM_FONT = "Custom (uploaded)";

const FONT_PRESETS = [
  "Cormorant Garamond",
  "Playfair Display",
  "Inter",
  "Roboto",
  "Lato",
  "Montserrat",
  "Open Sans",
  "Poppins",
  "Georgia",
  "Times New Roman",
  "Arial",
  "Helvetica",
  CUSTOM_FONT,
];

const ARABIC_FONT_PRESETS = [
  "Cairo",
  "Tajawal",
  "Alexandria",
  "Amiri",
  "Noto Sans Arabic",
  "IBM Plex Sans Arabic",
  "Almarai",
  "Changa",
];

/**
 * Invoice titles, section visibility toggles, table header colours, page colours,
 * and invoice typography (Arabic + Latin fonts, size, custom font upload).
 * Restores every invoice control that existed on the legacy settings page.
 */
export function InvoiceLayoutControls() {
  const { lang, t } = useI18n();
  const isAr = lang === "ar";
  const { form, setBs, brandId } = useBrandSettingsFormContext();
  const bs = form.bs;
  const fontInput = useRef<HTMLInputElement>(null);
  const [uploadingFont, setUploadingFont] = useState(false);
  const inheritFont = bs.invoice_inherit_brand_font ?? true;

  const handleFontUpload = async (file: File) => {
    try {
      setUploadingFont(true);
      const url = await uploadPublicMedia(brandId, file, "font");
      setBs({ font_url: url, font_family: CUSTOM_FONT });
      toast.success(isAr ? "تم رفع الخط — لا تنسَ الحفظ" : "Font uploaded — remember to save");
    } catch (e: any) {
      toast.error(e?.message ?? (isAr ? "فشل رفع الخط" : "Font upload failed"));
    } finally {
      setUploadingFont(false);
    }
  };

  const toggles: Array<{
    key:
      | "invoice_show_business_name"
      | "invoice_show_business_details"
      | "invoice_show_customer_contact"
      | "invoice_show_fulfillment"
      | "invoice_show_notes";
    ar: string;
    en: string;
  }> = [
    { key: "invoice_show_business_name", ar: "اسم المتجر في الرأس", en: "Business name" },
    {
      key: "invoice_show_business_details",
      ar: "بيانات المتجر (العنوان والهاتف والضريبة)",
      en: "Business details (address, phone, VAT)",
    },
    { key: "invoice_show_customer_contact", ar: "بيانات تواصل العميل", en: "Customer contact" },
    { key: "invoice_show_fulfillment", ar: "طريقة التوصيل/الاستلام", en: "Fulfillment method" },
    { key: "invoice_show_notes", ar: "ملاحظات الطلب", en: "Order notes" },
  ];

  return (
    <div className="space-y-5">
      {/* Titles */}
      <div className="space-y-2 pt-2 border-t border-border">
        <Label className="text-xs font-semibold">{isAr ? "عنوان الفاتورة" : "Invoice title"}</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">{isAr ? "بالعربية" : "Arabic"}</Label>
            <Input
              dir="rtl"
              className="mt-1 h-9 text-xs"
              placeholder="فاتورة ضريبية"
              value={bs.invoice_title_ar ?? ""}
              onChange={(e) => setBs({ invoice_title_ar: e.target.value || null })}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">
              {isAr ? "بالإنجليزية" : "English"}
            </Label>
            <Input
              dir="ltr"
              className="mt-1 h-9 text-xs"
              placeholder="Tax Invoice"
              value={bs.invoice_title_en ?? ""}
              onChange={(e) => setBs({ invoice_title_en: e.target.value || null })}
            />
          </div>
        </div>
      </div>

      {/* Visibility toggles */}
      <div className="space-y-2 pt-2 border-t border-border">
        <Label className="text-xs font-semibold">
          {isAr ? "الأقسام الظاهرة في الفاتورة" : "Sections shown on the invoice"}
        </Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {toggles.map((item) => (
            <label
              key={item.key}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2 text-xs cursor-pointer"
            >
              <span>{isAr ? item.ar : item.en}</span>
              <Switch
                checked={bs[item.key] ?? true}
                onCheckedChange={(checked) => setBs({ [item.key]: checked })}
              />
            </label>
          ))}
        </div>
      </div>

      {/* Page + table colours */}
      <div className="space-y-2 pt-2 border-t border-border">
        <Label className="text-xs font-semibold">
          {isAr ? "ألوان الصفحة وجدول المنتجات" : "Page & product table colours"}
        </Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <ColorField
            label={isAr ? "خلفية الفاتورة" : "Page background"}
            value={bs.background_color || "#ffffff"}
            onChange={(val) => setBs({ background_color: val || "#ffffff" })}
          />
          <ColorField
            label={t("settings.textColor")}
            value={bs.text_color || "#1c1917"}
            onChange={(val) => setBs({ text_color: val || "#1c1917" })}
          />
          <ColorField
            label={isAr ? "خلفية رأس الجدول" : "Table header background"}
            value={bs.invoice_table_header_bg || "#f8fafc"}
            onChange={(val) => setBs({ invoice_table_header_bg: val })}
          />
          <ColorField
            label={isAr ? "نص رأس الجدول" : "Table header text"}
            value={bs.invoice_table_header_fg || "#111111"}
            onChange={(val) => setBs({ invoice_table_header_fg: val })}
          />
        </div>
      </div>

      {/* Typography (only when not inheriting brand fonts) */}
      {!inheritFont && (
        <div className="space-y-4 pt-2 border-t border-border">
          <Label className="text-xs font-semibold flex items-center gap-1.5">
            <Type className="size-3.5 text-primary" />
            {isAr ? "خطوط الفاتورة" : "Invoice fonts"}
          </Label>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              {isAr ? "الخط العربي" : "Arabic font"}
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {ARABIC_FONT_PRESETS.map((preset) => {
                const active = (bs.invoice_arabic_font_family || "Cairo") === preset;
                return (
                  <Button
                    key={preset}
                    type="button"
                    size="sm"
                    variant={active ? "default" : "outline"}
                    onClick={() => setBs({ invoice_arabic_font_family: preset })}
                    className={cn("h-8 text-xs", !active && "text-muted-foreground")}
                    style={{ fontFamily: `"${preset}", sans-serif` }}
                  >
                    {preset}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">
                {isAr ? "الخط اللاتيني / الإنجليزي" : "Latin / English font"}
              </Label>
              <Select
                value={bs.font_family || "Cormorant Garamond"}
                onValueChange={(val) => setBs({ font_family: val })}
              >
                <SelectTrigger className="mt-1 h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FONT_PRESETS.map((font) => (
                    <SelectItem
                      key={font}
                      value={font}
                      style={{ fontFamily: `"${font}", sans-serif` }}
                    >
                      {font}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">{t("settings.fontSize")}</Label>
              <Input
                type="number"
                min={8}
                max={24}
                className="mt-1 h-9 text-xs font-mono"
                value={bs.font_size ?? 14}
                onChange={(e) => setBs({ font_size: Number(e.target.value) || 14 })}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fontInput}
              type="file"
              accept=".woff,.woff2,.ttf,.otf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFontUpload(file);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              disabled={uploadingFont}
              onClick={() => fontInput.current?.click()}
            >
              {uploadingFont ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Upload className="size-3.5" />
              )}
              {isAr ? "رفع خط مخصص (woff/ttf)" : "Upload custom font (woff/ttf)"}
            </Button>
            {bs.font_url && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs gap-1 text-muted-foreground"
                onClick={() => setBs({ font_url: null, font_family: "Cormorant Garamond" })}
              >
                <X className="size-3.5" />
                {isAr ? "إزالة الخط المخصص" : "Remove custom font"}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
