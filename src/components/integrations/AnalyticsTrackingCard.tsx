import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { integrationsQueries, saveTrackingSettings } from "@/lib/data/integrations";

/** A failed write's message, as the toasts showed it before. */
const errorOf = (error: unknown) => ({
  message: (error as { message?: string } | null)?.message ?? String(error),
});

type TrackingForm = {
  google_analytics_enabled: boolean;
  google_analytics_id: string;
  meta_pixel_enabled: boolean;
  meta_pixel_id: string;
  consent_required: boolean;
};

/** The store's Google Analytics and Meta Pixel IDs (official IDs only, never a script). */
export function AnalyticsTrackingCard({ brandId, isAr }: { brandId: string; isAr: boolean }) {
  const [saving, setSaving] = useState(false);
  const defaults: TrackingForm = {
    google_analytics_enabled: false,
    google_analytics_id: "",
    meta_pixel_enabled: false,
    meta_pixel_id: "",
    consent_required: true,
  };
  const [form, setForm] = useState<TrackingForm>(defaults);
  const q = useQuery(integrationsQueries.tracking(brandId));
  useEffect(() => {
    if (!q.data) return;
    setForm({
      google_analytics_enabled: Boolean(q.data.google_analytics_enabled),
      google_analytics_id: q.data.google_analytics_id ?? "",
      meta_pixel_enabled: Boolean(q.data.meta_pixel_enabled),
      meta_pixel_id: q.data.meta_pixel_id ?? "",
      consent_required: q.data.consent_required ?? true,
    });
  }, [q.data]);
  const save = async () => {
    const ga = form.google_analytics_id.trim().toUpperCase();
    const meta = form.meta_pixel_id.trim();
    if (form.google_analytics_enabled && !/^G-[A-Z0-9]+$/.test(ga))
      return toast.error(
        isAr
          ? "أدخل معرّف GA4 صحيحاً مثل G-XXXXXXXXXX"
          : "Enter a valid GA4 ID such as G-XXXXXXXXXX",
      );
    if (form.meta_pixel_enabled && !/^\d{5,30}$/.test(meta))
      return toast.error(
        isAr
          ? "معرّف Meta Pixel يجب أن يحتوي أرقاماً فقط"
          : "Meta Pixel ID must contain digits only",
      );
    setSaving(true);
    const error = await saveTrackingSettings(brandId, {
      google_analytics_enabled: form.google_analytics_enabled,
      google_analytics_id: ga || null,
      meta_pixel_enabled: form.meta_pixel_enabled,
      meta_pixel_id: meta || null,
      consent_required: form.consent_required,
    }).then(() => null, errorOf);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(isAr ? "تم حفظ إعدادات التتبع" : "Tracking settings saved");
  };
  return (
    <Card className="mb-6 p-3 sm:p-5" dir={isAr ? "rtl" : "ltr"}>
      <div className="mb-4">
        <h2 className="font-display text-xl">
          {isAr ? "التحليلات والتتبع" : "Analytics & Tracking"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {isAr
            ? "أدخل المعرّفات الرسمية فقط. لا يتم قبول أكواد أو نصوص برمجية مخصصة."
            : "Enter official IDs only. Custom scripts are never accepted."}
        </p>
      </div>
      <div className="grid gap-4">
        <div className="rounded-lg border p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label>Google Analytics 4</Label>
              <p className="text-xs text-muted-foreground">G-XXXXXXXXXX</p>
            </div>
            <Switch
              checked={form.google_analytics_enabled}
              onCheckedChange={(v) => setForm((f) => ({ ...f, google_analytics_enabled: v }))}
            />
          </div>
          <Input
            className="mt-3"
            dir="ltr"
            maxLength={32}
            value={form.google_analytics_id}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                google_analytics_id: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""),
              }))
            }
            placeholder="G-XXXXXXXXXX"
          />
        </div>
        <div className="rounded-lg border p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label>Meta Pixel</Label>
              <p className="text-xs text-muted-foreground">
                {isAr ? "معرّف رقمي فقط" : "Numeric pixel ID only"}
              </p>
            </div>
            <Switch
              checked={form.meta_pixel_enabled}
              onCheckedChange={(v) => setForm((f) => ({ ...f, meta_pixel_enabled: v }))}
            />
          </div>
          <Input
            className="mt-3"
            dir="ltr"
            inputMode="numeric"
            maxLength={30}
            value={form.meta_pixel_id}
            onChange={(e) =>
              setForm((f) => ({ ...f, meta_pixel_id: e.target.value.replace(/\D/g, "") }))
            }
            placeholder="123456789012345"
          />
        </div>
        <div className="flex items-center justify-between gap-3 rounded-lg border p-4">
          <div>
            <Label>{isAr ? "طلب موافقة الزائر" : "Require visitor consent"}</Label>
            <p className="text-xs text-muted-foreground">
              {isAr ? "موصى به للخصوصية والامتثال." : "Recommended for privacy and compliance."}
            </p>
          </div>
          <Switch
            checked={form.consent_required}
            onCheckedChange={(v) => setForm((f) => ({ ...f, consent_required: v }))}
          />
        </div>
        <Button onClick={save} disabled={saving || q.isLoading}>
          {saving
            ? isAr
              ? "جارٍ الحفظ..."
              : "Saving..."
            : isAr
              ? "حفظ إعدادات التتبع"
              : "Save tracking settings"}
        </Button>
      </div>
    </Card>
  );
}
