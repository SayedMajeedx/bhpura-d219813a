import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Download,
  ExternalLink,
  History,
  Loader2,
  RefreshCw,
  Rocket,
  Smartphone,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type BrandSummary = {
  id: string;
  slug: string;
  name_en: string;
  name_ar: string | null;
  logo_url: string | null;
};
type AppRow = {
  id: string;
  brand_id: string;
  app_name: string;
  android_package: string;
  storefront_url: string;
  icon_url: string | null;
  primary_color: string;
  status: string;
  version_name: string;
  version_code: number;
  latest_apk_url: string | null;
  latest_build_id: string | null;
  updated_at: string;
};
type BuildRow = {
  id: string;
  app_id: string;
  version_name: string;
  version_code: number;
  status: string;
  provider_run_url: string | null;
  apk_url: string | null;
  apk_sha256: string | null;
  apk_size_bytes: number | null;
  error_message: string | null;
  validation_results: Record<string, boolean> | null;
  completed_at: string | null;
  created_at: string;
};

const statusTone: Record<string, string> = {
  ready: "bg-emerald-500",
  building: "bg-blue-500",
  provisioning: "bg-amber-500",
  ready_for_build: "bg-violet-500",
  failed: "bg-rose-500",
  draft: "bg-zinc-500",
  disabled: "bg-zinc-500",
};

export function WhiteLabelAppsPanel({ brands, isAr }: { brands: BrandSummary[]; isAr: boolean }) {
  const qc = useQueryClient();
  const [working, setWorking] = useState<string | null>(null);
  const apps = useQuery({
    queryKey: ["white-label-apps"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("white_label_apps_public")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AppRow[];
    },
    refetchInterval: 15000,
  });
  const builds = useQuery({
    queryKey: ["white-label-app-builds"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("white_label_app_builds_public")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as BuildRow[];
    },
    refetchInterval: 15000,
  });
  const byBrand = new Map((apps.data ?? []).map((app) => [app.brand_id, app]));
  const provision = async (brand: BrandSummary, rebuild: boolean) => {
    setWorking(brand.id);
    const { data, error } = await supabase.functions.invoke("provision-white-label-app", {
      body: { brand_id: brand.id, rebuild },
    });
    setWorking(null);
    if (error || data?.error)
      return toast.error(data?.error || error?.message || "Provisioning failed");
    toast.success(
      data.requires_github_connection
        ? isAr
          ? "تم تجهيز Firebase والتطبيق؛ ربط GitHub مطلوب لبدء البناء"
          : "Firebase and app prepared; connect GitHub to start the build"
        : isAr
          ? "بدأ بناء التطبيق تلقائياً"
          : "App build started automatically",
    );
    void qc.invalidateQueries({ queryKey: ["white-label-apps"] });
    void qc.invalidateQueries({ queryKey: ["white-label-app-builds"] });
  };
  const activateBuild = async (buildId: string) => {
    setWorking(buildId);
    const { error } = await (supabase as any).rpc("activate_white_label_build", {
      p_build_id: buildId,
    });
    setWorking(null);
    if (error) return toast.error(error.message);
    toast.success(isAr ? "تم اعتماد هذا الإصدار للتنزيل" : "Release activated for download");
    void qc.invalidateQueries({ queryKey: ["white-label-apps"] });
  };
  return (
    <div className="space-y-4">
      <Card className="border-primary/20 bg-primary/[0.025] p-5">
        <div className="flex items-start gap-3">
          <Smartphone className="mt-0.5 h-5 w-5 text-primary" />
          <div>
            <h3 className="font-bold">
              {isAr ? "مصنع تطبيقات White‑Label" : "White‑Label App Factory"}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {isAr
                ? "يجلب الاسم والشعار والألوان والدومين من إعدادات كل براند، ويسجل Firebase ويبني APK مستقل."
                : "Uses each brand’s settings to provision Firebase and build an independent branded APK."}
            </p>
          </div>
        </div>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2">
        {brands.map((brand) => {
          const app = byBrand.get(brand.id);
          const busy =
            working === brand.id || app?.status === "provisioning" || app?.status === "building";
          const appBuilds = app
            ? (builds.data ?? []).filter((build) => build.app_id === app.id)
            : [];
          return (
            <Card key={brand.id} className="p-5">
              <div className="flex items-center gap-3">
                {app?.icon_url || brand.logo_url ? (
                  <img
                    src={app?.icon_url || brand.logo_url || ""}
                    className="h-12 w-12 rounded-xl border bg-muted object-contain"
                    alt=""
                  />
                ) : (
                  <div className="grid h-12 w-12 place-items-center rounded-xl bg-muted">
                    <Smartphone className="h-5 w-5" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">
                    {isAr ? brand.name_ar || brand.name_en : brand.name_en}
                  </p>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {app?.android_package || `com.boutq.${brand.slug.replace(/-/g, "")}`}
                  </p>
                </div>
                {app ? (
                  <Badge className={`${statusTone[app.status] || "bg-zinc-500"} text-white`}>
                    {app.status}
                  </Badge>
                ) : (
                  <Badge variant="outline">{isAr ? "غير منشأ" : "Not created"}</Badge>
                )}
              </div>
              {app && (
                <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-muted/40 p-3 text-xs">
                  <div>
                    <span className="text-muted-foreground">{isAr ? "الإصدار" : "Version"}</span>
                    <p className="font-bold">
                      {app.version_name} ({app.version_code})
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{isAr ? "المتجر" : "Store"}</span>
                    <p className="truncate font-bold" dir="ltr">
                      {app.storefront_url.replace("https://", "")}
                    </p>
                  </div>
                </div>
              )}
              <div className="mt-4 flex gap-2">
                <Button
                  className="flex-1 gap-2"
                  disabled={busy}
                  onClick={() => provision(brand, !!app)}
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : app ? (
                    <RefreshCw className="h-4 w-4" />
                  ) : (
                    <Rocket className="h-4 w-4" />
                  )}
                  {app
                    ? isAr
                      ? "مزامنة وإعادة بناء"
                      : "Sync & rebuild"
                    : isAr
                      ? "إنشاء التطبيق"
                      : "Create app"}
                </Button>
                {app?.latest_apk_url && (
                  <Button variant="outline" className="gap-2" asChild>
                    <a href={app.latest_apk_url} download>
                      <Download className="h-4 w-4" />
                      <span className="sr-only">{isAr ? "تحميل APK" : "Download APK"}</span>
                    </a>
                  </Button>
                )}
              </div>
              {app && appBuilds.length > 0 && (
                <details className="group mt-4 rounded-xl border bg-muted/20">
                  <summary className="flex cursor-pointer list-none items-center gap-2 p-3 text-sm font-bold">
                    <History className="h-4 w-4 text-primary" />
                    {isAr ? "سجل الإصدارات" : "Release history"}
                    <Badge variant="secondary" className="ms-auto">
                      {appBuilds.length}
                    </Badge>
                  </summary>
                  <div className="space-y-2 border-t p-3">
                    {appBuilds.map((build) => {
                      const succeeded = build.status === "succeeded";
                      return (
                        <div key={build.id} className="rounded-lg border bg-background p-3 text-xs">
                          <div className="flex items-center gap-2">
                            {succeeded ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            ) : build.status === "failed" ? (
                              <XCircle className="h-4 w-4 text-rose-600" />
                            ) : (
                              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                            )}
                            <span className="font-bold" dir="ltr">
                              v{build.version_name} ({build.version_code})
                            </span>
                            <span className="ms-auto text-muted-foreground">
                              {new Date(build.completed_at || build.created_at).toLocaleString(
                                isAr ? "ar-BH" : "en-BH",
                              )}
                            </span>
                          </div>
                          {build.apk_size_bytes ? (
                            <p className="mt-2 text-muted-foreground">
                              {(build.apk_size_bytes / 1024 / 1024).toFixed(1)} MB · SHA-256{" "}
                              {build.apk_sha256?.slice(0, 12)}…
                            </p>
                          ) : null}
                          {build.error_message ? (
                            <p className="mt-2 text-rose-600">{build.error_message}</p>
                          ) : null}
                          <div className="mt-2 flex gap-2">
                            {build.apk_url && (
                              <Button size="sm" variant="outline" className="h-8 gap-1" asChild>
                                <a href={build.apk_url} download>
                                  <Download className="h-3.5 w-3.5" />
                                  {isAr ? "تحميل" : "Download"}
                                </a>
                              </Button>
                            )}
                            {build.provider_run_url && (
                              <Button size="sm" variant="ghost" className="h-8 gap-1" asChild>
                                <a href={build.provider_run_url} target="_blank" rel="noreferrer">
                                  <ExternalLink className="h-3.5 w-3.5" />
                                  GitHub
                                </a>
                              </Button>
                            )}
                            {succeeded && build.id !== app.latest_build_id && (
                              <Button
                                size="sm"
                                variant="secondary"
                                className="h-8"
                                disabled={working === build.id}
                                onClick={() => activateBuild(build.id)}
                              >
                                {working === build.id && (
                                  <Loader2 className="me-1 h-3.5 w-3.5 animate-spin" />
                                )}
                                {isAr ? "اعتماد هذا الإصدار" : "Activate release"}
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </details>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
