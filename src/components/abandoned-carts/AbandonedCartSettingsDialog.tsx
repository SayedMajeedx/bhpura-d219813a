import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ShoppingCart, MessageSquare, Mail, Bell, Shield, Loader2, Sparkles } from "lucide-react";
import type { BrandAbandonedCartSettings } from "@/lib/abandoned-carts.types";

interface AbandonedCartSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId: string;
  initialSettings?: BrandAbandonedCartSettings | null;
}

export function AbandonedCartSettingsDialog({
  open,
  onOpenChange,
  brandId,
  initialSettings,
}: AbandonedCartSettingsDialogProps) {
  const { lang, t } = useI18n();
  const isAr = lang === "ar";
  const queryClient = useQueryClient();

  const [form, setForm] = useState<Partial<BrandAbandonedCartSettings>>({
    is_enabled: true,
    abandonment_threshold_minutes: 30,
    max_recovery_messages: 3,
    cooldown_hours_between_messages: 12,
    enable_whatsapp: true,
    enable_email: true,
    enable_push: false,
    default_discount_type: "percentage",
    default_discount_value: 10,
    discount_expiry_hours: 48,
  });

  useEffect(() => {
    if (initialSettings) {
      setForm(initialSettings);
    }
  }, [initialSettings]);

  const saveMutation = useMutation({
    mutationFn: async (updated: Partial<BrandAbandonedCartSettings>) => {
      const { error } = await (supabase as any)
        .from("brand_abandoned_cart_settings")
        .upsert(
          {
            brand_id: brandId,
            ...updated,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "brand_id" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(
        isAr ? "تم حفظ إعدادات السلات المتروكة بنجاح" : "Abandoned cart settings saved successfully",
      );
      queryClient.invalidateQueries({ queryKey: ["brand_abandoned_cart_settings", brandId] });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast.error(err.message || (isAr ? "حدث خطأ أثناء الحفظ" : "Failed to save settings"));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(form);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-xl">
            <ShoppingCart className="h-5 w-5 text-primary" />
            {isAr ? "إعدادات استعادة السلات المتروكة" : "Abandoned Cart Settings"}
          </DialogTitle>
          <DialogDescription>
            {isAr
              ? "تحديد معايير اعتبار السلة متروكة، القنوات المعتمدة، وضوابط الخصومات التلقائية."
              : "Define abandonment thresholds, enabled channels, and automated incentive limits."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 pt-2">
          {/* Main Toggle */}
          <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-card">
            <div className="space-y-0.5">
              <Label className="text-base font-semibold">
                {isAr ? "تفعيل نظام استعادة السلات المتروكة" : "Enable Cart Recovery"}
              </Label>
              <p className="text-xs text-muted-foreground">
                {isAr
                  ? "تتبع السلات غير المكتملة وإرسال التذكيرات الذكية"
                  : "Track incomplete carts and send smart follow-ups"}
              </p>
            </div>
            <Switch
              checked={form.is_enabled ?? true}
              onCheckedChange={(c) => setForm((prev) => ({ ...prev, is_enabled: c }))}
            />
          </div>

          {/* Timing & Safeguards */}
          <Card className="p-4 space-y-4 border-border">
            <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground">
              <Shield className="h-4 w-4 text-primary" />
              {isAr ? "التوقيت وفترات التهدئة (Anti-Spam)" : "Timing & Anti-Spam Safeguards"}
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="threshold">
                  {isAr ? "اعتبار السلة متروكة بعد (دقيقة)" : "Abandonment (Minutes)"}
                </Label>
                <Input
                  id="threshold"
                  type="number"
                  min="5"
                  value={form.abandonment_threshold_minutes ?? 30}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      abandonment_threshold_minutes: Number(e.target.value) || 5,
                    }))
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="max_msg">
                  {isAr ? "أقصى عدد رسائل للسلة" : "Max Follow-ups per Cart"}
                </Label>
                <Input
                  id="max_msg"
                  type="number"
                  min="1"
                  max="5"
                  value={form.max_recovery_messages ?? 3}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      max_recovery_messages: Number(e.target.value) || 1,
                    }))
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cooldown">
                  {isAr ? "فترة التهدئة بين الرسائل (ساعة)" : "Cooldown (Hours)"}
                </Label>
                <Input
                  id="cooldown"
                  type="number"
                  min="1"
                  value={form.cooldown_hours_between_messages ?? 12}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      cooldown_hours_between_messages: Number(e.target.value) || 1,
                    }))
                  }
                />
              </div>
            </div>
          </Card>

          {/* Enabled Channels */}
          <Card className="p-4 space-y-3 border-border">
            <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground">
              <MessageSquare className="h-4 w-4 text-primary" />
              {isAr ? "قنوات الإرسال المسموحة" : "Permitted Dispatch Channels"}
            </h3>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-emerald-500" />
                  <Label className="font-normal">{isAr ? "تفعيل واتساب (WhatsApp)" : "WhatsApp Recovery"}</Label>
                </div>
                <Switch
                  checked={form.enable_whatsapp ?? true}
                  onCheckedChange={(c) => setForm((prev) => ({ ...prev, enable_whatsapp: c }))}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-sky-500" />
                  <Label className="font-normal">{isAr ? "تفعيل البريد الإلكتروني (Email)" : "Email Recovery"}</Label>
                </div>
                <Switch
                  checked={form.enable_email ?? true}
                  onCheckedChange={(c) => setForm((prev) => ({ ...prev, enable_email: c }))}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-purple-500" />
                  <Label className="font-normal">{isAr ? "تفعيل إشعارات الويب / الموبايل (Push)" : "Push Notifications"}</Label>
                </div>
                <Switch
                  checked={form.enable_push ?? false}
                  onCheckedChange={(c) => setForm((prev) => ({ ...prev, enable_push: c }))}
                />
              </div>
            </div>
          </Card>

          {/* Default Incentive Discounts */}
          <Card className="p-4 space-y-4 border-border">
            <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground">
              <Sparkles className="h-4 w-4 text-primary" />
              {isAr ? "حوافز الخصم المخصصة (Unique Discount Coupons)" : "Unique Recovery Discount"}
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>{isAr ? "نوع الخصم الافتراضي" : "Discount Type"}</Label>
                <Select
                  value={form.default_discount_type ?? "percentage"}
                  onValueChange={(v: any) =>
                    setForm((prev) => ({ ...prev, default_discount_type: v }))
                  }
                >
                  <SelectTrigger className="min-h-[44px] bg-background border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">{isAr ? "نسبة مئوية (%)" : "Percentage (%)"}</SelectItem>
                    <SelectItem value="fixed">{isAr ? "مبلغ ثابت (د.ب)" : "Fixed Amount (BHD)"}</SelectItem>
                    <SelectItem value="none">{isAr ? "بدون خصم" : "No Discount"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="disc_val">{isAr ? "قيمة الخصم" : "Discount Value"}</Label>
                <Input
                  id="disc_val"
                  type="number"
                  min="0"
                  step="0.5"
                  value={form.default_discount_value ?? 10}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      default_discount_value: Number(e.target.value) || 0,
                    }))
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="exp_hrs">
                  {isAr ? "مدة صلاحية الكود (ساعة)" : "Coupon Validity (Hours)"}
                </Label>
                <Input
                  id="exp_hrs"
                  type="number"
                  min="1"
                  value={form.discount_expiry_hours ?? 48}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      discount_expiry_hours: Number(e.target.value) || 24,
                    }))
                  }
                />
              </div>
            </div>
          </Card>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="min-h-[44px]"
            >
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              type="submit"
              disabled={saveMutation.isPending}
              className="min-h-[44px] bg-primary text-primary-foreground"
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isAr ? (
                "حفظ الإعدادات"
              ) : (
                "Save Settings"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
