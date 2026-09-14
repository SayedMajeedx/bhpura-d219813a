import { useState } from "react";
import { useBrand } from "@/lib/brand-context";
import { useAdminStoreProfile } from "@/hooks/use-store-profile";
import {
  resolveFitProfiles,
  fitProfileForProduct,
  normalizeFitProfiles,
  missingFitFields,
  FIT_PROFILE_FIELDS,
} from "@/addons/fit-passport/lib/fit-passport";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Scissors, Ruler, Check, FileText } from "lucide-react";
import { toast } from "sonner";

export interface ItemTailoringData {
  id?: string;
  product_id?: string | null;
  name?: string;
  name_en?: string | null;
  name_ar?: string | null;
  price?: number;
  quantity?: number;
  unit_price?: number;
  location?: "main" | "incubator" | "custom";
  selected_variant?: { size?: string | null; color?: string | null; fabric?: string | null } | null;
  custom_field_values?: Array<{
    key: string;
    label_ar: string | null;
    label_en: string | null;
    value: string;
  }>;
}

export interface ItemTailoringCustomizerProps {
  item: ItemTailoringData;
  isAr: boolean;
  passport?: { measurements: unknown; preferred_length_unit: "in" | "cm"; version: number } | null;
  productCategory?: string | null;
  productName?: string | null;
  fitPassportEnabled?: boolean;
  onChange: (patch: Partial<ItemTailoringData>) => void;
}

export function ItemTailoringCustomizer({
  item,
  isAr,
  passport,
  productCategory,
  productName,
  fitPassportEnabled = true,
  onChange,
}: ItemTailoringCustomizerProps) {
  const brand = useBrand();
  const { profile: storeProfile } = useAdminStoreProfile(brand?.id);
  const fitProfiles = resolveFitProfiles(storeProfile?.fitProfiles);

  const detectedProfile = fitProfileForProduct(fitProfiles, productCategory, productName);
  const existingProfileField = String(
    item.custom_field_values?.find((field) => field.key === "fit_passport_profile")?.value ?? "",
  ).toLowerCase();
  const matchedFromField = fitProfiles.find(
    (p) =>
      existingProfileField.includes(p.key) ||
      existingProfileField.includes(p.label_ar.toLowerCase()) ||
      existingProfileField.includes(p.label_en.toLowerCase()),
  );
  const initialProfile = matchedFromField?.key ?? detectedProfile ?? fitProfiles[0]?.key ?? "abaya";
  const [selectedProfile, setSelectedProfile] = useState<string>(initialProfile);

  const existingUnitField = item.custom_field_values?.find(
    (field) => field.key === "fit_passport_unit",
  )?.value;
  const initialUnit: "in" | "cm" =
    existingUnitField === "cm" || passport?.preferred_length_unit === "cm" ? "cm" : "in";
  const [unit, setUnit] = useState<"in" | "cm">(initialUnit);

  const getMeasurementVal = (key: string): string => {
    const direct = item.custom_field_values?.find(
      (f) => f.key === `fit_passport_${selectedProfile}_${key}`,
    );
    if (direct?.value != null) {
      return String(direct.value)
        .replace(/[^\d.]/g, "")
        .trim();
    }
    const legacy = item.custom_field_values?.find(
      (f) => f.key === key || f.key.endsWith(`_${key}`),
    );
    if (legacy?.value != null) {
      return String(legacy.value)
        .replace(/[^\d.]/g, "")
        .trim();
    }
    return "";
  };

  const handleMeasurementChange = (key: string, val: string, labelAr: string, labelEn: string) => {
    const retained = (item.custom_field_values ?? []).filter(
      (f) => f.key !== `fit_passport_${selectedProfile}_${key}`,
    );
    const updated = [...retained];
    if (val.trim()) {
      updated.push({
        key: `fit_passport_${selectedProfile}_${key}`,
        label_ar: `Passport — ${labelAr}`,
        label_en: `Passport — ${labelEn}`,
        value: `${val.trim()} ${unit}`,
      });
    }
    const cleaned = updated.filter(
      (f) => f.key !== "fit_passport_profile" && f.key !== "fit_passport_unit",
    );
    const currentDef = fitProfiles.find((p) => p.key === selectedProfile);
    cleaned.push({
      key: "fit_passport_profile",
      label_ar: "ملف المقاس المستخدم",
      label_en: "Fit Passport profile",
      value: currentDef
        ? `${currentDef.label_ar} / ${currentDef.label_en}`
        : selectedProfile === "abaya"
          ? "عباية / Abaya"
          : "فستان / Dress",
    });
    cleaned.push({
      key: "fit_passport_unit",
      label_ar: "وحدة القياس",
      label_en: "Length unit",
      value: unit,
    });

    onChange({
      selected_variant: {
        ...(item.selected_variant ?? {}),
        size:
          item.selected_variant?.size ||
          (isAr ? "تفصيل / قياسات Passport" : "Custom / Fit Passport"),
      },
      location: "custom",
      custom_field_values: cleaned,
    });
  };

  const passportValues =
    normalizeFitProfiles(fitProfiles, passport?.measurements)[selectedProfile] ?? {};
  const passportComplete = Boolean(
    passport && missingFitFields(fitProfiles, selectedProfile, passportValues).length === 0,
  );

  const applyCustomerPassport = () => {
    if (!passport) return;
    const prefUnit = passport.preferred_length_unit || unit;
    setUnit(prefUnit);
    const retained = (item.custom_field_values ?? []).filter(
      (field) => !field.key.startsWith("fit_passport_"),
    );
    const currentDef = fitProfiles.find((p) => p.key === selectedProfile);
    const currentFields =
      currentDef?.fields ??
      (FIT_PROFILE_FIELDS as any)[selectedProfile]?.map(([k, ar, en]: any[]) => ({
        key: k,
        label_ar: ar,
        label_en: en,
      })) ??
      [];
    const snapshot: NonNullable<ItemTailoringData["custom_field_values"]> = [
      {
        key: "fit_passport_profile",
        label_ar: "ملف المقاس المستخدم",
        label_en: "Fit Passport profile",
        value: currentDef
          ? `${currentDef.label_ar} / ${currentDef.label_en}`
          : selectedProfile === "abaya"
            ? "عباية / Abaya"
            : "فستان / Dress",
      },
      {
        key: "fit_passport_unit",
        label_ar: "وحدة القياس",
        label_en: "Length unit",
        value: prefUnit,
      },
      ...currentFields
        .filter((f: any) => passportValues[f.key] != null && String(passportValues[f.key]).trim())
        .map((f: any) => ({
          key: `fit_passport_${selectedProfile}_${f.key}`,
          label_ar: `Passport — ${f.label_ar}`,
          label_en: `Passport — ${f.label_en}`,
          value: `${passportValues[f.key]} ${prefUnit}`,
        })),
      {
        key: "fit_passport_version",
        label_ar: "إصدار ملف المقاس",
        label_en: "Fit Passport version",
        value: String(passport.version),
      },
    ];
    onChange({
      selected_variant: {
        ...(item.selected_variant ?? {}),
        size: isAr ? "تفصيل / قياسات Passport" : "Custom / Fit Passport",
      },
      location: "custom",
      custom_field_values: [...retained, ...snapshot],
    });
    toast.success(isAr ? "تم تطبيق مقاسات العميل المحفوظة" : "Customer Fit Passport applied");
  };

  const hasAppliedPassport = (item.custom_field_values ?? []).some((f) =>
    f.key.startsWith(`fit_passport_${selectedProfile}_`),
  );

  const notesField = (item.custom_field_values ?? []).find(
    (cf) => cf.key === "tailoring_notes" || cf.key === "custom_measurements",
  );
  const currentNotes = notesField?.value ?? "";

  const handleNotesChange = (notesVal: string) => {
    const others = (item.custom_field_values ?? []).filter(
      (cf) => cf.key !== "tailoring_notes" && cf.key !== "custom_measurements",
    );
    const updated = notesVal.trim()
      ? [
          ...others,
          {
            key: "tailoring_notes",
            label_ar: "ملاحظات وتفاصيل التفصيل",
            label_en: "Tailoring & Measurements",
            value: notesVal.trim(),
          },
        ]
      : others;
    onChange({ custom_field_values: updated });
  };

  return (
    <div className="rounded-xl border border-primary/25 bg-primary/5 p-3.5 space-y-3.5 text-xs animate-in fade-in-50 duration-200">
      <div className="flex items-center justify-between gap-2 border-b border-primary/15 pb-2">
        <div className="flex items-center gap-1.5 font-bold text-primary">
          <Scissors className="h-4 w-4" />
          <span>
            {isAr ? "خيارات التخصيص والمقاسات (التفصيل)" : "Customization & Tailoring Options"}
          </span>
        </div>
        <span className="text-xs text-muted-foreground font-normal">
          {isAr ? "تفصيل حسب الطلب" : "Made to order"}
        </span>
      </div>

      {/* 📏 Fit Passport Module */}
      {fitPassportEnabled && (
        <div className="rounded-xl border border-border bg-card p-3.5 space-y-3 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2.5">
            <div className="flex items-center gap-2">
              <span className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground">
                <Ruler className="size-3.5" />
              </span>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-foreground">
                    {(isAr ? brand?.name_ar : brand?.name_en) ||
                      brand?.name_en ||
                      brand?.name_ar ||
                      "Fit"}{" "}
                    Passport
                  </span>
                  {hasAppliedPassport && (
                    <span className="rounded-full bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 text-xs font-semibold">
                      {isAr ? "مطبّق على البند" : "Applied"}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {isAr ? "مقاسات الخياطة والتفصيل المعتمدة" : "Standard tailoring measurements"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Profile Selector */}
              <div className="flex items-center rounded-lg border border-border bg-muted/40 p-0.5 text-xs">
                {fitProfiles.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setSelectedProfile(p.key)}
                    className={`rounded-md px-2 py-1 font-semibold transition-colors ${
                      selectedProfile === p.key
                        ? "bg-primary text-primary-foreground shadow-2xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {isAr ? p.label_ar : p.label_en}
                  </button>
                ))}
              </div>

              {/* Unit Selector (in / cm) */}
              <div className="flex items-center rounded-lg border border-border bg-muted/40 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setUnit("in")}
                  className={`rounded-md px-2 py-1 font-semibold transition-colors ${
                    unit === "in"
                      ? "bg-primary text-primary-foreground shadow-2xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {isAr ? "بوصة" : "in"}
                </button>
                <button
                  type="button"
                  onClick={() => setUnit("cm")}
                  className={`rounded-md px-2 py-1 font-semibold transition-colors ${
                    unit === "cm"
                      ? "bg-primary text-primary-foreground shadow-2xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {isAr ? "سم" : "cm"}
                </button>
              </div>
            </div>
          </div>

          {/* Saved Customer Passport banner if available */}
          {passport && (
            <div
              className={`rounded-lg border p-2.5 flex flex-wrap items-center justify-between gap-2 ${
                passportComplete
                  ? "border-primary/25 bg-primary/5"
                  : "border-amber-200 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-950/20"
              }`}
            >
              <div>
                <p className="font-bold text-xs">
                  {isAr
                    ? `مقاسات العميل المحفوظة متوفرة (إصدار V${passport.version})`
                    : `Saved customer measurements available (V${passport.version})`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {passportComplete
                    ? isAr
                      ? "يمكن تطبيق المقاسات المسجلة للعميل مباشرة"
                      : "Customer profile complete, ready to apply"
                    : isAr
                      ? "ملف العميل غير مكتمل لبعض الحقول، يمكن إكمالها يدوياً"
                      : "Some fields missing in customer profile, can be set manually"}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={applyCustomerPassport}
                className="h-7 text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
              >
                <Check className="size-3.5" />
                {isAr ? "تطبيق مقاسات العميل" : "Apply saved passport"}
              </Button>
            </div>
          )}

          {/* Measurements Input Grid */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-foreground flex items-center justify-between">
              <span>{isAr ? "قياسات التفصيل:" : "Tailoring Measurements:"}</span>
              <span className="text-xs text-muted-foreground font-normal">
                {isAr ? `الوحدة: ${unit === "in" ? "بوصة (إنش)" : "سنتيمتر"}` : `Unit: ${unit}`}
              </span>
            </Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(
                fitProfiles.find((p) => p.key === selectedProfile)?.fields ??
                (FIT_PROFILE_FIELDS as any)[selectedProfile]?.map(([key, ar, en, req]: any[]) => ({
                  key,
                  label_ar: ar,
                  label_en: en,
                  required: req,
                })) ??
                []
              ).map(({ key, label_ar: ar, label_en: en, required: req }: any) => {
                const val = getMeasurementVal(key);
                return (
                  <div key={key} className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground flex items-center gap-0.5">
                      {isAr ? ar : en}
                      {req && <span className="text-destructive font-bold">*</span>}
                    </span>
                    <div className="relative">
                      <Input
                        type="number"
                        step="0.1"
                        min="0.1"
                        value={val}
                        onChange={(e) => handleMeasurementChange(key, e.target.value, ar, en)}
                        placeholder={unit}
                        className="h-8 text-xs bg-background pe-7"
                      />
                      <span className="absolute end-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none uppercase">
                        {unit}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 📝 Tailoring Notes & Workshop Instructions ("بوكس ملاحظات") */}
      <div className="rounded-xl border border-border bg-card p-3.5 space-y-1.5 shadow-2xs">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5 text-primary" />
            <span>{isAr ? "ملاحظات وتفاصيل التفصيل والخياط:" : "Tailoring & Workshop Notes:"}</span>
          </Label>
          <span className="text-xs text-muted-foreground">
            {isAr ? "تعليمات للمشغل" : "Workshop instructions"}
          </span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {isAr
            ? "دوّن أي تفاصيل خاصة للخياطة (مثل: بطانة كاملة، تعديل طول الكم، خياطة مخفية، فتحة أزرار، تضييق الخصر...)"
            : "Enter any workshop instructions (e.g., full lining, specific sleeve adjustment, hidden buttons)..."}
        </p>
        <Textarea
          rows={3}
          value={currentNotes}
          onChange={(e) => handleNotesChange(e.target.value)}
          placeholder={
            isAr
              ? "مثال: الطول 54، دوران الصدر 22، طول الكم 28، تضييق بسيط عند الخصر، بطانة كاملة، قصة كلوش..."
              : "e.g. Length 54, Chest 22, Sleeves 28, slim waist, full lining..."
          }
          className="text-xs bg-background resize-none leading-relaxed border-border-strong focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
    </div>
  );
}
export default ItemTailoringCustomizer;
