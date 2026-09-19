import * as React from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  customFontFaces,
  fontCapabilities,
  normalizeTypography,
  type TypographyConfig,
} from "@/lib/typography";

export const STOREFRONT_AR_FONTS = [
  "Readex Pro",
  "Tajawal",
  "29LT Bukra",
  "29LT Zarid Display",
  "29LT Kaff",
  "29LT Azer",
  "Cairo",
  "Alexandria",
  "Amiri",
  "Almarai",
];

export const STOREFRONT_EN_FONTS = [
  "Plus Jakarta Sans",
  "Inter",
  "Playfair Display",
  "Cormorant Garamond",
  "Montserrat",
  "Poppins",
  "Arial",
  "Georgia",
  "Times New Roman",
];

export function TypographyAdvancedControls({
  title,
  config,
  onChange,
  isAr,
  namespace,
}: {
  title: string;
  config: TypographyConfig;
  onChange: (config: TypographyConfig) => void;
  isAr: boolean;
  namespace: "Storefront" | "Admin";
}) {
  const previewLanguage = isAr ? "ar" : "en";
  const bodyCapabilitySet = (["en", "ar"] as const).map((language) =>
    fontCapabilities(config.body[language])
  );
  const displayCapabilitySet = (["en", "ar"] as const).map((language) =>
    fontCapabilities(config.display[language])
  );
  const bodyCapabilities = fontCapabilities(config.body[previewLanguage]);
  const displayCapabilities = fontCapabilities(config.display[previewLanguage]);
  const bodyWeightRange = {
    min: Math.max(...bodyCapabilitySet.map((item) => item.weight.min)),
    max: Math.min(...bodyCapabilitySet.map((item) => item.weight.max)),
  };
  const displayWeightRange = {
    min: Math.max(...displayCapabilitySet.map((item) => item.weight.min)),
    max: Math.min(...displayCapabilitySet.map((item) => item.weight.max)),
  };
  const allCapabilities = [...bodyCapabilitySet, ...displayCapabilitySet];
  const hasHexp = allCapabilities.some((item) => item.hexp);
  const hasItalic = allCapabilities.some((item) => item.italic);
  const hasGenericAxes = allCapabilities.some((item) => item.genericAxes);
  const previewFaces = customFontFaces(config, previewLanguage)
    .replaceAll("BoutqBodyCustom", `${namespace}TypographyPreviewBody`)
    .replaceAll("BoutqDisplayCustom", `${namespace}TypographyPreviewDisplay`);

  const setNumber = (key: keyof TypographyConfig, value: number) =>
    onChange({ ...config, [key]: value });

  const range = (
    label: string,
    key:
      | "bodyWeight"
      | "headingWeight"
      | "scale"
      | "bodyLineHeight"
      | "headingLineHeight"
      | "letterSpacing",
    min: number,
    max: number,
    step: number,
    formatValue: (value: number) => string = String,
    help?: string
  ) => (
    <div className="space-y-2 rounded-lg border border-border bg-background/60 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Label className="text-sm font-medium">{label}</Label>
          {help && (
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {help}
            </p>
          )}
        </div>
        <span className="rounded-md bg-muted px-2 py-1 text-xs font-semibold tabular-nums text-foreground">
          {formatValue(config[key])}
        </span>
      </div>
      <input
        className="w-full accent-primary"
        type="range"
        min={min}
        max={max}
        step={step}
        value={config[key]}
        onChange={(event) => setNumber(key, Number(event.target.value))}
      />
    </div>
  );

  return (
    <div className="space-y-4 rounded-xl border border-border bg-background/40 p-4">
      {previewFaces && <style>{previewFaces}</style>}
      <div>
        <h4 className="text-sm font-semibold">{title}</h4>
        <p className="mt-1 text-xs text-muted-foreground">
          {isAr
            ? "نظام أدوار متكامل للنصوص والعناوين مع محاور الخطوط المتغيرة."
            : "Role-based body and display typography with variable-font axes."}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {(["body", "display"] as const).flatMap((role) =>
          (["en", "ar"] as const).map((language) => {
            const fonts = language === "ar" ? STOREFRONT_AR_FONTS : STOREFRONT_EN_FONTS;
            const selectedSource = config[role][language];
            const availableFonts = selectedSource.url
              ? [selectedSource.family, ...fonts.filter((font) => font !== selectedSource.family)]
              : fonts.includes(selectedSource.family)
                ? fonts
                : [selectedSource.family, ...fonts];
            return (
              <div key={`${role}-${language}`} className="space-y-2">
                <Label>
                  {isAr
                    ? `${role === "body" ? "خط النص" : "خط العناوين"} ${language === "ar" ? "العربي" : "الإنجليزي"}`
                    : `${language === "ar" ? "Arabic" : "English"} ${role} font`}
                </Label>
                <Select
                  value={config[role][language].family}
                  onValueChange={(family) => {
                    const nextConfig: TypographyConfig = {
                      ...config,
                      [role]: {
                        ...config[role],
                        [language]: { family, url: null },
                      },
                    };
                    onChange(normalizeTypography(nextConfig, nextConfig));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableFonts.map((font) => (
                      <SelectItem key={font} value={font}>
                        <span
                          style={{
                            fontFamily:
                              selectedSource.url && font === selectedSource.family
                                ? role === "body"
                                  ? `${namespace}TypographyPreviewBody`
                                  : `${namespace}TypographyPreviewDisplay`
                                : font,
                          }}
                        >
                          {font}
                          {selectedSource.url && font === selectedSource.family
                            ? isAr
                              ? " — مرفوع"
                              : " — uploaded"
                            : ""}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          })
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {range(
          isAr ? "سُمك النصوص" : "Body weight",
          "bodyWeight",
          bodyWeightRange.min,
          bodyWeightRange.max,
          10,
          (value) => String(value),
          isAr ? "درجة سماكة النصوص العادية والأزرار." : "Thickness of body copy and controls."
        )}
        {range(
          isAr ? "سُمك العناوين" : "Heading weight",
          "headingWeight",
          displayWeightRange.min,
          displayWeightRange.max,
          10,
          (value) => String(value),
          isAr ? "درجة سماكة عناوين الأقسام والبنرات." : "Thickness of headings and banner titles."
        )}
        {range(
          isAr ? "الحجم العام للخطوط" : "Overall type size",
          "scale",
          0.85,
          1.25,
          0.01,
          (value) => `${Math.round(value * 100)}%`,
          isAr
            ? "يكبّر أو يصغّر جميع أحجام الخطوط بنسب متوازنة."
            : "Scales all type sizes proportionally."
        )}
        {range(
          isAr ? "المسافة بين أسطر النص" : "Body line spacing",
          "bodyLineHeight",
          1.2,
          2,
          0.05,
          (value) => `${value}×`,
          isAr
            ? "مساحة التنفس بين أسطر الفقرات والنصوص."
            : "Breathing room between lines of body copy."
        )}
        {range(
          isAr ? "المسافة بين أسطر العناوين" : "Heading line spacing",
          "headingLineHeight",
          0.9,
          1.6,
          0.05,
          (value) => `${value}×`,
          isAr
            ? "المسافة الرأسية للعناوين متعددة الأسطر."
            : "Vertical spacing for multi-line headings."
        )}
        {range(
          isAr ? "المسافة بين الحروف" : "Letter spacing",
          "letterSpacing",
          -0.08,
          0.2,
          0.01,
          (value) => `${value > 0 ? "+" : ""}${value}em`,
          isAr
            ? "تقريب الحروف أو إبعادها عن بعضها."
            : "Tightens or loosens the space between characters."
        )}
      </div>
      {hasGenericAxes && (
        <div className="grid gap-4 sm:grid-cols-3">
          {(["width", "slant", "opticalSize"] as const).map((axis) => {
            const limits =
              axis === "width" ? [75, 125, 1] : axis === "slant" ? [-12, 0, 1] : [8, 72, 1];
            const axisCopy = {
              width: {
                label: isAr ? "عرض الحروف" : "Character width",
                technical: "wdth",
                help: isAr
                  ? "يجعل شكل الحروف أضيق أو أعرض."
                  : "Makes letterforms narrower or wider.",
                value: `${config.axes.width}%`,
              },
              slant: {
                label: isAr ? "ميلان الحروف" : "Character slant",
                technical: "slnt",
                help: isAr
                  ? "يميل الحروف تدريجيًا عند دعم الخط."
                  : "Gradually slants letters when supported.",
                value: `${config.axes.slant}°`,
              },
              opticalSize: {
                label: isAr ? "الضبط البصري للحجم" : "Optical size tuning",
                technical: "opsz",
                help: isAr
                  ? "يضبط تفاصيل الخط لتناسب حجم العرض."
                  : "Tunes font details for its display size.",
                value: `${config.axes.opticalSize}px`,
              },
            }[axis];
            return (
              <div
                key={axis}
                className="space-y-2 rounded-lg border border-border bg-background/60 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Label className="text-sm font-medium">{axisCopy.label}</Label>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                      {axisCopy.help} <span dir="ltr">({axisCopy.technical})</span>
                    </p>
                  </div>
                  <span className="rounded-md bg-muted px-2 py-1 text-xs font-semibold tabular-nums text-foreground">
                    {axisCopy.value}
                  </span>
                </div>
                <input
                  className="w-full accent-primary"
                  type="range"
                  min={limits[0]}
                  max={limits[1]}
                  step={limits[2]}
                  value={config.axes[axis]}
                  onChange={(event) =>
                    onChange({
                      ...config,
                      axes: { ...config.axes, [axis]: Number(event.target.value) },
                    })
                  }
                />
              </div>
            );
          })}
        </div>
      )}
      {hasHexp && (
        <div className="space-y-2 rounded-lg border border-border bg-background/60 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Label className="text-sm font-medium">
                {isAr ? "اتساع بنية الحروف العربية" : "Arabic letterform expansion"}
              </Label>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                {isAr
                  ? "محور Readex Pro الحقيقي (HEXP): يوسّع بنية الحروف تدريجيًا مع الحفاظ على وضوح القراءة."
                  : "Readex Pro's native HEXP axis expands letterforms while preserving readability."}
              </p>
            </div>
            <span className="rounded-md bg-muted px-2 py-1 text-xs font-semibold tabular-nums">
              {config.axes.hexp}%
            </span>
          </div>
          <input
            className="w-full accent-primary"
            type="range"
            min={0}
            max={100}
            step={1}
            value={config.axes.hexp}
            onChange={(event) =>
              onChange({
                ...config,
                axes: { ...config.axes, hexp: Number(event.target.value) },
              })
            }
          />
        </div>
      )}
      {hasItalic && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
          <div>
            <Label>{isAr ? "النمط المائل الحقيقي" : "True italic style"}</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              {isAr
                ? "يستخدم ملف Plus Jakarta Sans Italic الأصلي، وليس إمالة صناعية من المتصفح."
                : "Uses the native Plus Jakarta Sans Italic variable font, not synthetic slanting."}
            </p>
          </div>
          <Switch
            checked={config.axes.italic}
            onCheckedChange={(italic) => onChange({ ...config, axes: { ...config.axes, italic } })}
          />
        </div>
      )}
      <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
        <div>
          <Label>{isAr ? "تحسين وضوح الخط تلقائيًا" : "Automatic optical optimization"}</Label>
          <p className="mt-1 text-xs text-muted-foreground">
            {isAr
              ? "يُحسّن تفاصيل الخط بحسب حجمه تلقائيًا عند دعم الخط لهذه الميزة."
              : "Optimizes font details for each size when the font supports it."}
          </p>
        </div>
        <Switch
          checked={config.opticalSizing}
          onCheckedChange={(opticalSizing) => onChange({ ...config, opticalSizing })}
        />
      </div>
      <div
        className="rounded-xl border border-dashed border-border p-5"
        style={{
          fontFamily: config.body[previewLanguage].url
            ? `${namespace}TypographyPreviewBody`
            : config.body[previewLanguage].family,
          fontWeight: config.bodyWeight,
          lineHeight: config.bodyLineHeight,
          letterSpacing: `${config.letterSpacing}em`,
          fontStyle: config.axes.italic && bodyCapabilities.italic ? "italic" : "normal",
          fontVariationSettings: bodyCapabilities.hexp
            ? `'HEXP' ${config.axes.hexp}`
            : bodyCapabilities.genericAxes
              ? `'wdth' ${config.axes.width}, 'slnt' ${config.axes.slant}, 'opsz' ${config.axes.opticalSize}`
              : "normal",
        }}
      >
        <div
          className="text-2xl"
          style={{
            fontFamily: config.display[previewLanguage].url
              ? `${namespace}TypographyPreviewDisplay`
              : config.display[previewLanguage].family,
            fontWeight: config.headingWeight,
            lineHeight: config.headingLineHeight,
            fontStyle: config.axes.italic && displayCapabilities.italic ? "italic" : "normal",
            fontVariationSettings: displayCapabilities.hexp
              ? `'HEXP' ${config.axes.hexp}`
              : displayCapabilities.genericAxes
                ? `'wdth' ${config.axes.width}, 'slnt' ${config.axes.slant}, 'opsz' ${config.axes.opticalSize}`
                : "normal",
          }}
        >
          {isAr ? "هوية طباعية راقية" : "Refined typographic identity"}
        </div>
        <p className="mt-2 text-sm">
          {isAr
            ? "معاينة فورية للنصوص والعناوين قبل حفظ التغييرات."
            : "Live body and display preview before publishing changes."}
        </p>
      </div>
    </div>
  );
}
