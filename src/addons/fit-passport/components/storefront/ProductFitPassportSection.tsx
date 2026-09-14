import { useState, useMemo, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
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

export interface ProductFitPassportSectionProps {
  product?: any;
  customFields?: any[];
  cfValues?: Record<string, string>;
  setCfValues?: (updater: (prev: Record<string, string>) => Record<string, string>) => void;
  sizeMode?: "ready" | "custom";
  customer?: { id: string } | null;
  onApplied?: (applied: boolean) => void;
}

export function ProductFitPassportSection({
  product,
  customFields = [],
  cfValues = {},
  setCfValues,
  sizeMode = "custom",
  customer: propCustomer,
  onApplied,
}: ProductFitPassportSectionProps) {
  const { brand, lang, t, session, settings } = useStorefront();
  const isAr = lang === "ar";
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
        f.key === "custom_measurements" ||
        f.key.includes("passport_"),
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
  const [tailoringNotes, setTailoringNotes] = useState("");

  const storedFitProfiles = useMemo(
    () => normalizeFitProfiles(fitProfiles, fitPassportQ.data?.measurements),
    [fitProfiles, fitPassportQ.data?.measurements],
  );

  useEffect(() => {
    if (customerId && fitPassportQ.data?.measurements) {
      const values = storedFitProfiles[fitProfileType] || {};
      setPassportDraft(
        Object.fromEntries(Object.entries(values).map(([key, value]) => [key, String(value)])),
      );
      if (fitPassportQ.data?.tailoring_notes) {
        setTailoringNotes(fitPassportQ.data.tailoring_notes);
      }
    } else if (isGuest && brand?.slug) {
      try {
        const raw = localStorage.getItem(`pura_guest_fit_passport_${brand.slug}_${fitProfileType}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.draft && typeof parsed.draft === "object") {
            setPassportDraft(parsed.draft);
          }
          if (parsed?.unit === "in" || parsed?.unit === "cm") {
            setGuestUnit(parsed.unit);
          }
        }
      } catch {
        // LocalStorage fallback
      }
    }
  }, [customerId, fitPassportQ.data?.measurements, fitProfileType, brand?.slug, isGuest, storedFitProfiles]);

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
    if (missingFitFields(fitProfiles, fitProfileType, passportDraft).length) {
      toast.error(
        t(
          "يرجى إكمال المقاسات الإجبارية بقيم صحيحة أكبر من صفر",
          "Complete all required measurements with values greater than zero",
        ),
      );
      return;
    }

    if (isGuest && brand?.slug) {
      try {
        localStorage.setItem(
          `pura_guest_fit_passport_${brand.slug}_${fitProfileType}`,
          JSON.stringify({ draft: passportDraft, unit: guestUnit }),
        );
      } catch {
        // LocalStorage fallback
      }
    }

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
    onApplied?.(true);
    toast.success(
      isAr ? "تم تطبيق مقاسات الـ Passport على طلبك" : "Fit Passport measurements applied",
    );
  };

  const handleSaveAndApplyPassport = async () => {
    if (isGuest) {
      handleApplyPassport();
      return;
    }
    if (missingFitFields(fitProfiles, fitProfileType, passportDraft).length) {
      toast.error(
        t(
          "يرجى إكمال المقاسات الإجبارية بقيم صحيحة أكبر من صفر",
          "Complete all required measurements with values greater than zero",
        ),
      );
      return;
    }
    const cleanedProfile = Object.fromEntries(
      Object.entries(passportDraft)
        .filter(([, value]) => Number(value) > 0)
        .map(([key, value]) => [key, Number(value)]),
    );
    setSavingPassport(true);
    try {
      const { error } = await (supabase.from("customer_fit_passports") as any).upsert(
        {
          brand_id: brand!.id,
          auth_user_id: customerId,
          measurements: { ...storedFitProfiles, [fitProfileType]: cleanedProfile },
          preferred_length_unit: currentUnit,
          consent_to_store: true,
          tailoring_notes: tailoringNotes.trim() || null,
        },
        { onConflict: "brand_id,auth_user_id" },
      );
      setSavingPassport(false);
      if (error) {
        toast.error(t("تعذر حفظ المقاسات", "Could not save measurements"));
        return;
      }
      await fitPassportQ.refetch();
      handleApplyPassport();
      toast.success(t("تم حفظ المقاسات في Passport وتطبيقها", "Measurements saved and applied"));
    } catch {
      setSavingPassport(false);
      handleApplyPassport();
    }
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
    onApplied?.(false);
    toast.info(isAr ? "تم إلغاء تطبيق المقاسات" : "Measurements removed");
  };

  return (
    <div
      className={`rounded-xl border p-4 mb-6 ${
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
              <Button
                type="button"
                variant={guestUnit === "in" ? "default" : "ghost"}
                size="sm"
                onClick={() => setGuestUnit("in")}
                className="h-7 px-2 text-xs"
              >
                {t("بوصة", "in")}
              </Button>
              <Button
                type="button"
                variant={guestUnit === "cm" ? "default" : "ghost"}
                size="sm"
                onClick={() => setGuestUnit("cm")}
                className="h-7 px-2 text-xs"
              >
                {t("سم", "cm")}
              </Button>
            </div>
          )}

          <Button
            type="button"
            size="sm"
            variant={passportApplied ? "outline" : "default"}
            disabled={savingPassport}
            onClick={
              passportApplied
                ? handleRemovePassport
                : isGuest
                  ? handleApplyPassport
                  : handleSaveAndApplyPassport
            }
            className="gap-2"
          >
            {passportApplied ? <X className="size-4" /> : <Check className="size-4" />}
            {passportApplied
              ? t("إلغاء التطبيق", "Remove")
              : savingPassport
                ? t("جارٍ الحفظ…", "Saving…")
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
                <span className="text-destructive ms-1">*</span>
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

      {passportApplied && (
        <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
          <Check className="size-3.5" />
          {t(
            "تم ربط هذه المقاسات بالطلب. يمكن إلغاء التطبيق لتعديلها في أي وقت.",
            "Measurements attached to this order. Click Remove to modify them anytime.",
          )}
        </p>
      )}

      {isGuest && !passportApplied && brand?.slug && (
        <div className="mt-3.5 pt-3 border-t border-border flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {t(
              "لا يشترط إنشاء حساب لتفصيل هذه القطعة.",
              "No account required to tailor this item.",
            )}
          </span>
          <Link
            to="/$slug/auth"
            params={{ slug: brand.slug }}
            search={{
              redirect: typeof window !== "undefined" ? window.location.pathname : "",
            }}
            className="text-primary hover:underline font-semibold"
          >
            {t(
              "لديك حساب مسجل؟ تسجيل الدخول لاسترجاع المقاسات",
              "Have an account? Sign in to load saved measurements",
            )}
          </Link>
        </div>
      )}
    </div>
  );
}

export default ProductFitPassportSection;
