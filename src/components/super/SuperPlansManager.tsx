// ==============================================================================
// BOUTQ OS: SUPER ADMIN SAAS PLANS & VERSIONING MANAGER
// ==============================================================================

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  listPlansWithDetails,
  createPlanVersion,
  updatePlanStatus,
  updatePlanDetails,
  createCustomPlan,
  deletePlan,
  updatePlatformBillingMode,
} from "@/lib/saas-billing/saas-billing.functions";
import type {
  SaaSPlan,
  SaaSPlanVersion,
  SaaSFeature,
  SaaSPlanFeature,
  BillingIntervalMode,
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
  AlertTriangle,
  Loader2,
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Power,
  PowerOff,
  Trash2,
  Edit3,
  MoreVertical,
  Filter,
  ShieldCheck,
  Info,
  Clock,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type PlanFilter = "all" | "active" | "hidden" | "inactive";

export function SuperPlansManager() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["super_saas_plans"],
    queryFn: () => listPlansWithDetails(),
  });

  const { data: platformSettings } = useQuery({
    queryKey: ["platform_system_settings_billing"],
    queryFn: async () => {
      const { data } = await supabase
        .from("system_settings")
        .select("billing_interval_mode")
        .eq("id", 1)
        .maybeSingle();
      return data as { billing_interval_mode: BillingIntervalMode } | null;
    },
  });

  const [filter, setFilter] = useState<PlanFilter>("all");
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);

  // New Version Modal State
  const [versioningPlan, setVersioningPlan] = useState<SaaSPlan | null>(null);
  const [newVersionMonthly, setNewVersionMonthly] = useState<number>(0);
  const [newVersionAnnual, setNewVersionAnnual] = useState<number>(0);
  const [changeSummary, setChangeSummary] = useState<string>("");
  const [featureValues, setFeatureValues] = useState<
    Record<string, { enabled: boolean; numericValue: number }>
  >({});

  // Edit Plan Metadata Modal State
  const [editingPlanDetails, setEditingPlanDetails] = useState<SaaSPlan | null>(null);
  const [editNameAr, setEditNameAr] = useState<string>("");
  const [editNameEn, setEditNameEn] = useState<string>("");
  const [editDescAr, setEditDescAr] = useState<string>("");
  const [editDescEn, setEditDescEn] = useState<string>("");
  const [editBadgeColor, setEditBadgeColor] = useState<string>("");
  const [editTrialDays, setEditTrialDays] = useState<number>(0);
  const [editSortOrder, setEditSortOrder] = useState<number>(0);
  const [editBillingIntervalMode, setEditBillingIntervalMode] = useState<BillingIntervalMode>("both");

  // Create Custom Plan Modal State
  const [isCreatingPlan, setIsCreatingPlan] = useState<boolean>(false);
  const [newPlanCode, setNewPlanCode] = useState<string>("");
  const [newPlanNameAr, setNewPlanNameAr] = useState<string>("");
  const [newPlanNameEn, setNewPlanNameEn] = useState<string>("");
  const [newPlanDescAr, setNewPlanDescAr] = useState<string>("");
  const [newPlanDescEn, setNewPlanDescEn] = useState<string>("");
  const [newPlanPriceMonthly, setNewPlanPriceMonthly] = useState<number>(0);
  const [newPlanPriceAnnual, setNewPlanPriceAnnual] = useState<number>(0);
  const [newPlanTrialDays, setNewPlanTrialDays] = useState<number>(0);
  const [newPlanBillingIntervalMode, setNewPlanBillingIntervalMode] = useState<BillingIntervalMode>("both");
  const [newPlanIsPublic, setNewPlanIsPublic] = useState<boolean>(true);
  const [newPlanIsActive, setNewPlanIsActive] = useState<boolean>(true);
  const [newPlanFeatures, setNewPlanFeatures] = useState<
    Record<string, { enabled: boolean; numericValue: number }>
  >({});

  // Delete Plan Confirmation Modal State
  const [deletingPlan, setDeletingPlan] = useState<SaaSPlan | null>(null);

  // General submitting state
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  if (isLoading) {
    return (
      <div className="p-12 flex flex-col items-center justify-center text-muted-foreground gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="text-xs">
          {isAr ? "جاري تحميل خطط المنصة وإصداراتها..." : "Loading SaaS plans & versions catalog..."}
        </span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 text-center text-destructive space-y-2">
        <AlertTriangle className="h-8 w-8 mx-auto" />
        <p className="text-sm font-bold">
          {isAr ? "فشل تحميل بيانات الخطط" : "Failed to load plans data"}
        </p>
        <p className="text-xs text-muted-foreground">{getFriendlyErrorMessage(error)}</p>
      </div>
    );
  }

  const { plans, versions, planFeatures, features, subscribersCountByPlan } = data;

  // Filter plans based on selected tab
  const filteredPlans = plans.filter((plan) => {
    if (filter === "active") return plan.is_active && plan.is_public;
    if (filter === "hidden") return plan.is_active && !plan.is_public;
    if (filter === "inactive") return !plan.is_active;
    return true;
  });

  const activeCount = plans.filter((p) => p.is_active && p.is_public).length;
  const hiddenCount = plans.filter((p) => p.is_active && !p.is_public).length;
  const inactiveCount = plans.filter((p) => !p.is_active).length;

  // Quick Toggle Public Visibility
  const handleTogglePublic = async (plan: SaaSPlan) => {
    const nextPublic = !plan.is_public;
    const toastId = toast.loading(
      isAr
        ? nextPublic
          ? "جاري إظهار الخطة في صفحة الأسعار..."
          : "جاري إخفاء الخطة عن العامة..."
        : nextPublic
          ? "Making plan public..."
          : "Hiding plan from public...",
    );

    try {
      await updatePlanStatus({
        data: {
          planId: plan.id,
          isPublic: nextPublic,
        },
      });
      toast.success(
        isAr
          ? nextPublic
            ? `تم إظهار باقة "${plan.name_ar}" للجميع بنجاح.`
            : `تم إخفاء باقة "${plan.name_ar}" عن الزوار والمسجلين الجدد.`
          : `Plan ${plan.name_en} visibility updated successfully.`,
        { id: toastId },
      );
      void queryClient.invalidateQueries({ queryKey: ["super_saas_plans"] });
    } catch (err) {
      console.error(err);
      toast.error(getFriendlyErrorMessage(err) || "Failed to update visibility", { id: toastId });
    }
  };

  // Quick Toggle Active Status (Cancel / Deactivate / Reactivate)
  const handleToggleActive = async (plan: SaaSPlan) => {
    const nextActive = !plan.is_active;
    const toastId = toast.loading(
      isAr
        ? nextActive
          ? "جاري إعادة تفعيل الخطة..."
          : "جاري إلغاء وتعطيل الخطة..."
        : nextActive
          ? "Reactivating plan..."
          : "Deactivating plan...",
    );

    try {
      await updatePlanStatus({
        data: {
          planId: plan.id,
          isActive: nextActive,
        },
      });
      toast.success(
        isAr
          ? nextActive
            ? `تم إعادة تفعيل باقة "${plan.name_ar}" بنجاح!`
            : `تم إلغاء/تعطيل باقة "${plan.name_ar}". لن يتمكن أي متجر جديد من الاشتراك بها.`
          : `Plan ${plan.name_en} status updated successfully.`,
        { id: toastId },
      );
      void queryClient.invalidateQueries({ queryKey: ["super_saas_plans"] });
    } catch (err) {
      console.error(err);
      toast.error(getFriendlyErrorMessage(err) || "Failed to update active status", { id: toastId });
    }
  };

  // Update Platform Global Billing Interval Mode
  const handleUpdateGlobalBillingMode = async (mode: BillingIntervalMode) => {
    const toastId = toast.loading(isAr ? "جاري تحديث دورات الفوترة..." : "Updating billing cycles...");
    try {
      await updatePlatformBillingMode({ data: { mode } });
      toast.success(isAr ? "تم تحديث دورات الفوترة بنجاح!" : "Billing cycles updated successfully!", {
        id: toastId,
      });
      void queryClient.invalidateQueries({ queryKey: ["platform_system_settings_billing"] });
      void queryClient.invalidateQueries({ queryKey: ["super_saas_plans"] });
    } catch (err) {
      console.error(err);
      toast.error(getFriendlyErrorMessage(err) || "Failed to update billing mode", { id: toastId });
    }
  };

  // Open Edit Details Modal
  const handleOpenEditDetails = (plan: SaaSPlan) => {
    setEditingPlanDetails(plan);
    setEditNameAr(plan.name_ar);
    setEditNameEn(plan.name_en);
    setEditDescAr(plan.description_ar || "");
    setEditDescEn(plan.description_en || "");
    setEditBadgeColor(plan.badge_color || "bg-primary/10 text-primary");
    setEditTrialDays(plan.trial_days || 0);
    setEditSortOrder(plan.sort_order || 0);
    setEditBillingIntervalMode(plan.billing_interval_mode || "both");
  };

  // Save Edit Details
  const handleSavePlanDetails = async () => {
    if (!editingPlanDetails) return;
    setIsSubmitting(true);
    const toastId = toast.loading(isAr ? "جاري حفظ بيانات الخطة..." : "Saving plan details...");

    try {
      await updatePlanDetails({
        data: {
          planId: editingPlanDetails.id,
          nameAr: editNameAr.trim(),
          nameEn: editNameEn.trim(),
          descriptionAr: editDescAr.trim() || null,
          descriptionEn: editDescEn.trim() || null,
          badgeColor: editBadgeColor.trim() || null,
          trialDays: Number(editTrialDays) || 0,
          sortOrder: Number(editSortOrder) || 0,
          billingIntervalMode: editBillingIntervalMode,
        },
      });

      toast.success(isAr ? "تم تحديث بيانات الخطة بنجاح!" : "Plan details updated successfully!", {
        id: toastId,
      });
      setEditingPlanDetails(null);
      void queryClient.invalidateQueries({ queryKey: ["super_saas_plans"] });
    } catch (err) {
      console.error(err);
      toast.error(getFriendlyErrorMessage(err) || "Failed to update plan details", { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Create Custom Plan Modal
  const handleOpenCreatePlan = () => {
    setNewPlanCode("");
    setNewPlanNameAr("");
    setNewPlanNameEn("");
    setNewPlanDescAr("");
    setNewPlanDescEn("");
    setNewPlanPriceMonthly(20);
    setNewPlanPriceAnnual(200);
    setNewPlanTrialDays(0);
    setNewPlanBillingIntervalMode("both");
    setNewPlanIsPublic(true);
    setNewPlanIsActive(true);

    const initialFeats: Record<string, { enabled: boolean; numericValue: number }> = {};
    features.forEach((f) => {
      if (f.value_type === "boolean") {
        initialFeats[f.key] = { enabled: true, numericValue: 0 };
      } else {
        initialFeats[f.key] = { enabled: true, numericValue: 100 };
      }
    });
    setNewPlanFeatures(initialFeats);
    setIsCreatingPlan(true);
  };

  // Save New Custom Plan
  const handleSaveCreatePlan = async () => {
    if (!newPlanCode.trim() || !newPlanNameAr.trim() || !newPlanNameEn.trim()) {
      toast.error(isAr ? "يرجى تعبئة رمز واسم الخطة" : "Please enter plan code and names");
      return;
    }

    setIsSubmitting(true);
    const toastId = toast.loading(isAr ? "جاري إنشاء الخطة الجديدة..." : "Creating new SaaS plan...");

    try {
      const formattedFeatures = Object.entries(newPlanFeatures).map(([key, val]) => {
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

      await createCustomPlan({
        data: {
          code: newPlanCode.trim().toLowerCase(),
          nameAr: newPlanNameAr.trim(),
          nameEn: newPlanNameEn.trim(),
          descriptionAr: newPlanDescAr.trim() || null,
          descriptionEn: newPlanDescEn.trim() || null,
          isPublic: newPlanIsPublic,
          isActive: newPlanIsActive,
          trialDays: Number(newPlanTrialDays) || 0,
          billingIntervalMode: newPlanBillingIntervalMode,
          priceMonthly: Number(newPlanPriceMonthly) || 0,
          priceAnnual: Number(newPlanPriceAnnual) || 0,
          features: formattedFeatures,
        },
      });

      toast.success(isAr ? "تم إنشاء الخطة الجديدة بنجاح!" : "New SaaS plan created successfully!", {
        id: toastId,
      });
      setIsCreatingPlan(false);
      void queryClient.invalidateQueries({ queryKey: ["super_saas_plans"] });
    } catch (err) {
      console.error(err);
      toast.error(getFriendlyErrorMessage(err) || "Failed to create plan", { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Plan
  const handleDeletePlan = async () => {
    if (!deletingPlan) return;
    setIsSubmitting(true);
    const toastId = toast.loading(isAr ? "جاري حذف الخطة..." : "Deleting plan...");

    try {
      await deletePlan({
        data: {
          planId: deletingPlan.id,
        },
      });

      toast.success(isAr ? "تم حذف الخطة بنجاح!" : "Plan deleted successfully!", { id: toastId });
      setDeletingPlan(null);
      void queryClient.invalidateQueries({ queryKey: ["super_saas_plans"] });
    } catch (err) {
      console.error(err);
      toast.error(getFriendlyErrorMessage(err) || "Failed to delete plan", { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open New Version Modal
  const handleOpenNewVersionModal = (plan: SaaSPlan) => {
    setVersioningPlan(plan);
    const currentVer =
      versions.find((v) => v.plan_id === plan.id && v.is_current) ||
      versions.find((v) => v.plan_id === plan.id);
    setNewVersionMonthly(currentVer ? Number(currentVer.price_monthly) : 0);
    setNewVersionAnnual(currentVer ? Number(currentVer.price_annual) : 0);
    setChangeSummary(
      isAr ? `تحديث ميزات وباقة ${plan.name_ar}` : `Updated features and quota for ${plan.name_en}`,
    );

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
          numericValue:
            alloc?.numeric_value !== undefined && alloc?.numeric_value !== null
              ? Number(alloc.numeric_value)
              : 100,
        };
      }
    });

    setFeatureValues(initialFeats);
  };

  // Save New Version
  const handleSaveNewVersion = async () => {
    if (!versioningPlan) return;
    setIsSubmitting(true);
    const toastId = toast.loading(
      isAr ? "جاري إنشاء وتعميم إصدار الخطة الجديد..." : "Publishing new plan version...",
    );

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
          planId: versioningPlan.id,
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
      setVersioningPlan(null);
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
      {/* Header & Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/60">
        <div>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            <span>
              {isAr ? "إدارة باقات المنصة والإصدارات والحدود" : "SaaS Plans, Versioning & Entitlements"}
            </span>
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isAr
              ? "تحكم كامل في تفعيل أو إخفاء أو إلغاء الباقات، مع حماية المشتركين القدامى وتحديث أسعار ومزايا المشتركين الجدد."
              : "Complete control over plan visibility, deactivation, and immutable versioning for grandfathered subscribers."}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={handleOpenCreatePlan}
            className="gap-1.5 font-bold text-xs min-h-[44px]"
          >
            <Plus className="h-4 w-4" />
            <span>{isAr ? "إضافة باقة جديدة" : "Create New Plan"}</span>
          </Button>
        </div>
      </div>

      {/* Platform-wide Billing Mode Control Card */}
      <div className="p-4 rounded-2xl bg-card border border-border shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span>{isAr ? "نظام دورات الفوترة المعروضة للمتاجر" : "Active Merchant Billing Cycles"}</span>
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isAr
              ? "تحكم فيما إذا كان المتجر يمكنه الاختيار بين شهري وسنوي، أو حصر التسجيل على شهري فقط أو سنوي فقط."
              : "Specify whether merchants can choose between monthly and annual, or restrict checkout to monthly only or annual only."}
          </p>
        </div>

        <div className="flex items-center gap-1.5 p-1 bg-muted/40 border border-border/60 rounded-xl shrink-0">
          <button
            type="button"
            onClick={() => handleUpdateGlobalBillingMode("both")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all min-h-[36px] ${
              (platformSettings?.billing_interval_mode || "both") === "both"
                ? "bg-primary text-primary-foreground shadow-sm font-bold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {isAr ? "شهري وسنوي" : "Monthly & Annual"}
          </button>
          <button
            type="button"
            onClick={() => handleUpdateGlobalBillingMode("monthly_only")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all min-h-[36px] ${
              platformSettings?.billing_interval_mode === "monthly_only"
                ? "bg-primary text-primary-foreground shadow-sm font-bold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {isAr ? "شهري فقط" : "Monthly Only"}
          </button>
          <button
            type="button"
            onClick={() => handleUpdateGlobalBillingMode("annual_only")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all min-h-[36px] ${
              platformSettings?.billing_interval_mode === "annual_only"
                ? "bg-primary text-primary-foreground shadow-sm font-bold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {isAr ? "سنوي فقط" : "Annual Only"}
          </button>
        </div>
      </div>

      {/* Filter Tabs Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        <Button
          type="button"
          variant={filter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("all")}
          className="text-xs font-semibold gap-1.5 h-9 rounded-xl"
        >
          <span>{isAr ? "جميع الباقات" : "All Plans"}</span>
          <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-mono">
            {plans.length}
          </Badge>
        </Button>

        <Button
          type="button"
          variant={filter === "active" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("active")}
          className="text-xs font-semibold gap-1.5 h-9 rounded-xl"
        >
          <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
          <span>{isAr ? "النشطة والمتاحة" : "Active & Public"}</span>
          <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-mono">
            {activeCount}
          </Badge>
        </Button>

        <Button
          type="button"
          variant={filter === "hidden" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("hidden")}
          className="text-xs font-semibold gap-1.5 h-9 rounded-xl"
        >
          <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
          <span>{isAr ? "المخفية عن العامة" : "Hidden"}</span>
          <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-mono">
            {hiddenCount}
          </Badge>
        </Button>

        <Button
          type="button"
          variant={filter === "inactive" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("inactive")}
          className="text-xs font-semibold gap-1.5 h-9 rounded-xl"
        >
          <span className="h-2 w-2 rounded-full bg-destructive shrink-0" />
          <span>{isAr ? "الملغاة والمعطلة" : "Deactivated / Cancelled"}</span>
          <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-mono">
            {inactiveCount}
          </Badge>
        </Button>
      </div>

      {/* Plans List Grid */}
      {filteredPlans.length === 0 ? (
        <div className="p-12 text-center text-muted-foreground border border-dashed border-border rounded-2xl space-y-2">
          <Layers className="h-8 w-8 mx-auto text-muted-foreground/50" />
          <p className="text-sm font-bold">
            {isAr ? "لا توجد باقات في هذا التصنيف" : "No plans found in this filter category"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredPlans.map((plan) => {
            const planVers = versions.filter((v) => v.plan_id === plan.id);
            const currentVer = planVers.find((v) => v.is_current) || planVers[0];
            const subscribers = subscribersCountByPlan[plan.id] || 0;
            const isExpanded = expandedPlanId === plan.id;

            return (
              <Card
                key={plan.id}
                className={`border bg-card/80 shadow-sm rounded-2xl flex flex-col justify-between transition-all hover:border-border/80 ${
                  !plan.is_active
                    ? "opacity-75 border-destructive/30 bg-destructive/5"
                    : !plan.is_public
                      ? "border-amber-500/30 bg-amber-500/5"
                      : "border-border"
                }`}
              >
                <CardHeader className="pb-3 border-b border-border/50">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge
                          variant="outline"
                          className={plan.badge_color || "bg-primary/10 text-primary"}
                        >
                          {plan.code}
                        </Badge>

                        {/* Status Badges */}
                        {!plan.is_active ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] bg-destructive/10 text-destructive border-destructive/20 font-bold"
                          >
                            <PowerOff className="h-2.5 w-2.5 me-1" />
                            {isAr ? "خطة ملغاة / معطلة" : "Deactivated / Cancelled"}
                          </Badge>
                        ) : !plan.is_public ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/20 font-bold"
                          >
                            <EyeOff className="h-2.5 w-2.5 me-1" />
                            {isAr ? "مخفية عن العامة" : "Hidden"}
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20 font-bold"
                          >
                            <Check className="h-2.5 w-2.5 me-1" />
                            {isAr ? "نشطة ومتاحة" : "Active"}
                          </Badge>
                        )}

                        <Badge variant="secondary" className="text-[10px] font-medium">
                          {plan.billing_interval_mode === "monthly_only"
                            ? (isAr ? "شهري فقط" : "Monthly Only")
                            : plan.billing_interval_mode === "annual_only"
                            ? (isAr ? "سنوي فقط" : "Annual Only")
                            : (isAr ? "شهري وسنوي" : "Monthly & Annual")}
                        </Badge>
                      </div>

                      <CardTitle className="text-base font-bold text-foreground">
                        {isAr ? plan.name_ar : plan.name_en}
                      </CardTitle>
                    </div>

                    {/* Actions Dropdown Menu */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0 rounded-lg"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52 text-xs">
                        {/* Toggle Visibility */}
                        <DropdownMenuItem
                          onClick={() => handleTogglePublic(plan)}
                          className="gap-2 cursor-pointer font-medium"
                        >
                          {plan.is_public ? (
                            <>
                              <EyeOff className="h-3.5 w-3.5 text-amber-600" />
                              <span>{isAr ? "إخفاء الخطة عن العامة" : "Hide from Public"}</span>
                            </>
                          ) : (
                            <>
                              <Eye className="h-3.5 w-3.5 text-emerald-600" />
                              <span>{isAr ? "إظهار الخطة للجميع" : "Make Plan Public"}</span>
                            </>
                          )}
                        </DropdownMenuItem>

                        {/* Toggle Active / Deactivate / Cancel */}
                        <DropdownMenuItem
                          onClick={() => handleToggleActive(plan)}
                          className={`gap-2 cursor-pointer font-medium ${
                            plan.is_active ? "text-destructive focus:text-destructive" : ""
                          }`}
                        >
                          {plan.is_active ? (
                            <>
                              <PowerOff className="h-3.5 w-3.5 text-destructive" />
                              <span>{isAr ? "تعطيل / إلغاء الخطة" : "Deactivate / Cancel Plan"}</span>
                            </>
                          ) : (
                            <>
                              <Power className="h-3.5 w-3.5 text-emerald-600" />
                              <span>{isAr ? "إعادة تفعيل الخطة" : "Reactivate Plan"}</span>
                            </>
                          )}
                        </DropdownMenuItem>

                        <DropdownMenuSeparator />

                        {/* Edit Details */}
                        <DropdownMenuItem
                          onClick={() => handleOpenEditDetails(plan)}
                          className="gap-2 cursor-pointer"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          <span>{isAr ? "تعديل تفاصيل الباقة" : "Edit Plan Details"}</span>
                        </DropdownMenuItem>

                        {/* Delete Plan */}
                        <DropdownMenuItem
                          onClick={() => setDeletingPlan(plan)}
                          className="gap-2 cursor-pointer text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>{isAr ? "حذف الباقة" : "Delete Plan"}</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <CardDescription className="text-xs line-clamp-2 mt-1">
                    {isAr ? plan.description_ar : plan.description_en}
                  </CardDescription>

                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                    <div className="flex items-center gap-1.5 font-semibold">
                      <Users className="h-3.5 w-3.5" />
                      <span>
                        {subscribers} {isAr ? "مشترك" : "Subscribers"}
                      </span>
                    </div>

                    {plan.trial_days > 0 && (
                      <div className="flex items-center gap-1 text-[11px] font-mono text-primary">
                        <Clock className="h-3 w-3" />
                        <span>
                          {plan.trial_days} {isAr ? "أيام تجربة" : "Days Trial"}
                        </span>
                      </div>
                    )}
                  </div>
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
                        <span className="text-[10px] font-normal text-muted-foreground">
                          /{isAr ? "شهر" : "mo"}
                        </span>
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
                      {isExpanded ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
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
                                <Badge
                                  variant="outline"
                                  className="ms-1 text-[9px] bg-emerald-500/10 text-emerald-600"
                                >
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

                  {/* Quick Action Switches Bar */}
                  <div className="p-2.5 rounded-xl bg-muted/20 border border-border/50 flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`pub-${plan.id}`} className="text-[11px] font-medium text-muted-foreground cursor-pointer">
                        {plan.is_public ? (isAr ? "معروضة" : "Public") : (isAr ? "مخفية" : "Hidden")}
                      </Label>
                      <Switch
                        id={`pub-${plan.id}`}
                        checked={plan.is_public}
                        onCheckedChange={() => handleTogglePublic(plan)}
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <Label htmlFor={`act-${plan.id}`} className="text-[11px] font-medium text-muted-foreground cursor-pointer">
                        {plan.is_active ? (isAr ? "مفعلة" : "Active") : (isAr ? "ملغاة" : "Cancelled")}
                      </Label>
                      <Switch
                        id={`act-${plan.id}`}
                        checked={plan.is_active}
                        onCheckedChange={() => handleToggleActive(plan)}
                      />
                    </div>
                  </div>

                  {/* Action button: Create Version */}
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
      )}

      {/* MODAL 1: Create New Plan Dialog Modal */}
      {isCreatingPlan && (
        <Dialog open={isCreatingPlan} onOpenChange={(open) => !open && setIsCreatingPlan(false)}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base font-bold flex items-center gap-2">
                <Plus className="h-4 w-4 text-primary" />
                <span>{isAr ? "إنشاء باقة سحابية جديدة" : "Create New SaaS Plan"}</span>
              </DialogTitle>
              <DialogDescription className="text-xs">
                {isAr
                  ? "قم بتحديد رمز الباقة والأسعار والحدود المبدئية للإصدار الأول v1."
                  : "Define the plan code, localized titles, pricing, and initial v1 feature limits."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-3 text-xs">
              {/* Plan Code & Names */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="font-bold">{isAr ? "رمز الباقة (Code)" : "Plan Code"}</Label>
                  <Input
                    value={newPlanCode}
                    onChange={(e) => setNewPlanCode(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                    placeholder="e.g. enterprise_vip"
                    className="font-mono text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-bold">{isAr ? "الاسم بالعربية" : "Name (Arabic)"}</Label>
                  <Input
                    value={newPlanNameAr}
                    onChange={(e) => setNewPlanNameAr(e.target.value)}
                    placeholder="مثال: باقة الشركات الكبرى"
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-bold">{isAr ? "الاسم بالإنجليزية" : "Name (English)"}</Label>
                  <Input
                    value={newPlanNameEn}
                    onChange={(e) => setNewPlanNameEn(e.target.value)}
                    placeholder="e.g. Enterprise VIP"
                    className="text-xs"
                  />
                </div>
              </div>

              {/* Descriptions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="font-bold">{isAr ? "الوصف بالعربية" : "Description (Arabic)"}</Label>
                  <Input
                    value={newPlanDescAr}
                    onChange={(e) => setNewPlanDescAr(e.target.value)}
                    placeholder="وصف مختصر لمزايا الباقة"
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-bold">{isAr ? "الوصف بالإنجليزية" : "Description (English)"}</Label>
                  <Input
                    value={newPlanDescEn}
                    onChange={(e) => setNewPlanDescEn(e.target.value)}
                    placeholder="Brief description of the plan"
                    className="text-xs"
                  />
                </div>
              </div>

              {/* Pricing & Trial */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="font-bold">{isAr ? "السعر الشهري (د.ب)" : "Monthly Price (BHD)"}</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.5"
                    value={newPlanPriceMonthly}
                    onChange={(e) => setNewPlanPriceMonthly(parseFloat(e.target.value) || 0)}
                    className="font-mono text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-bold">{isAr ? "السعر السنوي (د.ب)" : "Annual Price (BHD)"}</Label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={newPlanPriceAnnual}
                    onChange={(e) => setNewPlanPriceAnnual(parseFloat(e.target.value) || 0)}
                    className="font-mono text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-bold">{isAr ? "أيام التجربة المجانية" : "Trial Days"}</Label>
                  <Input
                    type="number"
                    min="0"
                    value={newPlanTrialDays}
                    onChange={(e) => setNewPlanTrialDays(parseInt(e.target.value, 10) || 0)}
                    className="font-mono text-xs"
                  />
                </div>
              </div>

              {/* Allowed Billing Intervals */}
              <div className="space-y-1.5">
                <Label className="font-bold">{isAr ? "دورة الفوترة المتاحة للباقة" : "Allowed Billing Intervals"}</Label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewPlanBillingIntervalMode("both")}
                    className={`p-2.5 rounded-xl border text-xs font-semibold text-center transition-all ${
                      newPlanBillingIntervalMode === "both"
                        ? "border-primary bg-primary/10 text-primary font-bold shadow-sm"
                        : "border-border/60 hover:bg-muted/40 text-muted-foreground"
                    }`}
                  >
                    {isAr ? "شهري وسنوي" : "Monthly & Annual"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewPlanBillingIntervalMode("monthly_only")}
                    className={`p-2.5 rounded-xl border text-xs font-semibold text-center transition-all ${
                      newPlanBillingIntervalMode === "monthly_only"
                        ? "border-primary bg-primary/10 text-primary font-bold shadow-sm"
                        : "border-border/60 hover:bg-muted/40 text-muted-foreground"
                    }`}
                  >
                    {isAr ? "فقط شهري" : "Monthly Only"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewPlanBillingIntervalMode("annual_only")}
                    className={`p-2.5 rounded-xl border text-xs font-semibold text-center transition-all ${
                      newPlanBillingIntervalMode === "annual_only"
                        ? "border-primary bg-primary/10 text-primary font-bold shadow-sm"
                        : "border-border/60 hover:bg-muted/40 text-muted-foreground"
                    }`}
                  >
                    {isAr ? "فقط سنوي" : "Annual Only"}
                  </button>
                </div>
              </div>

              {/* Visibility & Status toggles */}
              <div className="p-3 rounded-xl bg-muted/30 border border-border/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={newPlanIsPublic}
                    onCheckedChange={setNewPlanIsPublic}
                    id="new-plan-public"
                  />
                  <Label htmlFor="new-plan-public" className="cursor-pointer">
                    {isAr ? "إظهار الخطة في صفحة الأسعار العامة" : "Show in public pricing page"}
                  </Label>
                </div>

                <div className="flex items-center gap-2">
                  <Switch
                    checked={newPlanIsActive}
                    onCheckedChange={setNewPlanIsActive}
                    id="new-plan-active"
                  />
                  <Label htmlFor="new-plan-active" className="cursor-pointer">
                    {isAr ? "تفعيل الباقة فورياً" : "Activate plan immediately"}
                  </Label>
                </div>
              </div>

              {/* Initial Feature Allocations Matrix */}
              <div className="space-y-2">
                <Label className="font-bold uppercase tracking-wider text-muted-foreground block">
                  {isAr ? "تخصيص المزايا والحدود للإصدار الأول v1" : "Feature Allocations for Version 1"}
                </Label>

                <div className="space-y-2 max-h-[260px] overflow-y-auto p-3 rounded-2xl border border-border bg-muted/20">
                  {features.map((feat) => {
                    const currentVal = newPlanFeatures[feat.key] || { enabled: false, numericValue: 0 };
                    const isBool = feat.value_type === "boolean";

                    return (
                      <div
                        key={feat.key}
                        className="p-2 rounded-xl bg-card border border-border/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                      >
                        <div className="space-y-0.5 max-w-[280px]">
                          <div className="flex items-center gap-1.5 font-bold text-foreground">
                            <span>{isAr ? feat.name_ar : feat.name_en}</span>
                            <span className="font-mono text-[10px] text-muted-foreground font-normal">
                              ({feat.key})
                            </span>
                          </div>
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
                                  setNewPlanFeatures((prev) => ({
                                    ...prev,
                                    [feat.key]: { enabled: checked, numericValue: 0 },
                                  }))
                                }
                              />
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <Label className="text-[10px] text-muted-foreground">
                                {isAr ? "الحد (-1 غير محدود):" : "Limit (-1 for unlimited):"}
                              </Label>
                              <Input
                                type="number"
                                min="-1"
                                value={currentVal.numericValue}
                                onChange={(e) =>
                                  setNewPlanFeatures((prev) => ({
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
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting}
                onClick={() => setIsCreatingPlan(false)}
                className="min-h-[44px]"
              >
                {isAr ? "إلغاء" : "Cancel"}
              </Button>
              <Button
                type="button"
                variant="default"
                disabled={isSubmitting || !newPlanCode.trim() || !newPlanNameAr.trim()}
                onClick={handleSaveCreatePlan}
                className="gap-2 font-bold min-h-[44px]"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                <span>{isAr ? "حفظ وإنشاء الباقة" : "Create Plan"}</span>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* MODAL 2: Edit Plan Details Modal */}
      {editingPlanDetails && (
        <Dialog open={Boolean(editingPlanDetails)} onOpenChange={(open) => !open && setEditingPlanDetails(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-base font-bold flex items-center gap-2">
                <Edit3 className="h-4 w-4 text-primary" />
                <span>
                  {isAr ? `تعديل بيانات: ${editingPlanDetails.name_ar}` : `Edit Plan: ${editingPlanDetails.name_en}`}
                </span>
              </DialogTitle>
              <DialogDescription className="text-xs">
                {isAr
                  ? "تعديل المسميات والأوصاف وشارات العرض للباقة."
                  : "Update localized names, descriptions, and badge colors."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="font-bold">{isAr ? "الاسم بالعربية" : "Name (Arabic)"}</Label>
                  <Input
                    value={editNameAr}
                    onChange={(e) => setEditNameAr(e.target.value)}
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-bold">{isAr ? "الاسم بالإنجليزية" : "Name (English)"}</Label>
                  <Input
                    value={editNameEn}
                    onChange={(e) => setEditNameEn(e.target.value)}
                    className="text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="font-bold">{isAr ? "الوصف بالعربية" : "Description (Arabic)"}</Label>
                <Input
                  value={editDescAr}
                  onChange={(e) => setEditDescAr(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="font-bold">{isAr ? "الوصف بالإنجليزية" : "Description (English)"}</Label>
                <Input
                  value={editDescEn}
                  onChange={(e) => setEditDescEn(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="font-bold">{isAr ? "أيام التجربة المجانية" : "Trial Days"}</Label>
                  <Input
                    type="number"
                    min="0"
                    value={editTrialDays}
                    onChange={(e) => setEditTrialDays(parseInt(e.target.value, 10) || 0)}
                    className="font-mono text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-bold">{isAr ? "ترتيب الظهور" : "Sort Order"}</Label>
                  <Input
                    type="number"
                    value={editSortOrder}
                    onChange={(e) => setEditSortOrder(parseInt(e.target.value, 10) || 0)}
                    className="font-mono text-xs"
                  />
                </div>
              </div>

              {/* Allowed Billing Intervals */}
              <div className="space-y-1.5">
                <Label className="font-bold">{isAr ? "دورة الفوترة المتاحة للباقة" : "Allowed Billing Intervals"}</Label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditBillingIntervalMode("both")}
                    className={`p-2.5 rounded-xl border text-xs font-semibold text-center transition-all ${
                      editBillingIntervalMode === "both"
                        ? "border-primary bg-primary/10 text-primary font-bold shadow-sm"
                        : "border-border/60 hover:bg-muted/40 text-muted-foreground"
                    }`}
                  >
                    {isAr ? "شهري وسنوي" : "Monthly & Annual"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditBillingIntervalMode("monthly_only")}
                    className={`p-2.5 rounded-xl border text-xs font-semibold text-center transition-all ${
                      editBillingIntervalMode === "monthly_only"
                        ? "border-primary bg-primary/10 text-primary font-bold shadow-sm"
                        : "border-border/60 hover:bg-muted/40 text-muted-foreground"
                    }`}
                  >
                    {isAr ? "فقط شهري" : "Monthly Only"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditBillingIntervalMode("annual_only")}
                    className={`p-2.5 rounded-xl border text-xs font-semibold text-center transition-all ${
                      editBillingIntervalMode === "annual_only"
                        ? "border-primary bg-primary/10 text-primary font-bold shadow-sm"
                        : "border-border/60 hover:bg-muted/40 text-muted-foreground"
                    }`}
                  >
                    {isAr ? "فقط سنوي" : "Annual Only"}
                  </button>
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting}
                onClick={() => setEditingPlanDetails(null)}
                className="min-h-[44px]"
              >
                {isAr ? "إلغاء" : "Cancel"}
              </Button>
              <Button
                type="button"
                variant="default"
                disabled={isSubmitting || !editNameAr.trim()}
                onClick={handleSavePlanDetails}
                className="gap-2 font-bold min-h-[44px]"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                <span>{isAr ? "حفظ التعديلات" : "Save Changes"}</span>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* MODAL 3: Delete Plan Confirmation Modal */}
      {deletingPlan && (
        <Dialog open={Boolean(deletingPlan)} onOpenChange={(open) => !open && setDeletingPlan(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base font-bold flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5 shrink-0" />
                <span>
                  {isAr ? `تأكيد حذف باقة: ${deletingPlan.name_ar}` : `Delete Plan: ${deletingPlan.name_en}`}
                </span>
              </DialogTitle>
              <DialogDescription className="text-xs">
                {(subscribersCountByPlan[deletingPlan.id] || 0) > 0 ? (
                  <span className="text-destructive font-bold block mt-2">
                    {isAr
                      ? `لا يمكن حذف هذه الخطة لوجود ${subscribersCountByPlan[deletingPlan.id]} متجر مشترك بها حالياً. يرجى تعطيل أو إخفاء الخطة بدلاً من حذفها لحماية استمرارية المتاجر.`
                      : `Cannot delete plan because it has ${subscribersCountByPlan[deletingPlan.id]} active subscriber(s). Please deactivate or hide the plan instead.`}
                  </span>
                ) : (
                  <span>
                    {isAr
                      ? "هل أنت متأكد من رغبتك في حذف هذه الخطة نهائياً من قاعدة البيانات؟ لا يمكن التراجع عن هذا الإجراء."
                      : "Are you sure you want to permanently delete this plan and all its versions from the database? This action cannot be undone."}
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting}
                onClick={() => setDeletingPlan(null)}
                className="min-h-[44px]"
              >
                {isAr ? "إلغاء" : "Cancel"}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={isSubmitting || (subscribersCountByPlan[deletingPlan.id] || 0) > 0}
                onClick={handleDeletePlan}
                className="gap-2 font-bold min-h-[44px]"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                <span>{isAr ? "حذف نهائي" : "Delete Plan"}</span>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* MODAL 4: Create New Plan Version Dialog Modal */}
      {versioningPlan && (
        <Dialog open={Boolean(versioningPlan)} onOpenChange={(open) => !open && setVersioningPlan(null)}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base font-bold flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span>
                  {isAr ? `تحديث باقة: ${versioningPlan.name_ar}` : `Create New Version: ${versioningPlan.name_en}`}
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
                  placeholder={
                    isAr
                      ? "مثال: زيادة حد المنتجات إلى 500 وتفعيل API..."
                      : "e.g., Increased products limit and added API access"
                  }
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
                      ? `سيبدأ المشتركون الجدد على الإصدار v${(versions.filter((v) => v.plan_id === versioningPlan.id).length || 0) + 1} فور الحفظ. المشتركون الحاليون (${subscribersCountByPlan[versioningPlan.id] || 0} متجر) سيبقون على عقودهم السابقة دون انقطاع.`
                      : `New subscribers will be provisioned on v${(versions.filter((v) => v.plan_id === versioningPlan.id).length || 0) + 1}. Existing ${subscribersCountByPlan[versioningPlan.id] || 0} active stores remain protected on their existing plan version.`}
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
                onClick={() => setVersioningPlan(null)}
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
