import { useState, useMemo, useRef } from "react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { resolveAllVariantAxes, variantAxisDefaultsFrom } from "@/lib/addons/addon-registry";
import type { OrderItem as Item } from "@/features/orders/types";
import {
  blankOrderItem,
  filterVariantsForSearch,
  recalcOrderItem,
} from "@/features/orders/lib/order-editor";
import type { Dispatch, SetStateAction } from "react";
import type { OrderItem } from "@/features/orders/types";
import type { OrderDetailData } from "@/features/orders/hooks/use-order-detail-data";

/** Adding and editing order lines: catalog search (with an out-of-stock check), barcode scan, variant pick, quantity/price edits and customizations. */
export function useOrderLineActions({
  addonDefaults,
  items,
  lang,
  productsQ,
  setItems,
  variantsQ,
}: {
  addonDefaults: ReturnType<typeof variantAxisDefaultsFrom>;
  items: OrderItem[];
  lang: ReturnType<typeof useI18n>["lang"];
  productsQ: OrderDetailData["productsQ"];
  setItems: Dispatch<SetStateAction<OrderItem[]>>;
  variantsQ: OrderDetailData["variantsQ"];
}) {
  const [outOfStockConfirmVariant, setOutOfStockConfirmVariant] = useState<any | null>(null);
  const [productSearchOpen, setProductSearchOpen] = useState(false);
  const [productSearchQuery, setProductSearchQuery] = useState("");
  const filteredVariantsForSearch = useMemo(
    () => filterVariantsForSearch(variantsQ.data ?? [], productsQ.data ?? [], productSearchQuery),
    [productSearchQuery, variantsQ.data, productsQ.data],
  );
  const handleSelectVariantFromModal = (variant: any, force = false) => {
    const mainStock = Number(variant.stock_main ?? 0);
    const incStock = Number(variant.stock_incubator ?? 0);
    const fallbackStock = Number(variant.stock ?? variant.quantity ?? 0);
    const totalStock = mainStock + incStock > 0 ? mainStock + incStock : fallbackStock;

    if (!force && totalStock <= 0) {
      setOutOfStockConfirmVariant(variant);
      return;
    }

    const p = (productsQ.data ?? []).find((x: any) => x.id === variant.product_id);
    const isAr = lang === "ar";
    const axes = resolveAllVariantAxes({
      product: p,
      addonDefaults,
      lang: isAr ? "ar" : "en",
    });
    const variantTitle = [
      p ? (p as any).name : "",
      variant.size && axes.size.visible ? `${axes.size.label}: ${variant.size}` : "",
      variant.color && axes.color.visible ? `${axes.color.label}: ${variant.color}` : "",
      variant.fabric && axes.fabric.visible ? `${axes.fabric.label}: ${variant.fabric}` : "",
    ]
      .filter(Boolean)
      .join(" — ");
    const price = Number(
      variant.selling_price ??
        variant.price_override ??
        variant.price ??
        (p as any)?.selling_price ??
        (p as any)?.base_price ??
        (p as any)?.price ??
        0,
    );
    const preferredLoc: "main" | "incubator" = (variant.stock_main ?? 0) > 0 ? "main" : "incubator";

    setItems((prev) => [
      ...prev,
      {
        product_id: variant.product_id,
        variant_id: variant.id,
        description: variantTitle || "Custom Item",
        quantity: 1,
        unit_price: price,
        unit_cost: (variant as any).cost_price == null ? null : Number((variant as any).cost_price),
        original_price: price,
        customizations: [],
        customization_total: 0,
        line_total: price,
        location: preferredLoc,
        selected_variant: variant,
      },
    ]);
    toast.success(
      isAr ? `تمت إضافة "${variantTitle}" إلى الطلب!` : `Added "${variantTitle}" to order!`,
    );
    setProductSearchOpen(false);
    setProductSearchQuery("");
  };
  const [scannerOpen, setScannerOpen] = useState(false);
  const [cameraStreamPromise, setCameraStreamPromise] = useState<Promise<MediaStream> | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const addItem = () => {
    setItems([...items, blankOrderItem()]);
  };
  const openBarcodeScanner = () => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    /* The scanner component owns camera acquisition. Avoid opening a competing
       warm-up stream here; it prevents autofocus on several mobile browsers. */
    setCameraStreamPromise(null);
    setScannerOpen(true);
  };
  const handleScanned = (code: string) => {
    const normalizeScan = (value: unknown) =>
      String(value ?? "")
        .replace(/\p{Cc}/gu, "")
        .trim()
        .toUpperCase();
    const trimmed = normalizeScan(code);
    if (!trimmed) return;
    const variants = variantsQ.data ?? [];
    const products = productsQ.data ?? [];
    const v =
      variants.find((x: any) => normalizeScan(x.barcode) === trimmed) ??
      variants.find((x: any) => normalizeScan(x.sku) === trimmed);
    if (!v) {
      toast.error(
        lang === "ar" ? `لم يتم العثور على الباركود: ${trimmed}` : `Barcode not found: ${trimmed}`,
      );
      return;
    }
    const p = products.find((x: any) => x.id === v.product_id);
    const isAr = lang === "ar";
    const axes = resolveAllVariantAxes({
      product: p,
      addonDefaults,
      lang: isAr ? "ar" : "en",
    });
    const lines = [p?.name || (v as any).title || "Product"];
    if (v.size && axes.size.visible) lines.push(`${axes.size.label}: ${v.size}`);
    if (v.color && axes.color.visible) lines.push(`${axes.color.label}: ${v.color}`);
    if (v.fabric && axes.fabric.visible) lines.push(`${axes.fabric.label}: ${v.fabric}`);
    setItems([
      ...items,
      {
        product_id: p?.id ?? null,
        variant_id: v.id,
        description: lines.join("\n"),
        quantity: 1,
        unit_price: Number(v.selling_price || 0),
        unit_cost: (v as any).cost_price == null ? null : Number((v as any).cost_price),
        original_price:
          (v as any).original_price == null ? null : Number((v as any).original_price),
        customizations: [],
        customization_total: 0,
        line_total: Number(v.selling_price || 0),
        location: "main",
        selected_variant: {
          size: v.size || null,
          color: v.color || null,
          fabric: v.fabric || null,
        },
        custom_field_values: [],
      },
    ]);
    toast.success(
      lang === "ar" ? `تمت إضافة ${p?.name || "المنتج"} بنجاح!` : `Added ${p?.name || "product"}!`,
    );
  };
  const updateItem = (idx: number, patch: Partial<Item>) => {
    setItems(items.map((it, i) => (i === idx ? recalcOrderItem({ ...it, ...patch }) : it)));
  };
  const pickVariant = (idx: number, variantId: string) => {
    const v = variantsQ.data?.find((x: any) => x.id === variantId);
    const p = productsQ.data?.find((x: any) => x.id === v?.product_id);
    if (!v || !p) return;
    const isAr = lang === "ar";
    const axes = resolveAllVariantAxes({
      product: p,
      addonDefaults,
      lang: isAr ? "ar" : "en",
    });
    const lines = [p.name];
    if (v.size && axes.size.visible) lines.push(`${axes.size.label}: ${v.size}`);
    if (v.color && axes.color.visible) lines.push(`${axes.color.label}: ${v.color}`);
    if (v.fabric && axes.fabric.visible) lines.push(`${axes.fabric.label}: ${v.fabric}`);
    updateItem(idx, {
      product_id: p.id,
      variant_id: v.id,
      description: lines.join("\n"),
      unit_price: Number(v.selling_price),
      unit_cost: (v as any).cost_price == null ? null : Number((v as any).cost_price),
      original_price: (v as any).original_price == null ? null : Number((v as any).original_price),
      selected_variant: {
        size: v.size || null,
        color: v.color || null,
        fabric: v.fabric || null,
      },
    });
  };
  const toggleCustom = (idx: number, c: { name: string; price_delta: number }) => {
    const it = items[idx];
    const exists = it.customizations.find((x) => x.name === c.name);
    const newCust = exists
      ? it.customizations.filter((x) => x.name !== c.name)
      : [...it.customizations, c];
    updateItem(idx, { customizations: newCust });
  };

  return {
    addItem,
    cameraStreamPromise,
    filteredVariantsForSearch,
    handleScanned,
    handleSelectVariantFromModal,
    openBarcodeScanner,
    outOfStockConfirmVariant,
    pickVariant,
    productSearchOpen,
    productSearchQuery,
    scannerOpen,
    setOutOfStockConfirmVariant,
    setProductSearchOpen,
    setProductSearchQuery,
    setScannerOpen,
    toggleCustom,
    updateItem,
  };
}
