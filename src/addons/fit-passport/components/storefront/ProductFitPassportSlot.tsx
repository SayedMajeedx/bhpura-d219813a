import { useState, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStorefront } from "@/lib/storefront-context";
import {
  resolveFitProfiles,
  fitProfileForProduct,
  normalizeFitProfiles,
  missingFitFields,
  FIT_PROFILE_FIELDS,
} from "../../lib/fit-passport";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Ruler, Check, X } from "lucide-react";
import { toast } from "sonner";

export interface ProductFitPassportSlotProps {
  product?: any;
  customFields?: any[];
  cfValues?: Record<string, string>;
  setCfValues?: (updater: (prev: Record<string, string>) => Record<string, string>) => void;
  sizeMode?: "ready" | "custom";
  customer?: { id: string } | null;
}

export function ProductFitPassportSlot({
  product,
  customFields = [],
  cfValues = {},
  setCfValues,
  sizeMode = "custom",
  customer: propCustomer,
}: ProductFitPassportSlotProps) {
  const { brand, lang, t, session, settings } = useStorefront();
  const isAr = lang === "ar";
  const qc = useQueryClient();
  const customerId = propCustomer?.id || session?.user?.id;
  const isGuest = !customerId;

  const fitProfiles = useMemo(
    () => resolveFitProfiles(settings?.fit_profiles),
    [settings?.fit_profiles],
  );

  const fitProfileType = useMemo(() => {
    return (
      fitProfileForProduct(fitProfiles, product?.category, product?.name) ||
      fitProfiles[0]?.key ||
      "abaya"
    );
  }, [fitProfiles, product]);

  const activeDef = useMemo(
    () => fitProfiles.find((p) => p.key === fitProfileType),
    [fitProfiles, fitProfileType],
  );

  const passportConfigured = Boolean(
    customFields.some((f) =>
      Boolean(
        f.key.startsWith("fit_passport_") ||
        f.key === "fit_profile" ||
        f.key === "custom_measurements",
      ),
    ),
  );

  const fitPassportQ = useQuery({
    queryKey: ["customer-fit-passport", brand?.id, customerId],
    enabled: Boolean(brand?.id && customerId && passportConfigured),
    queryFn: async () => {
      const { data, error } = await (supabase.from("customer_fit_passports") as any)
        .select("*")
        .eq("brand_id", brand!.id)
        .eq("auth_user_id", customerId)
        .maybeSingle();
      if (error) return null;
      return data;
    },
  });

  const [guestUnit, setGuestUnit] = useState<"in" | "cm">("in");
  const [passportDraft, setPassportDraft] = useState<Record<string, string>>({});
  const [passportApplied, setPassportApplied] = useState(false);
  const [savingPassport, setSavingPassport] = useState(false);

  if (!passportConfigured) return null;

  const currentUnit = isGuest ? guestUnit : (fitPassportQ.data?.preferred_length_unit ?? "in");

  const fields =
    activeDef?.fields ??
    (FIT_PROFILE_FIELDS as any)[fitProfileType]?.map(([k, ar, en, req]: any[]) => ({
      key: k,
      label_ar: ar,
      label_en: en,
      required: req,
    })) ??
    [];

  const handleApplyPassport = () => {
    if (!setCfValues) return;
    setCfValues((prev) => {
      const next = { ...prev };
      for (const f of fields) {
        if (passportDraft[f.key]) {
          next[`fit_passport_${fitProfileType}_${f.key}`] =
            `${passportDraft[f.key]} ${currentUnit}`;
        }
      }
      next["fit_passport_profile"] = activeDef
        ? `${activeDef.label_ar} / ${activeDef.label_en}`
        : fitProfileType;
      next["fit_passport_unit"] = currentUnit;
      return next;
    });
    setPassportApplied(true);
    toast.success(
      isAr ? "تم تطبيق مقاسات الـ Passport على طلبك" : "Fit Passport measurements applied",
    );
  };

  const handleRemovePassport = () => {
    if (!setCfValues) return;
    setCfValues((prev) => {
      const next = { ...prev };
      for (const f of fields) {
        delete next[`fit_passport_${fitProfileType}_${f.key}`];
      }
      delete next["fit_passport_profile"];
      delete next["fit_passport_unit"];
      return next;
    });
    setPassportApplied(false);
    toast.info(isAr ? "تم إلغاء تطبيق المقاسات" : "Measurements removed");
  };

  return (
    <div
      className={`rounded-xl border p-4 ${
        passportApplied
          ? "border-primary/20 bg-primary/[0.045]"
          : "border-amber-200 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-950/20"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Ruler className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-bold">
                {(isAr ? brand?.name_ar : brand?.name_en) ||
                  brand?.name_en ||
                  brand?.name_ar ||
                  "Fit"}{" "}
                Passport ·{" "}
                {activeDef ? (isAr ? activeDef.label_ar : activeDef.label_en) : fitProfileType}
              </p>
              {isGuest && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                  {t("طلب ضيف", "Guest order")}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {passportApplied
                ? t(
                    "تم تطبيق هذه المقاسات على طلبك.",
                    "These measurements are applied to your order.",
                  )
                : isGuest
                  ? t(
                      "إدخال المقاسات لتفصيل هذه القطعة كطلب ضيف مباشرة.",
                      "Enter measurements to tailor this item directly as a guest.",
                    )
                  : t(
                      "يمكن تعديل المقاسات هنا، ثم حفظها واستخدامها مباشرة.",
                      "Edit measurements here, then save and use them instantly.",
                    )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isGuest && !passportApplied && (
            <div className="flex items-center rounded-lg border border-border bg-background p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setGuestUnit("in")}
                className={`rounded-md px-2 py-1 text-xs transition-colors ${
                  guestUnit === "in"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t("بوصة", "in")}
              </button>
              <button
                type="button"
                onClick={() => setGuestUnit("cm")}
                className={`rounded-md px-2 py-1 text-xs transition-colors ${
                  guestUnit === "cm"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t("سم", "cm")}
              </button>
            </div>
          )}

          <Button
            type="button"
            size="sm"
            variant={passportApplied ? "outline" : "default"}
            onClick={passportApplied ? handleRemovePassport : handleApplyPassport}
            className="gap-2"
          >
            {passportApplied ? <X className="size-4" /> : <Check className="size-4" />}
            {passportApplied
              ? t("إلغاء التطبيق", "Remove")
              : isGuest
                ? t("تطبيق المقاسات", "Apply")
                : t("حفظ واستخدام", "Save & use")}
          </Button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-12">
        {fields.map(({ key, label_ar: ar, label_en: en, required }: any) => (
          <label
            key={key}
            className={`min-w-0 space-y-1.5 ${required ? "sm:col-span-3" : "sm:col-span-4"}`}
          >
            <span className="flex min-h-5 flex-wrap items-center gap-1.5 text-xs font-semibold sm:flex-nowrap">
              <span>{isAr ? ar : en}</span>
              {required ? (
                <span className="ms-1 text-destructive">*</span>
              ) : (
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium leading-none text-muted-foreground">
                  {t("اختياري", "optional")}
                </span>
              )}
            </span>
            <div className="relative">
              <Input
                type="number"
                inputMode="decimal"
                min="0.1"
                step="0.1"
                value={passportDraft[key] ?? ""}
                disabled={passportApplied}
                onChange={(event) =>
                  setPassportDraft((current) => ({
                    ...current,
                    [key]: event.target.value,
                  }))
                }
                className="h-10 pe-9 bg-background"
              />
              <span className="absolute end-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                {currentUnit}
              </span>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}
export default ProductFitPassportSlot;
