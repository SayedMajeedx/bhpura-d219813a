import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { toast } from "sonner";
import { Award, Sparkles, Check, Edit2, Shield, Truck, Percent, Loader2 } from "lucide-react";
import type { LoyaltyTier, LoyaltyTierKey } from "@/lib/loyalty.types";
import { DEFAULT_LOYALTY_TIERS } from "@/lib/loyalty.types";

interface LoyaltyTiersManagerProps {
  brandId: string;
  tiers: LoyaltyTier[];
}

export function LoyaltyTiersManager({ brandId, tiers }: LoyaltyTiersManagerProps) {
  const { lang, t } = useI18n();
  const isAr = lang === "ar";
  const queryClient = useQueryClient();

  const [editingTier, setEditingTier] = useState<LoyaltyTier | null>(null);

  // Initialize missing tiers if needed
  const initTiersMutation = useMutation({
    mutationFn: async () => {
      const inserts = DEFAULT_LOYALTY_TIERS.map((tier) => ({
        brand_id: brandId,
        ...tier,
      }));
      const { error } = await (supabase as any)
        .from("brand_loyalty_tiers")
        .upsert(inserts, { onConflict: "brand_id,tier_key" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(isAr ? "تم إعداد المستويات الافتراضية بنجاح" : "Default tiers initialized");
      queryClient.invalidateQueries({ queryKey: ["brand_loyalty_tiers", brandId] });
    },
    onError: (err: any) => {
      toast.error(err.message || (isAr ? "فشل تهيئة المستويات" : "Failed to initialize tiers"));
    },
  });

  const saveTierMutation = useMutation({
    mutationFn: async (tier: LoyaltyTier) => {
      const { error } = await (supabase as any)
        .from("brand_loyalty_tiers")
        .upsert(
          {
            ...tier,
            brand_id: brandId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "brand_id,tier_key" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(isAr ? "تم تحديث المستوى بنجاح" : "Tier updated successfully");
      queryClient.invalidateQueries({ queryKey: ["brand_loyalty_tiers", brandId] });
      setEditingTier(null);
    },
    onError: (err: any) => {
      toast.error(err.message || (isAr ? "حدث خطأ أثناء التحديث" : "Failed to update tier"));
    },
  });

  const displayTiers = tiers.length > 0 ? tiers : (DEFAULT_LOYALTY_TIERS as any[]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold font-display text-foreground flex items-center gap-2">
            <Award className="h-5 w-5 text-primary" />
            {isAr ? "مستويات العضوية والمكافآت (VIP Tiers)" : "VIP Membership Tiers"}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isAr
              ? "ترقية العملاء تلقائياً بناءً على إجمالي الإنفاق ومضاعفة نقاطهم وتقديم مزايا حصرية."
              : "Automatically graduate customers based on spend thresholds with point multipliers and perks."}
          </p>
        </div>

        {tiers.length === 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => initTiersMutation.mutate()}
            disabled={initTiersMutation.isPending}
            className="min-h-[44px] gap-2 border-border"
          >
            <Sparkles className="h-4 w-4 text-primary" />
            {isAr ? "تهيئة المستويات الافتراضية" : "Initialize Default Tiers"}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {displayTiers.map((tier: LoyaltyTier) => {
          return (
            <Card
              key={tier.tier_key}
              className="p-5 border-border bg-card flex flex-col justify-between relative overflow-hidden transition-all hover:border-primary/50 shadow-xs"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border"
                    style={{
                      borderColor: tier.badge_color || "var(--border)",
                      color: tier.badge_color || "var(--foreground)",
                      backgroundColor: `${tier.badge_color || "#64748b"}15`,
                    }}
                  >
                    <Award className="w-3.5 h-3.5" />
                    {isAr ? tier.name_ar : tier.name_en}
                  </span>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setEditingTier(tier)}
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* Requirements */}
                <div className="space-y-1">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                    {isAr ? "شروط التأهل" : "Qualification"}
                  </span>
                  <div className="text-sm font-bold text-foreground">
                    {Number(tier.min_spend) > 0 ? (
                      <span>
                        {tier.min_spend} {isAr ? "د.ب إنفاق" : "BHD spend"}
                      </span>
                    ) : (
                      <span>{isAr ? "بدون حد أدنى (مستوى البداية)" : "No minimum (Default tier)"}</span>
                    )}
                  </div>
                </div>

                {/* Multiplier & Discount */}
                <div className="grid grid-cols-2 gap-2 py-2 border-y border-border/60">
                  <div>
                    <span className="text-[10px] text-muted-foreground block">
                      {isAr ? "مضاعف النقاط" : "Multiplier"}
                    </span>
                    <span className="text-base font-extrabold text-primary">
                      {tier.points_multiplier}x
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block">
                      {isAr ? "خصم حصري" : "Perk Discount"}
                    </span>
                    <span className="text-base font-extrabold text-foreground">
                      {tier.discount_percent}%
                    </span>
                  </div>
                </div>

                {/* Perks list */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                    {isAr ? "المزايا الممنوحة" : "Perks & Benefits"}
                  </span>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {tier.free_shipping && (
                      <li className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                        <Truck className="h-3.5 w-3.5" />
                        <span>{isAr ? "شحن مجاني على الطلبات" : "Free shipping included"}</span>
                      </li>
                    )}
                    {(isAr ? tier.perks_ar : tier.perks_en)?.map((perk: string, idx: number) => (
                      <li key={idx} className="flex items-center gap-1.5">
                        <Check className="h-3 w-3 text-primary shrink-0" />
                        <span className="truncate">{perk}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-border/40">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingTier(tier)}
                  className="w-full min-h-[44px] text-xs border-border"
                >
                  {isAr ? "تعديل مزايا المستوى" : "Edit Tier Rules"}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Edit Tier Dialog */}
      {editingTier && (
        <Dialog open={!!editingTier} onOpenChange={(open) => !open && setEditingTier(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 font-display">
                <Award className="h-5 w-5 text-primary" />
                {isAr ? `تعديل ${editingTier.name_ar}` : `Edit ${editingTier.name_en}`}
              </DialogTitle>
              <DialogDescription>
                {isAr
                  ? "تعديل مسميات المستوى، حد الإنفاق، مضاعف النقاط والخصومات الإضافية."
                  : "Customize tier names, qualification spend, multipliers, and discounts."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{isAr ? "الاسم بالعربية" : "Name (Arabic)"}</Label>
                  <Input
                    value={editingTier.name_ar}
                    onChange={(e) =>
                      setEditingTier({ ...editingTier, name_ar: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{isAr ? "الاسم بالإنجليزية" : "Name (English)"}</Label>
                  <Input
                    value={editingTier.name_en}
                    onChange={(e) =>
                      setEditingTier({ ...editingTier, name_en: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{isAr ? "الحد الأدنى للإنفاق (د.ب)" : "Min Spend (BHD)"}</Label>
                  <Input
                    type="number"
                    min="0"
                    step="5"
                    value={editingTier.min_spend}
                    onChange={(e) =>
                      setEditingTier({
                        ...editingTier,
                        min_spend: Number(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{isAr ? "مضاعف كسب النقاط" : "Points Multiplier"}</Label>
                  <Input
                    type="number"
                    min="1.0"
                    step="0.05"
                    value={editingTier.points_multiplier}
                    onChange={(e) =>
                      setEditingTier({
                        ...editingTier,
                        points_multiplier: Number(e.target.value) || 1.0,
                      })
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{isAr ? "خصم حصري (%)" : "Exclusive Discount (%)"}</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={editingTier.discount_percent}
                    onChange={(e) =>
                      setEditingTier({
                        ...editingTier,
                        discount_percent: Number(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{isAr ? "رمز لون الشارة" : "Badge Color"}</Label>
                  <Input
                    type="text"
                    value={editingTier.badge_color}
                    onChange={(e) =>
                      setEditingTier({ ...editingTier, badge_color: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl border border-border">
                <div className="space-y-0.5">
                  <Label>{isAr ? "شحن مجاني دائم لأعضاء هذا المستوى" : "Free Shipping Perk"}</Label>
                  <p className="text-xs text-muted-foreground">
                    {isAr
                      ? "إعفاء أعضاء هذا المستوى من رسوم التوصيل عند الطلب"
                      : "Waive shipping fees on checkout for members of this tier"}
                  </p>
                </div>
                <Switch
                  checked={editingTier.free_shipping}
                  onCheckedChange={(c) =>
                    setEditingTier({ ...editingTier, free_shipping: c })
                  }
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => setEditingTier(null)}
                className="min-h-[44px]"
              >
                {isAr ? "إلغاء" : "Cancel"}
              </Button>
              <Button
                onClick={() => saveTierMutation.mutate(editingTier)}
                disabled={saveTierMutation.isPending}
                className="min-h-[44px] bg-primary text-primary-foreground"
              >
                {saveTierMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isAr ? (
                  "حفظ التغييرات"
                ) : (
                  "Save Tier"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
