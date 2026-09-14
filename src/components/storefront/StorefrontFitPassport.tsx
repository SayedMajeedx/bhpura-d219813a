import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Ruler, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  missingFitFields,
  normalizeFitProfiles,
  resolveFitProfiles,
  type FitProfileDefinition,
  type FitProfileType,
  type FitProfiles,
} from "@/lib/fit-passport";
import { useFitProfiles } from "@/lib/storefront-context";

type Passport = {
  measurements: unknown;
  fit_preference: "slim" | "regular" | "relaxed";
  preferred_length_unit: "in" | "cm";
  tailoring_notes: string | null;
  consent_to_store: boolean;
  verified_at: string | null;
  version: number;
};

const emptyProfiles = (defs: FitProfileDefinition[]): FitProfiles => {
  const result: FitProfiles = {};
  for (const def of defs) {
    result[def.key] = {};
  }
  return result;
};

export function StorefrontFitPassport({
  brandId,
  brandName,
  customerId,
  isAr,
  profiles: customProfiles,
}: {
  brandId: string;
  brandName?: string;
  customerId?: string;
  isAr: boolean;
  profiles?: FitProfileDefinition[];
}) {
  const qc = useQueryClient();
  const contextProfiles = useFitProfiles();
  const fitProfiles = resolveFitProfiles(customProfiles ?? contextProfiles);

  const passportTitle = brandName ? `${brandName} Fit Passport` : "Fit Passport";
  const [profile, setProfile] = useState<FitProfileType>(fitProfiles[0]?.key ?? "abaya");
  const [measurements, setMeasurements] = useState<FitProfiles>(() => emptyProfiles(fitProfiles));
  const [fit, setFit] = useState<Passport["fit_preference"]>("regular");
  const [unit, setUnit] = useState<Passport["preferred_length_unit"]>("in");
  const [notes, setNotes] = useState("");
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);

  // Keep profile in sync if fitProfiles change
  useEffect(() => {
    if (fitProfiles.length > 0 && !fitProfiles.some((p) => p.key === profile)) {
      setProfile(fitProfiles[0].key);
    }
  }, [fitProfiles, profile]);

  const passportQ = useQuery({
    queryKey: ["storefront-fit-passport", brandId, customerId],
    enabled: Boolean(customerId),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("customer_fit_passports")
        .select(
          "measurements,fit_preference,preferred_length_unit,tailoring_notes,consent_to_store,verified_at,version",
        )
        .eq("brand_id", brandId)
        .eq("customer_id", customerId)
        .maybeSingle();
      if (error) throw error;
      return data as Passport | null;
    },
  });

  useEffect(() => {
    const p = passportQ.data;
    if (!p) {
      try {
        const loaded: FitProfiles = emptyProfiles(fitProfiles);
        let found = false;
        for (const def of fitProfiles) {
          const raw = localStorage.getItem(`pura_guest_fit_passport_pura_${def.key}`);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed?.draft) {
              loaded[def.key] = parsed.draft;
              found = true;
            }
            if (parsed?.unit === "in" || parsed?.unit === "cm") setUnit(parsed.unit);
          }
        }
        if (found) {
          setMeasurements(loaded);
        }
      } catch {
        // Corrupted or unreadable local draft — fall through with no saved measurements.
      }
      return;
    }
    const n = normalizeFitProfiles(fitProfiles, p.measurements);
    const mapped: FitProfiles = {};
    for (const def of fitProfiles) {
      mapped[def.key] = Object.fromEntries(
        Object.entries(n[def.key] ?? {}).map(([k, v]) => [k, String(v)]),
      );
    }
    setMeasurements(mapped);
    setFit(p.fit_preference);
    setUnit(p.preferred_length_unit);
    setNotes(p.tailoring_notes ?? "");
    setConsent(p.consent_to_store);
  }, [passportQ.data, fitProfiles]);

  if (!customerId)
    return (
      <Card className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        {isAr
          ? `يتم تفعيل ${passportTitle} بعد إكمال أول طلب.`
          : `Place your first order to activate your ${passportTitle}.`}
      </Card>
    );

  const activeDef = fitProfiles.find((p) => p.key === profile) ?? fitProfiles[0];
  const activeFields = activeDef?.fields ?? [];

  const save = async () => {
    if (!consent)
      return toast.error(
        isAr
          ? "يرجى الموافقة على حفظ المقاسات قبل المتابعة."
          : "Please consent to storing your measurements.",
      );
    if (missingFitFields(fitProfiles, profile, measurements[profile] ?? {}).length)
      return toast.error(
        isAr
          ? "يرجى إكمال الحقول الإجبارية المعلّمة بنجمة."
          : "Complete the required fields marked with an asterisk.",
      );
    const clean = Object.fromEntries(
      Object.entries(measurements).map(([kind, values]) => [
        kind,
        Object.fromEntries(
          Object.entries(values)
            .map(([k, v]): [string, number] => [k, Number(v)])
            .filter(([, v]) => Number.isFinite(v) && v > 0),
        ),
      ]),
    );
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error } = await (supabase as any).from("customer_fit_passports").upsert(
        {
          brand_id: brandId,
          customer_id: customerId,
          auth_user_id: user?.id,
          measurements: clean,
          fit_preference: fit,
          preferred_length_unit: unit,
          tailoring_notes: notes.trim() || null,
          consent_to_store: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "brand_id,customer_id" },
      );
      if (error) throw error;
      toast.success(isAr ? "تم حفظ المقاسات بنجاح" : "Measurements saved successfully");
      qc.invalidateQueries({ queryKey: ["storefront-fit-passport", brandId, customerId] });
    } catch (e: any) {
      toast.error(e?.message || (isAr ? "تعذّر حفظ المقاسات" : "Failed to save measurements"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="overflow-hidden rounded-2xl border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/30 p-5 sm:p-6">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-serif text-lg font-bold tracking-tight text-foreground sm:text-xl">
              {passportTitle}
            </h2>
            {passportQ.data?.verified_at && (
              <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                <ShieldCheck className="size-3" />
                {isAr ? "موثّق" : "Verified"}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            {isAr
              ? "مقاساتك وتفضيلاتك المحفوظة لتفصيل الطلبات القادمة بدقة وسرعة."
              : "Your saved body measurements and tailoring preferences for quick and precise orders."}
          </p>
        </div>
        {passportQ.data && (
          <span className="rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold text-muted-foreground">
            v{passportQ.data.version}
          </span>
        )}
      </div>
      {passportQ.isLoading ? (
        <div className="grid min-h-56 place-items-center">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-5 p-5 sm:p-6">
          <Tabs value={profile} onValueChange={(v) => setProfile(v as FitProfileType)}>
            <TabsList
              className="grid h-auto w-full p-1"
              style={{
                gridTemplateColumns: `repeat(${Math.max(1, fitProfiles.length)}, minmax(0, 1fr))`,
              }}
            >
              {fitProfiles.map((p) => (
                <TabsTrigger key={p.key} value={p.key} className="gap-2 py-2.5">
                  <Ruler className="size-4" />
                  {isAr
                    ? p.label_ar.startsWith("مقاسات")
                      ? p.label_ar
                      : `مقاسات ${p.label_ar}`
                    : `${p.label_en} profile`}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>{isAr ? "وحدة القياس" : "Measurement unit"}</Label>
              <Select value={unit} onValueChange={(v) => setUnit(v as "in" | "cm")}>
                <SelectTrigger className="mt-1.5 h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="in">{isAr ? "إنش" : "Inches"}</SelectItem>
                  <SelectItem value="cm">{isAr ? "سنتيمتر" : "Centimeters"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{isAr ? "تفضيل القَصّة" : "Fit preference"}</Label>
              <Select value={fit} onValueChange={(v) => setFit(v as Passport["fit_preference"])}>
                <SelectTrigger className="mt-1.5 h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="slim">{isAr ? "محددة" : "Slim"}</SelectItem>
                  <SelectItem value="regular">{isAr ? "متوازنة" : "Regular"}</SelectItem>
                  <SelectItem value="relaxed">{isAr ? "واسعة" : "Relaxed"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <p className="mb-3 text-xs text-muted-foreground">
              {isAr
                ? "الحقول ذات النجمة إجبارية، والباقي اختياري."
                : "Fields marked with * are required; the rest are optional."}
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {activeFields.map((field) => (
                <div key={field.key}>
                  <Label className="text-xs">
                    {isAr ? field.label_ar : field.label_en}
                    {field.required && <span className="ms-1 text-destructive">*</span>}
                  </Label>
                  <div className="relative mt-1.5">
                    <Input
                      inputMode="decimal"
                      type="number"
                      min="0"
                      step="0.1"
                      value={String(measurements[profile]?.[field.key] ?? "")}
                      onChange={(e) =>
                        setMeasurements((c) => ({
                          ...c,
                          [profile]: { ...(c[profile] || {}), [field.key]: e.target.value },
                        }))
                      }
                      className="pe-9"
                    />
                    <span className="pointer-events-none absolute inset-y-0 end-3 grid place-items-center text-xs text-muted-foreground">
                      {unit}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <Label>{isAr ? "ملاحظات تفصيل إضافية" : "Additional tailoring notes"}</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                isAr
                  ? "مثال: أفضّل وسع إضافي في الصدر، بدون تقصير..."
                  : "e.g. Prefer looser chest, no hem shortening..."
              }
              rows={3}
              className="mt-1.5 resize-none text-xs"
            />
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/20 p-4">
            <Switch
              checked={consent}
              onCheckedChange={setConsent}
              id="passport-consent"
              className="mt-0.5"
            />
            <Label
              htmlFor="passport-consent"
              className="cursor-pointer text-xs leading-relaxed text-muted-foreground"
            >
              {isAr
                ? "أوافق على حفظ مقاساتي في حسابي لإعادة استخدامها في طلبات التفصيل القادمة."
                : "I consent to saving my measurements in my account for reuse in future made-to-order purchases."}
            </Label>
          </div>
          <div className="flex justify-end pt-2">
            <Button onClick={save} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {isAr ? "حفظ جواز المقاسات" : "Save Fit Passport"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
