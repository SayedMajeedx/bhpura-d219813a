import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/lib/brand-context";
import type { Product, Variant } from "@/features/inventory/types";
import type { VariantRowAxes } from "@/features/inventory/hooks/use-inventory-axis-defaults";
import { prefetchOptionTranslations } from "@/features/inventory/lib/option-translations";
import {
  isBarcodeInUse,
  newVariantValues,
  variantColumnPatch,
  type VariantDraft,
} from "@/features/inventory/lib/variant-draft";

/**
 * Add, edit and delete one product's variants. Stock edits go through the
 * stock ledger RPC; the first variant added activates the product.
 */
export function useVariantMutations({
  productId,
  product,
  variants,
  axes,
  isAr,
  onChanged,
}: {
  productId: string;
  product?: Product;
  variants: Variant[];
  axes: VariantRowAxes;
  isAr: boolean;
  onChanged: () => void;
}) {
  const brandId = useBrand().id;
  const {
    size: sizeAxis,
    color: colorAxis,
    fabric: fabricAxis,
    four: fourAxis,
    five: fiveAxis,
  } = axes;

  const add = async (row: VariantDraft, onAdded: () => void) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    if (isBarcodeInUse(variants, row.barcode)) {
      toast.error(
        isAr
          ? "هذا الباركود مستخدم بالفعل لمنتج آخر"
          : "This barcode is already assigned to another variant",
      );
      return;
    }

    const { color: finalColor, values } = newVariantValues(
      row,
      {
        size: sizeAxis.visible,
        color: colorAxis.visible,
        fabric: fabricAxis.visible,
        four: fourAxis.visible,
        five: fiveAxis.visible,
      },
      product,
    );
    const { error } = await (supabase.from("product_variants") as any).insert({
      user_id: user.id,
      brand_id: brandId,
      product_id: productId,
      ...values,
    });
    if (error) return toast.error(error.message);
    prefetchOptionTranslations([finalColor, row.fabric, row.option_four, row.option_five], isAr);

    if (finalColor && !product?.variant_label_color_ar) {
      await (supabase.from("products") as any)
        .update({
          variant_label_color_ar: colorAxis.label || "النكهة / الخيار",
          variant_label_color_en: "Flavor / Option",
        })
        .eq("id", productId);
    }

    if (variants.length === 0) {
      const { error: activationError } = await supabase
        .from("products")
        .update({ is_active: true })
        .eq("id", productId);
      if (activationError) {
        onChanged();
        return toast.error(
          isAr
            ? "تمت إضافة المتغير، لكن تعذر تفعيل المنتج تلقائياً."
            : "Variant added, but the product could not be activated automatically.",
        );
      }
      toast.success(
        isAr
          ? "تمت إضافة أول متغير وتفعيل المنتج تلقائياً."
          : "First variant added and the product was activated automatically.",
      );
    }
    onAdded();
    onChanged();
  };

  const update = async (v: Variant, patch: Partial<Variant>) => {
    // If barcode is changing, verify uniqueness within the brand
    if (
      patch.barcode !== undefined &&
      patch.barcode !== null &&
      patch.barcode.trim() !== "" &&
      variants.some((other) => other.id !== v.id && other.barcode === patch.barcode?.trim())
    ) {
      toast.error(
        isAr
          ? "هذا الباركود مستخدم بالفعل لمنتج آخر"
          : "This barcode is already assigned to another variant",
      );
      return;
    }

    // Handle stock updates via ledger RPC
    let stockUpdated = false;
    if (patch.stock_main !== undefined && Number(patch.stock_main) !== Number(v.stock_main ?? 0)) {
      const { error: stockErr } = await (supabase.rpc as any)("rpc_adjust_variant_stock", {
        p_variant_id: v.id,
        p_location: "main",
        p_mode: "set",
        p_value: Math.max(0, Number(patch.stock_main)),
        p_reason: "manual_adjustment",
        p_note: "Admin variant table inline edit",
      });
      if (stockErr) {
        toast.error(stockErr.message);
        return;
      }
      stockUpdated = true;
    }

    if (
      patch.stock_incubator !== undefined &&
      Number(patch.stock_incubator) !== Number(v.stock_incubator ?? 0)
    ) {
      const { error: incErr } = await (supabase.rpc as any)("rpc_adjust_variant_stock", {
        p_variant_id: v.id,
        p_location: "incubator",
        p_mode: "set",
        p_value: Math.max(0, Number(patch.stock_incubator)),
        p_reason: "manual_adjustment",
        p_note: "Admin variant table inline edit",
      });
      if (incErr) {
        toast.error(incErr.message);
        return;
      }
      stockUpdated = true;
    }

    const normalizedPatch = variantColumnPatch(patch, Number(product?.base_price ?? 0));

    if (Object.keys(normalizedPatch).length > 0) {
      const { error } = await (supabase.from("product_variants") as any)
        .update(normalizedPatch)
        .eq("id", v.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      prefetchOptionTranslations(
        [
          normalizedPatch.color,
          normalizedPatch.fabric,
          normalizedPatch.option_four,
          normalizedPatch.option_five,
        ],
        isAr,
      );
    }

    if (stockUpdated || Object.keys(normalizedPatch).length > 0) {
      onChanged();
    }
  };

  const del = async (id: string) => {
    const { error } = await supabase.from("product_variants").delete().eq("id", id);
    if (error) toast.error(error.message);
    else onChanged();
  };

  return { add, update, del };
}
