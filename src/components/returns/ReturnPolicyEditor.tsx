import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sliders,
  Shield,
  Save,
  Loader2,
  Clock,
  Truck,
  FileText,
  BadgePercent,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import type { BrandReturnPolicy, CompensationMethod } from "@/lib/returns.types";

interface ReturnPolicyEditorProps {
  brandId: string;
  lang: "en" | "ar";
}

export function ReturnPolicyEditor({ brandId, lang }: ReturnPolicyEditorProps) {
  const isAr = lang === "ar";
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const { data: policy, isLoading } = useQuery<BrandReturnPolicy>({
    queryKey: ["brand-return-policy", brandId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("brand_return_policies")
        .select("*")
        .eq("brand_id", brandId)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        // Return default configuration
        return {
          id: "",
          brand_id: brandId,
          return_window_days: 14,
          allow_partial_returns: true,
          allow_discounted_items: true,
          excluded_category_ids: [],
          excluded_product_ids: [],
          return_shipping_fee: 0,
          customer_shipping_fee_borne_by: "customer",
          allowed_compensation_methods: ["refund_original", "store_credit", "exchange"],
          require_images: false,
          auto_approve_policy: false,
          policy_terms_ar: "يحق للعميل استرجاع أو استبدال المنتجات خلال 14 يوماً من تاريخ الاستلام بشرط أن تكون بحالتها الأصلية غير مستخدمة.",
          policy_terms_en: "Customers may return or exchange items within 14 days of delivery provided they are unused and in original condition.",
          notify_on_status_change: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as BrandReturnPolicy;
      }
      return data as BrandReturnPolicy;
    },
    enabled: !!brandId,
  });

  const [form, setForm] = useState<Partial<BrandReturnPolicy>>({});

  useEffect(() => {
    if (policy) {
      setForm(policy);
    }
  }, [policy]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        brand_id: brandId,
        return_window_days: Number(form.return_window_days ?? 14),
        allow_partial_returns: form.allow_partial_returns ?? true,
        allow_discounted_items: form.allow_discounted_items ?? true,
        return_shipping_fee: Number(form.return_shipping_fee ?? 0),
        customer_shipping_fee_borne_by: form.customer_shipping_fee_borne_by || "customer",
        allowed_compensation_methods: form.allowed_compensation_methods || [
          "refund_original",
          "store_credit",
          "exchange",
        ],
        require_images: form.require_images ?? false,
        auto_approve_policy: form.auto_approve_policy ?? false,
        policy_terms_ar: form.policy_terms_ar || null,
        policy_terms_en: form.policy_terms_en || null,
        notify_on_status_change: form.notify_on_status_change ?? true,
      };

      const { error } = await (supabase as any)
        .from("brand_return_policies")
        .upsert(payload, {
          onConflict: "brand_id",
        });

      if (error) throw error;

      toast.success(
        isAr ? "تم حفظ وتحديث سياسة الإرجاع بنجاح" : "Return policy updated successfully",
      );
      queryClient.invalidateQueries({ queryKey: ["brand-return-policy", brandId] });
    } catch (err: any) {
      toast.error(err.message || "Failed to save policy");
    } finally {
      setSaving(false);
    }
  };

  const toggleCompensationMethod = (method: CompensationMethod) => {
    const current = form.allowed_compensation_methods || [];
    const exists = current.includes(method);
    const updated = exists ? current.filter((m) => m !== method) : [...current, method];
    if (updated.length > 0) {
      setForm({ ...form, allowed_compensation_methods: updated });
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center text-muted-foreground flex items-center justify-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span>{isAr ? "جارِ تحميل إعدادات السياسة..." : "Loading policy settings..."}</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-xl border border-border bg-card shadow-2xs flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20">
            <Sliders className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground">
              {isAr ? "إعدادات وسياسات الإرجاع والاستبدال" : "Brand Return & Exchange Policy"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {isAr
                ? "تخصيص شروط الإرجاع، المهل الزمنية، الرسوم، والتعويضات المتاحة لعملائك"
                : "Configure return window, fees, customer compensation methods, and terms"}
            </p>
          </div>
        </div>

        <Button
          variant="default"
          size="sm"
          onClick={handleSave}
          disabled={saving}
          className="gap-1.5 h-9 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {isAr ? "حفظ التغييرات" : "Save Settings"}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Core Rules Card */}
        <div className="p-5 rounded-xl border border-border bg-card shadow-2xs space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-foreground pb-2 border-b border-border">
            <Clock className="h-4 w-4 text-primary" />
            <span>{isAr ? "المهلة الزمنية والشروط الأساسية" : "Time Window & Eligibility"}</span>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-foreground">
              {isAr ? "فترة السماح بالإرجاع (بالأيام)" : "Return Window (Days)"}
            </Label>
            <Input
              type="number"
              min={1}
              max={365}
              value={form.return_window_days ?? 14}
              onChange={(e) =>
                setForm({ ...form, return_window_days: parseInt(e.target.value, 10) || 14 })
              }
              className="h-9 text-xs font-mono max-w-[140px]"
            />
            <p className="text-[11px] text-muted-foreground">
              {isAr
                ? "الحد الأقصى للأيام المسموح بها للعميل لتقديم طلب إرجاع بعد استلام الطلب"
                : "Maximum days allowed from delivery for a customer to request a return"}
            </p>
          </div>

          <div className="flex items-center justify-between py-2 border-t border-border">
            <div>
              <Label className="text-xs font-semibold text-foreground block">
                {isAr ? "السماح بالمرتجع الجزئي" : "Allow Partial Returns"}
              </Label>
              <span className="text-[11px] text-muted-foreground">
                {isAr ? "إمكانية إرجاع بعض قطع الطلب دون إرجاع كامل الطلب" : "Allow returning specific items from an order"}
              </span>
            </div>
            <Switch
              checked={form.allow_partial_returns ?? true}
              onCheckedChange={(val) => setForm({ ...form, allow_partial_returns: val })}
            />
          </div>

          <div className="flex items-center justify-between py-2 border-t border-border">
            <div>
              <Label className="text-xs font-semibold text-foreground block">
                {isAr ? "السماح بإرجاع المنتجات المخفضة" : "Allow Discounted Items"}
              </Label>
              <span className="text-[11px] text-muted-foreground">
                {isAr ? "تمكين إرجاع المنتجات المشتراة بخصم أو عروض" : "Allow returns on promotional or sale items"}
              </span>
            </div>
            <Switch
              checked={form.allow_discounted_items ?? true}
              onCheckedChange={(val) => setForm({ ...form, allow_discounted_items: val })}
            />
          </div>

          <div className="flex items-center justify-between py-2 border-t border-border">
            <div>
              <Label className="text-xs font-semibold text-foreground block">
                {isAr ? "إلزام العميل بإرفاق صور" : "Require Customer Photos"}
              </Label>
              <span className="text-[11px] text-muted-foreground">
                {isAr ? "اشتراط رفع صور للمنتج عند تقديم الطلب" : "Require attaching photos when requesting return"}
              </span>
            </div>
            <Switch
              checked={form.require_images ?? false}
              onCheckedChange={(val) => setForm({ ...form, require_images: val })}
            />
          </div>
        </div>

        {/* Shipping & Compensation Card */}
        <div className="p-5 rounded-xl border border-border bg-card shadow-2xs space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-foreground pb-2 border-b border-border">
            <Truck className="h-4 w-4 text-primary" />
            <span>{isAr ? "الشحن وطرق التعويض" : "Shipping Fees & Compensation"}</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">
                {isAr ? "رسوم استرجاع الشحن (د.ب)" : "Return Shipping Fee (BHD)"}
              </Label>
              <Input
                type="number"
                step="0.001"
                min={0}
                value={form.return_shipping_fee ?? 0}
                onChange={(e) =>
                  setForm({ ...form, return_shipping_fee: parseFloat(e.target.value) || 0 })
                }
                className="h-9 text-xs font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">
                {isAr ? "من يتحمل رسوم الشحن؟" : "Shipping Borne By"}
              </Label>
              <Select
                value={form.customer_shipping_fee_borne_by || "customer"}
                onValueChange={(val: any) =>
                  setForm({ ...form, customer_shipping_fee_borne_by: val })
                }
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer" className="text-xs">
                    {isAr ? "العميل (تُستقطع من الاسترداد)" : "Customer (Deducted)"}
                  </SelectItem>
                  <SelectItem value="brand" className="text-xs">
                    {isAr ? "المتجر (مجاني للعميل)" : "Brand (Free Return)"}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-border">
            <Label className="text-xs font-semibold text-foreground">
              {isAr ? "طرق التعويض المتاحة للعملاء" : "Allowed Compensation Methods"}
            </Label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "refund_original" as CompensationMethod, labelAr: "استرداد مالي", labelEn: "Original Refund" },
                { id: "store_credit" as CompensationMethod, labelAr: "رصيد متجر", labelEn: "Store Credit" },
                { id: "exchange" as CompensationMethod, labelAr: "استبدال منتج", labelEn: "Exchange" },
              ].map((m) => {
                const isSelected = (form.allowed_compensation_methods || []).includes(m.id);
                return (
                  <Button
                    key={m.id}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => toggleCompensationMethod(m.id)}
                    className={
                      isSelected
                        ? "h-9 text-xs font-semibold bg-primary/10 border-primary/30 text-primary"
                        : "h-9 text-xs border-border text-muted-foreground"
                    }
                  >
                    {isAr ? m.labelAr : m.labelEn}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between py-2 border-t border-border">
            <div>
              <Label className="text-xs font-semibold text-foreground block">
                {isAr ? "إشعارات العملاء التلقائية" : "Automated Notifications"}
              </Label>
              <span className="text-[11px] text-muted-foreground">
                {isAr ? "إرسال تحديثات عند تغيير حالة الطلب" : "Send updates on return status change"}
              </span>
            </div>
            <Switch
              checked={form.notify_on_status_change ?? true}
              onCheckedChange={(val) => setForm({ ...form, notify_on_status_change: val })}
            />
          </div>
        </div>
      </div>

      {/* Policy Terms in Arabic & English */}
      <div className="p-5 rounded-xl border border-border bg-card shadow-2xs space-y-4">
        <div className="flex items-center gap-2 text-sm font-bold text-foreground pb-2 border-b border-border">
          <FileText className="h-4 w-4 text-primary" />
          <span>{isAr ? "نص سياسة الإرجاع المعروضة للعميل" : "Customer-Facing Return Terms"}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-foreground">
              {isAr ? "الشروط والأحكام (بالعربية)" : "Terms & Conditions (Arabic)"}
            </Label>
            <Textarea
              rows={4}
              value={form.policy_terms_ar || ""}
              onChange={(e) => setForm({ ...form, policy_terms_ar: e.target.value })}
              className="text-xs leading-relaxed"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-foreground">
              {isAr ? "الشروط والأحكام (بالإنجليزية)" : "Terms & Conditions (English)"}
            </Label>
            <Textarea
              rows={4}
              value={form.policy_terms_en || ""}
              onChange={(e) => setForm({ ...form, policy_terms_en: e.target.value })}
              className="text-xs leading-relaxed"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
