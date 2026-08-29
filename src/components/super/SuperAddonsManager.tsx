// ==============================================================================
// BOUTQ OS: SUPER ADMIN MODULAR ADD-ONS MANAGER
// ==============================================================================

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listAddons, upsertAddon } from "@/lib/saas-billing/saas-billing.functions";
import type { SaaSAddon } from "@/lib/saas-billing/saas-billing.types";
import { useI18n } from "@/lib/i18n";
import { getFriendlyErrorMessage } from "@/lib/utils";
import { toast } from "sonner";
import {
  PackagePlus,
  Plus,
  Edit2,
  CheckCircle2,
  Loader2,
  Check,
  AlertTriangle,
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

export function SuperAddonsManager() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const queryClient = useQueryClient();

  const { data: addons, isLoading, error } = useQuery({
    queryKey: ["super_saas_addons"],
    queryFn: () => listAddons(),
  });

  const [editingAddon, setEditingAddon] = useState<Partial<SaaSAddon> | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isLoading) {
    return (
      <div className="p-12 flex flex-col items-center justify-center text-muted-foreground gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="text-xs">{isAr ? "جاري تحميل قائمة الإضافات..." : "Loading SaaS add-ons..."}</span>
      </div>
    );
  }

  if (error || !addons) {
    return (
      <div className="p-8 text-center text-destructive space-y-2">
        <AlertTriangle className="h-8 w-8 mx-auto" />
        <p className="text-sm font-bold">{isAr ? "فشل تحميل الإضافات" : "Failed to load add-ons"}</p>
        <p className="text-xs text-muted-foreground">{getFriendlyErrorMessage(error)}</p>
      </div>
    );
  }

  const handleOpenModal = (addon?: SaaSAddon) => {
    if (addon) {
      setEditingAddon({ ...addon });
    } else {
      setEditingAddon({
        code: `addon_custom_${Date.now().toString().slice(-4)}`,
        name_en: "",
        name_ar: "",
        description_en: "",
        description_ar: "",
        currency: "BHD",
        price_monthly: 10,
        price_annual: 95,
        target_feature_key: "products.limit",
        grant_type: "numeric_increment",
        grant_numeric_amount: 500,
        is_active: true,
        sort_order: 100,
      });
    }
  };

  const handleSaveAddon = async () => {
    if (!editingAddon || !editingAddon.code || !editingAddon.name_en || !editingAddon.name_ar) return;
    setIsSubmitting(true);
    const toastId = toast.loading(isAr ? "جاري حفظ الإضافة..." : "Saving add-on...");

    try {
      await upsertAddon({
        data: {
          id: editingAddon.id,
          code: editingAddon.code,
          nameEn: editingAddon.name_en,
          nameAr: editingAddon.name_ar,
          descriptionEn: editingAddon.description_en || undefined,
          descriptionAr: editingAddon.description_ar || undefined,
          priceMonthly: Number(editingAddon.price_monthly || 0),
          priceAnnual: Number(editingAddon.price_annual || 0),
          targetFeatureKey: editingAddon.target_feature_key || "products.limit",
          grantNumericAmount: Number(editingAddon.grant_numeric_amount || 0),
          grantBooleanValue: editingAddon.grant_type === "boolean_unlock" ? true : null,
          isActive: editingAddon.is_active ?? true,
        },
      });

      toast.success(isAr ? "تم حفظ الإضافة بنجاح!" : "Add-on saved successfully!", { id: toastId });
      setEditingAddon(null);
      void queryClient.invalidateQueries({ queryKey: ["super_saas_addons"] });
    } catch (err) {
      console.error(err);
      toast.error(getFriendlyErrorMessage(err) || "Failed to save add-on", { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border/60">
        <div>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <PackagePlus className="h-5 w-5 text-primary" />
            <span>{isAr ? "إدارة الإضافات المستقلة (SaaS Add-ons)" : "Modular SaaS Add-ons Catalog"}</span>
          </h2>
          <p className="text-xs text-muted-foreground">
            {isAr
              ? "إضافات سحابية لزيادة الحصص وسعة التخزين دون الحاجة لترقية الخطة كاملة."
              : "Modular capacity expansion add-ons for orders, products, storage and recovery."}
          </p>
        </div>
        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={() => handleOpenModal()}
          className="gap-1.5 font-bold text-xs min-h-[44px]"
        >
          <Plus className="h-4 w-4" />
          <span>{isAr ? "إضافة خيار جديد" : "New Add-on"}</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {addons.map((addon) => (
          <Card
            key={addon.id}
            className="border border-border bg-card shadow-sm rounded-2xl flex flex-col justify-between"
          >
            <CardHeader className="pb-3 border-b border-border/50">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="font-mono text-[10px]">
                  {addon.code}
                </Badge>
                {addon.is_active ? (
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 text-[10px]">
                    {isAr ? "مفعل" : "Active"}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-muted text-muted-foreground text-[10px]">
                    {isAr ? "معطل" : "Inactive"}
                  </Badge>
                )}
              </div>
              <CardTitle className="text-base font-bold text-foreground mt-2">
                {isAr ? addon.name_ar : addon.name_en}
              </CardTitle>
              <CardDescription className="text-xs line-clamp-2">
                {isAr ? addon.description_ar : addon.description_en}
              </CardDescription>
            </CardHeader>

            <CardContent className="pt-4 space-y-4">
              <div className="p-3 rounded-xl bg-muted/40 border border-border/50 flex items-center justify-between text-xs">
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                    {isAr ? "الميزة المستهدفة" : "Target Feature"}
                  </span>
                  <span className="font-mono font-bold text-foreground">{addon.target_feature_key}</span>
                </div>
                <div className="text-right">
                  <span className="font-mono font-bold text-foreground block">
                    {addon.price_monthly} BHD/m
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {addon.price_annual} BHD/y
                  </span>
                </div>
              </div>

              <div className="text-xs text-muted-foreground font-medium">
                {addon.grant_type === "numeric_increment" ? (
                  <span>
                    +{addon.grant_numeric_amount.toLocaleString()} {isAr ? "إضافية للمتجر" : "capacity boost"}
                  </span>
                ) : (
                  <span>{isAr ? "فتح الميزة بالكامل" : "Full feature unlock"}</span>
                )}
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleOpenModal(addon)}
                className="w-full gap-1.5 font-bold text-xs min-h-[44px]"
              >
                <Edit2 className="h-3.5 w-3.5" />
                <span>{isAr ? "تعديل الإضافة" : "Edit Add-on"}</span>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Add / Edit Add-on Dialog Modal */}
      {editingAddon && (
        <Dialog open={Boolean(editingAddon)} onOpenChange={(open) => !open && setEditingAddon(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-base font-bold flex items-center gap-2">
                <PackagePlus className="h-4 w-4 text-primary" />
                <span>
                  {editingAddon.id
                    ? isAr
                      ? "تعديل الإضافة السحابية"
                      : "Edit SaaS Add-on"
                    : isAr
                      ? "إنشاء إضافة سحابية جديدة"
                      : "Create New SaaS Add-on"}
                </span>
              </DialogTitle>
              <DialogDescription className="text-xs">
                {isAr
                  ? "تحديد أسعار الإضافة والميزة المستهدفة والكمية الممنوحة."
                  : "Configure add-on pricing, target feature key, and granted boost amount."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-foreground">
                    {isAr ? "الاسم بالعربية" : "Arabic Name"}
                  </Label>
                  <Input
                    value={editingAddon.name_ar || ""}
                    onChange={(e) => setEditingAddon((prev) => ({ ...prev, name_ar: e.target.value }))}
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-foreground">
                    {isAr ? "الاسم بالإنجليزية" : "English Name"}
                  </Label>
                  <Input
                    value={editingAddon.name_en || ""}
                    onChange={(e) => setEditingAddon((prev) => ({ ...prev, name_en: e.target.value }))}
                    className="text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-foreground">
                    {isAr ? "السعر الشهري (د.ب)" : "Monthly Price (BHD)"}
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.5"
                    value={editingAddon.price_monthly ?? 0}
                    onChange={(e) =>
                      setEditingAddon((prev) => ({ ...prev, price_monthly: parseFloat(e.target.value) || 0 }))
                    }
                    className="font-mono text-xs"
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
                    value={editingAddon.price_annual ?? 0}
                    onChange={(e) =>
                      setEditingAddon((prev) => ({ ...prev, price_annual: parseFloat(e.target.value) || 0 }))
                    }
                    className="font-mono text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-foreground">
                    {isAr ? "الميزة المستهدفة" : "Target Feature Key"}
                  </Label>
                  <Input
                    value={editingAddon.target_feature_key || ""}
                    onChange={(e) =>
                      setEditingAddon((prev) => ({ ...prev, target_feature_key: e.target.value }))
                    }
                    className="font-mono text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-foreground">
                    {isAr ? "الكمية الممنوحة" : "Grant Boost Amount"}
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    value={editingAddon.grant_numeric_amount ?? 0}
                    onChange={(e) =>
                      setEditingAddon((prev) => ({
                        ...prev,
                        grant_numeric_amount: parseInt(e.target.value, 10) || 0,
                      }))
                    }
                    className="font-mono text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-border">
                <span className="text-xs font-bold text-foreground">
                  {isAr ? "تفعيل الإضافة للشراء" : "Active & Available for Purchase"}
                </span>
                <Switch
                  checked={editingAddon.is_active ?? true}
                  onCheckedChange={(checked) =>
                    setEditingAddon((prev) => ({ ...prev, is_active: checked }))
                  }
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                size="default"
                disabled={isSubmitting}
                onClick={() => setEditingAddon(null)}
                className="min-h-[44px]"
              >
                {isAr ? "إلغاء" : "Cancel"}
              </Button>
              <Button
                type="button"
                variant="default"
                size="default"
                disabled={isSubmitting || !editingAddon.name_en || !editingAddon.name_ar}
                onClick={handleSaveAddon}
                className="gap-2 font-bold min-h-[44px]"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                <span>{isAr ? "حفظ الإضافة" : "Save Add-on"}</span>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
