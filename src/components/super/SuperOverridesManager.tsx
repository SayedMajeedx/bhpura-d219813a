// ==============================================================================
// BOUTQ OS: SUPER ADMIN BRAND OVERRIDES & AUDIT LOGS MANAGER
// ==============================================================================

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  setBrandEntitlementOverride,
  removeBrandEntitlementOverride,
  listBrandOverridesAndAuditLogs,
  listPlansWithDetails,
} from "@/lib/saas-billing/saas-billing.functions";
import type { BrandEntitlementOverride } from "@/lib/saas-billing/saas-billing.types";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { getFriendlyErrorMessage } from "@/lib/utils";
import { toast } from "sonner";
import {
  ShieldAlert,
  Plus,
  Trash2,
  FileText,
  Clock,
  User,
  Loader2,
  Check,
  AlertTriangle,
  Sparkles,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function SuperOverridesManager() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const queryClient = useQueryClient();

  // Fetch all brands for selection
  const { data: brandsList } = useQuery({
    queryKey: ["super_all_brands_list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brands")
        .select("id, slug, name_en, name_ar, plan_type")
        .order("name_en", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch global features for dropdown
  const { data: plansData } = useQuery({
    queryKey: ["super_saas_plans"],
    queryFn: () => listPlansWithDetails(),
  });

  // Fetch audit logs and overrides
  const { data: overridesAndAuditData, isLoading: logsLoading } = useQuery({
    queryKey: ["super_saas_audit_logs"],
    queryFn: () => listBrandOverridesAndAuditLogs({ data: {} }),
  });

  const auditLogs = overridesAndAuditData?.auditLogs || [];

  const [selectedBrandId, setSelectedBrandId] = useState<string>("");
  const [featureKey, setFeatureKey] = useState<string>("products.limit");
  const [overrideType, setOverrideType] = useState<"set_boolean" | "set_limit" | "increment_limit">("set_limit");
  const [booleanValue, setBooleanValue] = useState<boolean>(true);
  const [numericValue, setNumericValue] = useState<number>(500);
  const [reason, setReason] = useState<string>("");
  const [expiresAt, setExpiresAt] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch active overrides for selected brand
  const { data: brandOverrides = [], isLoading: overridesLoading } = useQuery<BrandEntitlementOverride[]>({
    queryKey: ["brand_overrides_view", selectedBrandId],
    queryFn: async () => {
      if (!selectedBrandId) return [];
      const { data, error } = await (supabase as any)
        .from("brand_entitlement_overrides")
        .select("*")
        .eq("brand_id", selectedBrandId);
      if (error) throw error;
      return (data || []) as BrandEntitlementOverride[];
    },
    enabled: Boolean(selectedBrandId),
  });

  const handleApplyOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBrandId || !featureKey || !reason.trim()) {
      toast.error(isAr ? "يرجى تعبئة كافة الحقول المطلوبة وسبب الاستثناء" : "Please fill required fields and reason");
      return;
    }

    setIsSubmitting(true);
    const toastId = toast.loading(isAr ? "جاري تطبيق الاستثناء للمتجر..." : "Applying custom entitlement override...");

    try {
      await setBrandEntitlementOverride({
        data: {
          brandId: selectedBrandId,
          featureKey,
          booleanValue: overrideType === "set_boolean" ? booleanValue : null,
          numericValue: overrideType !== "set_boolean" ? numericValue : null,
          reason: reason.trim(),
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        },
      });

      toast.success(isAr ? "تم تطبيق الاستثناء بنجاح!" : "Override applied successfully!", { id: toastId });
      setReason("");
      void queryClient.invalidateQueries({ queryKey: ["brand_overrides_view", selectedBrandId] });
      void queryClient.invalidateQueries({ queryKey: ["super_saas_audit_logs"] });
    } catch (err) {
      console.error(err);
      toast.error(getFriendlyErrorMessage(err) || "Failed to apply override", { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevokeOverride = async (fKey: string) => {
    if (!selectedBrandId) return;
    const toastId = toast.loading(isAr ? "جاري إلغاء الاستثناء..." : "Revoking override...");

    try {
      await removeBrandEntitlementOverride({
        data: {
          brandId: selectedBrandId,
          featureKey: fKey,
        },
      });
      toast.success(isAr ? "تم إلغاء الاستثناء بنجاح!" : "Override revoked!", { id: toastId });
      void queryClient.invalidateQueries({ queryKey: ["brand_overrides_view", selectedBrandId] });
      void queryClient.invalidateQueries({ queryKey: ["super_saas_audit_logs"] });
    } catch (err) {
      console.error(err);
      toast.error(getFriendlyErrorMessage(err) || "Failed to revoke override", { id: toastId });
    }
  };

  return (
    <div className="space-y-8">
      {/* 1. Custom Brand Overrides Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1 border border-border bg-card shadow-sm rounded-2xl">
          <CardHeader className="pb-3 border-b border-border/50">
            <CardTitle className="text-base font-bold text-foreground flex items-center gap-2">
              <ShieldAlert className="h-4.5 w-4.5 text-primary" />
              <span>{isAr ? "منح استثناء خاص بمتجر" : "Grant Custom Override"}</span>
            </CardTitle>
            <CardDescription className="text-xs">
              {isAr
                ? "تجاوز يدوي لحدود الخطة أو تفعيل ميزة لمتجر محدد مع توثيق السبب وفترة الصلاحية."
                : "Manual bypass of plan limits or feature unlocks for a specific merchant."}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <form onSubmit={handleApplyOverride} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-foreground">
                  {isAr ? "اختر المتجر" : "Target Store"}
                </Label>
                <Select value={selectedBrandId} onValueChange={setSelectedBrandId}>
                  <SelectTrigger className="text-xs min-h-[44px]">
                    <SelectValue placeholder={isAr ? "اختر المتجر..." : "Select store..."} />
                  </SelectTrigger>
                  <SelectContent className="max-h-[250px]">
                    {(brandsList || []).map((b) => (
                      <SelectItem key={b.id} value={b.id} className="text-xs">
                        {isAr ? b.name_ar || b.name_en : b.name_en} ({b.slug})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-foreground">
                  {isAr ? "الميزة المراد تعديلها" : "Feature to Override"}
                </Label>
                <Select value={featureKey} onValueChange={setFeatureKey}>
                  <SelectTrigger className="text-xs min-h-[44px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-[250px]">
                    {(plansData?.features || []).map((f) => (
                      <SelectItem key={f.key} value={f.key} className="text-xs">
                        {isAr ? f.name_ar : f.name_en} ({f.key})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-foreground">
                  {isAr ? "نوع التجاوز" : "Override Type"}
                </Label>
                <Select
                  value={overrideType}
                  onValueChange={(val: any) => setOverrideType(val)}
                >
                  <SelectTrigger className="text-xs min-h-[44px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="set_limit">{isAr ? "تعيين حد رقمي محدد" : "Set Exact Limit"}</SelectItem>
                    <SelectItem value="increment_limit">{isAr ? "إضافة سعة إضافية فوق الخطة" : "Increment Limit (+Amount)"}</SelectItem>
                    <SelectItem value="set_boolean">{isAr ? "تفعيل أو تعطيل الميزة" : "Set Boolean Enable/Disable"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {overrideType === "set_boolean" ? (
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-foreground">
                    {isAr ? "الحالة المطلوبة" : "Desired State"}
                  </Label>
                  <Select
                    value={booleanValue ? "true" : "false"}
                    onValueChange={(v) => setBooleanValue(v === "true")}
                  >
                    <SelectTrigger className="text-xs min-h-[44px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">{isAr ? "مفعل (Enabled)" : "Enabled"}</SelectItem>
                      <SelectItem value="false">{isAr ? "معطل (Disabled)" : "Disabled"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-foreground">
                    {isAr ? "القيمة الرقمية (-1 غير محدود)" : "Numeric Value (-1 for unlimited)"}
                  </Label>
                  <Input
                    type="number"
                    min="-1"
                    value={numericValue}
                    onChange={(e) => setNumericValue(parseInt(e.target.value, 10) || 0)}
                    className="font-mono text-xs min-h-[44px]"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-foreground">
                  {isAr ? "سبب منح الاستثناء (إلزامي للتدقيق)" : "Reason for Override (Audit Log)"}
                </Label>
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={isAr ? "مثال: اتفاقية شراكة خاصة / تعويض فني" : "e.g., Special enterprise agreement"}
                  className="text-xs min-h-[44px]"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-foreground">
                  {isAr ? "تاريخ الانتهاء (اختياري)" : "Expires At (Optional)"}
                </Label>
                <Input
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="text-xs min-h-[44px]"
                />
              </div>

              <Button
                type="submit"
                disabled={isSubmitting || !selectedBrandId || !reason.trim()}
                className="w-full gap-2 font-bold min-h-[44px]"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                <span>{isAr ? "تطبيق الاستثناء الآن" : "Apply Override"}</span>
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Active Overrides for Selected Brand Table */}
        <Card className="lg:col-span-2 border border-border bg-card shadow-sm rounded-2xl">
          <CardHeader className="pb-3 border-b border-border/50">
            <CardTitle className="text-base font-bold text-foreground flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4.5 w-4.5 text-amber-500" />
                <span>{isAr ? "الاستثناءات الحالية للمتجر المختار" : "Active Store Overrides"}</span>
              </div>
              {selectedBrandId && (
                <Badge variant="outline" className="font-mono text-xs">
                  {brandOverrides?.length || 0} {isAr ? "استثناء" : "Overrides"}
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="text-xs">
              {isAr
                ? "قائمة بالاستثناءات المطبقة حالياً على المتجر والتي تتجاوز إعدادات الخطة العامة."
                : "Active custom grants that override base plan quotas for the selected store."}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {!selectedBrandId ? (
              <div className="p-12 text-center text-muted-foreground text-xs">
                {isAr ? "يرجى اختيار متجر من القائمة لعرض الاستثناءات المطبقة عليه." : "Select a store to view and manage its active overrides."}
              </div>
            ) : overridesLoading ? (
              <div className="p-12 flex justify-center text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : !brandOverrides || brandOverrides.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground text-xs space-y-2">
                <Check className="h-8 w-8 text-emerald-500 mx-auto" />
                <p className="font-bold text-foreground">
                  {isAr ? "لا توجد استثناءات خاصة لهذا المتجر" : "No custom overrides active for this store"}
                </p>
                <p className="text-[11px]">
                  {isAr ? "يخضع المتجر لحدود ومزايا باقته الأساسية فقط." : "Store operates strictly within standard plan quotas."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/40 text-muted-foreground border-b border-border/50">
                      <th className="p-3 text-left font-bold">{isAr ? "الميزة" : "Feature"}</th>
                      <th className="p-3 text-left font-bold">{isAr ? "نوع التجاوز" : "Type"}</th>
                      <th className="p-3 text-left font-bold">{isAr ? "القيمة الممنوحة" : "Granted Value"}</th>
                      <th className="p-3 text-left font-bold">{isAr ? "السبب" : "Reason"}</th>
                      <th className="p-3 text-center font-bold">{isAr ? "إجراء" : "Action"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {brandOverrides.map((ov) => (
                      <tr key={ov.id} className="border-b border-border/40 hover:bg-muted/20">
                        <td className="p-3 font-mono font-bold text-foreground">{ov.feature_key}</td>
                        <td className="p-3">
                          <Badge variant="outline" className="text-[10px]">
                            {ov.override_type}
                          </Badge>
                        </td>
                        <td className="p-3 font-mono font-bold">
                          {ov.override_type === "set_boolean"
                            ? ov.boolean_value
                              ? "TRUE"
                              : "FALSE"
                            : ov.numeric_value === -1
                              ? "UNLIMITED"
                              : ov.numeric_value}
                        </td>
                        <td className="p-3 text-muted-foreground text-[11px] max-w-[180px] truncate">
                          {ov.reason}
                        </td>
                        <td className="p-3 text-center">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRevokeOverride(ov.feature_key)}
                            className="h-8 w-8 text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 2. Full SaaS Audit Trail Log */}
      <Card className="border border-border bg-card shadow-sm rounded-2xl">
        <CardHeader className="pb-3 border-b border-border/50">
          <CardTitle className="text-base font-bold text-foreground flex items-center gap-2">
            <FileText className="h-4.5 w-4.5 text-primary" />
            <span>{isAr ? "سجل تدقيق تغييرات الاشتراكات والخطط (Audit Log)" : "SaaS Billing & Plans Audit Trail"}</span>
          </CardTitle>
          <CardDescription className="text-xs">
            {isAr
              ? "سجل غير قابل للتعديل يوثق كل عمليات إنشاء الإصدارات، منح الاستثناءات، وترقيات وإلغاءات المتاجر."
              : "Immutable audit trail of all plan modifications, custom overrides, and subscription transitions."}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {logsLoading ? (
            <div className="p-12 flex justify-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : !auditLogs || auditLogs.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-xs">
              {isAr ? "لا توجد سجلات تدقيق سابقة." : "No audit records found."}
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[350px]">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/40 text-muted-foreground border-b border-border/50 sticky top-0 bg-background">
                    <th className="p-3 text-left font-bold">{isAr ? "التاريخ والوقت" : "Timestamp"}</th>
                    <th className="p-3 text-left font-bold">{isAr ? "المنفذ" : "Actor"}</th>
                    <th className="p-3 text-left font-bold">{isAr ? "نوع الحدث" : "Action"}</th>
                    <th className="p-3 text-left font-bold">{isAr ? "الهدف" : "Target"}</th>
                    <th className="p-3 text-left font-bold">{isAr ? "تفاصيل التغيير" : "Payload / Changes"}</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log: any) => (
                    <tr key={log.id} className="border-b border-border/40 hover:bg-muted/20">
                      <td className="p-3 text-muted-foreground font-mono text-[11px] whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td className="p-3 text-foreground font-semibold flex items-center gap-1">
                        <User className="h-3 w-3 text-muted-foreground" />
                        <span>{log.actor_email || "System"}</span>
                      </td>
                      <td className="p-3">
                        <Badge variant="outline" className="font-mono text-[10px] bg-primary/10 text-primary">
                          {log.action}
                        </Badge>
                      </td>
                      <td className="p-3 font-mono text-[11px] text-muted-foreground">
                        {log.target_type}: {log.target_id.slice(0, 12)}...
                      </td>
                      <td className="p-3 font-mono text-[10px] text-muted-foreground max-w-[280px] truncate">
                        {JSON.stringify(log.changes)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
