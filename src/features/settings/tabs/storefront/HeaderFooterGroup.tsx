import * as React from "react";
import { useI18n } from "@/lib/i18n";
import { useBrandSettingsFormContext } from "@/features/settings/use-brand-settings-form";
import { resolveFooterVariant } from "@/lib/storefront-engine";
import { AdvancedOnly } from "@/features/settings/FieldVisibility";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { SettingsNavContext } from "@/features/settings/GroupNavigator";
import { AlignCenter, AlignLeft, AlignRight } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BarColorsField } from "./BarColorsField";

export function HeaderFooterGroup() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const { form, setBs } = useBrandSettingsFormContext();
  const bs = form.bs;
  // "Show store name in footer" is only read by the classic (simple) footer.
  // A Storefront 2.0 brand that keeps footer_layout = "simple" still gets it.
  const footerVariant = resolveFooterVariant(bs);
  const { setActiveGroup } = React.useContext(SettingsNavContext);
  const brandColor = bs.storefront_accent_color || form.brand.primary_color || "#8C6D58";

  const headerLogoSize = bs.logo_size ?? 36;
  const footerLogoSize = bs.footer_logo_size ?? 28;

  const footerPresets = [
    { label: isAr ? "صغير جداً (20px)" : "XS (20px)", val: 20 },
    { label: isAr ? "افتراضي (28px)" : "Default (28px)", val: 28 },
    { label: isAr ? "متوسط (36px)" : "Medium (36px)", val: 36 },
    { label: isAr ? "كبير (48px)" : "Large (48px)", val: 48 },
    { label: isAr ? "كبير جداً (64px)" : "XL (64px)", val: 64 },
  ];

  // The header, the side menu and the footer, each with everything about it: its colours were in
  // the palette (twice), the footer's layout, newsletter and payment icons with the new look's
  // options, and the trust badges with the footer (they are the trust bar's, on the Home page).
  return (
    <div className="space-y-6">
      {/* 1. Header */}
      <div className="rounded-xl border border-border p-5 bg-card shadow-sm space-y-5">
        <div>
          <h3 className="text-base font-semibold text-foreground">
            {isAr ? "الترويسة" : "Header"}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {isAr
              ? "الشريط أعلى كل صفحات المتجر: الشعار واسم المتجر وألوانه."
              : "The bar at the top of every page: the logo, the store's name and its colours."}
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

        <BarColorsField
          label={isAr ? "ألوان الترويسة" : "Header colours"}
          bg={bs.header_bg}
          fg={bs.header_fg}
          brandColor={brandColor}
          isAr={isAr}
          onChange={(colors) => setBs({ header_bg: colors.bg, header_fg: colors.fg })}
        />

        <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-3.5 bg-background">
          <div className="min-w-0">
            <Label htmlFor="header-glass" className="cursor-pointer text-xs font-semibold">
              {isAr ? "ترويسة زجاجية عند التمرير" : "Frosted header while scrolling"}
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isAr
                ? "تظهر الصفحة خلف الترويسة بضبابية خفيفة"
                : "The page shows through the header, softly blurred"}
            </p>
          </div>
          <Switch
            id="header-glass"
            checked={bs.header_glass ?? true}
            onCheckedChange={(checked) => setBs({ header_glass: checked })}
          />
        </div>
      </div>

      {/* 2. Side menu */}
      <div className="rounded-xl border border-border p-5 bg-card shadow-sm space-y-5">
        <div>
          <h3 className="text-base font-semibold text-foreground">
            {isAr ? "القائمة الجانبية" : "Side menu"}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {isAr
              ? "القائمة التي تُفتح من زر القائمة: ألوانها وروابطها."
              : "The menu the menu button opens: its colours and links."}
          </p>
        </div>

        <BarColorsField
          label={isAr ? "ألوان القائمة" : "Menu colours"}
          bg={bs.menu_bg}
          fg={bs.menu_fg}
          brandColor={brandColor}
          isAr={isAr}
          onChange={(colors) => setBs({ menu_bg: colors.bg, menu_fg: colors.fg })}
        />
        <AdvancedOnly
          fieldKey="menu_show_home"
          reason={isAr ? "عنوان القائمة وروابطها" : "The menu's title and links"}
        >
          <div className="space-y-4">
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
                {
                  key: "menu_show_home",
                  labelAr: "إظهار رابط الرئيسية",
                  labelEn: "Show Home Link",
                },
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

      {/* 3. Footer */}
      <div className="rounded-xl border border-border p-5 bg-card shadow-sm space-y-5">
        <div>
          <h3 className="text-base font-semibold text-foreground">{isAr ? "التذييل" : "Footer"}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {isAr ? "أسفل كل صفحات المتجر." : "The bottom of every page."}
          </p>
        </div>

        <div className="max-w-xs space-y-1.5">
          <Label htmlFor="footer-layout">{isAr ? "شكل التذييل" : "Footer layout"}</Label>
          <Select
            // Legacy rows stored the simple footer as "minimal"; normalise so the
            // control reflects what the storefront actually renders.
            value={footerVariant}
            onValueChange={(value) => setBs({ footer_layout: value })}
          >
            <SelectTrigger id="footer-layout" className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="simple">{isAr ? "بسيط" : "Minimal"}</SelectItem>
              <SelectItem value="columns">{isAr ? "أعمدة" : "Columns"}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {footerVariant === "simple" && (
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
        )}

        {/* Both footers read these (the columns footer through --sf-footer-bg / -fg). */}
        <BarColorsField
          label={isAr ? "ألوان التذييل" : "Footer colours"}
          bg={bs.footer_bg}
          fg={bs.footer_fg}
          brandColor={brandColor}
          isAr={isAr}
          onChange={(colors) => setBs({ footer_bg: colors.bg, footer_fg: colors.fg })}
        />

        {footerVariant === "columns" && (
          <>
            <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-3.5 bg-background">
              <div className="min-w-0">
                <Label htmlFor="footer-newsletter" className="cursor-pointer text-xs font-semibold">
                  {isAr ? "الاشتراك في النشرة" : "Newsletter sign-up"}
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isAr
                    ? "واتساب أو بريد، ويغذّي حملات الواتساب"
                    : "WhatsApp or email; feeds your WhatsApp campaigns"}
                </p>
              </div>
              <Switch
                id="footer-newsletter"
                checked={bs.newsletter_enabled ?? true}
                onCheckedChange={(checked) => setBs({ newsletter_enabled: checked })}
              />
            </div>
            {bs.newsletter_enabled !== false && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="min-w-0">
                  <Label htmlFor="newsletter-title-ar" className="text-xs font-medium">
                    {isAr ? "عنوان الاشتراك (عربي)" : "Newsletter title (Arabic)"}
                  </Label>
                  <Input
                    id="newsletter-title-ar"
                    dir="rtl"
                    className="mt-1 h-9 text-xs"
                    placeholder="اشترك لتصلك أحدث المنتجات والعروض"
                    value={bs.newsletter_title_ar ?? ""}
                    onChange={(e) => setBs({ newsletter_title_ar: e.target.value || null })}
                  />
                </div>
                <div className="min-w-0">
                  <Label htmlFor="newsletter-title-en" className="text-xs font-medium">
                    {isAr ? "عنوان الاشتراك (إنجليزي)" : "Newsletter title (English)"}
                  </Label>
                  <Input
                    id="newsletter-title-en"
                    dir="ltr"
                    className="mt-1 h-9 text-xs"
                    placeholder="Be the first to see new arrivals"
                    value={bs.newsletter_title_en ?? ""}
                    onChange={(e) => setBs({ newsletter_title_en: e.target.value || null })}
                  />
                </div>
              </div>
            )}
            <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-3.5 bg-background">
              <div className="min-w-0">
                <Label htmlFor="footer-payments" className="cursor-pointer text-xs font-semibold">
                  {isAr ? "أيقونات طرق الدفع" : "Payment icons"}
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isAr ? "طرق الدفع التي يقبلها متجرك" : "The payment methods your store accepts"}
                </p>
              </div>
              <Switch
                id="footer-payments"
                checked={bs.footer_show_payment_methods ?? true}
                onCheckedChange={(checked) => setBs({ footer_show_payment_methods: checked })}
              />
            </div>
          </>
        )}

        {/* The trust badges are edited with the trust bar, in the Home page group. */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-border p-3.5 text-xs text-muted-foreground">
          <span className="min-w-0">
            {isAr
              ? "شارات الثقة تُعدَّل مع شريط الثقة في الصفحة الرئيسية."
              : "The trust badges are edited with the trust bar, in the Home page group."}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setActiveGroup("home_sections")}
          >
            {isAr ? "فتح الصفحة الرئيسية" : "Open Home page"}
          </Button>
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
    </div>
  );
}
