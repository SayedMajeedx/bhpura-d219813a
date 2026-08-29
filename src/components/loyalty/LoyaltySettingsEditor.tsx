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
import { toast } from "sonner";
import { Loader2, Coins, ShieldCheck, Gift, Clock } from "lucide-react";
import type { BrandLoyaltyProgram } from "@/lib/loyalty.types";

interface LoyaltySettingsEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId: string;
  initialSettings?: BrandLoyaltyProgram | null;
}

export function LoyaltySettingsEditor({
  open,
  onOpenChange,
  brandId,
  initialSettings,
}: LoyaltySettingsEditorProps) {
  const { lang, t } = useI18n();
  const isAr = lang === "ar";
  const queryClient = useQueryClient();

  const [form, setForm] = useState<Partial<BrandLoyaltyProgram>>({
    is_enabled: true,
    points_per_currency_unit: 10,
    redemption_rate: 0.010,
    min_points_to_redeem: 100,
    max_redemption_percentage: 50,
    points_expiry_days: 365,
    holding_period_days: 14,
    include_shipping: false,
    include_tax: false,
    include_discounted_items: false,
    first_order_bonus_points: 50,
    review_bonus_points: 25,
    referral_bonus_points: 100,
    welcome_bonus_points: 20,
    tier_multipliers_enabled: true,
  });

  useEffect(() => {
    if (initialSettings) {
      setForm(initialSettings);
    }
  }, [initialSettings]);

  const saveMutation = useMutation({
    mutationFn: async (updated: Partial<BrandLoyaltyProgram>) => {
      const { error } = await (supabase as any)
        .from("brand_loyalty_programs")
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
        isAr ? "تم حفظ إعدادات برنامج الولاء بنجاح" : "Loyalty program settings saved successfully",
      );
      queryClient.invalidateQueries({ queryKey: ["brand_loyalty_program", brandId] });
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
            <Coins className="h-5 w-5 text-primary" />
            {isAr ? "إعدادات برنامج الولاء والمكافآت" : "Loyalty Program Settings"}
          </DialogTitle>
          <DialogDescription>
            {isAr
              ? "تخصيص قواعد كسب واسترداد النقاط، فترات الانتظار، واستثناءات الضريبة والشحن."
              : "Configure earning and redemption rules, holding periods, and spend inclusions."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 pt-2">
          {/* Main Program Toggle */}
          <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-card">
            <div className="space-y-0.5">
              <Label className="text-base font-semibold">
                {isAr ? "تفعيل برنامج الولاء" : "Enable Loyalty Program"}
              </Label>
              <p className="text-xs text-muted-foreground">
                {isAr
                  ? "السماح للعملاء بكسب واستخدام النقاط في المتجر"
                  : "Allow customers to earn and redeem reward points"}
              </p>
            </div>
            <Switch
              checked={form.is_enabled ?? true}
              onCheckedChange={(checked) => setForm((prev) => ({ ...prev, is_enabled: checked }))}
            />
          </div>

          {/* Earning & Redemption Rates */}
          <Card className="p-4 space-y-4 border-border">
            <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground">
              <Coins className="h-4 w-4 text-primary" />
              {isAr ? "معدلات الكسب والاسترداد" : "Earning & Redemption Rates"}
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="points_per_bhd">
                  {isAr ? "النقاط المكتسبة لكل 1 د.ب" : "Points per 1 BHD spend"}
                </Label>
                <Input
                  id="points_per_bhd"
                  type="number"
                  min="1"
                  step="1"
                  value={form.points_per_currency_unit ?? 10}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      points_per_currency_unit: Number(e.target.value) || 1,
                    }))
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="redemption_rate">
                  {isAr ? "قيمة النقطة بالدينار (د.ب)" : "Point value in BHD"}
                </Label>
                <Input
                  id="redemption_rate"
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={form.redemption_rate ?? 0.010}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      redemption_rate: Number(e.target.value) || 0.010,
                    }))
                  }
                />
                <span className="text-[11px] text-muted-foreground block">
                  {isAr
                    ? `(100 نقطة = ${((form.redemption_rate ?? 0.010) * 100).toFixed(3)} د.ب)`
                    : `(100 pts = ${((form.redemption_rate ?? 0.010) * 100).toFixed(3)} BHD)`}
                </span>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="min_points">
                  {isAr ? "الحد الأدنى للنقاط للاستخدام" : "Minimum points to redeem"}
                </Label>
                <Input
                  id="min_points"
                  type="number"
                  min="0"
                  step="10"
                  value={form.min_points_to_redeem ?? 100}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      min_points_to_redeem: Number(e.target.value) || 0,
                    }))
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="max_pct">
                  {isAr ? "أقصى نسبة خصم من السلة (%)" : "Max discount percentage (%)"}
                </Label>
                <Input
                  id="max_pct"
                  type="number"
                  min="1"
                  max="100"
                  value={form.max_redemption_percentage ?? 50}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      max_redemption_percentage: Number(e.target.value) || 50,
                    }))
                  }
                />
              </div>
            </div>
          </Card>

          {/* Holding & Expiration */}
          <Card className="p-4 space-y-4 border-border">
            <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground">
              <Clock className="h-4 w-4 text-primary" />
              {isAr ? "فترات الانتظار والصلاحية" : "Holding & Expiration Periods"}
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="holding_days">
                  {isAr ? "فترة تعليق النقاط (أيام بعد الطلب)" : "Points Holding Period (Days)"}
                </Label>
                <Input
                  id="holding_days"
                  type="number"
                  min="0"
                  value={form.holding_period_days ?? 14}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      holding_period_days: Number(e.target.value) || 0,
                    }))
                  }
                />
                <span className="text-[11px] text-muted-foreground block">
                  {isAr
                    ? "تظل النقاط معلقة حتى تنتهي مهلة المرتجع المسموحة"
                    : "Points stay pending until the return window elapses"}
                </span>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="expiry_days">
                  {isAr ? "مدة صلاحية النقاط (أيام - 0 = لا تنتهي)" : "Points Expiration (Days - 0 = never)"}
                </Label>
                <Input
                  id="expiry_days"
                  type="number"
                  min="0"
                  value={form.points_expiry_days ?? 365}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      points_expiry_days: Number(e.target.value) || 0,
                    }))
                  }
                />
              </div>
            </div>
          </Card>

          {/* Spend Inclusions / Exclusions */}
          <Card className="p-4 space-y-3 border-border">
            <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" />
              {isAr ? "استثناءات وقواعد الحساب" : "Calculation Exclusions & Rules"}
            </h3>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="font-normal">
                    {isAr ? "احتساب رسوم الشحن في كسب النقاط" : "Include shipping in points calculation"}
                  </Label>
                </div>
                <Switch
                  checked={form.include_shipping ?? false}
                  onCheckedChange={(c) => setForm((prev) => ({ ...prev, include_shipping: c }))}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="font-normal">
                    {isAr ? "احتساب الضريبة (VAT) في كسب النقاط" : "Include tax (VAT) in points calculation"}
                  </Label>
                </div>
                <Switch
                  checked={form.include_tax ?? false}
                  onCheckedChange={(c) => setForm((prev) => ({ ...prev, include_tax: c }))}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="font-normal">
                    {isAr ? "كسب نقاط على المنتجات المخفضة/العروض" : "Include discounted/sale items"}
                  </Label>
                </div>
                <Switch
                  checked={form.include_discounted_items ?? false}
                  onCheckedChange={(c) => setForm((prev) => ({ ...prev, include_discounted_items: c }))}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="font-normal">
                    {isAr ? "تفعيل مضاعفات مستويات العضوية (Tier Multipliers)" : "Enable VIP Tier Multipliers"}
                  </Label>
                </div>
                <Switch
                  checked={form.tier_multipliers_enabled ?? true}
                  onCheckedChange={(c) => setForm((prev) => ({ ...prev, tier_multipliers_enabled: c }))}
                />
              </div>
            </div>
          </Card>

          {/* Bonus Points Triggers */}
          <Card className="p-4 space-y-4 border-border">
            <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground">
              <Gift className="h-4 w-4 text-primary" />
              {isAr ? "مكافآت وحوافز إضافية (Bonus Triggers)" : "Bonus Points Triggers"}
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="first_order_bonus">
                  {isAr ? "مكافأة أول طلب للعميل" : "First Order Bonus Points"}
                </Label>
                <Input
                  id="first_order_bonus"
                  type="number"
                  min="0"
                  value={form.first_order_bonus_points ?? 50}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      first_order_bonus_points: Number(e.target.value) || 0,
                    }))
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="review_bonus">
                  {isAr ? "مكافأة تقييم المنتجات" : "Product Review Bonus Points"}
                </Label>
                <Input
                  id="review_bonus"
                  type="number"
                  min="0"
                  value={form.review_bonus_points ?? 25}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      review_bonus_points: Number(e.target.value) || 0,
                    }))
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="welcome_bonus">
                  {isAr ? "مكافأة التسجيل والترحيب" : "Welcome / Sign-up Bonus Points"}
                </Label>
                <Input
                  id="welcome_bonus"
                  type="number"
                  min="0"
                  value={form.welcome_bonus_points ?? 20}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      welcome_bonus_points: Number(e.target.value) || 0,
                    }))
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="referral_bonus">
                  {isAr ? "مكافأة إحالة صديق" : "Referral Bonus Points"}
                </Label>
                <Input
                  id="referral_bonus"
                  type="number"
                  min="0"
                  value={form.referral_bonus_points ?? 100}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      referral_bonus_points: Number(e.target.value) || 0,
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
                "حفظ التغييرات"
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
