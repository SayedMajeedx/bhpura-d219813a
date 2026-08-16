import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/lib/brand-context";
import { useI18n, useT } from "@/lib/i18n";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Package, Plus, Trash2, Box, Info } from "lucide-react";
import { formatMoney } from "@/lib/format";

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
    Array<{ packaging_material_id: string; quantity_per_unit: number }>
  >([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setDirectCost(initialDirectCost || 0);
  }, [initialDirectCost, open]);

  // Fetch available packaging materials
  const materialsQ = useQuery({
    queryKey: ["packaging-materials", brandId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("packaging_materials")
        .select("*")
        .eq("brand_id", brandId)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: open,
  });

  // Fetch current BOM items for this product
  const bomQ = useQuery({
    queryKey: ["product-bom-items", productId],
    queryFn: async () => {
      if (!productId) return [];
      const { data, error } = await (supabase as any)
        .from("product_bom_items")
        .select("packaging_material_id, quantity_per_unit")
        .eq("product_id", productId)
        .eq("brand_id", brandId);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: open && !!productId,
  });

  useEffect(() => {
    if (bomQ.data) {
      setSelectedMaterials(
        bomQ.data.map((item: any) => ({
          packaging_material_id: item.packaging_material_id,
          quantity_per_unit: Number(item.quantity_per_unit || 1),
        })),
      );
    }
  }, [bomQ.data]);

  const materials: any[] = materialsQ.data ?? [];

  const handleAddMaterialRow = () => {
    if (materials.length === 0) return;
    setSelectedMaterials((prev) => [
      ...prev,
      { packaging_material_id: materials[0].id, quantity_per_unit: 1 },
    ]);
  };

  const handleRemoveMaterialRow = (index: number) => {
    setSelectedMaterials((prev) => prev.filter((_, i) => i !== index));
  };

  const handleMaterialChange = (index: number, matId: string) => {
    setSelectedMaterials((prev) => {
      const next = [...prev];
      next[index].packaging_material_id = matId;
      return next;
    });
  };

  const handleQtyChange = (index: number, qty: number) => {
    setSelectedMaterials((prev) => {
      const next = [...prev];
      next[index].quantity_per_unit = Math.max(1, qty);
      return next;
    });
  };

  // Calculate live total packaging cost
  const bomCostTotal = selectedMaterials.reduce((sum, item) => {
    const mat = materials.find((m) => m.id === item.packaging_material_id);
    const unitCost = Number(mat?.unit_cost || 0);
    return sum + unitCost * item.quantity_per_unit;
  }, 0);

  const totalCalculatedPackagingCost = directCost + bomCostTotal;

  const handleSave = async () => {
    if (!productId) return;
    setIsSaving(true);
    try {
      // 1. Update direct packaging cost on product
      await (supabase as any)
        .from("products")
        .update({ direct_packaging_cost: directCost } as any)
        .eq("id", productId)
        .eq("brand_id", brandId);

      // 2. Delete existing BOM items for product
      await (supabase as any)
        .from("product_bom_items")
        .delete()
        .eq("product_id", productId)
        .eq("brand_id", brandId);

      // 3. Insert new BOM items
      if (selectedMaterials.length > 0) {
        const rowsToInsert = selectedMaterials.map((sm) => ({
          brand_id: brandId,
          product_id: productId,
          packaging_material_id: sm.packaging_material_id,
          quantity_per_unit: sm.quantity_per_unit,
        }));
        await (supabase as any).from("product_bom_items").insert(rowsToInsert as any);
      }

      qc.invalidateQueries({ queryKey: ["dashboard-products", brandId] });
      qc.invalidateQueries({ queryKey: ["product-bom-items", productId] });

      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      console.error("Failed to save BOM packaging", err);
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
              <span>{isAr ? "تكلفة التغليف المباشرة (إدخال يدوي)" : "Direct Packaging Cost (Manual)"}</span>
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
                  const mat = materials.find((m) => m.id === item.packaging_material_id);
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
                        {materials.map((m) => (
                          <option key={m.id} value={m.id}>
                            {isAr ? m.name_ar || m.name : m.name} ({formatMoney(m.unit_cost, "BHD")})
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

        <DialogFooter className="gap-2 sm:gap-0 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="h-9 text-xs">
            {isAr ? "إلغاء" : "Cancel"}
          </Button>
          <Button onClick={handleSave} disabled={isSaving} className="h-9 text-xs font-bold">
            {isSaving ? (isAr ? "جاري الحفظ..." : "Saving...") : isAr ? "حفظ التغييرات" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
