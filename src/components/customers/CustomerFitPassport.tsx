import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, History, Ruler, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  missingFitFields,
  normalizeFitProfiles,
  resolveFitProfiles,
  type FitProfileDefinition,
  type FitProfileType,
  type FitProfiles,
} from "@/lib/fit-passport";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Passport = {
  id: string;
  measurements: Record<string, string | number>;
  fit_preference: "slim" | "regular" | "relaxed";
  preferred_length_unit: "in" | "cm";
  tailoring_notes: string | null;
  consent_to_store: boolean;
  verified_at: string | null;
  version: number;
  updated_at: string;
};

const emptyProfiles = (defs: FitProfileDefinition[]): FitProfiles => {
  const result: FitProfiles = {};
  for (const def of defs) {
    result[def.key] = {};
  }
  return result;
};

export function CustomerFitPassport({
  brandId,
  brandName,
  customerId,
  isAr,
  profiles: customProfiles,
}: {
  brandId: string;
  brandName?: string;
  customerId: string;
  isAr: boolean;
  profiles?: FitProfileDefinition[];
}) {
  const qc = useQueryClient();
  const fitProfiles = resolveFitProfiles(customProfiles);
  const [saving, setSaving] = useState(false);

  const passportQ = useQuery({
    queryKey: ["fit-passport", brandId, customerId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("customer_fit_passports")
        .select("*")
        .eq("brand_id", brandId)
        .eq("customer_id", customerId)
        .maybeSingle();
      if (error) throw error;
      return data as Passport | null;
    },
  });

  const historyQ = useQuery({
    queryKey: ["fit-passport-history", brandId, customerId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("customer_fit_passport_history")
        .select("id, version, changed_at")
        .eq("brand_id", brandId)
        .eq("customer_id", customerId)
        .order("version", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as { id: string; version: number; changed_at: string }[];
    },
  });

  const [profile, setProfile] = useState<FitProfileType>(fitProfiles[0]?.key ?? "abaya");
  const [measurements, setMeasurements] = useState<FitProfiles>(() => emptyProfiles(fitProfiles));
  const [fit, setFit] = useState<Passport["fit_preference"]>("regular");
  const [unit, setUnit] = useState<Passport["preferred_length_unit"]>("in");
  const [notes, setNotes] = useState("");
  const [consent, setConsent] = useState(false);
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    if (fitProfiles.length > 0 && !fitProfiles.some((p) => p.key === profile)) {
      setProfile(fitProfiles[0].key);
    }
  }, [fitProfiles, profile]);

  useEffect(() => {
    const p = passportQ.data;
    if (!p) return;
    const normalized = normalizeFitProfiles(fitProfiles, p.measurements);
    const mapped: FitProfiles = {};
    for (const def of fitProfiles) {
      mapped[def.key] = Object.fromEntries(
        Object.entries(normalized[def.key] ?? {}).map(([key, value]) => [key, String(value)]),
      );
    }
    setMeasurements(mapped);
    setFit(p.fit_preference);
    setUnit(p.preferred_length_unit);
    setNotes(p.tailoring_notes ?? "");
    setConsent(p.consent_to_store);
    setVerified(Boolean(p.verified_at));
  }, [passportQ.data, fitProfiles]);

  const activeDef = fitProfiles.find((p) => p.key === profile) ?? fitProfiles[0];
  const activeFields = activeDef?.fields ?? [];

  const save = async () => {
    if (!consent)
      return toast.error(
        isAr
          ? "يجب تسجيل موافقة صاحب الملف قبل حفظ المقاسات"
          : "Customer consent is required before saving measurements",
      );
    if (missingFitFields(fitProfiles, profile, measurements[profile] ?? {}).length)
      return toast.error(
        isAr
          ? "يرجى استكمال الحقول الإجبارية المؤشر عليها بنجمة"
          : "Please complete required fields marked with an asterisk",
      );

    const cleanMeasurements = Object.fromEntries(
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
      const payload = {
        brand_id: brandId,
        customer_id: customerId,
        measurements: cleanMeasurements,
        fit_preference: fit,
        preferred_length_unit: unit,
        tailoring_notes: notes.trim() || null,
        consent_to_store: consent,
        verified_at: verified ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await (supabase as any)
        .from("customer_fit_passports")
        .upsert(payload, { onConflict: "brand_id,customer_id" });
      if (error) throw error;

      toast.success(isAr ? "تم حفظ جواز المقاسات بنجاح" : "Fit passport saved successfully");
      qc.invalidateQueries({ queryKey: ["fit-passport", brandId, customerId] });
      qc.invalidateQueries({ queryKey: ["fit-passport-history", brandId, customerId] });
    } catch (error: any) {
      toast.error(error?.message || (isAr ? "تعذر حفظ المقاسات" : "Failed to save passport"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="rounded-2xl border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5">
        <div className="flex items-center gap-3">
          <div className="rounded-xl border bg-primary/10 p-2 text-primary">
            <Ruler className="size-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-foreground">
              {brandName ? `${brandName} Fit Passport` : isAr ? "جواز المقاسات" : "Fit Passport"}
            </h3>
            <p className="text-xs text-muted-foreground">
              {isAr
                ? "ملف قياسات العميل المعتمد للطلبات المخصصة والتفصيل"
                : "Customer's official measurements for custom tailoring"}
            </p>
          </div>
        </div>
        {passportQ.data && (
          <span className="rounded-full border bg-background px-2.5 py-1 text-xs font-semibold">
            v{passportQ.data.version}
          </span>
        )}
      </div>
      <div className="space-y-5 p-5">
        <Tabs value={profile} onValueChange={(value) => setProfile(value as FitProfileType)}>
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
                  ? p.label_ar.startsWith("ملف")
                    ? p.label_ar
                    : `ملف ${p.label_ar}`
                  : `${p.label_en} profile`}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Label>{isAr ? "وحدة القياس" : "Measurement unit"}</Label>
            <Select value={unit} onValueChange={(value) => setUnit(value as "in" | "cm")}>
              <SelectTrigger className="mt-1.5 w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="in">{isAr ? "إنش" : "Inches"}</SelectItem>
                <SelectItem value="cm">{isAr ? "سم" : "Centimeters"}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-44">
            <Label>{isAr ? "تفضيل القصة" : "Fit preference"}</Label>
            <Select
              value={fit}
              onValueChange={(value) => setFit(value as Passport["fit_preference"])}
            >
              <SelectTrigger className="mt-1.5">
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {activeFields.map((field) => (
            <div key={field.key}>
              <Label htmlFor={`fit-${field.key}`} className="text-xs">
                {isAr ? field.label_ar : field.label_en}
                {field.required && <span className="ms-1 text-destructive">*</span>}
              </Label>
              <div className="relative mt-1.5">
                <Input
                  id={`fit-${field.key}`}
                  type="number"
                  min="0"
                  step="0.1"
                  value={String(measurements[profile]?.[field.key] ?? "")}
                  onChange={(event) =>
                    setMeasurements((current) => ({
                      ...current,
                      [profile]: { ...(current[profile] || {}), [field.key]: event.target.value },
                    }))
                  }
                  className="pe-9 font-mono"
                />
                <span className="absolute end-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  {unit}
                </span>
              </div>
            </div>
          ))}
        </div>
        <div>
          <Label htmlFor="fit-notes">{isAr ? "ملاحظات الخياطة" : "Tailoring notes"}</Label>
          <Textarea
            id="fit-notes"
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="mt-1.5"
            placeholder={
              isAr
                ? "مثال: يُفضّل أن يكون الكم أوسع قليلاً..."
                : "Example: prefers a slightly wider sleeve..."
            }
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-4">
            <span>
              <span className="flex items-center gap-2 text-sm font-semibold">
                <ShieldCheck className="size-4 text-primary" />
                {isAr ? "موافقة حفظ المقاسات" : "Consent to store"}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {isAr
                  ? "تم تأكيد الموافقة على حفظ بيانات المقاس"
                  : "Customer consented to storing fit data"}
              </span>
            </span>
            <Switch checked={consent} onCheckedChange={setConsent} />
          </label>
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-4">
            <span>
              <span className="flex items-center gap-2 text-sm font-semibold">
                <CheckCircle2 className="size-4 text-emerald-500" />
                {isAr ? "توثيق القياسات" : "Verified measurements"}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {isAr
                  ? "تم أخذ المقاسات في البوتيك أو من خياط معتمد"
                  : "Taken in-store or by a certified tailor"}
              </span>
            </span>
            <Switch checked={verified} onCheckedChange={setVerified} />
          </label>
        </div>
        {historyQ.data && historyQ.data.length > 0 && (
          <div className="rounded-xl border bg-muted/30 p-3 text-xs text-muted-foreground">
            <span className="mb-1.5 flex items-center gap-1.5 font-semibold text-foreground">
              <History className="size-3.5" />
              {isAr ? "سجل التعديلات السابقة:" : "Version history:"}
            </span>
            <div className="flex flex-wrap gap-2">
              {historyQ.data.map((h) => (
                <span key={h.id} className="rounded-md border bg-background px-2 py-0.5">
                  v{h.version} • {new Date(h.changed_at).toLocaleDateString()}
                </span>
              ))}
            </div>
          </div>
        )}
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving} className="gap-2">
            <Save className="size-4" />
            {saving
              ? isAr
                ? "جاري الحفظ..."
                : "Saving..."
              : isAr
                ? "حفظ المقاسات"
                : "Save Passport"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
