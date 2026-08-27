import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Loader2, RefreshCw, Rocket, Smartphone } from "lucide-react";
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
  updated_at: string;
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
                  <Button variant="outline" asChild>
                    <a href={app.latest_apk_url} target="_blank" rel="noreferrer">
                      <Download className="h-4 w-4" />
                    </a>
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
