import React, { useState } from "react";
import { formatMoney } from "@/lib/format";
import { stockUnitsLabel, variantCountLabel } from "@/lib/inventory-labels";
import {
  Package,
  Pencil,
  Trash2,
  Printer,
  MoreVertical,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Box,
  Building2,
  Copy,
  ExternalLink,
  Share2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface InventoryWorkQueueProps {
  lang: "en" | "ar";
  products: any[];
  variantsByProduct: Record<string, any[]>;
  isLoading: boolean;
  isError: boolean;
  onEdit: (product: any) => void;
  onDelete: (productId: string) => void;
  onPrintLabel: (product: any) => void;
  onConfigureBom?: (product: any) => void;
  onTransferToIncubator?: (product: any) => void;
  onDuplicate?: (product: any) => void;
  onShare?: (product: any) => void;
  onPreview?: (product: any) => void;
  renderVariantList?: (product: any) => React.ReactNode;
  selectedProductIds?: ReadonlySet<string>;
  onToggleProduct?: (productId: string) => void;
  onToggleAll?: () => void;
  currency?: string;
  categories?: Array<{
    id: string;
    name_en: string;
    name_ar: string | null;
    slug: string | null;
  }>;
  expandedProducts?: Record<string, boolean>;
  onToggleExpand?: (productId: string) => void;
}

export const InventoryWorkQueue: React.FC<InventoryWorkQueueProps> = ({
  lang,
  products,
  variantsByProduct,
  isLoading,
  isError,
  onEdit,
  onDelete,
  onPrintLabel,
  onConfigureBom,
  onTransferToIncubator,
  onDuplicate,
  onShare,
  onPreview,
  renderVariantList,
  selectedProductIds = new Set<string>(),
  onToggleProduct = () => undefined,
  onToggleAll = () => undefined,
  currency = "BHD",
  categories,
  expandedProducts: controlledExpandedProducts,
  onToggleExpand: controlledOnToggleExpand,
}) => {
  const isAr = lang === "ar";
  const [internalExpandedProducts, setInternalExpandedProducts] = useState<Record<string, boolean>>({});
  const expandedProducts = controlledExpandedProducts ?? internalExpandedProducts;
  const [pendingDelete, setPendingDelete] = useState<any | null>(null);
  const selectedOnPage = products.filter((product) => selectedProductIds.has(product.id)).length;

  const resolveCategoryName = (catVal: string | null | undefined) => {
    if (!catVal || !catVal.trim()) return null;
    const match = categories?.find(
      (c) =>
        c.slug?.toLowerCase() === catVal.toLowerCase() ||
        c.name_en?.toLowerCase() === catVal.toLowerCase() ||
        c.name_ar?.toLowerCase() === catVal.toLowerCase() ||
        c.id === catVal,
    );
    if (match) {
      return isAr ? match.name_ar || match.name_en : match.name_en || match.name_ar;
    }
    return catVal;
  };

  const toggleExpand = (productId: string) => {
    if (controlledOnToggleExpand) {
      controlledOnToggleExpand(productId);
    } else {
      setInternalExpandedProducts((prev) => ({
        ...prev,
        [productId]: !prev[productId],
      }));
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center text-xs text-muted-foreground bg-card rounded-xl border border-border-subtle">
        <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent mb-2" />
        <p>{isAr ? "جاري تحميل كتالوج المنتجات..." : "Loading product catalog..."}</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-8 text-center text-xs text-destructive bg-card rounded-xl border border-destructive/20">
        <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-80" />
        <p className="font-bold">{isAr ? "تعذر تحميل المنتجات" : "Failed to load products"}</p>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="p-12 text-center text-xs text-muted-foreground bg-card rounded-xl border border-border-subtle space-y-2">
        <p className="font-bold text-sm text-foreground">
          {isAr ? "لا توجد منتجات مطابقة" : "No products found"}
        </p>
        <p>
          {isAr
            ? "جرب تغيير كلمات البحث أو مسح التصفية"
            : "Try adjusting search or clearing active filters."}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-xl border border-border-subtle bg-card overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-start text-xs border-collapse">
            <thead>
              <tr className="border-b border-border-subtle bg-muted/40 font-bold text-muted-foreground uppercase text-xs tracking-wider">
                <th className="p-3 text-center w-12">
                  <Checkbox
                    checked={
                      products.length > 0 && selectedOnPage === products.length
                        ? true
                        : selectedOnPage > 0
                          ? "indeterminate"
                          : false
                    }
                    onCheckedChange={onToggleAll}
                    aria-label={
                      isAr ? "تحديد كل المنتجات في الصفحة" : "Select all products on this page"
                    }
                  />
                </th>
                <th className="p-3 text-start">
                  {isAr ? "اسم المنتج والرمز" : "Product & Identity"}
                </th>
                <th className="p-3 text-start">{isAr ? "القسم" : "Category"}</th>
                <th className="p-3 text-start">{isAr ? "المتغيرات والأنواع" : "Variants"}</th>
                <th className="p-3 text-start">{isAr ? "حالة المخزون" : "Stock Level"}</th>
                <th className="p-3 text-end">{isAr ? "سعر البيع" : "Price"}</th>
                <th className="p-3 text-center">{isAr ? "الإجراء" : "Action"}</th>
                <th className="p-3 text-center w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {products.map((product) => {
                const name = isAr
                  ? product.name_ar || product.name
                  : product.name_en || product.name;
                const pVariants = variantsByProduct[product.id] || [];
                const totalStock = pVariants.reduce(
                  (acc: number, v: any) =>
                    acc + Number(v.stock_main ?? 0) + Number(v.stock_incubator ?? 0),
                  0,
                );
                const minPrice =
                  pVariants.length > 0
                    ? Math.min(...pVariants.map((v: any) => Number(v.selling_price || 0)))
                    : Number(product.base_price || 0);

                const isLowStock = totalStock > 0 && totalStock <= 5;
                const isOutOfStock = totalStock === 0;
                const isExpanded = !!expandedProducts[product.id];

                // Commercial identifier resolution
                const sku = product.sku || pVariants.find((v: any) => v.sku)?.sku || null;
                const barcode = product.barcode || pVariants.find((v: any) => v.barcode)?.barcode || null;

                // Detailed attention diagnostics
                const media = Array.isArray(product.media) ? product.media : [];
                const hasMedia =
                  product.image_url ||
                  media.some((m: any) =>
                    typeof m === "string" ? Boolean(m.trim()) : Boolean(m?.url || m?.src),
                  );
                const hasCategory = Boolean(product.category && resolveCategoryName(product.category));
                const isHiddenWithStock = !product.is_active && totalStock > 0;

                const attentionReasons: {
                  key: string;
                  label_ar: string;
                  label_en: string;
                  tone: "danger" | "warning" | "info";
                }[] = [];
                if (isOutOfStock) {
                  attentionReasons.push({
                    key: "out_of_stock",
                    label_ar: "نفاد المخزون",
                    label_en: "Out of Stock",
                    tone: "danger",
                  });
                } else if (isLowStock) {
                  attentionReasons.push({
                    key: "low_stock",
                    label_ar: "مخزون منخفض",
                    label_en: "Low Stock",
                    tone: "warning",
                  });
                }
                if (!hasMedia) {
                  attentionReasons.push({
                    key: "missing_image",
                    label_ar: "نقص الصور",
                    label_en: "No Image",
                    tone: "warning",
                  });
                }
                if (!hasCategory) {
                  attentionReasons.push({
                    key: "missing_category",
                    label_ar: "بدون تصنيف",
                    label_en: "No Category",
                    tone: "info",
                  });
                }
                if (isHiddenWithStock) {
                  attentionReasons.push({
                    key: "hidden_with_stock",
                    label_ar: "مخفي ولديه مخزون",
                    label_en: "Hidden with Stock",
                    tone: "info",
                  });
                }

                return (
                  <React.Fragment key={product.id}>
                    <tr
                      id={`product-row-${product.id}`}
                      className="hover:bg-muted/30 transition-colors group cursor-pointer"
                      onClick={() => toggleExpand(product.id)}
                    >
                      <td className="p-3 text-center" onClick={(event) => event.stopPropagation()}>
                        <Checkbox
                          checked={selectedProductIds.has(product.id)}
                          onCheckedChange={() => onToggleProduct(product.id)}
                          aria-label={isAr ? `تحديد المنتج ${name}` : `Select product ${name}`}
                        />
                      </td>
                      {/* Product Name & Image */}
                      <td className="p-3 align-middle font-medium">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-muted border border-border-subtle flex items-center justify-center overflow-hidden shrink-0">
                            {product.image_url ? (
                              <img
                                src={product.image_url}
                                alt={name}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <Package className="h-5 w-5 text-muted-foreground" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-foreground truncate max-w-[200px] flex items-center gap-1.5">
                              <span>{name}</span>
                              {isExpanded ? (
                                <ChevronUp className="h-3.5 w-3.5 text-primary shrink-0" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 group-hover:text-foreground" />
                              )}
                            </div>
                            {sku ? (
                              <div className="text-xs text-muted-foreground font-mono">
                                SKU: {sku}
                              </div>
                            ) : barcode ? (
                              <div className="text-xs text-muted-foreground font-mono">
                                BAR: {barcode}
                              </div>
                            ) : null}
                            {attentionReasons.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {attentionReasons.map((reason) => (
                                  <span
                                    key={reason.key}
                                    className={`inline-flex items-center px-1.5 py-0.5 text-xs font-semibold rounded ${
                                      reason.tone === "danger"
                                        ? "bg-destructive/10 text-destructive border border-destructive/20"
                                        : reason.tone === "warning"
                                          ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20"
                                          : "bg-muted text-muted-foreground border border-border-subtle"
                                    }`}
                                  >
                                    {isAr ? reason.label_ar : reason.label_en}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Category */}
                      <td className="p-3 align-middle font-medium">
                        {product.category && resolveCategoryName(product.category) ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs bg-muted/70 text-foreground border border-border-subtle">
                            {resolveCategoryName(product.category)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs italic">
                            {isAr ? "بدون قسم" : "No category"}
                          </span>
                        )}
                      </td>

                      {/* Variants Breakdown */}
                      <td className="p-3 align-middle">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpand(product.id);
                          }}
                          className="h-7 px-2 text-xs font-mono font-bold hover:bg-primary/10 hover:text-primary"
                        >
                          {variantCountLabel(pVariants.length, lang)}
                          {isExpanded ? (
                            <ChevronUp className="h-3 w-3 ms-1 text-primary" />
                          ) : (
                            <ChevronDown className="h-3 w-3 ms-1 text-muted-foreground" />
                          )}
                        </Button>
                      </td>

                      {/* Stock Level */}
                      <td className="p-3 align-middle">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-md text-xs font-bold ${
                            isOutOfStock
                              ? "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
                              : isLowStock
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                                : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                          }`}
                        >
                          {isOutOfStock
                            ? isAr
                              ? "نفذت الكمية"
                              : "Out of Stock"
                            : isLowStock
                              ? isAr
                                ? stockUnitsLabel(totalStock, "low", lang)
                                : stockUnitsLabel(totalStock, "low", lang)
                              : isAr
                                ? stockUnitsLabel(totalStock, "available", lang)
                                : stockUnitsLabel(totalStock, "available", lang)}
                        </span>
                      </td>

                      {/* Price */}
                      <td className="p-3 align-middle text-end font-mono font-extrabold text-foreground">
                        {formatMoney(minPrice, currency, lang)}
                      </td>

                      {/* Primary Action Button */}
                      <td
                        className="p-3 align-middle text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          size="sm"
                          onClick={() => onEdit(product)}
                          className="h-8 px-3 text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 shadow-2xs"
                        >
                          <Pencil className="h-3 w-3 me-1" />
                          {isAr ? "تعديل" : "Edit"}
                        </Button>
                      </td>

                      {/* Secondary Actions */}
                      <td
                        className="p-3 align-middle text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground"
                              aria-label={
                                isAr ? "المزيد من إجراءات المنتج" : "More product actions"
                              }
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align={isAr ? "start" : "end"}
                            className="w-48 text-xs"
                          >
                            {onPreview && (
                              <DropdownMenuItem onClick={() => onPreview(product)}>
                                <ExternalLink className="h-3.5 w-3.5 me-2 text-primary" />
                                {isAr ? "معاينة المنتج" : "Preview Product"}
                              </DropdownMenuItem>
                            )}
                            {onShare && (
                              <DropdownMenuItem onClick={() => onShare(product)}>
                                <Share2 className="h-3.5 w-3.5 me-2 text-primary" />
                                {isAr ? "مشاركة الرابط" : "Share Link"}
                              </DropdownMenuItem>
                            )}
                            {onDuplicate && (
                              <DropdownMenuItem onClick={() => onDuplicate(product)}>
                                <Copy className="h-3.5 w-3.5 me-2 text-primary" />
                                {isAr ? "تكرار المنتج" : "Duplicate Product"}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => onPrintLabel(product)}>
                              <Printer className="h-3.5 w-3.5 me-2" />
                              {isAr ? "طباعة الباركوّد" : "Print Barcode"}
                            </DropdownMenuItem>
                            {onConfigureBom && (
                              <DropdownMenuItem onClick={() => onConfigureBom(product)}>
                                <Box className="h-3.5 w-3.5 me-2 text-primary" />
                                {isAr ? "تكاليف ومواد التغليف (BOM)" : "Packaging Materials (BOM)"}
                              </DropdownMenuItem>
                            )}
                            {onTransferToIncubator && (
                              <DropdownMenuItem onClick={() => onTransferToIncubator(product)}>
                                <Building2 className="h-3.5 w-3.5 me-2 text-primary" />
                                {isAr ? "تحويل إلى حاضنة..." : "Transfer to Incubator..."}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onSelect={() => setPendingDelete(product)}
                              className="text-rose-600 focus:text-rose-600"
                            >
                              <Trash2 className="h-3.5 w-3.5 me-2" />
                              {isAr ? "حذف المنتج" : "Delete Product"}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>

                    {/* Expanded Variant Detail Row */}
                    {isExpanded && renderVariantList && (
                      <tr className="bg-muted/15 border-b border-border-subtle">
                        <td colSpan={8} className="p-3 sm:p-4">
                          <div
                            className="bg-card rounded-lg border border-border-subtle p-3 shadow-2xs"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {renderVariantList(product)}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>{isAr ? "حذف المنتج" : "Delete product"}</AlertDialogTitle>
            <AlertDialogDescription>
              {isAr
                ? `هل أنت متأكد من حذف ${pendingDelete?.name_ar || pendingDelete?.name || "هذا المنتج"}؟ لا يمكن التراجع عن هذا الإجراء.`
                : `Delete ${pendingDelete?.name_en || pendingDelete?.name || "this product"}? This action cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{isAr ? "إلغاء" : "Cancel"}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (pendingDelete) onDelete(pendingDelete.id);
                setPendingDelete(null);
              }}
            >
              {isAr ? "حذف" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
