import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/lib/brand-context";
import { useI18n, useT } from "@/lib/i18n";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Package, Plus, Trash2, Box, Info, Sparkles } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { toast } from "sonner";

interface ProductBomModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  productName: string;
  directPackagingCost: number;
  onSaved?: () => void;
}

export function ProductBomModal({
  open,
  onOpenChange,
  productId,
  productName,
  directPackagingCost: initialDirectCost,
  onSaved,
}: ProductBomModalProps) {
  const t = useT();
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const brand = useBrand();
  const brandId = brand.id;
  const qc = useQueryClient();

  const [directCost, setDirectCost] = useState<number>(initialDirectCost || 0);
  const [selectedMaterials, setSelectedMaterials] = useState<
    { packaging_material_id: string; quantity_per_unit: number }[]
  >([]);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch brand packaging materials
  const { data: materials = [], isLoading: isLoadingMaterials } = useQuery({
    queryKey: ["packaging-materials", brandId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("packaging_materials")
        .select("*")
        .eq("brand_id", brandId)
        .order("name", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!brandId && open,
  });

  // Fetch current product BOM items
  const { data: currentBom = [], isLoading: isLoadingBom } = useQuery({
    queryKey: ["product-bom-items", productId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("product_bom_items")
        .select("packaging_material_id, quantity_per_unit")
        .eq("product_id", productId)
        .eq("brand_id", brandId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!productId && !!brandId && open,
  });

  // Load existing BOM on modal open
  useEffect(() => {
    if (open) {
      setDirectCost(initialDirectCost || 0);
      if (currentBom.length > 0) {
        setSelectedMaterials(
          currentBom.map((item: any) => ({
            packaging_material_id: item.packaging_material_id,
            quantity_per_unit: Number(item.quantity_per_unit || 1),
          })),
        );
      } else {
        setSelectedMaterials([]);
      }
    }
  }, [open, currentBom, initialDirectCost]);

  const handleAddMaterialRow = () => {
    if (materials.length === 0) return;
    // Pick first material that is not yet selected
    const unselected = materials.find(
      (m: any) => !selectedMaterials.some((sm) => sm.packaging_material_id === m.id),
    );
    const materialToAdd = unselected || materials[0];

    setSelectedMaterials((prev) => [
      ...prev,
      { packaging_material_id: materialToAdd.id, quantity_per_unit: 1 },
    ]);
  };

  const handleRemoveMaterialRow = (index: number) => {
    setSelectedMaterials((prev) => prev.filter((_, i) => i !== index));
  };

  const handleMaterialChange = (index: number, newMaterialId: string) => {
    setSelectedMaterials((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, packaging_material_id: newMaterialId } : item,
      ),
    );
  };

  const handleQtyChange = (index: number, newQty: number) => {
    setSelectedMaterials((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, quantity_per_unit: Math.max(1, newQty) } : item,
      ),
    );
  };

  // Calculate live total packaging cost
  const totalBOMCost = selectedMaterials.reduce((acc, curr) => {
    const mat = materials.find((m: any) => m.id === curr.packaging_material_id);
    const unitCost = Number(mat?.unit_cost || 0);
    return acc + unitCost * curr.quantity_per_unit;
  }, 0);

  const totalCalculatedPackagingCost = directCost + totalBOMCost;

  const handleSave = async () => {
    if (!productId || !brandId) return;
    setIsSaving(true);
    try {
      // 1. Update direct_packaging_cost on product
      const { error: pErr } = await (supabase as any)
        .from("products")
        .update({ direct_packaging_cost: directCost } as any)
        .eq("id", productId)
        .eq("brand_id", brandId);
      if (pErr) throw pErr;

      // 2. Delete existing BOM items for product
      const { error: dErr } = await (supabase as any)
        .from("product_bom_items")
        .delete()
        .eq("product_id", productId)
        .eq("brand_id", brandId);
      if (dErr) throw dErr;

      // 3. Insert new BOM items
      if (selectedMaterials.length > 0) {
        const rowsToInsert = selectedMaterials.map((sm) => ({
          brand_id: brandId,
          product_id: productId,
          packaging_material_id: sm.packaging_material_id,
          quantity_per_unit: sm.quantity_per_unit,
        }));
        const { error: iErr } = await (supabase as any)
          .from("product_bom_items")
          .insert(rowsToInsert as any);
        if (iErr) throw iErr;
      }

      toast.success(isAr ? "تم حفظ تكاليف التغليف بنجاح" : "BOM packaging saved successfully");
      qc.invalidateQueries({ queryKey: ["dashboard-products", brandId] });
      qc.invalidateQueries({ queryKey: ["products", brandId] });
      qc.invalidateQueries({ queryKey: ["product-bom-items", productId] });
      qc.invalidateQueries({ queryKey: ["product-bom-items-all", brandId] });

      onSaved?.();
      onOpenChange(false);
    } catch (err: any) {
      console.error("Failed to save BOM packaging", err);
      toast.error(
        err.message || (isAr ? "خطأ في حفظ تكاليف التغليف" : "Failed to save BOM packaging"),
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleApplyToAllProducts = async () => {
    if (!brandId) return;
    setIsSaving(true);
    try {
      // 1. Fetch all product IDs for this brand
      const { data: allProducts, error: pFetchErr } = await (supabase as any)
        .from("products")
        .select("id")
        .eq("brand_id", brandId);
      if (pFetchErr) throw pFetchErr;

      const pIds = (allProducts ?? []).map((p: any) => p.id);
      if (pIds.length === 0) return;

      // 2. Update direct_packaging_cost on all products
      await (supabase as any)
        .from("products")
        .update({ direct_packaging_cost: directCost } as any)
        .eq("brand_id", brandId);

      // 3. Delete existing BOM items for all products of this brand
      await (supabase as any).from("product_bom_items").delete().eq("brand_id", brandId);

      // 4. Insert new BOM items for all products
      if (selectedMaterials.length > 0) {
        const rowsToInsert: any[] = [];
        for (const pid of pIds) {
          for (const sm of selectedMaterials) {
            rowsToInsert.push({
              brand_id: brandId,
              product_id: pid,
              packaging_material_id: sm.packaging_material_id,
              quantity_per_unit: sm.quantity_per_unit,
            });
          }
        }
        const { error: iErr } = await (supabase as any)
          .from("product_bom_items")
          .insert(rowsToInsert as any);
        if (iErr) throw iErr;
      }

      toast.success(
        isAr
          ? "تم تطبيق مواد التغليف على جميع منتجات المتجر بنجاح"
          : "Packaging BOM applied to all products successfully",
      );
      qc.invalidateQueries({ queryKey: ["dashboard-products", brandId] });
      qc.invalidateQueries({ queryKey: ["products", brandId] });
      qc.invalidateQueries({ queryKey: ["product-bom-items"] });
      qc.invalidateQueries({ queryKey: ["product-bom-items-all", brandId] });

      onSaved?.();
      onOpenChange(false);
    } catch (err: any) {
      console.error("Failed to apply BOM to all products", err);
      toast.error(
        err.message || (isAr ? "خطأ في تطبيق التغليف على المنتجات" : "Failed to apply BOM to all"),
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold text-foreground">
            <Box className="h-5 w-5 text-primary" />
            {isAr ? "تكلفة التغليف ومواد العلب (BOM)" : "Packaging & BOM Materials"}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            {isAr
              ? `تحديد مواد التغليف المرفقة للمنتج (${productName}) خصم تلقائي وحساب تكلفة الـ COGS.`
              : `Assign packaging materials to (${productName}) for automatic stock deduction & COGS calculation.`}
          </p>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Direct Packaging Cost Fallback */}
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3.5 space-y-2">
            <Label className="text-xs font-semibold text-foreground flex items-center justify-between">
              <span>
                {isAr ? "تكلفة التغليف المباشرة (إدخال يدوي)" : "Direct Packaging Cost (Manual)"}
              </span>
              <span className="text-[11px] text-muted-foreground">BHD</span>
            </Label>
            <Input
              type="number"
              step="0.001"
              min="0"
              value={directCost}
              onChange={(e) => setDirectCost(parseFloat(e.target.value) || 0)}
              className="h-9 text-sm"
              placeholder="0.000"
            />
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Info className="h-3 w-3 text-primary shrink-0" />
              {isAr
                ? "استخدم هذا الحقل للإعداد السريع إذا لم تقم بإنشاء مواد تغليف في المخزون."
                : "Use this field for fast manual setup if you haven't created inventory raw materials."}
            </p>
          </div>

          {/* Attached BOM Raw Materials */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Package className="h-4 w-4 text-primary" />
                {isAr ? "مواد التغليف المرفقة (من المخزون)" : "Attached Packaging Items"}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddMaterialRow}
                disabled={materials.length === 0}
                className="h-8 text-xs gap-1"
              >
                <Plus className="h-3.5 w-3.5" />
                {isAr ? "إضافة مادة" : "Add Item"}
              </Button>
            </div>

            {materials.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                {isAr
                  ? "لا توجد مواد تغليف مسجلة في المخزون بعد. يمكنك إضافتها من صفحة المخزون."
                  : "No packaging materials in inventory yet. You can add them from the Inventory page."}
              </div>
            ) : selectedMaterials.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                {isAr
                  ? "لم يتم ربط أية مواد تغليف من المخزون بهذا المنتج."
                  : "No inventory materials attached to this product."}
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {selectedMaterials.map((item, index) => {
                  const mat = materials.find((m: any) => m.id === item.packaging_material_id);
                  const matCost = Number(mat?.unit_cost || 0);

                  return (
                    <div
                      key={index}
                      className="flex items-center gap-2 rounded-md border border-border p-2 bg-card"
                    >
                      <select
                        value={item.packaging_material_id}
                        onChange={(e) => handleMaterialChange(index, e.target.value)}
                        className="flex-1 h-8 text-xs rounded-md border border-input bg-background px-2"
                      >
                        {materials.map((m: any) => (
                          <option key={m.id} value={m.id}>
                            {isAr ? m.name_ar || m.name : m.name} ({formatMoney(m.unit_cost, "BHD")}
                            )
                          </option>
                        ))}
                      </select>

                      <div className="w-16">
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity_per_unit}
                          onChange={(e) => handleQtyChange(index, parseInt(e.target.value) || 1)}
                          className="h-8 text-xs text-center px-1"
                        />
                      </div>

                      <span className="text-[11px] font-semibold text-muted-foreground w-16 text-right">
                        {formatMoney(matCost * item.quantity_per_unit, "BHD")}
                      </span>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveMaterialRow(index)}
                        className="h-8 w-8 text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Total Packaging Cost Summary */}
          <div className="rounded-lg bg-primary/10 border border-primary/20 p-3 flex items-center justify-between">
            <span className="text-xs font-bold text-foreground">
              {isAr ? "إجمالي تكلفة التغليف للقطعة:" : "Total Packaging Cost / Unit:"}
            </span>
            <span className="text-sm font-extrabold text-primary">
              {formatMoney(totalCalculatedPackagingCost, "BHD")}
            </span>
          </div>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-2 justify-between items-center w-full">
          <Button
            type="button"
            variant="secondary"
            onClick={handleApplyToAllProducts}
            disabled={isSaving}
            className="w-full sm:w-auto h-9 text-xs font-semibold gap-1.5"
          >
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            {isAr ? "تطبيق على جميع منتجات المتجر" : "Apply to All Products"}
          </Button>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="h-9 text-xs">
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button onClick={handleSave} disabled={isSaving} className="h-9 text-xs font-bold">
              {isSaving
                ? isAr
                  ? "جاري الحفظ..."
                  : "Saving..."
                : isAr
                  ? "حفظ لهذا المنتج"
                  : "Save for Product"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
