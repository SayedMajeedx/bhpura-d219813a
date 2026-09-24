import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Plus, History } from "lucide-react";
import { useT, useI18n } from "@/lib/i18n";
import { InventoryHistorySheet } from "@/components/inventory/InventoryHistorySheet";
import { useProfile } from "@/lib/profile-context";
import { useBrand } from "@/lib/brand-context";
import type { Product, Variant, VariantViewMode } from "@/features/inventory/types";
import { SIZE_UNITS } from "@/features/inventory/lib/size-units";
import {
  emptyVariantDraft,
  makeInStoreBarcode,
  newVariantDraft,
} from "@/features/inventory/lib/variant-draft";
import { stockLabels } from "@/features/inventory/lib/stock-labels";
import {
  resolveVariantListAxes,
  useInventoryAxisDefaults,
} from "@/features/inventory/hooks/use-inventory-axis-defaults";
import { useCompositeVariantHealer } from "@/features/inventory/hooks/use-composite-variant-healer";
import { useVariantMutations } from "@/features/inventory/hooks/use-variant-mutations";
import { useVariantBulkActions } from "@/features/inventory/hooks/use-variant-bulk-actions";
import { CompositeVariantsBanner } from "@/features/inventory/components/CompositeVariantsBanner";
import { VariantAddCard } from "@/features/inventory/components/VariantAddCard";
import { VariantAddRow } from "@/features/inventory/components/VariantAddRow";
import { VariantViewModeBar } from "@/features/inventory/components/VariantViewModeBar";
import { VariantTableHead } from "@/features/inventory/components/VariantTableHead";
import { VariantBulkToolbar } from "@/features/inventory/components/VariantBulkToolbar";
import { VariantMobileCard } from "@/features/inventory/components/VariantMobileCard";
import { ManageProductAxesDialog } from "@/features/inventory/components/ManageProductAxesDialog";
import { VariantDesktopRow } from "@/features/inventory/components/VariantDesktopRow";
import { BulkVariantDialog } from "@/features/inventory/components/BulkVariantDialog";

export function VariantList({
  productId,
  productName,
  businessName,
  variants,
  onChanged,
  salesByVariant,
  product,
}: {
  productId: string;
  productName: string;
  businessName: string | null;
  variants: Variant[];
  onChanged: () => void;
  salesByVariant: Map<string, number>;
  product?: Product;
}) {
  const t = useT();
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const { canViewFinancials } = useProfile();
  const brand = useBrand();
  const [historyVariant, setHistoryVariant] = useState<Variant | null>(null);
  const [historyProductOpen, setHistoryProductOpen] = useState(false);
  const addonAxisDefaults = useInventoryAxisDefaults(brand.id);
  const axes = useMemo(
    () => resolveVariantListAxes(product, addonAxisDefaults, isAr ? "ar" : "en", variants),
    [product, addonAxisDefaults, isAr, variants],
  );

  const { compositeVariants, isHealing, handleAutoHealCompositeVariants } =
    useCompositeVariantHealer({
      variants,
      product,
      productId,
      colorLabel: axes.color.label,
      isAr,
      onChanged,
    });

  const [adding, setAdding] = useState(false);
  const [row, setRow] = useState(() => emptyVariantDraft(product));

  const startAdding = (cloneFrom?: Variant) => {
    setRow(newVariantDraft(product, variants, cloneFrom));
    setAdding(true);
  };

  const { add, update, del } = useVariantMutations({
    productId,
    product,
    variants,
    axes,
    isAr,
    onChanged,
  });
  const saveNewVariant = () =>
    add(row, () => {
      setRow(emptyVariantDraft(product));
      setAdding(false);
    });

  const { mainLabel, incLabel, barcodeLabel } = stockLabels(isAr);

  // State for dynamic columns compacting / hiding
  const [viewMode, setViewMode] = useState<VariantViewMode>("quick");

  const hasAnyImage = useMemo(
    () => variants.some((v) => v.image_url && v.image_url.trim()),
    [variants],
  );

  const renderImageCol = viewMode === "full" || (viewMode === "barcodes" && hasAnyImage);
  const renderSkuCol = viewMode === "full" || viewMode === "barcodes";
  const renderBarcodeCol = viewMode === "full" || viewMode === "barcodes";

  // Selected state for bulk actions
  const {
    selectedIds,
    setSelectedIds,
    isAllSelected,
    toggleSelectAll,
    toggleSelect,
    bulkSetPrice,
    bulkAddStock,
    bulkApplyMarkup,
    bulkDelete,
  } = useVariantBulkActions(variants, onChanged, isAr);

  return (
    <div className="mt-4 border-t border-border pt-4">
      {/* 1-Click Smart Split & Auto-Healer Banner */}
      {compositeVariants.length > 0 && (
        <CompositeVariantsBanner
          compositeVariants={compositeVariants}
          isHealing={isHealing}
          onHeal={handleAutoHealCompositeVariants}
          isAr={isAr}
        />
      )}

      {/* Mobile Stacked Card View */}
      <div className="space-y-4 md:hidden">
        <div className="flex items-center justify-between gap-2 pb-1">
          <div className="text-xs font-bold text-muted-foreground">
            {variants.length} {isAr ? "متغيرات" : "variants"}
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs font-bold gap-1 rounded-md"
              onClick={() => {
                setHistoryVariant(null);
                setHistoryProductOpen(true);
              }}
              title={isAr ? "سجل حركات المخزون" : "Inventory History"}
            >
              <History className="h-3.5 w-3.5 text-primary" />
              <span>{isAr ? "السجل" : "History"}</span>
            </Button>
            <ManageProductAxesDialog
              productId={productId}
              product={product}
              onChanged={onChanged}
            />
          </div>
        </div>
        {variants.map((v) => (
          <VariantMobileCard
            key={v.id}
            v={v}
            canViewFinancials={canViewFinancials}
            barcodeLabel={barcodeLabel}
            SIZE_UNITS={SIZE_UNITS}
            salesByVariant={salesByVariant}
            t={t}
            isAr={isAr}
            brand={brand}
            update={update}
            del={del}
            mainLabel={mainLabel}
            incLabel={incLabel}
            isSelected={selectedIds.has(v.id)}
            onToggleSelect={() => toggleSelect(v.id)}
            product={product}
            onDuplicate={startAdding}
            onOpenHistory={setHistoryVariant}
          />
        ))}

        {/* Adding state on Mobile */}
        {adding && (
          <VariantAddCard
            row={row}
            setRow={setRow}
            axes={axes}
            product={product}
            brandId={brand.id}
            canViewFinancials={canViewFinancials}
            isAr={isAr}
            onCancel={() => setAdding(false)}
            onSave={saveNewVariant}
          />
        )}
      </div>

      {/* Desktop Redesigned Table View */}
      <div className="hidden w-full md:block border border-border-strong rounded-2xl shadow-2xs bg-background overflow-hidden relative">
        {/* View Mode Segmented Switcher Bar */}
        <VariantViewModeBar
          viewMode={viewMode}
          setViewMode={setViewMode}
          variantCount={variants.length}
          productId={productId}
          product={product}
          onChanged={onChanged}
          onOpenHistory={() => {
            setHistoryVariant(null);
            setHistoryProductOpen(true);
          }}
          isAr={isAr}
        />

        <div className="w-full">
          <table className="w-full text-xs text-start border-collapse table-fixed">
            <VariantTableHead
              axes={axes}
              isAllSelected={isAllSelected}
              onToggleSelectAll={toggleSelectAll}
              isAr={isAr}
            />
            <tbody>
              {variants.map((v) => (
                <VariantDesktopRow
                  key={v.id}
                  v={v}
                  canViewFinancials={canViewFinancials}
                  barcodeLabel={barcodeLabel}
                  salesByVariant={salesByVariant}
                  t={t}
                  isAr={isAr}
                  brand={brand}
                  update={update}
                  productName={productName}
                  businessName={businessName}
                  genBarcode={makeInStoreBarcode}
                  del={del}
                  isSelected={selectedIds.has(v.id)}
                  onToggleSelect={() => toggleSelect(v.id)}
                  renderImageCol={renderImageCol}
                  renderSkuCol={renderSkuCol}
                  renderBarcodeCol={renderBarcodeCol}
                  product={product}
                  onDuplicate={startAdding}
                  onOpenHistory={setHistoryVariant}
                  viewMode={viewMode}
                />
              ))}

              {/* Adding desktop row (perfect matching columnar design) */}
              {adding && (
                <VariantAddRow
                  row={row}
                  setRow={setRow}
                  axes={axes}
                  product={product}
                  brandId={brand.id}
                  viewMode={viewMode}
                  canViewFinancials={canViewFinancials}
                  isAr={isAr}
                  onCancel={() => setAdding(false)}
                  onSave={saveNewVariant}
                />
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Control Buttons Footer */}
      <div className="mt-4.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {!adding && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 px-3.5 rounded-xl text-xs font-bold hover:bg-secondary/40 touch-manipulation"
              onClick={(e) => {
                e.preventDefault();
                startAdding();
              }}
            >
              <Plus className="h-3.5 w-3.5 me-1" /> {t("inventory.addVariant")}
            </Button>
          )}
          <BulkVariantDialog
            productId={productId}
            product={product}
            variants={variants}
            canViewFinancials={canViewFinancials}
            onChanged={onChanged}
          />
          <ManageProductAxesDialog productId={productId} product={product} onChanged={onChanged} />
        </div>
      </div>

      {/* FLOATING BULK ACTIONS TOOLBAR */}
      {selectedIds.size > 0 && (
        <VariantBulkToolbar
          selectedCount={selectedIds.size}
          canViewFinancials={canViewFinancials}
          isAr={isAr}
          onSetPrice={bulkSetPrice}
          onAddStock={bulkAddStock}
          onApplyMarkup={bulkApplyMarkup}
          onDelete={bulkDelete}
          onClear={() => setSelectedIds(new Set())}
        />
      )}

      <InventoryHistorySheet
        isOpen={Boolean(historyVariant || historyProductOpen)}
        onClose={() => {
          setHistoryVariant(null);
          setHistoryProductOpen(false);
        }}
        brandId={brand.id}
        slug={brand.slug}
        variantId={historyVariant?.id || null}
        productId={productId}
        productName={productName}
        variantLabel={
          historyVariant
            ? [historyVariant.size, historyVariant.color].filter(Boolean).join(" · ")
            : undefined
        }
      />
    </div>
  );
}
