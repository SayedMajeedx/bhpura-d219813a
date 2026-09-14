import { useState, useEffect } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/query-keys";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  STORE_VERTICALS,
  STORE_MODULES,
  VERTICAL_LABELS,
  MODULE_LABELS,
  type StoreVertical,
  type StoreModuleId,
} from "@/lib/store-profile";
import { resolveFitProfiles, type FitProfileDefinition } from "@/lib/addons/addon-presets";
import { starterPackFor, getAddon, dependentsOf, isInstalled } from "@/lib/addons/addon-registry";
import type { AddonId } from "@/lib/addons/addon-types";
import {
  Sparkles,
  RotateCcw,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Ruler,
  Puzzle,
  CheckCircle2,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useAdminStoreProfile } from "@/hooks/use-store-profile";
import { useBrandAddons } from "@/hooks/use-brand-addons";

const MODULE_TO_ADDON: Record<StoreModuleId, AddonId> = {
  size_guide: "size-guides",
  fit_passport: "fit-passport",
  made_to_order: "made-to-order",
};

export function StoreProfileCard({ brandId, slug }: { brandId: string; slug: string }) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  const { profile, isLoading: isProfileLoading } = useAdminStoreProfile(brandId);
  const { addons, installAddon, disableAddon, isMutating } = useBrandAddons(brandId);

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
    enabled: Boolean(brandId),
  });

  const [vertical, setVertical] = useState<StoreVertical>(profile.vertical);
  const [fitProfiles, setFitProfiles] = useState<FitProfileDefinition[] | null>(
    profile.customFitProfiles ?? null,
  );

  // Synchronize local state with profile when loaded
  useEffect(() => {
    if (!isProfileLoading && profile) {
      setVertical(profile.vertical);
      setFitProfiles(profile.customFitProfiles ?? null);
    }
  }, [profile, isProfileLoading]);

  // Dialog state for vertical change confirmation & starter pack sync
  const [pendingVertical, setPendingVertical] = useState<StoreVertical | null>(null);
  const [showVerticalChangeDialog, setShowVerticalChangeDialog] = useState(false);
  const [addonsToDisableSelection, setAddonsToDisableSelection] = useState<AddonId[]>([]);

  // Dialog state for reset to defaults confirmation
  const [showResetConfirmDialog, setShowResetConfirmDialog] = useState(false);

  const hasFitPassport = isInstalled(addons, "fit-passport");
  const activeFitProfiles = resolveFitProfiles(fitProfiles);

  const handleSelectVertical = (newVertical: StoreVertical) => {
    if (newVertical === vertical) return;
    setPendingVertical(newVertical);
    setAddonsToDisableSelection([]);
    setShowVerticalChangeDialog(true);
  };

  const handleConfirmVerticalChange = async () => {
    if (!pendingVertical) return;
    setSaving(true);
    try {
      // 1. Update business_settings store_vertical (never write deprecated store_modules)
      const { error: bsError } = await (supabase.from("business_settings") as any)
        .update({
          store_vertical: pendingVertical,
          updated_at: new Date().toISOString(),
        })
        .eq("brand_id", brandId);
      if (bsError) throw bsError;

      // 2. Install missing required starter pack add-ons
      const pendingStarter = starterPackFor(pendingVertical);
      for (const addonId of pendingStarter.required) {
        if (!isInstalled(addons, addonId)) {
          await installAddon({ addonId, withDependencies: true });
        }
      }

      // 3. Disable any candidate add-ons merchant explicitly chose to disable
      for (const addonId of addonsToDisableSelection) {
        await disableAddon({ addonId });
      }

      // 4. Invalidate profile and addons caches
      await qc.invalidateQueries({ queryKey: queryKeys.brand.storeProfile(brandId) });
      await qc.invalidateQueries({ queryKey: queryKeys.addons.all(brandId) });

      setVertical(pendingVertical);
      setShowVerticalChangeDialog(false);
      setPendingVertical(null);

      toast.success(
        isAr
          ? "تم تغيير نشاط المتجر وتحديث إضافات حزمة البداية بنجاح"
          : "Store vertical and starter pack add-ons updated successfully",
      );
    } catch (err: any) {
      toast.error(
        err.message || (isAr ? "فشل تحديث نشاط المتجر" : "Failed to update store vertical"),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleModuleToggle = async (id: StoreModuleId, checked: boolean) => {
    const addonId = MODULE_TO_ADDON[id];
    if (checked) {
      try {
        await installAddon({ addonId, withDependencies: true });
        toast.success(
          isAr ? "تم تثبيت وتفعيل الوحدة بنجاح" : "Module installed and enabled successfully",
        );
      } catch (err: any) {
        toast.error(err.message || (isAr ? "فشل تفعيل الوحدة" : "Failed to enable module"));
      }
    } else {
      // Check dependents before disabling
      const installedIds = (addons || [])
        .filter((r) => r.status === "installed")
        .map((r) => r.addon_id);
      const deps = dependentsOf(addonId, installedIds);
      if (deps.length > 0) {
        const depNames = deps
          .map((d) => (isAr ? getAddon(d)?.name.ar : getAddon(d)?.name.en) || d)
          .join(", ");
        toast.error(
          isAr
            ? `لا يمكن تعطيل هذه الوحدة لأن الإضافات التالية تعتمد عليها: ${depNames}`
            : `Cannot disable this module because the following add-ons depend on it: ${depNames}`,
        );
        return;
      }

      try {
        await disableAddon({ addonId });
        toast.success(isAr ? "تم إيقاف الوحدة بنجاح" : "Module disabled successfully");
      } catch (err: any) {
        toast.error(err.message || (isAr ? "فشل إيقاف الوحدة" : "Failed to disable module"));
      }
    }
  };

  const handleConfirmResetDefaults = async () => {
    setSaving(true);
    try {
      const pack = starterPackFor(vertical);
      // Install all required
      for (const addonId of pack.required) {
        if (!isInstalled(addons, addonId)) {
          await installAddon({ addonId, withDependencies: true });
        }
      }

      // Disable unneeded modules from other verticals that have no dependents
      const installedRows = (addons || []).filter((r) => r.status === "installed");
      for (const row of installedRows) {
        const manifest = getAddon(row.addon_id);
        if (
          manifest &&
          !manifest.activities.includes(vertical) &&
          !pack.required.includes(row.addon_id)
        ) {
          const remainingInstalled = installedRows
            .filter((r) => r.addon_id !== row.addon_id)
            .map((r) => r.addon_id);
          const deps = dependentsOf(row.addon_id, remainingInstalled);
          if (deps.length === 0) {
            await disableAddon({ addonId: row.addon_id });
          }
        }
      }

      await qc.invalidateQueries({ queryKey: queryKeys.brand.storeProfile(brandId) });
      await qc.invalidateQueries({ queryKey: queryKeys.addons.all(brandId) });

      setShowResetConfirmDialog(false);
      toast.success(
        isAr
          ? "تمت استعادة الوحدات الافتراضية للنشاط بنجاح"
          : "Restored vertical default modules successfully",
      );
    } catch (err: any) {
      toast.error(
        err.message ||
          (isAr ? "فشل استعادة الوحدات الافتراضية" : "Failed to reset modules to defaults"),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleResetFitProfiles = () => {
    setFitProfiles(null);
    toast.info(
      isAr
        ? "تمت استعادة قالب الأزياء الافتراضي لملفات المقاسات"
        : "Reset to default fashion fit profiles template",
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await (supabase.from("business_settings") as any)
        .update({
          store_vertical: vertical,
          fit_profiles: fitProfiles,
          updated_at: new Date().toISOString(),
        })
        .eq("brand_id", brandId);

      if (error) throw error;

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

  // Compute items for the vertical change dialog
  const pendingStarter = pendingVertical
    ? starterPackFor(pendingVertical)
    : { required: [], suggested: [] };
  const toInstall = pendingStarter.required.filter((id) => !isInstalled(addons, id));
  const candidatesToDisable = (addons || [])
    .filter((r) => r.status === "installed")
    .filter((r) => {
      const manifest = getAddon(r.addon_id);
      return (
        manifest &&
        pendingVertical &&
        !manifest.activities.includes(pendingVertical) &&
        !pendingStarter.required.includes(r.addon_id)
      );
    });

  const isLoading = isProfileLoading || isMutating;

  return (
    <>
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
            onClick={() => setShowResetConfirmDialog(true)}
            disabled={isLoading || saving}
            className="self-start sm:self-auto gap-1 text-xs"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {isAr ? "إعادة للافتراضيات" : "Reset to Defaults"}
          </Button>
        </div>

        {/* Add-ons Platform Quick Access */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-xl border border-border bg-muted/20">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Puzzle className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">
                  {isAr ? "منصة إضافات المتجر" : "Store Add-ons Platform"}
                </span>
                <Badge variant="secondary" className="text-xs px-2 py-0">
                  {isAr ? `${addons.length} إضافات مثبتة` : `${addons.length} installed`}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isAr
                  ? "تثبيت وتخصيص إضافات الأنشطة وتوسيع إمكانيات متجرك"
                  : "Install and configure activity add-ons to extend your store"}
              </p>
            </div>
          </div>
          <Button
            asChild
            variant="outline"
            size="sm"
            className="shrink-0 gap-1.5 h-9 rounded-xl border-border"
          >
            <Link to={`/admin/b/${slug}/addons` as any}>
              <Puzzle className="size-3.5 text-primary" />
              <span>{isAr ? "إدارة الإضافات" : "Manage Add-ons"}</span>
            </Link>
          </Button>
        </div>

        <div className="space-y-4">
          <div className="max-w-md space-y-2">
            <Label htmlFor="store-vertical-select" className="text-sm font-medium">
              {isAr ? "نوع النشاط التجاري" : "Store Vertical"}
            </Label>
            <Select
              value={vertical}
              onValueChange={(val) => handleSelectVertical(val as StoreVertical)}
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
                const addonId = MODULE_TO_ADDON[id];
                const isEnabled = isInstalled(addons, addonId);
                const isDefaultRecommended = starterPackFor(vertical).required.includes(addonId);

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

          {hasFitPassport && (
            <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Ruler className="w-4 h-4" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">
                        {isAr ? "ملفات قياسات Fit Passport" : "Fit Passport Profiles"}
                      </span>
                      {fitProfiles ? (
                        <Badge
                          variant="outline"
                          className="text-xs px-2 py-0 border-primary/30 text-primary"
                        >
                          {isAr ? "مخصص" : "Customized"}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs px-2 py-0">
                          {isAr ? "قالب الأزياء الافتراضي" : "Default Template"}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {isAr
                        ? "الملفات المعرّفة للعملاء والطلبات والتفصيل ومقاسات المنتجات"
                        : "Configured measurement profiles for customers, PDP, and order tailoring"}
                    </p>
                  </div>
                </div>
                {fitProfiles !== null && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleResetFitProfiles}
                    className="gap-1 text-xs self-start sm:self-auto"
                  >
                    <RotateCcw className="w-3 h-3" />
                    {isAr ? "استعادة قالب الأزياء الافتراضي" : "Restore Fashion Template"}
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {activeFitProfiles.map((prof) => (
                  <div
                    key={prof.key}
                    className="rounded-lg border border-border bg-card p-3 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-bold text-foreground">
                        {isAr ? prof.label_ar : prof.label_en}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {prof.fields.filter((f) => f.required).length}{" "}
                        {isAr ? "حقول إجبارية" : "required"}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {prof.fields.map((f) => (
                        <span
                          key={f.key}
                          className={`rounded px-1.5 py-0.5 text-xs ${
                            f.required
                              ? "bg-primary/10 text-primary font-medium"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {isAr ? f.label_ar : f.label_en}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {Boolean(passportCount && passportCount > 0 && !hasFitPassport) && (
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

      {/* Vertical Change & Starter Pack Synchronization Dialog */}
      <Dialog
        open={showVerticalChangeDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowVerticalChangeDialog(false);
            setPendingVertical(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-5 text-primary" />
              <span>
                {isAr ? "تغيير نشاط المتجر وتحديث الإضافات" : "Change Store Vertical & Add-ons"}
              </span>
            </DialogTitle>
            <DialogDescription>
              {isAr
                ? `تغيير النشاط من "${VERTICAL_LABELS[vertical]?.ar}" إلى "${pendingVertical ? VERTICAL_LABELS[pendingVertical]?.ar : ""}". يمكنك مراجعة حزمة البداية المقترحة أدناه.`
                : `Changing vertical from "${VERTICAL_LABELS[vertical]?.en}" to "${pendingVertical ? VERTICAL_LABELS[pendingVertical]?.en : ""}". Review the starter pack changes below.`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* New Vertical Required Add-ons */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-foreground">
                {isAr
                  ? "إضافات حزمة البداية التي ستُثبَّت وتُفعَّل:"
                  : "Starter pack add-ons to install & enable:"}
              </Label>
              {toInstall.length > 0 ? (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pe-1">
                  {toInstall.map((id) => {
                    const m = getAddon(id);
                    return (
                      <div
                        key={id}
                        className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-muted/40 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="secondary"
                            className="text-xs px-1.5 py-0 bg-primary/10 text-primary"
                          >
                            {isAr ? "أساسي" : "Required"}
                          </Badge>
                          <span className="font-medium text-foreground">
                            {isAr ? m?.name.ar : m?.name.en}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <CheckCircle2 className="size-3 text-primary" />
                          <span>{isAr ? "سيتم التثبيت" : "Will install"}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground p-2 rounded-lg bg-muted/30">
                  {isAr
                    ? "جميع الإضافات الأساسية للنشاط الجديد مثبتة ومفعلة مسبقاً."
                    : "All essential add-ons for the new vertical are already installed."}
                </p>
              )}
            </div>

            {/* Candidate Previous Add-ons to Disable */}
            {candidatesToDisable.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-border">
                <div className="space-y-0.5">
                  <Label className="text-xs font-semibold text-foreground">
                    {isAr
                      ? "إضافات النشاط السابق (اختياري - يُقترح إيقافها):"
                      : "Previous vertical add-ons (optional to disable):"}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {isAr
                      ? "تعطيل الإضافة يخفي واجهاتها فقط مع الحفاظ الكامل على كافة بياناتها المخزنة."
                      : "Disabling hides UI components while preserving all stored data."}
                  </p>
                </div>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pe-1">
                  {candidatesToDisable.map((r) => {
                    const m = getAddon(r.addon_id);
                    const isChecked = addonsToDisableSelection.includes(r.addon_id);
                    return (
                      <label
                        key={r.addon_id}
                        className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-muted/20 text-xs cursor-pointer hover:bg-muted/40 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={isChecked}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setAddonsToDisableSelection((prev) => [...prev, r.addon_id]);
                              } else {
                                setAddonsToDisableSelection((prev) =>
                                  prev.filter((id) => id !== r.addon_id),
                                );
                              }
                            }}
                          />
                          <span className="font-medium text-foreground">
                            {isAr ? m?.name.ar : m?.name.en}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {isChecked
                            ? isAr
                              ? "سيتم التعطيل"
                              : "Will disable"
                            : isAr
                              ? "إبقاء مفعلة"
                              : "Keep active"}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowVerticalChangeDialog(false);
                setPendingVertical(null);
              }}
              disabled={saving}
            >
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button type="button" onClick={handleConfirmVerticalChange} disabled={saving}>
              {saving
                ? isAr
                  ? "جاري التطبيق..."
                  : "Applying..."
                : isAr
                  ? "تأكيد وتطبيق التغييرات"
                  : "Confirm & Apply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset to Defaults Confirmation Dialog */}
      <Dialog
        open={showResetConfirmDialog}
        onOpenChange={(open) => setShowResetConfirmDialog(open)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="size-5 text-primary" />
              <span>{isAr ? "إعادة ضبط الوحدات للافتراضيات" : "Reset Modules to Defaults"}</span>
            </DialogTitle>
            <DialogDescription>
              {isAr
                ? `سيتم تثبيت وتفعيل إضافات حزمة البداية لنشاط "${VERTICAL_LABELS[vertical]?.ar}"، وتعطيل الوحدات التي لا تنتمي لهذا النشاط.`
                : `This will install and enable starter pack add-ons for "${VERTICAL_LABELS[vertical]?.en}", and disable modules that do not belong to this vertical.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowResetConfirmDialog(false)}
              disabled={saving}
            >
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button type="button" onClick={handleConfirmResetDefaults} disabled={saving}>
              {saving
                ? isAr
                  ? "جاري الاستعادة..."
                  : "Resetting..."
                : isAr
                  ? "تأكيد الاستعادة"
                  : "Confirm Reset"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
