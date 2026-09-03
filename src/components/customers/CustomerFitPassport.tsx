import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, History, Ruler, Save, ShieldCheck, Shirt } from "lucide-react";
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
  FIT_PROFILE_FIELDS,
  missingFitFields,
  normalizeFitProfiles,
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

export function CustomerFitPassport({
  brandId,
  customerId,
  isAr,
}: {
  brandId: string;
  customerId: string;
  isAr: boolean;
}) {
  const qc = useQueryClient();
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
  const [profile, setProfile] = useState<FitProfileType>("abaya");
  const [measurements, setMeasurements] = useState<FitProfiles>({ abaya: {}, dress: {} });
  const [fit, setFit] = useState<Passport["fit_preference"]>("regular");
  const [unit, setUnit] = useState<Passport["preferred_length_unit"]>("in");
  const [notes, setNotes] = useState("");
  const [consent, setConsent] = useState(false);
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    const p = passportQ.data;
    if (!p) return;
    const normalized = normalizeFitProfiles(p.measurements);
    setMeasurements({
      abaya: Object.fromEntries(
        Object.entries(normalized.abaya).map(([key, value]) => [key, String(value)]),
      ),
      dress: Object.fromEntries(
        Object.entries(normalized.dress).map(([key, value]) => [key, String(value)]),
      ),
    });
    setFit(p.fit_preference);
    setUnit(p.preferred_length_unit);
    setNotes(p.tailoring_notes ?? "");
    setConsent(p.consent_to_store);
    setVerified(Boolean(p.verified_at));
  }, [passportQ.data]);

  const save = async () => {
    if (!consent)
      return toast.error(
        isAr
          ? "يجب تسجيل موافقة صاحب الملف قبل حفظ المقاسات"
          : "Customer consent is required before saving measurements",
      );
    if (missingFitFields(profile, measurements[profile]).length)
      return toast.error(
        isAr
          ? "أكمل الحقول الإجبارية المعلّمة بنجمة"
          : "Complete the required fields marked with an asterisk",
      );
    setSaving(true);
    const clean = Object.fromEntries(
      Object.entries(measurements).map(([kind, values]) => [
        kind,
        Object.fromEntries(
          Object.entries(values)
            .filter(([, value]) => String(value).trim())
            .map(([key, value]) => [key, Number(value)]),
        ),
      ]),
    );
    const { error } = await (supabase as any).from("customer_fit_passports").upsert(
      {
        brand_id: brandId,
        customer_id: customerId,
        measurements: clean,
        fit_preference: fit,
        preferred_length_unit: unit,
        tailoring_notes: notes.trim() || null,
        consent_to_store: consent,
        verified_at: verified ? (passportQ.data?.verified_at ?? new Date().toISOString()) : null,
      },
      { onConflict: "brand_id,customer_id" },
    );
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(
      isAr ? "تم حفظ Fit Passport وإصدار نسخة جديدة" : "Fit Passport saved as a new version",
    );
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["fit-passport", brandId, customerId] }),
      qc.invalidateQueries({ queryKey: ["fit-passport-history", brandId, customerId] }),
    ]);
  };

  return (
    <Card className="overflow-hidden rounded-2xl border-border/60 shadow-lg">
      <div className="flex items-start justify-between gap-4 border-b bg-primary/[0.04] p-5">
        <div className="flex gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Ruler className="size-5" />
          </span>
          <div>
            <h2 className="font-display text-xl font-bold">Pura Fit Passport</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {isAr
                ? "مقاسات موثّقة يمكن إعادة استخدامها في الطلبات القادمة"
                : "Verified measurements ready for every future order"}
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
          <TabsList className="grid h-auto w-full grid-cols-2 p-1">
            <TabsTrigger value="abaya" className="gap-2 py-2.5">
              <Ruler className="size-4" />
              {isAr ? "ملف العباية" : "Abaya profile"}
            </TabsTrigger>
            <TabsTrigger value="dress" className="gap-2 py-2.5">
              <Shirt className="size-4" />
              {isAr ? "ملف الفستان" : "Dress profile"}
            </TabsTrigger>
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
          {FIT_PROFILE_FIELDS[profile].map(([key, ar, en, required]) => (
            <div key={key}>
              <Label htmlFor={`fit-${key}`} className="text-xs">
                {isAr ? ar : en}
                {required && <span className="ms-1 text-destructive">*</span>}
              </Label>
              <div className="relative mt-1.5">
                <Input
                  id={`fit-${key}`}
                  type="number"
                  min="0"
                  step="0.1"
                  value={String(measurements[profile][key] ?? "")}
                  onChange={(event) =>
                    setMeasurements((current) => ({
                      ...current,
                      [profile]: { ...current[profile], [key]: event.target.value },
                    }))
                  }
                  className="pe-9 font-mono"
                />
                <span className="absolute end-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
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
                  : "Customer approved storing fit data"}
              </span>
            </span>
            <Switch checked={consent} onCheckedChange={setConsent} />
          </label>
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-4">
            <span>
              <span className="flex items-center gap-2 text-sm font-semibold">
                <CheckCircle2 className="size-4 text-primary" />
                {isAr ? "تم التحقق" : "Fit verified"}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {isAr ? "تمت مراجعة المقاسات مع صاحب الملف" : "Measurements reviewed with customer"}
              </span>
            </span>
            <Switch checked={verified} onCheckedChange={setVerified} />
          </label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <History className="size-4" />
            {historyQ.data?.length
              ? isAr
                ? `${historyQ.data.length} نسخ محفوظة مؤخراً`
                : `${historyQ.data.length} recent versions`
              : isAr
                ? "سيتم حفظ كل تعديل تلقائياً"
                : "Every change will be versioned"}
          </div>
          <Button onClick={save} disabled={saving || passportQ.isLoading} className="gap-2">
            <Save className="size-4" />
            {saving
              ? isAr
                ? "جارٍ الحفظ…"
                : "Saving…"
              : isAr
                ? "حفظ Fit Passport"
                : "Save Fit Passport"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
