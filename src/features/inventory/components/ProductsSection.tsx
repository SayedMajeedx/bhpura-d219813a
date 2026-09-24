import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useMemo, useCallback, useDeferredValue } from "react";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { useBrand } from "@/lib/brand-context";
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
import { isLowStock, isOutOfStock } from "@/lib/inventory-health";
import type { Product, Variant } from "@/features/inventory/types";

import { ProductImporterModal } from "@/features/inventory/components/ProductImporterModal";
import { VariantList } from "@/features/inventory/components/VariantList";
import {
  filterInventoryProducts,
  inventoryCategoryOptions,
  inventoryScopeFromFilter,
  productNeedsAttention,
  productStockFrom,
  productWeeklySalesFrom,
  salesByVariantFrom,
  variantsByProductFrom,
  type InventoryScope,
} from "@/features/inventory/lib/product-list";
import { inventoryScopeTabs } from "@/features/inventory/lib/inventory-scope-tabs";
import { useProductActions } from "@/features/inventory/hooks/use-product-actions";
import { useProductBulkActions } from "@/features/inventory/hooks/use-product-bulk-actions";
import { InventoryImportMenu } from "@/features/inventory/components/InventoryImportMenu";
import {
  BulkCategoryDialog,
  BulkDeleteProductsDialog,
} from "@/features/inventory/components/ProductBulkDialogs";
import { DeleteProductDialog } from "@/features/inventory/components/DeleteProductDialog";
import { InventoryEmptyState } from "@/features/inventory/components/InventoryEmptyState";
import { useInventoryCategories } from "@/features/inventory/hooks/use-inventory-categories";
import { ProductDialog } from "@/features/inventory/components/ProductDialog";

export function ProductsSection({
  initialFilter,
  initialAction,
  products,
  variants,
  pendingNotifyCount = 0,
  businessName,
  currency,
  onChanged,
  salesHistory,
}: {
  initialFilter?: string;
  initialAction?: string;
  products: Product[];
  variants: Variant[];
  pendingNotifyCount?: number;
  businessName: string | null;
  currency: string;
  onChanged: () => void;
  salesHistory: any[];
}) {
  const navigate = useNavigate();
  const brand = useBrand();
  const brandId = brand.id;
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
  const [search, setSearch] = useState("");
  const [expandedProducts, setExpandedProducts] = useState<Record<string, boolean>>({});
  const [productToDelete, setProductToDelete] = useState<string | null>(null);
  const [incubatorTransferModalOpen, setIncubatorTransferModalOpen] = useState(false);
  const [incubatorTransferProducts, setIncubatorTransferProducts] = useState<Product[]>([]);
  const [isInstagramModalOpen, setIsInstagramModalOpen] = useState(false);
  const [isProductImporterOpen, setIsProductImporterOpen] = useState(false);
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);

  const toggleProduct = (productId: string) => {
    setExpandedProducts((prev) => ({
      ...prev,
      [productId]: !prev[productId],
    }));
  };

  const salesByVariant = useMemo(() => salesByVariantFrom(salesHistory), [salesHistory]);
  const productWeeklySales = useCallback(
    (productId: string) => productWeeklySalesFrom(variants, salesByVariant, productId),
    [variants, salesByVariant],
  );
  const productStock = useCallback(
    (productId: string) => productStockFrom(variants, productId),
    [variants],
  );
  const variantsByProduct = useMemo(() => variantsByProductFrom(variants), [variants]);

  const {
    del,
    handleDuplicateProduct,
    handlePreviewProduct,
    handleShareProduct,
    printAll,
    printProductLabels,
  } = useProductActions({ products, variants, variantsByProduct, businessName, isAr, onChanged });
  const {
    selectedProductIds,
    setSelectedProductIds,
    toggleSelectedProduct,
    bulkDeleteOpen,
    setBulkDeleteOpen,
    bulkDeleting,
    deleteSelectedProducts,
    bulkCategoryOpen,
    setBulkCategoryOpen,
    bulkSelectedCategory,
    setBulkSelectedCategory,
    bulkCategoryApplying,
    applyBulkCategory,
  } = useProductBulkActions({ brandId, products, isAr, onChanged });

  const deferredSearch = useDeferredValue(search);
  const normalizedSearch = deferredSearch.trim().toLowerCase();

  const lowStock = products.filter((product) =>
    isLowStock(productStock(product.id), productWeeklySales(product.id)),
  ).length;

  const [scopeFilter, setScopeFilter] = useState<InventoryScope>(
    () => inventoryScopeFromFilter(initialFilter) ?? "all",
  );
  useEffect(() => {
    const scope = inventoryScopeFromFilter(initialFilter);
    if (scope) setScopeFilter(scope);
  }, [initialFilter]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("newest");

  const needsAttentionProducts = useMemo(
    () =>
      products.filter((p) =>
        productNeedsAttention(p, productStock(p.id), productWeeklySales(p.id)),
      ),
    [products, productStock, productWeeklySales],
  );

  const scopeTabs = inventoryScopeTabs({
    all: products.length,
    attention: needsAttentionProducts.length,
    active: products.filter((p) => p.is_active).length,
    inactive: products.filter((p) => !p.is_active).length,
    low: lowStock,
    out: products.filter((p) => isOutOfStock(productStock(p.id))).length,
    featured: products.filter((p) => p.featured_trending).length,
  });

  const categoriesQ = useInventoryCategories(brand.id);

  const categoryOptions = useMemo(
    () => inventoryCategoryOptions(products, categoriesQ.data ?? []),
    [products, categoriesQ.data],
  );

  const filteredDisplayProducts = useMemo(
    () =>
      filterInventoryProducts({
        products,
        variantsByProduct,
        search: normalizedSearch,
        category: selectedCategory,
        scope: scopeFilter,
        sortBy,
        productStock,
        productWeeklySales,
      }),
    [
      products,
      variantsByProduct,
      normalizedSearch,
      selectedCategory,
      scopeFilter,
      sortBy,
      productStock,
      productWeeklySales,
    ],
  );

  const filteredProductIds = filteredDisplayProducts.map((product) => product.id);
  const inventoryTotalPages = Math.max(1, Math.ceil(filteredDisplayProducts.length / pageSize));
  const safeInventoryPage = Math.min(page, inventoryTotalPages);
  const paginatedProducts = filteredDisplayProducts.slice(
    (safeInventoryPage - 1) * pageSize,
    safeInventoryPage * pageSize,
  );
  const paginatedProductIds = paginatedProducts.map((product) => product.id);
  useEffect(() => {
    setPage(1);
  }, [search, selectedCategory, scopeFilter, sortBy, pageSize]);
  useEffect(() => {
    if (page > inventoryTotalPages) setPage(inventoryTotalPages);
  }, [page, inventoryTotalPages]);
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
  const clearFilters = () => {
    setSearch("");
    setSelectedCategory("all");
    setScopeFilter("all");
  };

  const activeFilterCount = (selectedCategory !== "all" ? 1 : 0) + (search ? 1 : 0);

  return (
    <div className="space-y-3.5">
      {/* 1. Integrated Command Header */}
      <InventoryCommandHeader
        lang={isAr ? "ar" : "en"}
        productCount={products.length}
        pendingNotifyCount={pendingNotifyCount}
        isCourier={false}
        onCreateNew={openNewProduct}
        renderImporters={
          <InventoryImportMenu
            slug={brand.slug}
            isAr={isAr}
            onImportInstagram={() => setIsInstagramModalOpen(true)}
            onImportCatalog={() => setIsProductImporterOpen(true)}
            onPrintAll={printAll}
            onTransferSelected={transferSelectedToIncubators}
          />
        }
      />

      {/* 2. Operational Scope Switcher */}
      <InventoryScopeSwitcher
        lang={isAr ? "ar" : "en"}
        tabs={scopeTabs}
        activeTab={scopeFilter}
        onTabChange={(tabId) => setScopeFilter(tabId as any)}
      />

      {/* 3. Compact Command Toolbar */}
      <InventoryToolbar
        lang={isAr ? "ar" : "en"}
        search={search}
        onSearchChange={setSearch}
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
        categories={categoryOptions}
        sortBy={sortBy}
        onSortChange={setSortBy}
        activeFilterCount={activeFilterCount}
        onClearFilters={clearFilters}
      />

      <BulkSelectionToolbar
        lang={isAr ? "ar" : "en"}
        entityAr="منتج"
        entityEn="products"
        selectedCount={selectedProductIds.size}
        allFilteredSelected={allFilteredProductsSelected}
        disabled={bulkDeleting || bulkCategoryApplying || filteredDisplayProducts.length === 0}
        onSelectAll={() =>
          setSelectedProductIds((current) => {
            const next = new Set(current);
            filteredProductIds.forEach((id) => next.add(id));
            return next;
          })
        }
        onDeselectAll={() => setSelectedProductIds(new Set())}
        onDeleteSelected={() => setBulkDeleteOpen(true)}
        onUpdateCategory={() => {
          setBulkSelectedCategory("");
          setBulkCategoryOpen(true);
        }}
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
          onClearFilters={clearFilters}
        />
      )}

      {/* 4. Mobile Purpose-Built Product Cards */}
      <div className="space-y-3 block sm:hidden" hidden={filteredDisplayProducts.length === 0}>
        {paginatedProducts.map((p) => {
          const pVariants = variantsByProduct[p.id] || [];
          const totalStock = productStock(p.id);
          const minPrice =
            pVariants.length > 0
              ? Math.min(...pVariants.map((v) => Number(v.selling_price || 0)))
              : Number(p.base_price || 0);

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
                renderVariantList={(prod) => (
                  <VariantList
                    productId={prod.id}
                    productName={prod.name}
                    businessName={businessName}
                    variants={variantsByProduct[prod.id] || []}
                    onChanged={onChanged}
                    salesByVariant={salesByVariant}
                    product={prod}
                  />
                )}
                selected={selectedProductIds.has(p.id)}
                onToggleSelected={toggleSelectedProduct}
                isExpanded={Boolean(expandedProducts[p.id])}
                onToggleExpand={() => toggleProduct(p.id)}
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
          renderVariantList={(prod) => (
            <VariantList
              productId={prod.id}
              productName={prod.name}
              businessName={businessName}
              variants={variantsByProduct[prod.id] || []}
              onChanged={onChanged}
              salesByVariant={salesByVariant}
              product={prod}
            />
          )}
          selectedProductIds={selectedProductIds}
          onToggleProduct={toggleSelectedProduct}
          onToggleAll={toggleVisibleProducts}
        />
      </div>

      <ListPagination
        lang={isAr ? "ar" : "en"}
        entityAr="منتج"
        entityEn="Products"
        totalItems={filteredDisplayProducts.length}
        page={safeInventoryPage}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />

      <BulkDeleteProductsDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        count={selectedProductIds.size}
        deleting={bulkDeleting}
        onConfirm={() => void deleteSelectedProducts()}
        isAr={isAr}
      />

      <BulkCategoryDialog
        open={bulkCategoryOpen}
        onOpenChange={setBulkCategoryOpen}
        count={selectedProductIds.size}
        categories={categoriesQ.data ?? []}
        value={bulkSelectedCategory}
        onValueChange={setBulkSelectedCategory}
        applying={bulkCategoryApplying}
        onApply={() => void applyBulkCategory()}
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
          onSaved={(newProductId?: string) => {
            setOpen(false);
            setEditing(null);
            onChanged();
            if (newProductId) {
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
