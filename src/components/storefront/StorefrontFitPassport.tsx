import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Ruler, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const MEASUREMENTS = [
  ["height", "الطول", "Height"],
  ["abaya_length", "طول العباية", "Abaya length"],
  ["sleeve", "طول الكم", "Sleeve"],
  ["shoulder", "عرض الكتف", "Shoulder"],
  ["bust", "الصدر", "Bust"],
  ["waist", "الخصر", "Waist"],
  ["hips", "الأرداف", "Hips"],
  ["arm_width", "عرض الذراع", "Arm width"],
] as const;

type Passport = {
  measurements: Record<string, string | number>;
  fit_preference: "slim" | "regular" | "relaxed";
  preferred_length_unit: "in" | "cm";
  tailoring_notes: string | null;
  consent_to_store: boolean;
  verified_at: string | null;
  version: number;
};

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
  const [measurements, setMeasurements] = useState<Record<string, string>>({});
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
    const passport = passportQ.data;
    if (!passport) return;
    setMeasurements(
      Object.fromEntries(
        Object.entries(passport.measurements ?? {}).map(([key, value]) => [key, String(value)]),
      ),
    );
    setFit(passport.fit_preference);
    setUnit(passport.preferred_length_unit);
    setNotes(passport.tailoring_notes ?? "");
    setConsent(passport.consent_to_store);
  }, [passportQ.data]);

  if (!customerId) {
    return (
      <Card className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        {isAr
          ? "أكملي أول طلب لتفعيل Pura Fit Passport الخاص بك."
          : "Place your first order to activate your Pura Fit Passport."}
      </Card>
    );
  }

  const save = async () => {
    if (!consent) {
      toast.error(
        isAr
          ? "وافقي على حفظ المقاسات قبل المتابعة."
          : "Please consent to storing your measurements.",
      );
      return;
    }
    const clean = Object.fromEntries(
      Object.entries(measurements)
        .filter(([, value]) => value.trim())
        .map(([key, value]) => [key, Number(value)]),
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
    if (error) {
      toast.error(
        isAr ? "تعذر حفظ المقاسات. حاولي مرة أخرى." : "Could not save your measurements.",
      );
      return;
    }
    toast.success(isAr ? "تم حفظ Pura Fit Passport" : "Pura Fit Passport saved");
    await qc.invalidateQueries({ queryKey: ["storefront-fit-passport", brandId, customerId] });
  };

  return (
    <Card className="overflow-hidden rounded-2xl border-border/70 bg-card shadow-sm">
      <div className="relative overflow-hidden border-b bg-primary/[0.045] p-5 sm:p-6">
        <div className="absolute end-0 top-0 size-36 rounded-full bg-primary/[0.06] blur-2xl" />
        <div className="relative flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-primary text-primary-foreground">
              <Ruler className="size-5" />
            </span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.16em] text-primary">
                Pura Fit Passport
              </p>
              <h3 className="mt-1 text-lg font-bold" style={{ color: "var(--sf-heading)" }}>
                {isAr ? "مقاساتك، محفوظة لكل طلب" : "Your fit, ready for every order"}
              </h3>
              <p className="mt-1 max-w-lg text-xs leading-relaxed text-muted-foreground">
                {isAr
                  ? "احفظي مقاساتك مرة واحدة لتجربة تفصيل أسرع وأكثر دقة في طلباتك القادمة."
                  : "Save your measurements once for faster, more consistent custom orders."}
              </p>
            </div>
          </div>
          {passportQ.data?.verified_at && (
            <span className="flex shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">
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
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>{isAr ? "وحدة القياس" : "Measurement unit"}</Label>
              <Select value={unit} onValueChange={(value) => setUnit(value as "in" | "cm")}>
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
              <Select
                value={fit}
                onValueChange={(value) => setFit(value as Passport["fit_preference"])}
              >
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {MEASUREMENTS.map(([key, ar, en]) => (
              <div key={key}>
                <Label htmlFor={`customer-fit-${key}`} className="text-xs">
                  {isAr ? ar : en}
                </Label>
                <div className="relative mt-1.5">
                  <Input
                    id={`customer-fit-${key}`}
                    inputMode="decimal"
                    type="number"
                    min="0"
                    step="0.1"
                    value={measurements[key] ?? ""}
                    onChange={(event) =>
                      setMeasurements((current) => ({ ...current, [key]: event.target.value }))
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
          <div>
            <Label htmlFor="customer-fit-notes">
              {isAr ? "ملاحظات تساعد الخياط" : "Notes for your tailor"}
            </Label>
            <Textarea
              id="customer-fit-notes"
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="mt-1.5"
              placeholder={
                isAr ? "مثال: أفضل الكم أوسع قليلاً…" : "Example: I prefer a slightly wider sleeve…"
              }
            />
          </div>
          <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border bg-muted/20 p-4">
            <span className="flex gap-3">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
              <span>
                <strong className="block text-sm">
                  {isAr ? "أوافق على حفظ مقاساتي" : "I consent to storing my measurements"}
                </strong>
                <small className="mt-1 block leading-relaxed text-muted-foreground">
                  {isAr
                    ? "تُستخدم لتجهيز طلباتك فقط ويمكنك تعديلها متى شئت."
                    : "Used only to prepare your orders; you can update them anytime."}
                </small>
              </span>
            </span>
            <Switch checked={consent} onCheckedChange={setConsent} />
          </label>
          <div className="flex items-center justify-between gap-3 border-t pt-4">
            <span className="text-xs text-muted-foreground">
              {passportQ.data
                ? isAr
                  ? `الإصدار ${passportQ.data.version}`
                  : `Version ${passportQ.data.version}`
                : isAr
                  ? "لم تُحفظ مقاسات بعد"
                  : "No measurements saved yet"}
            </span>
            <Button onClick={save} disabled={saving} className="gap-2">
              <Save className="size-4" />
              {saving
                ? isAr
                  ? "جارٍ الحفظ…"
                  : "Saving…"
                : isAr
                  ? "حفظ المقاسات"
                  : "Save measurements"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
