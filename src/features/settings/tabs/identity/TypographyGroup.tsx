import * as React from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Type } from "lucide-react";
import { AdvancedOnly } from "../../FieldVisibility";
import { TypographyAdvancedControls } from "./TypographyAdvancedControls";
import { useBrandSettingsFormContext } from "../../use-brand-settings-form";
import { useI18n } from "@/lib/i18n";
import { LookSample } from "./LookSample";
import { FontPickers } from "./FontPickers";
import {
  defaultAdminTypography,
  normalizeTypography,
  resolveStorefrontTypography,
  type TypographyConfig,
} from "@/lib/typography";

export function TypographyGroup() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const { bs, setBs, patchBs, form } = useBrandSettingsFormContext();

  // What the storefront shows, so a change made here never saves a font the store did not see
  // (defaults filled in would have saved "29LT Zarid Display" as a chosen heading font).
  const storefrontTypography: TypographyConfig = resolveStorefrontTypography(bs);

  const adminTypography: TypographyConfig = normalizeTypography(
    bs.admin_typography as any,
    defaultAdminTypography(),
  );

  return (
    <div className="space-y-6">
      {/* 1. Basic Font Selection */}
      <Card className="p-6 rounded-2xl border-border bg-card space-y-6">
        <div className="flex items-center gap-2">
          <Type className="h-5 w-5 text-primary" />
          <div>
            <h3 className="font-display text-lg font-semibold">
              {isAr ? "الخطوط الأساسية للمتجر" : "Storefront Typography"}
            </h3>
            <p className="text-xs text-muted-foreground">
              {isAr
                ? "اختر الخط العربي والإنجليزي المناسب لهوية متجرك"
                : "Select primary Arabic and English fonts for your store"}
            </p>
          </div>
        </div>

        <div className="mb-5">
          <LookSample brand={form.brand} settings={bs as Record<string, unknown>} isAr={isAr} />
        </div>
        <FontPickers
          bs={bs as Record<string, unknown>}
          isAr={isAr}
          onChange={(patch) => patchBs(patch)}
        />
      </Card>

      {/* 2. Advanced Typography Controls */}
      <AdvancedOnly
        fieldName="identity.typography.advanced"
        reason={isAr ? "خطوط مخصصة وأحجام وأوزان الخطوط" : "Custom fonts, sizes and weights"}
      >
        <Card className="p-6 rounded-2xl border-border bg-card space-y-6">
          <div>
            <h4 className="font-semibold text-base">
              {isAr ? "إعدادات الخطوط المتقدمة والمخصصة" : "Advanced Typography System"}
            </h4>
            <p className="text-xs text-muted-foreground">
              {isAr
                ? "روابط خطوط WOFF2 مخصصة وتعديل أوزان ومقاييس الخطوط لواجهة المتجر ولوحة الإدارة"
                : "Custom WOFF2 font URLs and fine-grained scale/weight configuration"}
            </p>
          </div>

          {/* Custom Font URLs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl border border-border bg-muted/20">
            <div className="space-y-2">
              <Label>{isAr ? "رابط الخط العربي المخصص (WOFF2)" : "Custom Arabic Font URL"}</Label>
              <Input
                value={bs.storefront_font_ar_url ?? ""}
                onChange={(e) => setBs("storefront_font_ar_url", e.target.value || null)}
                placeholder="https://.../font.woff2"
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label>
                {isAr ? "رابط الخط الإنجليزي المخصص (WOFF2)" : "Custom English Font URL"}
              </Label>
              <Input
                value={bs.storefront_font_en_url ?? ""}
                onChange={(e) => setBs("storefront_font_en_url", e.target.value || null)}
                placeholder="https://.../font.woff2"
                dir="ltr"
              />
            </div>
          </div>

          {/* Storefront Typography Advanced */}
          <TypographyAdvancedControls
            title={isAr ? "نظام خطوط المتجر (Storefront)" : "Storefront Typography Roles"}
            config={storefrontTypography}
            // The text font chosen here is the picker's too: the storefront reads the picker first,
            // so a text font set only here never showed.
            onChange={(cfg) =>
              setBs({
                storefront_typography: cfg as any,
                storefront_font_ar: cfg.body.ar.family,
                storefront_font_ar_url: cfg.body.ar.url,
                storefront_font_en: cfg.body.en.family,
                storefront_font_en_url: cfg.body.en.url,
              })
            }
            isAr={isAr}
            namespace="Storefront"
          />

          {/* Admin Typography Advanced */}
          <TypographyAdvancedControls
            title={isAr ? "نظام خطوط لوحة التحكم (Admin)" : "Admin Dashboard Typography Roles"}
            config={adminTypography}
            onChange={(cfg) => setBs("admin_typography", cfg as any)}
            isAr={isAr}
            namespace="Admin"
          />
        </Card>
      </AdvancedOnly>
    </div>
  );
}
