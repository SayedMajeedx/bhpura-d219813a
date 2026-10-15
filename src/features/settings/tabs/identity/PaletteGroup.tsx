import * as React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SettingsNavContext } from "@/features/settings/GroupNavigator";
import { Palette, Sliders } from "lucide-react";
import { QuickThemeCustomizer } from "@/components/settings/QuickThemeCustomizer";
import { ColorField } from "../../shared/ColorField";
import { AdvancedOnly } from "../../FieldVisibility";
import { useBrandSettingsFormContext } from "../../use-brand-settings-form";
import { useI18n } from "@/lib/i18n";
import { LookSample } from "./LookSample";
import type { ExtractedPalette } from "@/lib/logo-palette";
import { paletteToSettingsPatch } from "@/lib/brand-palette-apply";

export function PaletteGroup() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const { bs, setBs, patchBs, form } = useBrandSettingsFormContext();
  const { openGroup } = React.useContext(SettingsNavContext);

  const handleExtractPalette = (palette: ExtractedPalette) => {
    // Writes the full derived palette (header, footer, buttons, headings) plus
    // brand_palette metadata so the readiness checklist can see the logo source.
    patchBs(paletteToSettingsPatch(palette, "logo") as any);
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

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
          <span className="min-w-0">
            {isAr
              ? "ألوان الترويسة والقائمة والتذييل مع بقية إعداداتها."
              : "The header's, menu's and footer's colours are with the rest of their settings."}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => openGroup?.("storefront", "header_footer")}
          >
            {isAr ? "الترويسة والتذييل" : "Header & footer"}
          </Button>
        </div>

        <div className="mb-5">
          <LookSample brand={form.brand} settings={bs as Record<string, unknown>} isAr={isAr} />
        </div>
        <QuickThemeCustomizer
          primaryColor={bs.storefront_accent_color || "#8C6D58"}
          secondaryColor={bs.storefront_background_color || "#FAF8F5"}
          radius={bs.storefront_radius || "12px"}
          badgeAccent={bs.badge_accent || "#E53E3E"}
          logoUrl={bs.logo_url}
          isAr={isAr}
          onPrimaryChange={(val) => setBs("storefront_accent_color", val)}
          onSecondaryChange={(val) => setBs("storefront_background_color", val)}
          onRadiusChange={(val) => setBs("storefront_radius", val)}
          onBadgeAccentChange={(val) => setBs("badge_accent", val)}
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
      <AdvancedOnly
        fieldName="identity.palette.advanced_colors"
        reason={
          isAr
            ? "ألوان دقيقة: النصوص، الأزرار، الترويسة والقائمة والتذييل"
            : "Fine colours: text, buttons, header, menu and footer"
        }
      >
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
        </Card>
      </AdvancedOnly>
    </div>
  );
}
