import { useI18n } from "@/lib/i18n";
import { useBrandSettingsFormContext } from "@/features/settings/use-brand-settings-form";
import { AdvancedOnly } from "@/features/settings/FieldVisibility";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { TrustBadgesEditor } from "@/components/settings/TrustBadgesEditor";
import { AlignCenter, AlignLeft, AlignRight, Sparkles } from "lucide-react";

export function HeaderFooterGroup() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const { form, setBs } = useBrandSettingsFormContext();
  const bs = form.bs;
  const brand = form.brand;

  const brandDisplayName =
    (isAr ? brand.name_ar : brand.name_en) || brand.name_en || brand.slug || "Boutique";

  const headerLogoSize = bs.logo_size ?? 36;
  const footerLogoSize = bs.footer_logo_size ?? 28;

  const footerPresets = [
    { label: isAr ? "صغير جداً (20px)" : "XS (20px)", val: 20 },
    { label: isAr ? "افتراضي (28px)" : "Default (28px)", val: 28 },
    { label: isAr ? "متوسط (36px)" : "Medium (36px)", val: 36 },
    { label: isAr ? "كبير (48px)" : "Large (48px)", val: 48 },
    { label: isAr ? "كبير جداً (64px)" : "XL (64px)", val: 64 },
  ];

  return (
    <div className="space-y-6">
      {/* 1. Header Navigation & Logo */}
      <div className="rounded-xl border border-border p-5 bg-card shadow-sm space-y-5">
        <div>
          <h3 className="text-base font-semibold text-foreground">
            {isAr ? "شعار الترويسة العلوية (Header Logo)" : "Header Logo & Identity"}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {isAr
              ? "تحكم بحجم ومحاذاة الشعار في أعلى صفحات المتجر وعرض اسم المتجر بجانبه."
              : "Adjust storefront header logo scale, alignment, and adjacent text."}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">
                {isAr ? "ارتفاع الشعار بالترويسة (px)" : "Header Logo Height (px)"}
              </Label>
              <span className="text-xs font-mono font-semibold text-primary">
                {headerLogoSize}px
              </span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={24}
                max={120}
                step={2}
                value={headerLogoSize}
                onChange={(e) => setBs({ logo_size: Number(e.target.value) })}
                className="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
              />
              <Input
                type="number"
                min={24}
                max={120}
                value={headerLogoSize}
                onChange={(e) =>
                  setBs({ logo_size: Math.max(24, Math.min(120, Number(e.target.value) || 36)) })
                }
                className="w-18 text-center font-mono text-xs h-9"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-medium">
              {isAr ? "محاذاة الشعار في الترويسة" : "Logo Alignment"}
            </Label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={bs.logo_align === "left" ? "default" : "outline"}
                className="flex-1 text-xs h-9 gap-1.5"
                onClick={() => setBs({ logo_align: "left" })}
              >
                <AlignLeft className="size-4" />
                <span>{isAr ? "يسار" : "Left"}</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant={bs.logo_align === "center" ? "default" : "outline"}
                className="flex-1 text-xs h-9 gap-1.5"
                onClick={() => setBs({ logo_align: "center" })}
              >
                <AlignCenter className="size-4" />
                <span>{isAr ? "وسط" : "Center"}</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant={bs.logo_align === "right" ? "default" : "outline"}
                className="flex-1 text-xs h-9 gap-1.5"
                onClick={() => setBs({ logo_align: "right" })}
              >
                <AlignRight className="size-4" />
                <span>{isAr ? "يمين" : "Right"}</span>
              </Button>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-3.5 bg-background">
          <div>
            <Label className="cursor-pointer text-xs font-semibold">
              {isAr ? "إظهار اسم المتجر بجانب الشعار" : "Show store name beside logo"}
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isAr
                ? "عرض النص التعريفي بجوار صورة الشعار"
                : "Display brand name text in the header"}
            </p>
          </div>
          <Switch
            checked={bs.show_header_name ?? true}
            onCheckedChange={(checked) => setBs({ show_header_name: checked })}
          />
        </div>
      </div>

      {/* 2. Footer Brand Display & Trust Badges */}
      <div className="rounded-xl border border-border p-5 bg-card shadow-sm space-y-5">
        <div>
          <h3 className="text-base font-semibold text-foreground">
            {isAr ? "تذييل المتجر وشارات الثقة (Footer)" : "Footer & Trust Badges"}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {isAr
              ? "خيارات العرض في أسفل الموقع وشارات الأمان وسرعة الشحن والدفع الآمن."
              : "Storefront footer identity options and buyer assurance badges."}
          </p>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-3.5 bg-background">
          <div>
            <Label className="cursor-pointer text-xs font-semibold">
              {isAr ? "عرض اسم المتجر في التذييل" : "Show store name in footer"}
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isAr ? "إظهار اسم العلامة في أسفل الفوتر" : "Display brand name next to copyright"}
            </p>
          </div>
          <Switch
            checked={bs.show_footer_name ?? true}
            onCheckedChange={(checked) => setBs({ show_footer_name: checked })}
          />
        </div>

        {/* Footer Trust Badges Editor */}
        <div className="pt-2">
          <TrustBadgesEditor
            value={bs.trust_badges as any}
            onChange={(val) => setBs({ trust_badges: val as any })}
            isAr={isAr}
            footerBg={bs.footer_bg}
            footerFg={bs.footer_fg}
            vertical={(brand as any)?.store_vertical}
            settings={bs as any}
          />
        </div>

        {/* Advanced Footer Logo Scale */}
        <AdvancedOnly
          fieldKey="footer_logo_size"
          reason={isAr ? "تخصيص حجم شعار الفوتر بدقة" : "Fine-tune footer logo size"}
        >
          <div className="rounded-xl border border-border p-4 bg-muted/5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs font-semibold">
                  {isAr ? "حجم شعار تذييل الصفحة (الفوتر)" : "Footer Logo Height (px)"}
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isAr ? "ارتفاع الشعار المعروض في الفوتر" : "Height of the logo shown in footer"}
                </p>
              </div>
              <span className="text-xs font-mono font-semibold text-primary">
                {footerLogoSize}px
              </span>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="range"
                min={16}
                max={120}
                step={2}
                value={footerLogoSize}
                onChange={(e) => setBs({ footer_logo_size: Number(e.target.value) })}
                className="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
              />
              <Input
                type="number"
                min={16}
                max={120}
                value={footerLogoSize}
                onChange={(e) =>
                  setBs({
                    footer_logo_size: Math.max(16, Math.min(120, Number(e.target.value) || 28)),
                  })
                }
                className="w-18 text-center font-mono text-xs h-9"
              />
            </div>

            <div className="flex items-center gap-1.5 flex-wrap pt-1">
              <span className="text-xs text-muted-foreground me-1 font-medium">
                {isAr ? "أحجام جاهزة:" : "Presets:"}
              </span>
              {footerPresets.map((p) => (
                <Button
                  key={p.val}
                  type="button"
                  size="sm"
                  variant={footerLogoSize === p.val ? "default" : "outline"}
                  className="h-7 text-xs px-2.5 rounded-lg"
                  onClick={() => setBs({ footer_logo_size: p.val })}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          </div>
        </AdvancedOnly>
      </div>

      {/* 3. Navigation Drawer Menu Links (Advanced) */}
      <AdvancedOnly
        fieldKey="menu_show_home"
        reason={
          isAr ? "تخصيص روابط وعنوان القائمة الجانبية" : "Customize navigation drawer links & title"
        }
      >
        <div className="rounded-xl border border-border p-5 bg-card shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <div>
              <h3 className="text-base font-semibold text-foreground">
                {isAr ? "القائمة الجانبية المتنقلة (Drawer Menu)" : "Drawer Navigation Links"}
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {isAr
                  ? "تحكم بالروابط الأساسية التي تظهر للزوار داخل قائمة التصفح الجانبية."
                  : "Toggle which navigational destination links appear in the mobile/side drawer."}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div dir="rtl">
              <Label className="text-xs font-medium">
                {isAr ? "عنوان القائمة (عربي)" : "Menu Title (Arabic)"}
              </Label>
              <Input
                className="mt-1.5 text-end text-xs h-9"
                value={bs.menu_title_ar ?? ""}
                placeholder={isAr ? "فارغ يستخدم اسم المتجر" : "Blank uses brand name"}
                onChange={(e) => setBs({ menu_title_ar: e.target.value || null })}
              />
            </div>

            <div dir="ltr">
              <Label className="text-xs font-medium">
                {isAr ? "عنوان القائمة (إنجليزي)" : "Menu Title (English)"}
              </Label>
              <Input
                className="mt-1.5 text-start text-xs h-9"
                value={bs.menu_title_en ?? ""}
                placeholder="Blank uses brand name"
                onChange={(e) => setBs({ menu_title_en: e.target.value || null })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            {[
              { key: "menu_show_home", labelAr: "إظهار رابط الرئيسية", labelEn: "Show Home Link" },
              {
                key: "menu_show_account",
                labelAr: "إظهار رابط الحساب وتجربة الدخول",
                labelEn: "Show Account & Login",
              },
              {
                key: "menu_show_orders",
                labelAr: "إظهار رابط متابعة طلباتي",
                labelEn: "Show My Orders",
              },
              {
                key: "menu_show_pages",
                labelAr: "إظهار روابط الصفحات الثابتة والسياسات",
                labelEn: "Show Custom Pages & Policies",
              },
            ].map(({ key, labelAr, labelEn }) => (
              <div
                key={key}
                className="flex items-center justify-between gap-4 rounded-xl border border-border p-3.5 bg-background"
              >
                <Label className="cursor-pointer text-xs font-medium">
                  {isAr ? labelAr : labelEn}
                </Label>
                <Switch
                  checked={(bs as any)[key] ?? true}
                  onCheckedChange={(checked) => setBs({ [key]: checked })}
                />
              </div>
            ))}
          </div>
        </div>
      </AdvancedOnly>
    </div>
  );
}
