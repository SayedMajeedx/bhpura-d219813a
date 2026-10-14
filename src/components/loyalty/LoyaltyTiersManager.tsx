import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invalidateLoyalty, saveLoyaltyTiers } from "@/lib/data/loyalty";
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
import { Award, Sparkles, Edit2, Truck, Loader2 } from "lucide-react";
import type { LoyaltyTier } from "@/lib/loyalty.types";
import { starterLoyaltyTiers } from "@/lib/loyalty-program";
import { useAdminStoreProfile } from "@/hooks/use-store-profile";
import { useMoneyLabel, useStoreCurrency } from "@/hooks/use-store-currency";

interface LoyaltyTiersManagerProps {
  brandId: string;
  tiers: LoyaltyTier[];
}

export function LoyaltyTiersManager({ brandId, tiers }: LoyaltyTiersManagerProps) {
  const { modules } = useAdminStoreProfile(brandId).profile;
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const money = useMoneyLabel(isAr ? "ar" : "en");
  const currency = useStoreCurrency(brandId);
  const queryClient = useQueryClient();

  const [editingTier, setEditingTier] = useState<LoyaltyTier | null>(null);

  // Starter tiers in the store's currency, promising only what the system does.
  const initTiersMutation = useMutation({
    mutationFn: async () => {
      await saveLoyaltyTiers(brandId, starterLoyaltyTiers(currency, Boolean(modules.shipping)));
    },
    onSuccess: () => {
      toast.success(isAr ? "تم إعداد المستويات الافتراضية بنجاح" : "Default tiers initialized");
      void invalidateLoyalty(queryClient, brandId);
    },
    onError: (err: any) => {
      toast.error(err.message || (isAr ? "فشل تهيئة المستويات" : "Failed to initialize tiers"));
    },
  });

  const saveTierMutation = useMutation({
    mutationFn: async (tier: LoyaltyTier) => {
      await saveLoyaltyTiers(brandId, [{ ...tier, updated_at: new Date().toISOString() }]);
    },
    onSuccess: () => {
      toast.success(isAr ? "تم تحديث المستوى بنجاح" : "Tier updated successfully");
      void invalidateLoyalty(queryClient, brandId);
      setEditingTier(null);
    },
    onError: (err: any) => {
      toast.error(err.message || (isAr ? "حدث خطأ أثناء التحديث" : "Failed to update tier"));
    },
  });

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
            type="button"
            variant="outline"
            size="sm"
            onClick={() => initTiersMutation.mutate()}
            disabled={initTiersMutation.isPending}
            className="min-h-[44px] gap-2 border-border"
          >
            <Sparkles className="h-4 w-4 text-primary" />
            {isAr ? "إنشاء مستويات البداية" : "Create starter tiers"}
          </Button>
        )}
      </div>

      {/* The store's own tiers only: defaults shown here once looked saved while every member
          stayed in one tier. */}
      {tiers.length === 0 && (
        <Card className="border-dashed border-border p-5 text-sm text-muted-foreground">
          {isAr
            ? "لا توجد مستويات بعد: كل الأعضاء في مستوى واحد ويكسبون النقاط بنفس المعدل. أنشئ مستويات البداية ثم عدّلها لتناسب متجرك."
            : "No tiers yet: every member is in one tier and earns at the same rate. Create the starter tiers, then adjust them to your store."}
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {tiers.map((tier: LoyaltyTier) => {
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
                    aria-label={isAr ? "تعديل" : "Edit"}
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* Requirements */}
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-muted-foreground block">
                    {isAr ? "شروط التأهل" : "Qualification"}
                  </span>
                  <div className="text-sm font-bold text-foreground">
                    {Number(tier.min_spend) > 0 ? (
                      <span>
                        {tier.min_spend} {isAr ? `${money} إنفاق` : `${money} spend`}
                      </span>
                    ) : (
                      <span>
                        {isAr ? "بدون حد أدنى (مستوى البداية)" : "No minimum (Default tier)"}
                      </span>
                    )}
                  </div>
                </div>

                {/* What the tier gives: its multiplier, and free shipping where the store ships. */}
                <div className="space-y-1.5 border-t border-border-subtle pt-2">
                  <div>
                    <span className="text-xs text-muted-foreground block">
                      {isAr ? "مضاعف النقاط" : "Multiplier"}
                    </span>
                    <span className="text-base font-extrabold text-primary">
                      {tier.points_multiplier}x
                    </span>
                  </div>
                  {tier.free_shipping && (
                    <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      <Truck className="h-3.5 w-3.5" />
                      <span>{isAr ? "شحن مجاني على الطلبات" : "Free shipping included"}</span>
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-border-subtle">
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
                  ? "تعديل مسميات المستوى، حد الإنفاق ومضاعف النقاط."
                  : "Customize tier names, qualification spend and multipliers."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{isAr ? "الاسم بالعربية" : "Name (Arabic)"}</Label>
                  <Input
                    value={editingTier.name_ar}
                    onChange={(e) => setEditingTier({ ...editingTier, name_ar: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{isAr ? "الاسم بالإنجليزية" : "Name (English)"}</Label>
                  <Input
                    value={editingTier.name_en}
                    onChange={(e) => setEditingTier({ ...editingTier, name_en: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{isAr ? `الحد الأدنى للإنفاق (${money})` : `Min Spend (${money})`}</Label>
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

              {/* Free shipping is a perk of a store that ships (one that already gave it keeps it). */}
              {(modules.shipping || editingTier.free_shipping) && (
                <div className="flex items-center justify-between p-3 rounded-xl border border-border">
                  <div className="space-y-0.5">
                    <Label>
                      {isAr ? "شحن مجاني دائم لأعضاء هذا المستوى" : "Free Shipping Perk"}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {isAr
                        ? "إعفاء أعضاء هذا المستوى من رسوم التوصيل عند الطلب"
                        : "Waive shipping fees on checkout for members of this tier"}
                    </p>
                  </div>
                  <Switch
                    checked={editingTier.free_shipping}
                    onCheckedChange={(c) => setEditingTier({ ...editingTier, free_shipping: c })}
                  />
                </div>
              )}
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
