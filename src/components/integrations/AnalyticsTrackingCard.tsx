import { useEffect, useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { integrationsQueries, saveTrackingSettings } from "@/lib/data/integrations";
import { AD_PLATFORM_KEYS, type AdPlatformKey } from "@/lib/ad-events/platforms";
import {
  PLATFORM_WORDS,
  trackingProblem,
  typedPixel,
  type PixelForm,
} from "@/lib/ad-events/platform-words";
import { ServerEventsFields } from "./ServerEventsFields";

/** A failed write's message, as the toasts showed it before. */
const errorOf = (error: unknown) => ({
  message: (error as { message?: string } | null)?.message ?? String(error),
});

type TrackingForm = {
  google_analytics_enabled: boolean;
  google_analytics_id: string;
  consent_required: boolean;
} & Record<AdPlatformKey, PixelForm>;

const off: PixelForm = { enabled: false, id: "" };

/** One ad platform's pixel: its switch, its id, and its server events under them. */
function PixelBlock({
  platform,
  value,
  onChange,
  brandId,
  isAr,
  savedOn,
}: {
  platform: AdPlatformKey;
  value: PixelForm;
  onChange: (next: PixelForm) => void;
  brandId: string;
  isAr: boolean;
  savedOn: boolean;
}) {
  const words = PLATFORM_WORDS[platform];
  const inputId = useId();
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <Label htmlFor={inputId}>{words.name}</Label>
          <p className="text-xs text-muted-foreground">
            {isAr ? words.pixelHint.ar : words.pixelHint.en}
          </p>
        </div>
        <Switch
          aria-label={isAr ? `تشغيل ${words.name}` : `Turn on ${words.name}`}
          checked={value.enabled}
          onCheckedChange={(enabled) => onChange({ ...value, enabled })}
        />
      </div>
      <Input
        id={inputId}
        className="mt-3"
        dir="ltr"
        inputMode={platform === "meta" ? "numeric" : undefined}
        maxLength={40}
        value={value.id}
        onChange={(e) => onChange({ ...value, id: typedPixel(platform, e.target.value) })}
        placeholder={words.pixelPlaceholder}
      />
      <ServerEventsFields platform={platform} brandId={brandId} isAr={isAr} pixelOn={savedOn} />
    </div>
  );
}

/** The store's Google Analytics and ad pixel IDs (official IDs only, never a script). */
export function AnalyticsTrackingCard({ brandId, isAr }: { brandId: string; isAr: boolean }) {
  const [saving, setSaving] = useState(false);
  const gaId = useId();
  const [form, setForm] = useState<TrackingForm>({
    google_analytics_enabled: false,
    google_analytics_id: "",
    consent_required: true,
    meta: off,
    tiktok: off,
    snap: off,
  });
  const q = useQuery(integrationsQueries.tracking(brandId));
  useEffect(() => {
    if (!q.data) return;
    setForm({
      google_analytics_enabled: Boolean(q.data.google_analytics_enabled),
      google_analytics_id: q.data.google_analytics_id ?? "",
      consent_required: q.data.consent_required ?? true,
      meta: { enabled: Boolean(q.data.meta_pixel_enabled), id: q.data.meta_pixel_id ?? "" },
      tiktok: { enabled: Boolean(q.data.tiktok_pixel_enabled), id: q.data.tiktok_pixel_id ?? "" },
      snap: { enabled: Boolean(q.data.snap_pixel_enabled), id: q.data.snap_pixel_id ?? "" },
    });
  }, [q.data]);
  const savedOn: Record<AdPlatformKey, boolean> = {
    meta: Boolean(q.data?.meta_pixel_enabled && q.data?.meta_pixel_id),
    tiktok: Boolean(q.data?.tiktok_pixel_enabled && q.data?.tiktok_pixel_id),
    snap: Boolean(q.data?.snap_pixel_enabled && q.data?.snap_pixel_id),
  };

  const save = async () => {
    const problem = trackingProblem(form, isAr);
    if (problem) return toast.error(problem);
    setSaving(true);
    const id = (pixel: PixelForm) => pixel.id.trim() || null;
    const error = await saveTrackingSettings(brandId, {
      google_analytics_enabled: form.google_analytics_enabled,
      google_analytics_id: form.google_analytics_id.trim().toUpperCase() || null,
      meta_pixel_enabled: form.meta.enabled,
      meta_pixel_id: id(form.meta),
      tiktok_pixel_enabled: form.tiktok.enabled,
      tiktok_pixel_id: id(form.tiktok),
      snap_pixel_enabled: form.snap.enabled,
      snap_pixel_id: id(form.snap),
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
              <Label htmlFor={gaId}>Google Analytics 4</Label>
              <p className="text-xs text-muted-foreground">G-XXXXXXXXXX</p>
            </div>
            <Switch
              aria-label={isAr ? "تشغيل Google Analytics 4" : "Turn on Google Analytics 4"}
              checked={form.google_analytics_enabled}
              onCheckedChange={(v) => setForm((f) => ({ ...f, google_analytics_enabled: v }))}
            />
          </div>
          <Input
            id={gaId}
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
        {AD_PLATFORM_KEYS.map((platform) => (
          <PixelBlock
            key={platform}
            platform={platform}
            value={form[platform]}
            onChange={(next) => setForm((f) => ({ ...f, [platform]: next }))}
            brandId={brandId}
            isAr={isAr}
            savedOn={savedOn[platform]}
          />
        ))}
        <div className="flex items-center justify-between gap-3 rounded-lg border p-4">
          <div>
            <Label>{isAr ? "طلب موافقة الزائر" : "Require visitor consent"}</Label>
            <p className="text-xs text-muted-foreground">
              {isAr ? "موصى به للخصوصية والامتثال." : "Recommended for privacy and compliance."}
            </p>
          </div>
          <Switch
            aria-label={isAr ? "طلب موافقة الزائر" : "Require visitor consent"}
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
