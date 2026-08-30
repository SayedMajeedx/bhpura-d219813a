import { useQuery } from "@tanstack/react-query";
import { Apple, CheckCircle2, Download, RefreshCw, ShieldCheck, Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type Release = {
  id: string;
  app_key: "boutq_os" | "pura_line";
  platform: "android" | "ios";
  version_name: string;
  build_number: number;
  artifact_url: string;
  sha256: string;
  size_bytes: number;
  install_method: "direct" | "altstore";
  created_at: string;
};

const APP_NAMES = { boutq_os: "Boutq OS", pura_line: "Pura Line" } as const;

export function MobileAppDownloadsCard({ brandSlug, isAr }: { brandSlug: string; isAr: boolean }) {
  const releases = useQuery({
    queryKey: ["mobile-app-releases"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("mobile_app_releases_public")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Release[];
    },
    staleTime: 60_000,
  });
  const allowedApps: Array<Release["app_key"]> =
    brandSlug === "pura" || brandSlug === "pura-line" ? ["boutq_os", "pura_line"] : ["boutq_os"];
  const rows = allowedApps.flatMap((appKey) =>
    (["android", "ios"] as const).map((platform) => ({
      appKey,
      platform,
      release: releases.data?.find((item) => item.app_key === appKey && item.platform === platform),
    })),
  );

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden rounded-2xl border-primary/20 bg-gradient-to-br from-primary/[.06] via-card to-card p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/15">
            <Smartphone className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold">{isAr ? "تطبيقات الجوال" : "Mobile applications"}</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {isAr
                ? "حمّل آخر نسخة معتمدة مباشرة. نسخة Android تثبت كملف APK، ونسخة iPhone تثبت بواسطة AltStore."
                : "Download the latest approved release. Android installs as an APK; iPhone installs through AltStore."}
            </p>
          </div>
        </div>
      </Card>

      {releases.isError && (
        <Card className="flex items-center justify-between gap-3 rounded-2xl border-amber-300/50 p-4">
          <p className="text-sm text-amber-700 dark:text-amber-300">
            {isAr
              ? "تعذر تحميل قائمة الإصدارات حالياً."
              : "Release downloads are temporarily unavailable."}
          </p>
          <Button variant="outline" size="sm" onClick={() => void releases.refetch()}>
            <RefreshCw className="me-2 h-4 w-4" />
            {isAr ? "إعادة المحاولة" : "Retry"}
          </Button>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map(({ appKey, platform, release }) => (
          <Card key={`${appKey}-${platform}`} className="rounded-2xl border-border/70 p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border bg-muted/50">
                {platform === "ios" ? (
                  <Apple className="h-5 w-5" />
                ) : (
                  <Smartphone className="h-5 w-5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold">{APP_NAMES[appKey]}</p>
                <p className="text-xs text-muted-foreground">
                  {platform === "ios" ? "iPhone / iPad · IPA" : "Android · APK"}
                </p>
              </div>
              <Badge variant={release ? "default" : "secondary"}>
                {release ? (isAr ? "جاهز" : "Ready") : isAr ? "قيد التجهيز" : "Preparing"}
              </Badge>
            </div>

            {release ? (
              <>
                <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-muted/40 p-3 text-xs">
                  <div>
                    <span className="text-muted-foreground">{isAr ? "الإصدار" : "Version"}</span>
                    <p className="font-bold" dir="ltr">
                      v{release.version_name} ({release.build_number})
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{isAr ? "الحجم" : "Size"}</span>
                    <p className="font-bold">{(release.size_bytes / 1024 / 1024).toFixed(1)} MB</p>
                  </div>
                </div>
                <Button className="mt-4 w-full gap-2" asChild>
                  <a href={release.artifact_url} download>
                    <Download className="h-4 w-4" />
                    {platform === "ios"
                      ? isAr
                        ? "تحميل IPA لـAltStore"
                        : "Download IPA for AltStore"
                      : isAr
                        ? "تحميل APK"
                        : "Download APK"}
                  </a>
                </Button>
                <div className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  <span>
                    {isAr
                      ? `تم التحقق من الملف · SHA-256 ${release.sha256.slice(0, 12)}…`
                      : `Verified artifact · SHA-256 ${release.sha256.slice(0, 12)}…`}
                  </span>
                </div>
              </>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">
                {isAr
                  ? "سيظهر زر التحميل هنا فور اكتمال أول بناء ناجح."
                  : "The download button appears after the first successful build."}
              </div>
            )}
          </Card>
        ))}
      </div>

      <Card className="rounded-2xl border-blue-200 bg-blue-50/60 p-4 dark:border-blue-900 dark:bg-blue-950/20">
        <div className="flex items-start gap-2.5">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
          <p className="text-xs leading-relaxed text-blue-900 dark:text-blue-200">
            {isAr
              ? "نسخة iOS مخصصة للتثبيت الشخصي عبر AltStore. مع Apple ID مجاني يجب تجديد توقيع التطبيق كل 7 أيام، وقد لا تعمل إشعارات iOS الخارجية بدون حساب Apple Developer."
              : "The iOS build is for personal AltStore installation. A free Apple ID requires a refresh every 7 days, and remote iOS push notifications may not work without Apple Developer membership."}
          </p>
        </div>
      </Card>
    </div>
  );
}
