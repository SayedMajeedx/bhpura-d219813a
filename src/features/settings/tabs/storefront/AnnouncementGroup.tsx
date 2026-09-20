import { useI18n } from "@/lib/i18n";
import { useBrandSettingsFormContext } from "@/features/settings/use-brand-settings-form";
import { AdvancedOnly } from "@/features/settings/FieldVisibility";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ColorField } from "@/features/settings/shared/ColorField";
import { Megaphone, Sparkles, X } from "lucide-react";

export function AnnouncementGroup() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const { form, setBs } = useBrandSettingsFormContext();
  const bs = form.bs;

  const isEnabled = bs.announcement_enabled ?? false;
  const textAr = bs.announcement_text_ar ?? "";
  const textEn = bs.announcement_text_en ?? "";
  const bg = bs.announcement_bg || "#111111";
  const fg = bs.announcement_fg || "#ffffff";
  const isBold = bs.announcement_bold ?? false;
  const isItalic = bs.announcement_italic ?? false;
  const isDismissible = bs.announcement_dismissible ?? true;

  const currentText =
    (isAr ? textAr : textEn) ||
    (isAr ? textEn : textAr) ||
    (isAr ? "توصيل مجاني للطلبات فوق 20 دينار" : "Free delivery on orders over 20 BHD");

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border p-5 bg-card shadow-sm space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Megaphone className="size-4 text-primary" />
              <span>
                {isAr
                  ? "شريط الإعلانات أعلى الصفحة (Top Announcement Bar)"
                  : "Top Announcement Bar"}
              </span>
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {isAr
                ? "شريط علوي بارز يظهر العروض الترويجية أو التوصيل المجاني لكافة زوار المتجر."
                : "Prominent top banner highlighting special offers, discount codes, or shipping policies."}
            </p>
          </div>
          <Switch
            checked={isEnabled}
            onCheckedChange={(checked) => setBs({ announcement_enabled: checked })}
          />
        </div>

        {/* Live Banner Preview */}
        {isEnabled && (
          <div className="rounded-xl border border-border overflow-hidden bg-muted/10 p-4 space-y-2">
            <span className="text-xs font-medium text-muted-foreground block">
              {isAr ? "معاينة حية لشريط الإعلان:" : "Live Banner Preview:"}
            </span>
            <div
              style={{ backgroundColor: bg, color: fg }}
              className="w-full py-2.5 px-4 rounded-lg flex items-center justify-between text-xs transition-colors shadow-xs"
            >
              <div className="flex-1 text-center font-medium">
                <span className={`${isBold ? "font-bold" : ""} ${isItalic ? "italic" : ""}`}>
                  {currentText}
                </span>
              </div>
              {isDismissible && (
                <button
                  type="button"
                  aria-label={isAr ? "إغلاق" : "Close"}
                  className="opacity-70 hover:opacity-100 transition-opacity p-0.5 rounded cursor-pointer"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Basic Bilingual Text */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div dir="rtl">
            <Label className="text-xs font-medium">
              {isAr ? "نص الإعلان (عربي)" : "Announcement Text (Arabic)"}
            </Label>
            <Input
              className="mt-1.5 text-end text-xs h-9"
              value={textAr}
              placeholder={isAr ? "توصيل مجاني للطلبات فوق 20 دينار" : "Free delivery..."}
              onChange={(e) => setBs({ announcement_text_ar: e.target.value || null })}
            />
          </div>

          <div dir="ltr">
            <Label className="text-xs font-medium">
              {isAr ? "نص الإعلان (إنجليزي)" : "Announcement Text (English)"}
            </Label>
            <Input
              className="mt-1.5 text-start text-xs h-9"
              value={textEn}
              placeholder="Free delivery on orders over 20 BHD"
              onChange={(e) => setBs({ announcement_text_en: e.target.value || null })}
            />
          </div>
        </div>

        {/* Advanced Announcement Options */}
        <AdvancedOnly
          fieldKey="announcement_bg"
          reason={
            isAr
              ? "تخصيص ألوان وخط ونطاق ظهور شريط الإعلانات"
              : "Customize colors, typography, scope & audience"
          }
        >
          <div className="rounded-xl border border-border p-4 bg-muted/5 space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <h4 className="text-xs font-semibold">
                {isAr ? "خيارات التنسيق والظهور المتقدمة" : "Advanced Styling & Targeting"}
              </h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ColorField
                label={isAr ? "لون خلفية الشريط" : "Bar Background Color"}
                value={bs.announcement_bg || "#111111"}
                onChange={(val) => setBs({ announcement_bg: val || "#111111" })}
              />

              <ColorField
                label={isAr ? "لون نص الشريط" : "Bar Text Color"}
                value={bs.announcement_fg || "#ffffff"}
                onChange={(val) => setBs({ announcement_fg: val || "#ffffff" })}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 bg-background">
                <Label className="cursor-pointer text-xs font-medium">
                  {isAr ? "خط عريض" : "Bold Text"}
                </Label>
                <Switch
                  checked={isBold}
                  onCheckedChange={(checked) => setBs({ announcement_bold: checked })}
                />
              </div>

              <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 bg-background">
                <Label className="cursor-pointer text-xs font-medium">
                  {isAr ? "خط مائل" : "Italic Text"}
                </Label>
                <Switch
                  checked={isItalic}
                  onCheckedChange={(checked) => setBs({ announcement_italic: checked })}
                />
              </div>

              <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 bg-background">
                <Label className="cursor-pointer text-xs font-medium">
                  {isAr ? "قابل للإغلاق" : "Dismissible"}
                </Label>
                <Switch
                  checked={isDismissible}
                  onCheckedChange={(checked) => setBs({ announcement_dismissible: checked })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <Label className="text-xs font-medium">
                  {isAr ? "نطاق ظهور الشريط في الصفحات" : "Page Display Scope"}
                </Label>
                <Select
                  value={bs.announcement_scope || "all"}
                  onValueChange={(val: any) => setBs({ announcement_scope: val })}
                >
                  <SelectTrigger className="mt-1.5 text-xs h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {isAr ? "كافة صفحات المتجر" : "All Storefront Pages"}
                    </SelectItem>
                    <SelectItem value="home">
                      {isAr ? "الصفحة الرئيسية فقط" : "Homepage Only"}
                    </SelectItem>
                    <SelectItem value="catalog">
                      {isAr ? "صفحات التسوق والمنتجات" : "Shopping & Catalog Pages"}
                    </SelectItem>
                    <SelectItem value="checkout">
                      {isAr ? "صفحة الدفع فقط" : "Checkout Only"}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-medium">
                  {isAr ? "الجمهور المستهدف" : "Target Audience"}
                </Label>
                <Select
                  value={bs.announcement_audience || "all"}
                  onValueChange={(val: any) => setBs({ announcement_audience: val })}
                >
                  <SelectTrigger className="mt-1.5 text-xs h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {isAr ? "الجميع (زوار وعملاء مسجلون)" : "All Visitors & Customers"}
                    </SelectItem>
                    <SelectItem value="guest">
                      {isAr ? "الزوار غير المسجلين فقط" : "Guests Only"}
                    </SelectItem>
                    <SelectItem value="authenticated">
                      {isAr ? "العملاء المسجلون فقط" : "Registered Customers Only"}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </AdvancedOnly>
      </div>
    </div>
  );
}
