import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Ruler, Save, ShieldCheck, Shirt } from "lucide-react";
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
  FIT_PROFILE_FIELDS,
  missingFitFields,
  normalizeFitProfiles,
  type FitProfileType,
  type FitProfiles,
} from "@/lib/fit-passport";

type Passport = {
  measurements: unknown;
  fit_preference: "slim" | "regular" | "relaxed";
  preferred_length_unit: "in" | "cm";
  tailoring_notes: string | null;
  consent_to_store: boolean;
  verified_at: string | null;
  version: number;
};
const emptyProfiles = (): FitProfiles => ({ abaya: {}, dress: {} });

export function StorefrontFitPassport({
  brandId,
  customerId,
  isAr,
}: {
  brandId: string;
  customerId?: string;
  isAr: boolean;
}) {
  const qc = useQueryClient();
  const [profile, setProfile] = useState<FitProfileType>("abaya");
  const [measurements, setMeasurements] = useState<FitProfiles>(emptyProfiles);
  const [fit, setFit] = useState<Passport["fit_preference"]>("regular");
  const [unit, setUnit] = useState<Passport["preferred_length_unit"]>("in");
  const [notes, setNotes] = useState("");
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
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
    if (!p) return;
    const n = normalizeFitProfiles(p.measurements);
    setMeasurements({
      abaya: Object.fromEntries(Object.entries(n.abaya).map(([k, v]) => [k, String(v)])),
      dress: Object.fromEntries(Object.entries(n.dress).map(([k, v]) => [k, String(v)])),
    });
    setFit(p.fit_preference);
    setUnit(p.preferred_length_unit);
    setNotes(p.tailoring_notes ?? "");
    setConsent(p.consent_to_store);
  }, [passportQ.data]);
  if (!customerId)
    return (
      <Card className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        {isAr
          ? "يتم تفعيل Pura Fit Passport بعد إكمال أول طلب."
          : "Place your first order to activate your Pura Fit Passport."}
      </Card>
    );
  const save = async () => {
    if (!consent)
      return toast.error(
        isAr
          ? "يرجى الموافقة على حفظ المقاسات قبل المتابعة."
          : "Please consent to storing your measurements.",
      );
    if (missingFitFields(profile, measurements[profile]).length)
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
            .filter(([, v]) => String(v).trim())
            .map(([k, v]) => [k, Number(v)]),
        ),
      ]),
    );
    setSaving(true);
    const { error } = await (supabase as any).from("customer_fit_passports").upsert(
      {
        brand_id: brandId,
        customer_id: customerId,
        measurements: clean,
        fit_preference: fit,
        preferred_length_unit: unit,
        tailoring_notes: notes.trim() || null,
        consent_to_store: true,
      },
      { onConflict: "brand_id,customer_id" },
    );
    setSaving(false);
    if (error)
      return toast.error(
        isAr ? "تعذر حفظ المقاسات. يرجى المحاولة مرة أخرى." : "Could not save your measurements.",
      );
    toast.success(
      isAr ? `تم حفظ ملف ${profile === "abaya" ? "العباية" : "الفستان"}` : "Fit profile saved",
    );
    await qc.invalidateQueries({ queryKey: ["storefront-fit-passport", brandId, customerId] });
  };
  return (
    <Card className="overflow-hidden rounded-2xl border-border/70 bg-card shadow-sm">
      <div className="border-b bg-primary/[0.045] p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-primary text-primary-foreground">
              <Ruler className="size-5" />
            </span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.16em] text-primary">
                Pura Fit Passport
              </p>
              <h3 className="mt-1 text-lg font-bold">
                {isAr ? "ملفان دقيقان لكل تفصيل" : "Two precise profiles for every custom order"}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {isAr
                  ? "مقاسات مستقلة للعبايات والفساتين، جاهزة للاستخدام عند الطلب."
                  : "Separate abaya and dress measurements, ready when ordering."}
              </p>
            </div>
          </div>
          {passportQ.data?.verified_at && (
            <span className="flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">
              <CheckCircle2 className="size-3" />
              {isAr ? "موثّق" : "Verified"}
            </span>
          )}
        </div>
      </div>
      {passportQ.isLoading ? (
        <div className="grid min-h-56 place-items-center">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-5 p-5 sm:p-6">
          <Tabs value={profile} onValueChange={(v) => setProfile(v as FitProfileType)}>
            <TabsList className="grid h-auto w-full grid-cols-2 p-1">
              <TabsTrigger value="abaya" className="gap-2 py-2.5">
                <Ruler className="size-4" />
                {isAr ? "مقاسات العباية" : "Abaya profile"}
              </TabsTrigger>
              <TabsTrigger value="dress" className="gap-2 py-2.5">
                <Shirt className="size-4" />
                {isAr ? "مقاسات الفستان" : "Dress profile"}
              </TabsTrigger>
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
              {FIT_PROFILE_FIELDS[profile].map(([key, ar, en, required]) => (
                <div key={key}>
                  <Label className="text-xs">
                    {isAr ? ar : en}
                    {required && <span className="ms-1 text-destructive">*</span>}
                  </Label>
                  <div className="relative mt-1.5">
                    <Input
                      inputMode="decimal"
                      type="number"
                      min="0"
                      step="0.1"
                      value={String(measurements[profile][key] ?? "")}
                      onChange={(e) =>
                        setMeasurements((c) => ({
                          ...c,
                          [profile]: { ...c[profile], [key]: e.target.value },
                        }))
                      }
                      className="h-11 pe-9 font-mono"
                    />
                    <span className="absolute end-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
                      {unit}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <Label>{isAr ? "ملاحظات تساعد الخياط" : "Notes for your tailor"}</Label>
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1.5"
            />
          </div>
          <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border bg-muted/20 p-4">
            <span className="flex gap-3">
              <ShieldCheck className="size-5 text-primary" />
              <span>
                <strong className="block text-sm">
                  {isAr ? "أوافق على حفظ مقاساتي" : "I consent to storing my measurements"}
                </strong>
                <small className="text-muted-foreground">
                  {isAr ? "تُستخدم لتجهيز طلباتك فقط." : "Used only to prepare your orders."}
                </small>
              </span>
            </span>
            <Switch checked={consent} onCheckedChange={setConsent} />
          </label>
          <div className="flex items-center justify-between gap-3 border-t pt-4">
            <span className="text-xs text-muted-foreground">
              {passportQ.data
                ? `${isAr ? "الإصدار" : "Version"} ${passportQ.data.version}`
                : isAr
                  ? "لم تُحفظ مقاسات بعد"
                  : "No measurements saved yet"}
            </span>
            <Button onClick={save} disabled={saving} className="gap-2">
              <Save className="size-4" />
              {saving ? (isAr ? "جارٍ الحفظ…" : "Saving…") : isAr ? "حفظ الملف" : "Save profile"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
