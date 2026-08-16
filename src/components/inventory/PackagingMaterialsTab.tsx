import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/lib/brand-context";
import { useI18n } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Package, Plus, Pencil, Trash2, Box, AlertTriangle, Search } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { toast } from "sonner";

export function PackagingMaterialsTab() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const brand = useBrand();
  const brandId = brand.id;
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [modalOpen, setOpenModal] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);

  const [name, setName] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [sku, setSku] = useState("");
  const [stock, setStock] = useState<number>(0);
  const [unitCost, setUnitCost] = useState<number>(0);
  const [reorderLevel, setReorderLevel] = useState<number>(10);
  const [isSaving, setIsSaving] = useState(false);

  const materialsQ = useQuery({
    queryKey: ["packaging-materials", brandId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("packaging_materials")
        .select("*")
        .eq("brand_id", brandId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const materials = (materialsQ.data ?? []).filter((m: any) => {
    const q = search.toLowerCase();
    return (
      (m.name && m.name.toLowerCase().includes(q)) ||
      (m.name_ar && m.name_ar.toLowerCase().includes(q)) ||
      (m.sku && m.sku.toLowerCase().includes(q))
    );
  });

  const handleOpenAdd = () => {
    setEditingItem(null);
    setName("");
    setNameAr("");
    setSku("");
    setStock(0);
    setUnitCost(0);
    setReorderLevel(10);
    setOpenModal(true);
  };

  const handleOpenEdit = (item: any) => {
    setEditingItem(item);
    setName(item.name || "");
    setNameAr(item.name_ar || "");
    setSku(item.sku || "");
    setStock(item.stock_quantity || 0);
    setUnitCost(item.unit_cost || 0);
    setReorderLevel(item.reorder_level || 10);
    setOpenModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm(isAr ? "هل أنت تأكد من حذف مادة التغليف هذه؟" : "Delete this packaging material?")) return;
    try {
      await (supabase as any).from("packaging_materials").delete().eq("id", id).eq("brand_id", brandId);
      toast.success(isAr ? "تمت الحذف بنجاح" : "Material deleted");
      qc.invalidateQueries({ queryKey: ["packaging-materials", brandId] });
    } catch (err: any) {
      toast.error(err.message || "Failed to delete");
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error(isAr ? "يرجى إدخال اسم مادة التغليف" : "Please enter material name");
      return;
    }

    setIsSaving(true);
    try {
      if (editingItem) {
        await (supabase as any)
          .from("packaging_materials")
          .update({
            name,
            name_ar: nameAr,
            sku,
            stock_quantity: stock,
            unit_cost: unitCost,
            reorder_level: reorderLevel,
          } as any)
          .eq("id", editingItem.id)
          .eq("brand_id", brandId);
        toast.success(isAr ? "تم التحديث بنجاح" : "Updated successfully");
      } else {
        await (supabase as any).from("packaging_materials").insert({
          brand_id: brandId,
          name,
          name_ar: nameAr,
          sku,
          stock_quantity: stock,
          unit_cost: unitCost,
          reorder_level: reorderLevel,
        } as any);
        toast.success(isAr ? "تمت الإضافة بنجاح" : "Added successfully");
      }


      qc.invalidateQueries({ queryKey: ["packaging-materials", brandId] });
      setOpenModal(false);
    } catch (err: any) {
      toast.error(err.message || "Error saving material");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Box className="h-5 w-5 text-primary" />
            {isAr ? "إدارة مواد التغليف والعلب (BOM Packaging)" : "Packaging Materials & Packaging Stock"}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isAr
              ? "إدارة المخزون الخام للعلب والأكياس والكروت وتحديد تكلفة الوحدة لحساب الـ COGS تلقائياً."
              : "Track raw packaging stock (Boxes, Bags, Cards) & unit cost for automatic order COGS calculations."}
          </p>
        </div>

        <Button onClick={handleOpenAdd} className="gap-1.5 h-9 text-xs font-bold">
          <Plus className="h-4 w-4" />
          {isAr ? "إضافة مادة تغليف جديدة" : "Add Packaging Material"}
        </Button>
      </div>

      {/* Search & Stats */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={isAr ? "بحث في مواد التغليف..." : "Search packaging materials..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9 text-xs"
          />
        </div>

        <div className="text-xs font-medium text-muted-foreground">
          {isAr ? `إجمالي المواد: ${materials.length}` : `Total Materials: ${materials.length}`}
        </div>
      </div>

      {/* Materials Table / List */}
      {materialsQ.isLoading ? (
        <div className="py-12 text-center text-xs text-muted-foreground">
          {isAr ? "جاري تحميل مواد التغليف..." : "Loading packaging materials..."}
        </div>
      ) : materials.length === 0 ? (
        <Card className="p-8 text-center space-y-3">
          <Package className="h-10 w-10 text-muted-foreground mx-auto stroke-1" />
          <p className="text-sm font-semibold text-foreground">
            {isAr ? "لا توجد مواد تغليف مسجلة" : "No Packaging Materials Registered"}
          </p>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            {isAr
              ? "قم بأضافة الأكياس والعلب والشرائط وربطها بالمنتجات لحساب التكاليف وتتبع المخزون تلقائياً."
              : "Add packaging items (Boxes, Bags, Cards) and link them to products for automated cost deduction."}
          </p>
          <Button onClick={handleOpenAdd} variant="outline" size="sm" className="text-xs mt-2">
            <Plus className="h-3.5 w-3.5 mr-1" />
            {isAr ? "إضافة مادة الآن" : "Add Material Now"}
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {materials.map((item) => {
            const isLowStock = item.stock_quantity <= (item.reorder_level || 10);

            return (
              <Card key={item.id} className="p-4 flex flex-col justify-between space-y-3 border-border">
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-sm text-foreground">
                        {isAr ? item.name_ar || item.name : item.name}
                      </h3>
                      {item.sku && (
                        <span className="text-[11px] font-mono text-muted-foreground">SKU: {item.sku}</span>
                      )}
                    </div>
                    {isLowStock && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-bold text-destructive">
                        <AlertTriangle className="h-3 w-3" />
                        {isAr ? "مخزون منخفض" : "Low Stock"}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/40 p-2.5 text-xs">
                    <div>
                      <span className="text-[11px] text-muted-foreground block">{isAr ? "المخزون المتوفر" : "In Stock"}</span>
                      <span className="font-extrabold text-foreground text-sm">{item.stock_quantity} unit</span>
                    </div>
                    <div>
                      <span className="text-[11px] text-muted-foreground block">{isAr ? "تكلفة الوحدة" : "Unit Cost"}</span>
                      <span className="font-extrabold text-primary text-sm">{formatMoney(item.unit_cost, "BHD")}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-border/40">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleOpenEdit(item)}
                    className="h-8 text-xs gap-1"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    {isAr ? "تعديل" : "Edit"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(item.id)}
                    className="h-8 text-xs text-destructive hover:bg-destructive/10 gap-1"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {isAr ? "حذف" : "Delete"}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={modalOpen} onOpenChange={setOpenModal}>
        <DialogContent className="max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground">
              {editingItem
                ? isAr ? "تعديل مادة التغليف" : "Edit Packaging Material"
                : isAr ? "إضافة مادة تغليف جديدة" : "Add Packaging Material"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{isAr ? "اسم مادة التغليف (English)" : "Material Name (English)"}</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Luxury Gift Box (Medium)"
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{isAr ? "الاسم بالعربية" : "Arabic Name"}</Label>
              <Input
                value={nameAr}
                onChange={(e) => setNameAr(e.target.value)}
                placeholder="مثال: علبة هدايا فاخرة (وسط)"
                className="h-9 text-xs text-right"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">{isAr ? "رمز المادة (SKU)" : "SKU / Code"}</Label>
                <Input
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  placeholder="BOX-MED-01"
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">{isAr ? "تكلفة الوحدة (BHD)" : "Unit Cost (BHD)"}</Label>
                <Input
                  type="number"
                  step="0.001"
                  min="0"
                  value={unitCost}
                  onChange={(e) => setUnitCost(parseFloat(e.target.value) || 0)}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">{isAr ? "الكمية المتوفرة" : "Stock Quantity"}</Label>
                <Input
                  type="number"
                  min="0"
                  value={stock}
                  onChange={(e) => setStock(parseInt(e.target.value) || 0)}
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">{isAr ? "حد التنبيه (Low Stock)" : "Reorder Level"}</Label>
                <Input
                  type="number"
                  min="0"
                  value={reorderLevel}
                  onChange={(e) => setReorderLevel(parseInt(e.target.value) || 10)}
                  className="h-9 text-xs"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpenModal(false)} className="h-9 text-xs">
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button onClick={handleSave} disabled={isSaving} className="h-9 text-xs font-bold">
              {isSaving ? (isAr ? "جاري الحفظ..." : "Saving...") : isAr ? "حفظ" : "Save Material"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
