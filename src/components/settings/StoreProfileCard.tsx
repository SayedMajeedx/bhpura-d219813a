import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/query-keys";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  STORE_VERTICALS,
  STORE_MODULES,
  VERTICAL_LABELS,
  MODULE_LABELS,
  VERTICAL_MODULE_DEFAULTS,
  normalizeVertical,
  normalizeModuleOverrides,
  resolveStoreModules,
  type StoreVertical,
  type StoreModuleOverrides,
  type StoreModuleId,
} from "@/lib/store-profile";
import { Sparkles, RotateCcw, AlertTriangle, ArrowRight, ArrowLeft } from "lucide-react";
import { Link } from "@tanstack/react-router";

export function StoreProfileCard({ brandId, slug }: { brandId: string; slug: string }) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  const { data: rawSettings, isLoading } = useQuery({
    queryKey: queryKeys.brand.businessSettings(brandId),
    queryFn: async () => {
      const { data, error } = await (supabase.from("business_settings") as any)
        .select("store_vertical, store_modules")
        .eq("brand_id", brandId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: passportCount } = useQuery({
    queryKey: ["fit-passport-count", brandId],
    queryFn: async () => {
      const { count, error } = await (supabase.from("customer_fit_passports") as any)
        .select("*", { count: "exact", head: true })
        .eq("brand_id", brandId);
      if (error) return 0;
      return count ?? 0;
    },
    staleTime: 60_000,
  });

  const [vertical, setVertical] = useState<StoreVertical>("fashion");
  const [modules, setModules] = useState<StoreModuleOverrides>({});

  useEffect(() => {
    if (rawSettings) {
      setVertical(normalizeVertical(rawSettings.store_vertical ?? "fashion"));
      setModules(normalizeModuleOverrides(rawSettings.store_modules));
    }
  }, [rawSettings]);

  const resolvedModules = resolveStoreModules({
    store_vertical: vertical,
    store_modules: modules,
  });

  const handleModuleToggle = (id: StoreModuleId, checked: boolean) => {
    setModules((prev) => ({
      ...prev,
      [id]: checked,
    }));
  };

  const handleResetToDefaults = () => {
    setModules({});
    toast.info(
      isAr
        ? "تمت إعادة ضبط الوحدات إلى الافتراضيات المقترحة للنشاط"
        : "Modules reset to vertical defaults",
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await (supabase.from("business_settings") as any)
        .update({
          store_vertical: vertical,
          store_modules: modules,
          updated_at: new Date().toISOString(),
        })
        .eq("brand_id", brandId);

      if (error) throw error;

      await qc.invalidateQueries({ queryKey: queryKeys.brand.businessSettings(brandId) });
      await qc.invalidateQueries({ queryKey: queryKeys.brand.storeProfile(brandId) });

      toast.success(
        isAr ? "تم حفظ إعدادات نشاط المتجر بنجاح" : "Store profile settings saved successfully",
      );
    } catch (err: any) {
      toast.error(
        err.message ||
          (isAr ? "فشل حفظ إعدادات نشاط المتجر" : "Failed to save store profile settings"),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="overflow-hidden border border-border-subtle shadow-lg rounded-2xl bg-card p-3 sm:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-4">
        <div>
          <h2 className="font-display text-xl font-bold flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            {isAr ? "نوع النشاط ووحدات المتجر" : "Store Vertical & Modules"}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {isAr
              ? "حدّد نوع نشاط متجرك لتكييف التجربة والوحدات التخصصية بما يناسب منتجاتك"
              : "Set your store vertical and specialized modules tailored to your product catalog"}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleResetToDefaults}
          className="self-start sm:self-auto gap-1 text-xs"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          {isAr ? "إعادة للافتراضيات" : "Reset to Defaults"}
        </Button>
      </div>

      <div className="space-y-4">
        <div className="max-w-md space-y-2">
          <Label htmlFor="store-vertical-select" className="text-sm font-medium">
            {isAr ? "نوع النشاط التجاري" : "Store Vertical"}
          </Label>
          <Select
            value={vertical}
            onValueChange={(val) => setVertical(val as StoreVertical)}
            disabled={isLoading || saving}
          >
            <SelectTrigger id="store-vertical-select" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STORE_VERTICALS.map((v) => (
                <SelectItem key={v} value={v}>
                  {isAr ? VERTICAL_LABELS[v].ar : VERTICAL_LABELS[v].en}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-3 pt-2">
          <Label className="text-sm font-semibold">
            {isAr ? "الوحدات والميزات التخصصية" : "Specialized Store Modules"}
          </Label>
          <div className="grid grid-cols-1 gap-3">
            {STORE_MODULES.map((id) => {
              const meta = MODULE_LABELS[id];
              const isEnabled = resolvedModules[id];
              const isDefaultRecommended = VERTICAL_MODULE_DEFAULTS[vertical][id] === true;

              return (
                <div
                  key={id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-border bg-muted/30"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{isAr ? meta.ar : meta.en}</span>
                      {isDefaultRecommended && (
                        <Badge variant="secondary" className="text-xs px-2 py-0">
                          {isAr ? "موصى به لنشاطك" : "Recommended"}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {isAr ? meta.hintAr : meta.hintEn}
                    </p>
                    {id === "size_guide" && isEnabled && (
                      <div className="pt-1">
                        <Link
                          to={`/admin/b/${slug}/size-guides` as any}
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium"
                        >
                          {isAr ? "إدارة أدلة المقاسات" : "Manage size guides"}
                          {isAr ? (
                            <ArrowLeft className="w-3 h-3" />
                          ) : (
                            <ArrowRight className="w-3 h-3" />
                          )}
                        </Link>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center self-end sm:self-auto">
                    <Switch
                      checked={isEnabled}
                      onCheckedChange={(checked) => handleModuleToggle(id, checked)}
                      disabled={isLoading || saving}
                      aria-label={isAr ? meta.ar : meta.en}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {Boolean(passportCount && passportCount > 0 && !resolvedModules.fit_passport) && (
          <div className="flex items-start gap-3 p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200 text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            <div>
              <p className="font-semibold">
                {isAr ? "تنبيه بخصوص بيانات القياسات" : "Customer measurements notice"}
              </p>
              <p className="mt-0.5">
                {isAr
                  ? `يوجد ${passportCount} ملف قياس محفوظ للعملاء. إيقاف الوحدة يخفي الواجهة فقط دون حذف أي بيانات.`
                  : `There are ${passportCount} saved customer fit passports. Disabling this module only hides the UI and will not delete data.`}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end pt-2 border-t border-border">
        <Button
          type="button"
          onClick={handleSave}
          disabled={isLoading || saving}
          className="min-w-[120px]"
        >
          {saving
            ? isAr
              ? "جاري الحفظ..."
              : "Saving..."
            : isAr
              ? "حفظ التغييرات"
              : "Save Changes"}
        </Button>
      </div>
    </Card>
  );
}
