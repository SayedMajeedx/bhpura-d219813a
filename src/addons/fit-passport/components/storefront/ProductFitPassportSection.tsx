import { useState, useMemo, useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStorefront } from "@/lib/storefront-context";
import {
  resolveFitProfiles,
  fitProfileForProduct,
  normalizeFitProfiles,
  fitRangeMessage,
  fitRangeProblems,
  missingFitFields,
  FIT_PROFILE_FIELDS,
  lengthUnitLabel,
  passportTitle,
} from "../../lib/fit-passport";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Ruler, Check } from "lucide-react";
import { toast } from "sonner";

export interface ProductFitPassportSectionProps {
  product?: any;
  customFields?: any[];
  cfValues?: Record<string, string>;
  setCfValues?: (updater: (prev: Record<string, string>) => Record<string, string>) => void;
  sizeMode?: "ready" | "custom";
  customer?: { id: string } | null;
  /** Whether the order can use the measurements, and if not, what the shopper still has to do. */
  onApplied?: (applied: boolean, problem: string | null) => void;
}

export function ProductFitPassportSection({
  product,
  customFields = [],
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
  const [chosenUnit, setChosenUnit] = useState<"in" | "cm" | null>(null);
  const [passportDraft, setPassportDraft] = useState<Record<string, string>>({});
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
  }, [
    customerId,
    fitPassportQ.data?.measurements,
    fitPassportQ.data?.tailoring_notes,
    fitProfileType,
    brand?.slug,
    isGuest,
    storedFitProfiles,
  ]);

  const currentUnit =
    chosenUnit ?? (isGuest ? guestUnit : (fitPassportQ.data?.preferred_length_unit ?? "in"));

  const fields = useMemo<
    Array<{ key: string; label_ar: string; label_en: string; required: boolean }>
  >(
    () =>
      activeDef?.fields ??
      (FIT_PROFILE_FIELDS as any)[fitProfileType]?.map(([k, ar, en, req]: any[]) => ({
        key: k,
        label_ar: ar,
        label_en: en,
        required: req,
      })) ??
      [],
    [activeDef, fitProfileType],
  );

  /**
   * What is typed for this profile. A passport saved before the profile changed keeps other
   * keys, which no field shows and so no shopper could correct.
   */
  const typed = useMemo(() => {
    const entries = fields
      .map((f) => [f.key, (passportDraft[f.key] ?? "").trim()] as const)
      .filter(([, value]) => value !== "");
    return Object.fromEntries(entries);
  }, [fields, passportDraft]);

  const labelOf = (key: string) => {
    const field = fields.find((f) => f.key === key);
    return (isAr ? field?.label_ar : field?.label_en) || key;
  };

  const rangeProblems = fitRangeProblems(typed, currentUnit);
  const missing = missingFitFields(fitProfiles, fitProfileType, typed);
  const rangeSentence =
    rangeProblems.length > 0 ? fitRangeMessage(rangeProblems, labelOf, currentUnit, isAr) : null;
  // A store can make every measurement optional; a piece still cannot be made from none.
  const nothingTyped = Object.keys(typed).length === 0;
  const problem =
    rangeSentence ??
    (missing.length > 0
      ? t(
          `أكمل المقاسات المطلوبة: ${missing.map(labelOf).join("، ")}`,
          `Complete these measurements: ${missing.map(labelOf).join(", ")}`,
        )
      : nothingTyped
        ? t("أدخل مقاساتك", "Enter your measurements")
        : null);
  const complete = problem === null;

  // Measurements go on the order as they are typed: there is no "apply" to forget. The button
  // that asked for one once stopped shoppers who had filled in every field.
  const answerRef = useRef(onApplied);
  useEffect(() => {
    answerRef.current = onApplied;
  });
  const profileName = activeDef ? `${activeDef.label_ar} / ${activeDef.label_en}` : fitProfileType;
  useEffect(() => {
    if (!passportConfigured || sizeMode === "ready" || !setCfValues) return;
    setCfValues((prev) => {
      const next = { ...prev };
      for (const f of fields) delete next[`fit_passport_${fitProfileType}_${f.key}`];
      delete next["fit_passport_profile"];
      delete next["fit_passport_unit"];
      if (!complete) return next;
      for (const [key, value] of Object.entries(typed)) {
        next[`fit_passport_${fitProfileType}_${key}`] = `${value} ${currentUnit}`;
      }
      next["fit_passport_profile"] = profileName;
      next["fit_passport_unit"] = currentUnit;
      return next;
    });
    answerRef.current?.(complete, problem);
  }, [
    passportConfigured,
    sizeMode,
    setCfValues,
    fields,
    fitProfileType,
    profileName,
    typed,
    currentUnit,
    complete,
    problem,
  ]);

  // A guest's measurements wait for them on this device.
  useEffect(() => {
    if (!isGuest || !brand?.slug || Object.keys(typed).length === 0) return;
    try {
      localStorage.setItem(
        `pura_guest_fit_passport_${brand.slug}_${fitProfileType}`,
        JSON.stringify({ draft: typed, unit: currentUnit }),
      );
    } catch {
      // LocalStorage fallback
    }
  }, [isGuest, brand?.slug, fitProfileType, typed, currentUnit]);

  if (!passportConfigured || sizeMode === "ready") return null;

  const handleSavePassport = async () => {
    if (!complete) return;
    const cleanedProfile = Object.fromEntries(
      Object.entries(typed).map(([key, value]) => [key, Number(value)]),
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
      if (error) {
        toast.error(t("تعذر حفظ المقاسات", "Could not save measurements"));
        return;
      }
      await fitPassportQ.refetch();
      toast.success(t("تم حفظ المقاسات في حسابك", "Measurements saved to your account"));
    } finally {
      setSavingPassport(false);
    }
  };

  const chooseUnit = (unit: "in" | "cm") => {
    setGuestUnit(unit);
    setChosenUnit(unit);
  };

  return (
    <div
      className={`rounded-xl border p-4 mb-6 ${
        complete ? "border-primary/20 bg-primary/[0.045]" : "border-border bg-muted/30"
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
                {passportTitle(
                  (isAr ? brand?.name_ar : brand?.name_en) || brand?.name_en || brand?.name_ar,
                  isAr ? "ar" : "en",
                )}{" "}
                · {activeDef ? (isAr ? activeDef.label_ar : activeDef.label_en) : fitProfileType}
              </p>
              {isGuest && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                  {t("طلب ضيف", "Guest order")}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {complete
                ? t(
                    "مقاساتك مكتملة، وتصل مع طلبك كما كتبتها.",
                    "Your measurements are complete and go with your order as typed.",
                  )
                : t(
                    "أدخل المقاسات، وتصل مع طلبك كما كتبتها.",
                    "Enter your measurements. They go with your order as typed.",
                  )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-border bg-background p-0.5 text-xs font-semibold">
            <Button
              type="button"
              variant={currentUnit === "in" ? "default" : "ghost"}
              size="sm"
              onClick={() => chooseUnit("in")}
              className="h-7 px-2 text-xs"
            >
              {lengthUnitLabel("in", isAr ? "ar" : "en")}
            </Button>
            <Button
              type="button"
              variant={currentUnit === "cm" ? "default" : "ghost"}
              size="sm"
              onClick={() => chooseUnit("cm")}
              className="h-7 px-2 text-xs"
            >
              {lengthUnitLabel("cm", isAr ? "ar" : "en")}
            </Button>
          </div>

          {!isGuest && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={savingPassport || !complete}
              onClick={handleSavePassport}
              className="gap-2"
            >
              <Check className="size-4" />
              {savingPassport
                ? t("جارٍ الحفظ…", "Saving…")
                : t("حفظ في حسابي", "Save to my account")}
            </Button>
          )}
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
                aria-invalid={rangeProblems.some((item) => item.key === key) || undefined}
                value={passportDraft[key] ?? ""}
                onChange={(event) =>
                  setPassportDraft((current) => ({
                    ...current,
                    [key]: event.target.value,
                  }))
                }
                className="h-10 pe-9 bg-background"
              />
              <span className="absolute end-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                {lengthUnitLabel(currentUnit, isAr ? "ar" : "en")}
              </span>
            </div>
          </label>
        ))}
      </div>

      {rangeSentence && (
        <p role="alert" className="mt-3 text-xs font-medium text-destructive">
          {rangeSentence}
        </p>
      )}

      {isGuest && brand?.slug && (
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
