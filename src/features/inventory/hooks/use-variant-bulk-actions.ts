import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Variant } from "@/features/inventory/types";

/** Row selection in the variants table and the actions applied to the selection. */
export function useVariantBulkActions(variants: Variant[], onChanged: () => void, isAr: boolean) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const isAllSelected = variants.length > 0 && selectedIds.size === variants.length;

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(variants.map((v) => v.id)));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const bulkSetPrice = async () => {
    const val = prompt(
      isAr
        ? "أدخل سعر البيع الجديد لكافة المتغيرات المحددة:"
        : "Enter new selling price for all selected variants:",
    );
    if (val === null) return;
    const price = Number(val);
    if (isNaN(price) || price < 0) return toast.error(isAr ? "سعر غير صالح" : "Invalid price");
    const { error } = await supabase
      .from("product_variants")
      .update({ selling_price: price })
      .in("id", Array.from(selectedIds));
    if (error) toast.error(error.message);
    else {
      toast.success(isAr ? "تم تحديث الأسعار بنجاح" : "Prices updated successfully");
      setSelectedIds(new Set());
      onChanged();
    }
  };

  const bulkAddStock = async (amount: number) => {
    const selectedVariants = variants.filter((v) => selectedIds.has(v.id));
    const promises = selectedVariants.map((v) =>
      (supabase.rpc as any)("rpc_adjust_variant_stock", {
        p_variant_id: v.id,
        p_location: "main",
        p_mode: "delta",
        p_value: amount,
        p_reason: "manual_adjustment",
        p_note: `Bulk add stock +${amount}`,
      }),
    );
    const results = await Promise.all(promises);
    const hasError = results.some((r: any) => r.error);
    if (hasError) toast.error(isAr ? "فشل تحديث المخزون" : "Failed to update some stock entries");
    else {
      toast.success(
        isAr ? `تمت إضافة ${amount}+ مخزون بنجاح` : `Added +${amount} stock successfully`,
      );
      setSelectedIds(new Set());
      onChanged();
    }
  };

  const bulkApplyMarkup = async () => {
    const val = prompt(
      isAr
        ? "أدخل نسبة الهامش الربحي المئوية (مثال: 50 لـ 50%):"
        : "Enter markup percentage (e.g. 50 for 55%):",
    );
    if (val === null) return;
    const markup = Number(val);
    if (isNaN(markup) || markup < 0)
      return toast.error(isAr ? "نسبة مئوية غير صالحة" : "Invalid markup percentage");
    const selectedVariants = variants.filter((v) => selectedIds.has(v.id));
    const promises = selectedVariants.map((v) => {
      const newPrice = v.cost_price * (1 + markup / 100);
      return supabase
        .from("product_variants")
        .update({ selling_price: Number(newPrice.toFixed(3)) })
        .eq("id", v.id);
    });
    const results = await Promise.all(promises);
    const hasError = results.some((r) => r.error);
    if (hasError)
      toast.error(isAr ? "فشل تطبيق الهامش الربحي" : "Failed to apply markup on some variants");
    else {
      toast.success(isAr ? "تم تطبيق الهامش الربحي بنجاح" : "Markup applied successfully");
      setSelectedIds(new Set());
      onChanged();
    }
  };

  const bulkDelete = async () => {
    if (
      !confirm(
        isAr
          ? "هل أنت متأكد من حذف المتغيرات المحددة؟"
          : "Are you sure you want to delete the selected variants?",
      )
    )
      return;
    const { error } = await supabase
      .from("product_variants")
      .delete()
      .in("id", Array.from(selectedIds));
    if (error) toast.error(error.message);
    else {
      toast.success(isAr ? "تم حذف المتغيرات بنجاح" : "Variants deleted successfully");
      setSelectedIds(new Set());
      onChanged();
    }
  };

  return {
    selectedIds,
    setSelectedIds,
    isAllSelected,
    toggleSelectAll,
    toggleSelect,
    bulkSetPrice,
    bulkAddStock,
    bulkApplyMarkup,
    bulkDelete,
  };
}
