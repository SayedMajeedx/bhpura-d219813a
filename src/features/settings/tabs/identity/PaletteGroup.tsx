import * as React from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Palette, Sliders } from "lucide-react";
import {
  QuickThemeCustomizer,
  type FontMoodPreset,
} from "@/components/settings/QuickThemeCustomizer";
import { ColorField } from "../../shared/ColorField";
import { AdvancedOnly } from "../../FieldVisibility";
import { useBrandSettingsFormContext } from "../../use-brand-settings-form";
import { resolveFooterVariant } from "@/lib/storefront-engine";
import { useI18n } from "@/lib/i18n";
import type { ExtractedPalette } from "@/lib/logo-palette";
import { paletteToSettingsPatch } from "@/lib/brand-palette-apply";

export function PaletteGroup() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const { bs, setBs, patchBs } = useBrandSettingsFormContext();
  // Footer colours are only read by the classic (simple) footer; the columns
  // footer used by Storefront 2.0 derives its own surface from the theme.
  const showFooterColours = resolveFooterVariant(bs) === "simple";

  const handleExtractPalette = (palette: ExtractedPalette) => {
    // Writes the full derived palette (header, footer, buttons, headings) plus
    // brand_palette metadata so the readiness checklist can see the logo source.
    patchBs(paletteToSettingsPatch(palette, "logo") as any);
  };

  const handleFontPreset = (preset: FontMoodPreset) => {
    patchBs({
      storefront_font_ar: preset.fontAr,
      storefront_font_en: preset.fontEn,
    });
  };

  return (
    <div className="space-y-6">
      {/* 1. Basic Quick Theme Customizer */}
      <Card className="p-6 rounded-2xl border-border bg-card">
        <div className="flex items-center gap-2 mb-4">
          <Palette className="h-5 w-5 text-primary" />
          <div>
            <h3 className="font-display text-lg font-semibold">
              {isAr ? "ألوان وهوية المتجر" : "Storefront Colors & Theme"}
            </h3>
            <p className="text-xs text-muted-foreground">
              {isAr
                ? "الألوان الأساسية، انحناء الحواف، وشارات التميز"
                : "Primary accent, background, corner radius, and badges"}
            </p>
          </div>
        </div>

        <QuickThemeCustomizer
          primaryColor={bs.storefront_accent_color || "#8C6D58"}
          secondaryColor={bs.storefront_background_color || "#FAF8F5"}
          radius={bs.storefront_radius || "12px"}
          currentFontAr={bs.storefront_font_ar || "Cairo"}
          currentFontEn={bs.storefront_font_en || "Inter"}
          headerGlass={bs.header_glass ?? true}
          badgeAccent={bs.badge_accent || "#E53E3E"}
          headerBg={bs.header_bg}
          headerFg={bs.header_fg}
          footerBg={bs.footer_bg}
          footerFg={bs.footer_fg}
          logoUrl={bs.logo_url}
          isAr={isAr}
          onPrimaryChange={(val) => setBs("storefront_accent_color", val)}
          onSecondaryChange={(val) => setBs("storefront_background_color", val)}
          onRadiusChange={(val) => setBs("storefront_radius", val)}
          onBadgeAccentChange={(val) => setBs("badge_accent", val)}
          onHeaderGlassChange={(val) => setBs("header_glass", val)}
          onHeaderBgChange={(val) => setBs("header_bg", val)}
          onHeaderFgChange={(val) => setBs("header_fg", val)}
          onFooterBgChange={(val) => setBs("footer_bg", val)}
          onFooterFgChange={(val) => setBs("footer_fg", val)}
          onSelectFontPreset={handleFontPreset}
          onSwapColors={() => {
            const currentAccent = bs.storefront_accent_color || "#8C6D58";
            const currentBg = bs.storefront_background_color || "#FAF8F5";
            patchBs({
              storefront_accent_color: currentBg,
              storefront_background_color: currentAccent,
            });
          }}
          onExtractPalette={handleExtractPalette}
        />
        {(() => {
          const meta =
            (bs.brand_palette as { source?: string; extracted_at?: string } | null) ?? null;
          if (!meta?.source) return null;
          return (
            <p className="mt-3 text-xs text-muted-foreground">
              {meta.source === "logo"
                ? isAr
                  ? "اللوحة الحالية مستخرجة من الشعار"
                  : "Current palette was extracted from the logo"
                : isAr
                  ? "اللوحة الحالية مضبوطة يدوياً"
                  : "Current palette was set manually"}
              {meta.extracted_at
                ? ` · ${new Date(meta.extracted_at).toLocaleDateString(isAr ? "ar-BH" : "en-GB")}`
                : ""}
            </p>
          );
        })()}
      </Card>

      {/* 2. Advanced Fine-grained Color Controls */}
      <AdvancedOnly fieldName="identity.palette.advanced_colors">
        <Card className="p-6 rounded-2xl border-border bg-card space-y-6">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <Sliders className="h-5 w-5 text-primary" />
            <div>
              <h4 className="font-semibold text-base">
                {isAr ? "تخصيص الألوان المتقدم" : "Advanced Color Customization"}
              </h4>
              <p className="text-xs text-muted-foreground">
                {isAr
                  ? "تحكم دقيق في ألوان الأزرار والنصوص والرأس والتذييل لكل عنصر على حدة"
                  : "Fine-tune button, typography, header, and footer tokens individually"}
              </p>
            </div>
          </div>

          {/* Typography Colors */}
          <div className="space-y-4">
            <h5 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              {isAr ? "ألوان النصوص والعناوين" : "Typography & Content"}
            </h5>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <ColorField
                label={isAr ? "لون النص العام" : "Body Text Color"}
                value={bs.storefront_text_color ?? null}
                onChange={(v) => setBs("storefront_text_color", v)}
              />
              <ColorField
                label={isAr ? "لون العناوين" : "Headings Color"}
                value={bs.heading_color ?? null}
                onChange={(v) => setBs("heading_color", v)}
              />
              <ColorField
                label={isAr ? "لون الروابط" : "Links Color"}
                value={bs.link_color ?? null}
                onChange={(v) => setBs("link_color", v)}
              />
              <ColorField
                label={isAr ? "لون الأسعار" : "Price Color"}
                value={bs.price_color ?? null}
                onChange={(v) => setBs("price_color", v)}
              />
              <ColorField
                label={isAr ? "لون عنوان المنتج" : "Product Title Color"}
                value={bs.product_title_color ?? null}
                onChange={(v) => setBs("product_title_color", v)}
              />
            </div>
          </div>

          {/* Buttons & Actions */}
          <div className="space-y-4 pt-4 border-t border-border">
            <h5 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              {isAr ? "ألوان الأزرار والإجراءات" : "Buttons & Checkout Actions"}
            </h5>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <ColorField
                label={isAr ? "خلفية الزر الأساسي" : "Primary Button BG"}
                value={bs.btn_primary_bg ?? null}
                onChange={(v) => setBs("btn_primary_bg", v)}
              />
              <ColorField
                label={isAr ? "نص الزر الأساسي" : "Primary Button Text"}
                value={bs.btn_primary_fg ?? null}
                onChange={(v) => setBs("btn_primary_fg", v)}
              />
              <ColorField
                label={isAr ? "خلفية الزر الثانوي" : "Secondary Button BG"}
                value={bs.btn_secondary_bg ?? null}
                onChange={(v) => setBs("btn_secondary_bg", v)}
              />
              <ColorField
                label={isAr ? "نص الزر الثانوي" : "Secondary Button Text"}
                value={bs.btn_secondary_fg ?? null}
                onChange={(v) => setBs("btn_secondary_fg", v)}
              />
              <ColorField
                label={isAr ? "خلفية زر الدفع" : "Checkout Button BG"}
                value={bs.btn_checkout_bg ?? null}
                onChange={(v) => setBs("btn_checkout_bg", v)}
              />
              <ColorField
                label={isAr ? "نص زر الدفع" : "Checkout Button Text"}
                value={bs.btn_checkout_fg ?? null}
                onChange={(v) => setBs("btn_checkout_fg", v)}
              />
              <ColorField
                label={isAr ? "خلفية دفع سلة الشراء" : "Cart Drawer Checkout BG"}
                value={bs.cart_drawer_checkout_bg ?? null}
                onChange={(v) => setBs("cart_drawer_checkout_bg", v)}
              />
              <ColorField
                label={isAr ? "نص دفع سلة الشراء" : "Cart Drawer Checkout Text"}
                value={bs.cart_drawer_checkout_fg ?? null}
                onChange={(v) => setBs("cart_drawer_checkout_fg", v)}
              />
            </div>
          </div>

          {/* Header, Menu & Footer */}
          <div className="space-y-4 pt-4 border-t border-border">
            <h5 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              {isAr ? "ألوان الرأس والقائمة والتذييل" : "Header, Menu & Footer"}
            </h5>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <ColorField
                label={isAr ? "خلفية الرأس" : "Header BG"}
                value={bs.header_bg ?? null}
                onChange={(v) => setBs("header_bg", v)}
              />
              <ColorField
                label={isAr ? "نص وأيقونات الرأس" : "Header Text/Icons"}
                value={bs.header_fg ?? null}
                onChange={(v) => setBs("header_fg", v)}
              />
              <ColorField
                label={isAr ? "خلفية القائمة الجانبية" : "Menu BG"}
                value={bs.menu_bg ?? null}
                onChange={(v) => setBs("menu_bg", v)}
              />
              <ColorField
                label={isAr ? "نص القائمة الجانبية" : "Menu Text"}
                value={bs.menu_fg ?? null}
                onChange={(v) => setBs("menu_fg", v)}
              />
              {showFooterColours && (
                <>
                  <ColorField
                    label={isAr ? "خلفية التذييل" : "Footer BG"}
                    value={bs.footer_bg ?? null}
                    onChange={(v) => setBs("footer_bg", v)}
                  />
                  <ColorField
                    label={isAr ? "نص التذييل" : "Footer Text"}
                    value={bs.footer_fg ?? null}
                    onChange={(v) => setBs("footer_fg", v)}
                  />
                </>
              )}
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border p-4 bg-muted/10 mt-3">
              <div>
                <Label htmlFor="header_glass" className="font-semibold text-sm">
                  {isAr ? "تأثير زجاجي شفاف لشريط الرأس (Glassmorphism)" : "Header Glassmorphism"}
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isAr
                    ? "تأثير ضبابي أنيق لشريط التنقل العلوي عند التمرير"
                    : "Elegant frosted blur overlay on storefront header"}
                </p>
              </div>
              <Switch
                id="header_glass"
                checked={bs.header_glass ?? true}
                onCheckedChange={(val) => setBs("header_glass", val)}
              />
            </div>
          </div>
        </Card>
      </AdvancedOnly>
    </div>
  );
}
