import { ServicePriceSummary } from "@/features/inventory/components/ServicePriceSummary";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { useBrand } from "@/lib/brand-context";
import { useAdminStoreProfile } from "@/hooks/use-store-profile";
import { InventoryCommandHeader } from "@/components/inventory/InventoryCommandHeader";
import { InventoryScopeSwitcher } from "@/components/inventory/InventoryScopeSwitcher";
import { InventoryToolbar } from "@/components/inventory/InventoryToolbar";
import { InventoryWorkQueue } from "@/components/inventory/InventoryWorkQueue";
import { InventoryMobileCard } from "@/components/inventory/InventoryMobileCard";
import { BulkSelectionToolbar } from "@/components/bulk-selection-toolbar";
import { ProductBomModal } from "@/components/products/ProductBomModal";
import { BatchIncubatorTransferModal } from "@/components/incubators/BatchIncubatorTransferModal";

import { ListPagination } from "@/components/list-pagination";
import { InstagramImporterModal } from "@/components/inventory/InstagramImporterModal";
import type { Product, Variant } from "@/features/inventory/types";

import { ProductImporterModal } from "@/features/inventory/components/ProductImporterModal";
import { VariantList } from "@/features/inventory/components/VariantList";
import {
  inventoryCategoryOptions,
  type InventoryScope,
  type InventorySort,
} from "@/features/inventory/lib/product-list";
import { inventoryScopeTabs } from "@/features/inventory/lib/inventory-scope-tabs";
import type { InventoryView } from "@/features/inventory/lib/list-view";
import type { AttentionKey } from "@/features/inventory/lib/attention";
import { useInventoryList } from "@/features/inventory/hooks/use-inventory-list";
import { StockOverviewStrip } from "@/features/inventory/components/StockOverviewStrip";
import { MissingCostsLine } from "@/features/inventory/components/MissingCostsLine";
import { useVocabulary } from "@/hooks/use-vocabulary";
import { useProductActions } from "@/features/inventory/hooks/use-product-actions";
import { useProductBulkActions } from "@/features/inventory/hooks/use-product-bulk-actions";
import { useProductDialogData } from "@/features/inventory/hooks/use-product-dialog-data";
import { InventoryImportMenu } from "@/features/inventory/components/InventoryImportMenu";
import { isServicesProfile } from "@/lib/store-profile";
import { ProductBulkDialogsHost } from "@/features/inventory/components/ProductBulkDialogsHost";
import { DeleteProductDialog } from "@/features/inventory/components/DeleteProductDialog";
import { InventoryEmptyState } from "@/features/inventory/components/InventoryEmptyState";
import { useInventoryCategories } from "@/features/inventory/hooks/use-inventory-categories";
import { ProductDialog } from "@/features/inventory/components/ProductDialog";

export function ProductsSection({
  initialView,
  initialAction,
  products,
  variants,
  pendingNotifyCount = 0,
  businessName,
  currency,
  onChanged,
  salesHistory,
  lowStockUnits,
  pricesMatter = true,
  canViewCosts = false,
  canEditLowStockLevel = false,
  onSaveLowStockLevel,
}: {
  /** What the address asks the list to show (tab, search, filters, sort, page). */
  initialView: InventoryView;
  initialAction?: string;
  products: Product[];
  variants: Variant[];
  pendingNotifyCount?: number;
  businessName: string | null;
  currency: string;
  onChanged: () => void;
  salesHistory: any[];
  /** The store's own low-stock level. */
  lowStockUnits: number;
  /** False for a catalog that shows no prices: a product with no price is then as meant. */
  pricesMatter?: boolean;
  canViewCosts?: boolean;
  canEditLowStockLevel?: boolean;
  onSaveLowStockLevel: (level: number) => Promise<boolean>;
}) {
  const navigate = useNavigate();
  const brand = useBrand();
  const brandId = brand.id;
  const { profile: storeProfile } = useAdminStoreProfile(brandId);
  const isAr = useI18n().lang === "ar";
  const [editing, setEditing] = useState<Product | null>(null);
  const [bomTargetProduct, setBomTargetProduct] = useState<Product | null>(null);
  const [open, setOpen] = useState(false);
  const [dialogSession, setDialogSession] = useState(0);

  useEffect(() => {
    if (initialAction === "new") {
      setEditing(null);
      setDialogSession((v) => v + 1);
      setOpen(true);
      navigate({
        search: ((prev: any) => {
          const next = { ...prev };
          delete next.action;
          return next;
        }) as any,
        replace: true,
      });
    }
  }, [initialAction, navigate]);
  const [expandedProducts, setExpandedProducts] = useState<Record<string, boolean>>({});
  const [productToDelete, setProductToDelete] = useState<string | null>(null);
  const [incubatorTransferModalOpen, setIncubatorTransferModalOpen] = useState(false);
  const [incubatorTransferProducts, setIncubatorTransferProducts] = useState<Product[]>([]);
  const [isInstagramModalOpen, setIsInstagramModalOpen] = useState(false);
  const [isProductImporterOpen, setIsProductImporterOpen] = useState(false);

  const toggleProduct = (productId: string) => {
    setExpandedProducts((prev) => ({
      ...prev,
      [productId]: !prev[productId],
    }));
  };

  const list = useInventoryList({
    products,
    variants,
    salesHistory,
    initialView,
    lowStockUnits,
    pricesMatter,
    costsKnown: canViewCosts,
    lang: isAr ? "ar" : "en",
  });
  const { view, variantsByProduct, salesByVariant, productStock, lowestPrice } = list;
  const filteredDisplayProducts = list.filtered;
  const paginatedProducts = list.pageProducts;

  const {
    del,
    handleDuplicateProduct,
    handlePreviewProduct,
    handleShareProduct,
    printAll,
    printProductLabels,
  } = useProductActions({
    products,
    variants,
    variantsByProduct,
    businessName,
    currency,
    isAr,
    onChanged,
  });
  const { customFieldPresets } = useProductDialogData(brandId);
  const bulk = useProductBulkActions({
    brandId,
    products,
    presets: customFieldPresets,
    isAr,
    onChanged,
  });
  const { selectedProductIds, setSelectedProductIds, toggleSelectedProduct } = bulk;

  const { vocabulary } = useVocabulary();
  const scopeTabs = inventoryScopeTabs(list.counts, {
    tracksStock: storeProfile.modules.stock,
    madeToOrderLabel: vocabulary.made_to_order,
  });

  // A service shows its lengths and prices; a product its sizes, colours and stock.
  const renderVariants = (prod: Product) =>
    prod.item_kind === "service" ? (
      <ServicePriceSummary
        variants={variantsByProduct[prod.id] || []}
        isAr={isAr}
        currency={currency}
        product={prod}
      />
    ) : (
      <VariantList
        productId={prod.id}
        productName={prod.name}
        businessName={businessName}
        variants={variantsByProduct[prod.id] || []}
        onChanged={onChanged}
        salesByVariant={salesByVariant}
        product={prod}
      />
    );

  const categoriesQ = useInventoryCategories(brand.id);

  const categoryOptions = useMemo(
    () => inventoryCategoryOptions(products, categoriesQ.data ?? []),
    [products, categoriesQ.data],
  );

  const filteredProductIds = filteredDisplayProducts.map((product) => product.id);
  const paginatedProductIds = paginatedProducts.map((product) => product.id);
  const allFilteredProductsSelected =
    filteredProductIds.length > 0 && filteredProductIds.every((id) => selectedProductIds.has(id));
  const toggleVisibleProducts = () =>
    setSelectedProductIds((current) => {
      const next = new Set(current);
      if (paginatedProductIds.every((id) => next.has(id))) {
        paginatedProductIds.forEach((id) => next.delete(id));
      } else {
        paginatedProductIds.forEach((id) => next.add(id));
      }
      return next;
    });
  const transferSelectedToIncubators = () => {
    if (selectedProductIds.size > 0) {
      const targetList = products.filter((p) => selectedProductIds.has(p.id));
      setIncubatorTransferProducts(targetList);
      setIncubatorTransferModalOpen(true);
    } else {
      toast.info(
        isAr
          ? "يرجى تحديد منتج واحد على الأقل للتحويل للحاضنات"
          : "Please select at least one product to transfer to incubators",
      );
    }
  };

  const openNewProduct = () => {
    setEditing(null);
    setDialogSession((v) => v + 1);
    setOpen(true);
  };
  const openEditProduct = (prod: Product) => {
    setEditing(prod);
    setDialogSession((v) => v + 1);
    setOpen(true);
  };
  return (
    <div className="space-y-3.5">
      {/* 1. Integrated Command Header */}
      <InventoryCommandHeader
        lang={isAr ? "ar" : "en"}
        productCount={products.length}
        pendingNotifyCount={pendingNotifyCount}
        waitlistSlug={brand.slug}
        isCourier={false}
        isServices={isServicesProfile(storeProfile.modules)}
        onCreateNew={openNewProduct}
        renderImporters={
          <InventoryImportMenu
            slug={brand.slug}
            isAr={isAr}
            onImportInstagram={() => setIsInstagramModalOpen(true)}
            onImportCatalog={() => setIsProductImporterOpen(true)}
            onPrintAll={printAll}
            onTransferSelected={transferSelectedToIncubators}
            barcodes={storeProfile.modules.stock}
            incubators={storeProfile.modules.incubators}
          />
        }
      />

      {storeProfile.modules.stock && (
        <StockOverviewStrip
          totals={list.totals}
          currency={currency}
          lang={isAr ? "ar" : "en"}
          showCost={canViewCosts}
          showPartners={storeProfile.modules.incubators}
          lowStockUnits={lowStockUnits}
          canEditLevel={canEditLowStockLevel}
          onSaveLevel={onSaveLowStockLevel}
        />
      )}

      {canViewCosts && (
        <MissingCostsLine
          count={list.counts.missingCost}
          products={products}
          variantsByProduct={variantsByProduct}
          lowestPrice={lowestPrice}
          brandId={brandId}
          currency={currency}
          isAr={isAr}
          onSaved={onChanged}
        />
      )}

      {/* 2. Operational Scope Switcher */}
      <InventoryScopeSwitcher
        lang={isAr ? "ar" : "en"}
        tabs={scopeTabs}
        activeTab={view.scope}
        onTabChange={(tabId) => list.change({ scope: tabId as InventoryScope })}
      />

      {/* 3. Compact Command Toolbar */}
      <InventoryToolbar
        lang={isAr ? "ar" : "en"}
        search={view.search}
        onSearchChange={(search) => list.change({ search })}
        selectedCategory={view.category}
        onCategoryChange={(category) => list.change({ category })}
        categories={categoryOptions}
        sortBy={view.sort}
        onSortChange={(sort) => list.change({ sort: sort as InventorySort })}
        selectedIssue={view.issue}
        onIssueChange={(issue) => list.change({ issue: issue as "all" | AttentionKey })}
        tracksStock={storeProfile.modules.stock}
        showsCosts={canViewCosts}
        activeFilterCount={list.activeFilterCount}
        onClearFilters={list.clearFilters}
      />

      <BulkSelectionToolbar
        lang={isAr ? "ar" : "en"}
        entityAr="منتج"
        entityEn="products"
        selectedCount={selectedProductIds.size}
        allFilteredSelected={allFilteredProductsSelected}
        disabled={
          bulk.bulkDeleting ||
          bulk.bulkCategoryApplying ||
          bulk.bulkVisibilityApplying ||
          bulk.bulkPresetApplying ||
          filteredDisplayProducts.length === 0
        }
        onSelectAll={() =>
          setSelectedProductIds((current) => {
            const next = new Set(current);
            filteredProductIds.forEach((id) => next.add(id));
            return next;
          })
        }
        onDeselectAll={() => setSelectedProductIds(new Set())}
        onDeleteSelected={() => bulk.setBulkDeleteOpen(true)}
        onUpdateCategory={() => {
          bulk.setBulkSelectedCategory("");
          bulk.setBulkCategoryOpen(true);
        }}
        onPublish={() => bulk.setBulkVisibilityTarget(true)}
        onHide={() => bulk.setBulkVisibilityTarget(false)}
        onApplyPreset={() => bulk.setBulkPresetOpen(true)}
        onTransferToIncubator={() => {
          const selectedProds = products.filter((p) => selectedProductIds.has(p.id));
          if (selectedProds.length > 0) {
            setIncubatorTransferProducts(selectedProds);
            setIncubatorTransferModalOpen(true);
          }
        }}
      />

      {filteredDisplayProducts.length === 0 && (
        <InventoryEmptyState
          productCount={products.length}
          isAr={isAr}
          onAddProduct={openNewProduct}
          onClearFilters={list.clearFilters}
        />
      )}

      {/* 4. Mobile Purpose-Built Product Cards */}
      <div className="space-y-3 block sm:hidden" hidden={filteredDisplayProducts.length === 0}>
        {paginatedProducts.map((p) => {
          const pVariants = variantsByProduct[p.id] || [];
          const totalStock = productStock(p.id);
          const minPrice = lowestPrice(p.id);

          return (
            <div id={`product-row-${p.id}`} key={p.id}>
              <InventoryMobileCard
                lang={isAr ? "ar" : "en"}
                product={p}
                variants={pVariants}
                totalStock={totalStock}
                minPrice={minPrice}
                currency={currency}
                onEdit={openEditProduct}
                onDelete={(id) => setProductToDelete(id)}
                onPrintLabel={printProductLabels}
                onTransferToIncubator={(prod) => {
                  setIncubatorTransferProducts([prod]);
                  setIncubatorTransferModalOpen(true);
                }}
                onDuplicate={handleDuplicateProduct}
                onPreview={handlePreviewProduct}
                onShare={handleShareProduct}
                renderVariantList={renderVariants}
                selected={selectedProductIds.has(p.id)}
                onToggleSelected={toggleSelectedProduct}
                isExpanded={Boolean(expandedProducts[p.id])}
                onToggleExpand={() => toggleProduct(p.id)}
                lowStockUnits={lowStockUnits}
                weeklySales={list.productWeeklySales(p.id)}
                pricesMatter={pricesMatter}
                missingCost={list.missingCost(p.id)}
              />
            </div>
          );
        })}
      </div>

      {/* 5. Desktop High-Density Work Queue */}
      <div className={filteredDisplayProducts.length === 0 ? "hidden" : "hidden sm:block"}>
        <InventoryWorkQueue
          lang={isAr ? "ar" : "en"}
          products={paginatedProducts}
          variantsByProduct={variantsByProduct}
          categories={categoriesQ.data ?? []}
          currency={currency}
          isLoading={false}
          isError={false}
          expandedProducts={expandedProducts}
          onToggleExpand={toggleProduct}
          onEdit={openEditProduct}
          onDelete={(id) => setProductToDelete(id)}
          onPrintLabel={printProductLabels}
          onConfigureBom={(prod) => setBomTargetProduct(prod)}
          onTransferToIncubator={(prod) => {
            setIncubatorTransferProducts([prod]);
            setIncubatorTransferModalOpen(true);
          }}
          onDuplicate={handleDuplicateProduct}
          onPreview={handlePreviewProduct}
          onShare={handleShareProduct}
          renderVariantList={renderVariants}
          selectedProductIds={selectedProductIds}
          onToggleProduct={toggleSelectedProduct}
          onToggleAll={toggleVisibleProducts}
          lowStockUnits={lowStockUnits}
          weeklySalesOf={list.productWeeklySales}
          pricesMatter={pricesMatter}
          missingCostOf={list.missingCost}
        />
      </div>

      <ListPagination
        lang={isAr ? "ar" : "en"}
        entityAr="منتج"
        entityEn="Products"
        totalItems={filteredDisplayProducts.length}
        page={list.page}
        pageSize={list.pageSize}
        onPageChange={list.setPage}
        onPageSizeChange={list.setPageSize}
      />

      <ProductBulkDialogsHost
        bulk={bulk}
        products={products}
        categories={categoriesQ.data ?? []}
        presets={customFieldPresets}
        isAr={isAr}
      />

      <DeleteProductDialog
        productToDelete={productToDelete}
        setProductToDelete={setProductToDelete}
        onDelete={del}
        isAr={isAr}
      />

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setEditing(null);
        }}
      >
        <ProductDialog
          key={`${editing?.id ?? "new"}-${dialogSession}`}
          product={editing}
          onSaved={(newProductId?: string, kind?: "service" | "product") => {
            setOpen(false);
            setEditing(null);
            onChanged();
            if (newProductId && kind === "service") {
              // A service's prices were saved with it: nothing to add.
              setExpandedProducts((prev) => ({ ...prev, [newProductId]: true }));
              toast.success(isAr ? "تم إنشاء الخدمة." : "Service created.");
            } else if (newProductId) {
              setExpandedProducts((prev) => ({ ...prev, [newProductId]: true }));
              toast.success(
                isAr
                  ? "تم إنشاء المنتج بنجاح! تم فتح قسم المقاسات والألوان لإضافة خياراتك."
                  : "Product created successfully! Variants panel opened to add sizes & colors.",
                {
                  action: {
                    label: isAr ? "إضافة مقاسات وألوان" : "Add sizes & colors",
                    onClick: () => {
                      setExpandedProducts((prev) => ({ ...prev, [newProductId]: true }));
                      const el = document.getElementById(`product-row-${newProductId}`);
                      el?.scrollIntoView({ behavior: "smooth", block: "center" });
                    },
                  },
                  duration: 8000,
                },
              );
            }
          }}
        />
      </Dialog>

      {bomTargetProduct && (
        <ProductBomModal
          open={!!bomTargetProduct}
          onOpenChange={(open) => {
            if (!open) setBomTargetProduct(null);
          }}
          productId={bomTargetProduct.id}
          productName={bomTargetProduct.name}
          directPackagingCost={Number((bomTargetProduct as any).direct_packaging_cost || 0)}
          onSaved={onChanged}
        />
      )}

      {incubatorTransferModalOpen && (
        <BatchIncubatorTransferModal
          open={incubatorTransferModalOpen}
          onOpenChange={setIncubatorTransferModalOpen}
          targetProducts={incubatorTransferProducts}
          variantsByProduct={variantsByProduct}
          onSuccess={() => {
            setSelectedProductIds(new Set());
            void onChanged();
          }}
        />
      )}
      <InstagramImporterModal
        brandId={brandId}
        open={isInstagramModalOpen}
        onOpenChange={setIsInstagramModalOpen}
        onComplete={onChanged}
      />
      <ProductImporterModal
        brandId={brandId}
        isOpen={isProductImporterOpen}
        onOpenChange={setIsProductImporterOpen}
        onComplete={onChanged}
      />
    </div>
  );
}
