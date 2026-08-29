// ==============================================================================
// BOUTQ OS: SUPER ADMIN SAAS PLANS & VERSIONING MANAGER
// ==============================================================================

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listPlansWithDetails,
  createPlanVersion,
} from "@/lib/saas-billing/saas-billing.functions";
import type {
  SaaSPlan,
  SaaSPlanVersion,
  SaaSFeature,
  SaaSPlanFeature,
} from "@/lib/saas-billing/saas-billing.types";
import { useI18n } from "@/lib/i18n";
import { getFriendlyErrorMessage } from "@/lib/utils";
import { toast } from "sonner";
import {
  Layers,
  Plus,
  History,
  CheckCircle2,
  Users,
  Sparkles,
  Infinity as InfinityIcon,
  AlertTriangle,
  Loader2,
  Check,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export function SuperPlansManager() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["super_saas_plans"],
    queryFn: () => listPlansWithDetails(),
  });

  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);
  const [editingPlan, setEditingPlan] = useState<SaaSPlan | null>(null);
  const [newVersionMonthly, setNewVersionMonthly] = useState<number>(0);
  const [newVersionAnnual, setNewVersionAnnual] = useState<number>(0);
  const [changeSummary, setChangeSummary] = useState<string>("");
  const [featureValues, setFeatureValues] = useState<
    Record<string, { enabled: boolean; numericValue: number }>
  >({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  if (isLoading) {
    return (
      <div className="p-12 flex flex-col items-center justify-center text-muted-foreground gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="text-xs">{isAr ? "جاري تحميل خطط المنصة وإصداراتها..." : "Loading SaaS plans & versions catalog..."}</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 text-center text-destructive space-y-2">
        <AlertTriangle className="h-8 w-8 mx-auto" />
        <p className="text-sm font-bold">{isAr ? "فشل تحميل بيانات الخطط" : "Failed to load plans data"}</p>
        <p className="text-xs text-muted-foreground">{getFriendlyErrorMessage(error)}</p>
      </div>
    );
  }

  const { plans, versions, planFeatures, features, subscribersCountByPlan } = data;

  const handleOpenNewVersionModal = (plan: SaaSPlan) => {
    setEditingPlan(plan);
    const currentVer = versions.find((v) => v.plan_id === plan.id && v.is_current) || versions.find((v) => v.plan_id === plan.id);
    setNewVersionMonthly(currentVer ? Number(currentVer.price_monthly) : 0);
    setNewVersionAnnual(currentVer ? Number(currentVer.price_annual) : 0);
    setChangeSummary(isAr ? `تحديث ميزات وباقة ${plan.name_ar}` : `Updated features and quota for ${plan.name_en}`);

    // Pre-populate features from current version
    const initialFeats: Record<string, { enabled: boolean; numericValue: number }> = {};
    const currAllocations = currentVer
      ? planFeatures.filter((pf: SaaSPlanFeature) => pf.plan_version_id === currentVer.id)
      : [];

    features.forEach((f) => {
      const alloc = currAllocations.find((a: SaaSPlanFeature) => a.feature_key === f.key);
      if (f.value_type === "boolean") {
        initialFeats[f.key] = {
          enabled: alloc ? Boolean(alloc.boolean_value) : false,
          numericValue: 0,
        };
      } else {
        initialFeats[f.key] = {
          enabled: alloc ? alloc.numeric_value !== 0 : true,
          numericValue: alloc?.numeric_value !== undefined && alloc?.numeric_value !== null ? Number(alloc.numeric_value) : 100,
        };
      }
    });

    setFeatureValues(initialFeats);
  };

  const handleSaveNewVersion = async () => {
    if (!editingPlan) return;
    setIsSubmitting(true);
    const toastId = toast.loading(isAr ? "جاري إنشاء وتعميم إصدار الخطة الجديد..." : "Publishing new plan version...");

    try {
      const formattedFeatures = Object.entries(featureValues).map(([key, val]) => {
        const featDef = features.find((f) => f.key === key);
        if (featDef?.value_type === "boolean") {
          return {
            featureKey: key,
            booleanValue: val.enabled,
            numericValue: null,
          };
        } else {
          return {
            featureKey: key,
            booleanValue: val.enabled,
            numericValue: val.enabled ? val.numericValue : 0,
          };
        }
      });

      await createPlanVersion({
        data: {
          planId: editingPlan.id,
          priceMonthly: Number(newVersionMonthly),
          priceAnnual: Number(newVersionAnnual),
          changeSummary: changeSummary.trim(),
          features: formattedFeatures,
        },
      });

      toast.success(
        isAr
          ? "تم نشر إصدار الخطة الجديد بنجاح مع الحفاظ على حقوق المشتركين الحاليين!"
          : "New plan version published successfully! Grandfathered tenants remain on their active version.",
        { id: toastId },
      );
      setEditingPlan(null);
      void queryClient.invalidateQueries({ queryKey: ["super_saas_plans"] });
    } catch (err) {
      console.error(err);
      toast.error(getFriendlyErrorMessage(err) || "Failed to create version", { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border/60">
        <div>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            <span>{isAr ? "إدارة باقات المنصة والإصدارات والحدود" : "SaaS Plans, Versioning & Entitlements"}</span>
          </h2>
          <p className="text-xs text-muted-foreground">
            {isAr
              ? "إنشاء وإصدار الباقات السحابية مع حماية المشتركين القدامى (Grandfathering) وتحديث أسعار ومزايا المشتركين الجدد."
              : "Define tiered plans, create immutable versions with grandfathering protection, and adjust feature quotas."}
          </p>
        </div>
      </div>

      {/* Plans List Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {plans.map((plan) => {
          const planVers = versions.filter((v) => v.plan_id === plan.id);
          const currentVer = planVers.find((v) => v.is_current) || planVers[0];
          const subscribers = subscribersCountByPlan[plan.id] || 0;
          const isExpanded = expandedPlanId === plan.id;

          return (
            <Card
              key={plan.id}
              className="border border-border bg-card/80 shadow-sm rounded-2xl flex flex-col justify-between transition-all hover:border-border/80"
            >
              <CardHeader className="pb-3 border-b border-border/50">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className={plan.badge_color || "bg-primary/10 text-primary"}>
                    {plan.code}
                  </Badge>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-semibold">
                    <Users className="h-3.5 w-3.5" />
                    <span>
                      {subscribers} {isAr ? "مشترك" : "Subscribers"}
                    </span>
                  </div>
                </div>

                <CardTitle className="text-base font-bold text-foreground mt-2">
                  {isAr ? plan.name_ar : plan.name_en}
                </CardTitle>
                <CardDescription className="text-xs line-clamp-2">
                  {isAr ? plan.description_ar : plan.description_en}
                </CardDescription>
              </CardHeader>

              <CardContent className="pt-4 space-y-4 flex-1 flex flex-col justify-between">
                {/* Current Active Pricing */}
                <div className="p-3 rounded-xl bg-muted/40 border border-border/50 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                      {isAr ? "الإصدار الحالي النشط" : "Current Active Version"}
                    </span>
                    <span className="text-xs font-bold text-foreground">
                      v{currentVer?.version_number || 1}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-mono font-bold text-foreground block">
                      {currentVer?.price_monthly ?? 0} {currentVer?.currency || "BHD"}
                      <span className="text-[10px] font-normal text-muted-foreground">/{isAr ? "شهر" : "mo"}</span>
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {currentVer?.price_annual ?? 0} {currentVer?.currency || "BHD"}
                      <span className="text-[10px]">/{isAr ? "سنة" : "yr"}</span>
                    </span>
                  </div>
                </div>

                {/* Version History Collapsible */}
                <div className="space-y-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setExpandedPlanId(isExpanded ? null : plan.id)}
                    className="w-full justify-between text-xs font-medium text-muted-foreground h-8 px-2 hover:text-foreground"
                  >
                    <span className="flex items-center gap-1.5">
                      <History className="h-3.5 w-3.5" />
                      <span>
                        {isAr ? "سجل الإصدارات" : "Version History"} ({planVers.length})
                      </span>
                    </span>
                    {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </Button>

                  {isExpanded && (
                    <div className="space-y-1.5 p-2 rounded-xl bg-background border border-border/60 text-xs">
                      {planVers.map((v) => (
                        <div
                          key={v.id}
                          className="p-2 rounded-lg bg-muted/30 flex items-center justify-between text-[11px]"
                        >
                          <div>
                            <span className="font-bold text-foreground">v{v.version_number}</span>
                            {v.is_current && (
                              <Badge variant="outline" className="ms-1 text-[9px] bg-emerald-500/10 text-emerald-600">
                                {isAr ? "نشط" : "Current"}
                              </Badge>
                            )}
                            <p className="text-[10px] text-muted-foreground truncate max-w-[150px]">
                              {v.change_summary || "No notes"}
                            </p>
                          </div>
                          <div className="text-right font-mono font-semibold">
                            {v.price_monthly} BHD/m
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Action button */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenNewVersionModal(plan)}
                  className="w-full gap-1.5 font-bold text-xs min-h-[44px]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>{isAr ? "إنشاء وتعديل إصدار جديد" : "Create New Version"}</span>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Create New Plan Version Dialog Modal */}
      {editingPlan && (
        <Dialog open={Boolean(editingPlan)} onOpenChange={(open) => !open && setEditingPlan(null)}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base font-bold flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span>
                  {isAr ? `تحديث باقة: ${editingPlan.name_ar}` : `Create New Version: ${editingPlan.name_en}`}
                </span>
              </DialogTitle>
              <DialogDescription className="text-xs">
                {isAr
                  ? "سيتم إنشاء إصدار جديد رقمي معتمد للمشتركين الجدد. المشتركون الحاليون لن تتأثر أسعارهم أو مزاياهم."
                  : "A new immutable plan version will be created for new subscribers. Existing subscribers keep their contracted version."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5 py-3">
              {/* Pricing definition */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-foreground">
                    {isAr ? "السعر الشهري (د.ب)" : "Monthly Price (BHD)"}
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.5"
                    value={newVersionMonthly}
                    onChange={(e) => setNewVersionMonthly(parseFloat(e.target.value) || 0)}
                    className="font-mono text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-foreground">
                    {isAr ? "السعر السنوي (د.ب)" : "Annual Price (BHD)"}
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={newVersionAnnual}
                    onChange={(e) => setNewVersionAnnual(parseFloat(e.target.value) || 0)}
                    className="font-mono text-sm"
                  />
                </div>
              </div>

              {/* Version changelog summary */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-foreground">
                  {isAr ? "ملاحظات التغيير في هذا الإصدار" : "Version Change Summary"}
                </Label>
                <Input
                  value={changeSummary}
                  onChange={(e) => setChangeSummary(e.target.value)}
                  placeholder={isAr ? "مثال: زيادة حد المنتجات إلى 500 وتفعيل API..." : "e.g., Increased products limit and added API access"}
                  className="text-xs"
                />
              </div>

              {/* Entitlements & Feature Limits Allocation Matrix */}
              <div className="space-y-3">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                  {isAr ? "تخصيص المزايا والحدود لهذا الإصدار" : "Feature Allocations & Quotas for this Version"}
                </Label>

                <div className="space-y-2.5 max-h-[320px] overflow-y-auto p-3 rounded-2xl border border-border bg-muted/20">
                  {features.map((feat) => {
                    const currentVal = featureValues[feat.key] || { enabled: false, numericValue: 0 };
                    const isBool = feat.value_type === "boolean";

                    return (
                      <div
                        key={feat.key}
                        className="p-2.5 rounded-xl bg-card border border-border/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                      >
                        <div className="space-y-0.5 max-w-[280px]">
                          <div className="flex items-center gap-1.5 font-bold text-foreground">
                            <span>{isAr ? feat.name_ar : feat.name_en}</span>
                            <span className="font-mono text-[10px] text-muted-foreground font-normal">
                              ({feat.key})
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-tight">
                            {isAr ? feat.description_ar : feat.description_en}
                          </p>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          {isBool ? (
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-semibold text-muted-foreground">
                                {currentVal.enabled ? (isAr ? "مفعل" : "Enabled") : (isAr ? "معطل" : "Disabled")}
                              </span>
                              <Switch
                                checked={currentVal.enabled}
                                onCheckedChange={(checked) =>
                                  setFeatureValues((prev) => ({
                                    ...prev,
                                    [feat.key]: { enabled: checked, numericValue: 0 },
                                  }))
                                }
                              />
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-1.5">
                                <Label className="text-[10px] text-muted-foreground">
                                  {isAr ? "الحد (-1 غير محدود):" : "Limit (-1 for unlimited):"}
                                </Label>
                                <Input
                                  type="number"
                                  min="-1"
                                  value={currentVal.numericValue}
                                  onChange={(e) =>
                                    setFeatureValues((prev) => ({
                                      ...prev,
                                      [feat.key]: {
                                        enabled: parseInt(e.target.value, 10) !== 0,
                                        numericValue: parseInt(e.target.value, 10) || 0,
                                      },
                                    }))
                                  }
                                  className="w-24 h-8 font-mono text-xs"
                                />
                                {feat.unit && (
                                  <span className="text-[10px] text-muted-foreground">{feat.unit}</span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Simulation Banner */}
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2">
                <Sparkles className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                <div>
                  <span className="font-bold block">
                    {isAr ? "معاينة التأثير قبل الحفظ" : "Pre-save Impact Preview"}
                  </span>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {isAr
                      ? `سيبدأ المشتركون الجدد على الإصدار v${(versions.filter(v => v.plan_id === editingPlan.id).length || 0) + 1} فور الحفظ. المشتركون الحاليون (${subscribersCountByPlan[editingPlan.id] || 0} متجر) سيبقون على عقودهم السابقة دون انقطاع.`
                      : `New subscribers will be provisioned on v${(versions.filter(v => v.plan_id === editingPlan.id).length || 0) + 1}. Existing ${subscribersCountByPlan[editingPlan.id] || 0} active stores remain protected on their existing plan version.`}
                  </p>
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                size="default"
                disabled={isSubmitting}
                onClick={() => setEditingPlan(null)}
                className="min-h-[44px]"
              >
                {isAr ? "إلغاء" : "Cancel"}
              </Button>
              <Button
                type="button"
                variant="default"
                size="default"
                disabled={isSubmitting || !changeSummary.trim()}
                onClick={handleSaveNewVersion}
                className="gap-2 font-bold min-h-[44px]"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                <span>{isAr ? "نشر وتعميم الإصدار" : "Publish Version"}</span>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
