import { useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useMemo, useDeferredValue } from "react";
import { businessSettingsQueries } from "@/lib/data/business-settings";
import { Dialog } from "@/components/ui/dialog";
import { Users, Download } from "lucide-react";
import { useT, useI18n } from "@/lib/i18n";
import { useBrand } from "@/lib/brand-context";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
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
import { buildCustomerCrmStats } from "@/lib/commerce-metrics";
import { getNavFilterContext, saveNavFilterContext } from "@/lib/os-productivity";
import { queryKeys } from "@/lib/query-keys";
import { customersKeys, customersQueries, invalidateCustomers } from "@/lib/data/customers";
import { ordersQueries } from "@/lib/data/orders";

import { CustomersCommandHeader } from "@/components/customers/CustomersCommandHeader";
import {
  CustomersScopeSwitcher,
  type CustomerSegmentScope,
} from "@/components/customers/CustomersScopeSwitcher";
import { CustomersToolbar } from "@/components/customers/CustomersToolbar";
import { CustomersWorkQueue } from "@/components/customers/CustomersWorkQueue";
import { CustomerMobileCard } from "@/components/customers/CustomerMobileCard";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { BulkSelectionToolbar } from "@/components/bulk-selection-toolbar";
import { ListPagination } from "@/components/list-pagination";
import { RoutePendingSkeleton } from "@/components/os/route-pending-skeleton";
import { OsLoadFailedState, combinedLoadState } from "@/components/os/os-load-failed-state";
import { CustomersEmptyState } from "@/features/customers/components/CustomersEmptyState";
import { useCustomerDeletion } from "@/features/customers/hooks/use-customer-deletion";
import type { Customer, Address } from "@/features/customers/lib/customers-shared";
import { CustomerImporterModal } from "@/features/customers/components/CustomerImporterModal";
import { CustomerDialog } from "@/features/customers/components/CustomerDialog";

/** The customers list. `slug` is the store in the address (the route passes it). */
export function CustomersPage({ slug }: { slug: string }) {
  const t = useT();
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const qc = useQueryClient();
  const brand = useBrand();
  const brandId = brand.id;
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [isCustomerImporterOpen, setIsCustomerImporterOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
  const {
    selectedCustomerIds,
    toggleCustomer,
    toggleCustomers,
    selectCustomers,
    clearSelection,
    deleteCustomer: del,
    deleteSelectedCustomers,
    bulkDeleteOpen,
    setBulkDeleteOpen,
    bulkDeleting,
  } = useCustomerDeletion({ brandId, isAr });

  // Feature 7: Context-preserving return navigation for Customers
  const savedContext = getNavFilterContext("customers");
  const [search, setSearch] = useState(savedContext?.search || "");
  const [regionFilter, setRegionFilter] = useState(savedContext?.regionFilter || "all");
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [page, setPage] = useState(1);

  // Save navigation context on filter changes
  useEffect(() => {
    saveNavFilterContext("customers", { search, regionFilter });
  }, [search, regionFilter]);

  useRealtimeInvalidate(
    [
      { table: "customers", brandId, queryKey: queryKeys.customers.all(brandId) },
      { table: "customer_addresses", brandId, queryKey: customersKeys.addresses(brandId) },
    ],
    `customers-list-${brandId}`,
  );

  const customersQ = useQuery({ ...customersQueries.list(brandId), refetchOnWindowFocus: false });
  const { data } = customersQ;

  const addressesQ = useQuery({
    ...customersQueries.addresses(brandId),
    refetchOnWindowFocus: false,
  });
  const defaultByCustomer = new Map<string, Address>();
  (addressesQ.data ?? []).forEach((a) => {
    if (a.is_default) defaultByCustomer.set(a.customer_id, a);
  });

  const businessName = useQuery({
    ...businessSettingsQueries.detail(brandId),
    refetchOnWindowFocus: false,
  });
  const currency = businessName.data?.currency ?? "BHD";

  const ordersQ = useQuery({
    ...ordersQueries.customerMetrics(brandId),
    refetchOnWindowFocus: false,
  });

  const customerCrmStats = useMemo(
    () => buildCustomerCrmStats(ordersQ.data ?? [], Date.now(), currency),
    [ordersQ.data, currency],
  );

  const [segmentScope, setSegmentScope] = useState<CustomerSegmentScope>("all");

  const segmentCounts = useMemo(() => {
    const counts = { all: (data ?? []).length, vip: 0, repeat: 0, new: 0, churn: 0 };
    (data ?? []).forEach((c) => {
      const stats = customerCrmStats.get(c.id);
      if (stats?.badge === "VIP") counts.vip++;
      else if (stats?.badge === "Churn Risk") counts.churn++;
      else if (stats?.badge === "New Buyer") counts.new++;
      else if (
        stats?.badge === "Regular" ||
        (stats && stats.totalOrders > 1 && stats.badge !== "VIP" && stats.badge !== "Churn Risk")
      )
        counts.repeat++;
    });
    return counts;
  }, [data, customerCrmStats]);

  const deferredSearch = useDeferredValue(search);
  const normalizedSearch = deferredSearch.trim().toLowerCase();
  const filteredCustomers = (data ?? []).filter((customer) => {
    const defaultAddress = defaultByCustomer.get(customer.id);
    const customerRegion = defaultAddress?.region || customer.region || customer.city || "";
    const stats = customerCrmStats.get(customer.id);

    const matchesSearch =
      !normalizedSearch ||
      [customer.name, customer.phone, customer.email].some((value) =>
        String(value ?? "")
          .toLowerCase()
          .includes(normalizedSearch),
      );

    const matchesRegion = regionFilter === "all" || customerRegion === regionFilter;

    let matchesScope = true;
    if (segmentScope === "vip") matchesScope = stats?.badge === "VIP";
    else if (segmentScope === "churn") matchesScope = stats?.badge === "Churn Risk";
    else if (segmentScope === "new") matchesScope = stats?.badge === "New Buyer";
    else if (segmentScope === "repeat")
      matchesScope = Boolean(
        stats?.badge === "Regular" ||
        (stats && stats.totalOrders > 1 && stats.badge !== "VIP" && stats.badge !== "Churn Risk"),
      );

    return matchesSearch && matchesRegion && matchesScope;
  });

  const filteredCustomerIds = filteredCustomers.map((customer) => customer.id);
  const customerTotalPages = Math.max(1, Math.ceil(filteredCustomers.length / rowsPerPage));
  const safeCustomerPage = Math.min(page, customerTotalPages);
  const paginatedCustomers = filteredCustomers.slice(
    (safeCustomerPage - 1) * rowsPerPage,
    safeCustomerPage * rowsPerPage,
  );
  const paginatedCustomerIds = paginatedCustomers.map((customer) => customer.id);
  useEffect(() => {
    setPage(1);
  }, [search, regionFilter, segmentScope, rowsPerPage]);
  useEffect(() => {
    if (page > customerTotalPages) setPage(customerTotalPages);
  }, [page, customerTotalPages]);
  const allFilteredCustomersSelected =
    filteredCustomerIds.length > 0 &&
    filteredCustomerIds.every((id) => selectedCustomerIds.has(id));
  const toggleVisibleCustomers = () => toggleCustomers(paginatedCustomerIds);

  const loadState = combinedLoadState([customersQ, addressesQ, ordersQ]);
  if (loadState === "loading") {
    return <RoutePendingSkeleton />;
  }

  if (loadState === "failed") {
    return (
      <div className="space-y-3.5">
        <h1 className="sr-only">{isAr ? "العملاء" : "Customers"}</h1>
        <OsLoadFailedState
          isAr={isAr}
          title={isAr ? "تعذّر تحميل العملاء" : "Customers could not be loaded"}
          description={
            isAr
              ? "لم يتم تغيير أي بيانات. تحقق من الاتصال ثم أعد المحاولة."
              : "No data was changed. Check the connection and try again."
          }
          queries={[customersQ, addressesQ, ordersQ]}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      {/* 1. Integrated Command Header */}
      <CustomersCommandHeader
        lang={isAr ? "ar" : "en"}
        customerCount={(data ?? []).length}
        onCreateNew={() => setOpen(true)}
        renderImporters={
          <>
            <DropdownMenuItem
              onClick={() => setIsCustomerImporterOpen(true)}
              className="cursor-pointer gap-2 py-2 text-xs font-semibold text-primary"
            >
              <Users className="h-4 w-4 shrink-0 text-primary" />
              <span>{isAr ? "استيراد العملاء وجهات الاتصال" : "Universal Customer Migration"}</span>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="cursor-pointer gap-2 py-2 text-xs font-semibold">
              <Link to="/admin/b/$slug/export" params={{ slug: brand.slug }}>
                <Download className="h-4 w-4 shrink-0 text-primary" />
                <span>
                  {isAr ? "تصدير العملاء (إكسل / واتساب)" : "Export Customers (Excel / WhatsApp)"}
                </span>
              </Link>
            </DropdownMenuItem>
          </>
        }
      />

      {/* 2. CRM Segment Scope Switcher */}
      <CustomersScopeSwitcher
        lang={isAr ? "ar" : "en"}
        currentScope={segmentScope}
        onScopeChange={setSegmentScope}
        counts={segmentCounts}
      />

      {/* 3. Search & Region Toolbar */}
      <CustomersToolbar
        lang={isAr ? "ar" : "en"}
        search={search}
        onSearchChange={setSearch}
        regionFilter={regionFilter}
        onRegionChange={setRegionFilter}
        activeFilterCount={
          (search ? 1 : 0) + (regionFilter !== "all" ? 1 : 0) + (segmentScope !== "all" ? 1 : 0)
        }
        onClearFilters={() => {
          setSearch("");
          setRegionFilter("all");
          setSegmentScope("all");
        }}
      />

      <BulkSelectionToolbar
        lang={isAr ? "ar" : "en"}
        entityAr="عميل"
        entityEn="customers"
        selectedCount={selectedCustomerIds.size}
        allFilteredSelected={allFilteredCustomersSelected}
        disabled={bulkDeleting || filteredCustomers.length === 0}
        onSelectAll={() => selectCustomers(filteredCustomerIds)}
        onDeselectAll={clearSelection}
        onDeleteSelected={() => setBulkDeleteOpen(true)}
      />

      {filteredCustomers.length === 0 && (
        <CustomersEmptyState
          customerCount={(data ?? []).length}
          isAr={isAr}
          onAddCustomer={() => setOpen(true)}
          onClearFilters={() => {
            setSearch("");
            setRegionFilter("all");
            setSegmentScope("all");
          }}
        />
      )}

      {/* 4. Mobile Cards View */}
      <div className="space-y-3 block sm:hidden" hidden={filteredCustomers.length === 0}>
        {paginatedCustomers.map((c) => {
          const def = defaultByCustomer.get(c.id);
          const stats = customerCrmStats.get(c.id) || {
            totalOrders: 0,
            lifetimeSpend: 0,
            lastOrderDate: null,
            badge: null,
          };

          return (
            <CustomerMobileCard
              key={c.id}
              lang={isAr ? "ar" : "en"}
              customer={c}
              defaultAddress={def}
              stats={stats}
              currency={currency}
              onSelect={(customerId) =>
                navigate({
                  to: "/admin/b/$slug/customers/$customerId",
                  params: { slug, customerId },
                })
              }
              selected={selectedCustomerIds.has(c.id)}
              onToggleSelected={toggleCustomer}
            />
          );
        })}
      </div>

      {/* 5. Desktop High-Density Work Queue */}
      <div className={filteredCustomers.length === 0 ? "hidden" : "hidden sm:block"}>
        <CustomersWorkQueue
          lang={isAr ? "ar" : "en"}
          customers={paginatedCustomers}
          defaultByCustomer={defaultByCustomer}
          customerCrmStats={customerCrmStats}
          currency={currency}
          isLoading={false}
          isError={false}
          onSelectCustomer={(customerId) =>
            navigate({
              to: "/admin/b/$slug/customers/$customerId",
              params: { slug, customerId },
            })
          }
          onDeleteCustomer={(c) => setCustomerToDelete(c)}
          selectedCustomerIds={selectedCustomerIds}
          onToggleCustomer={toggleCustomer}
          onToggleAll={toggleVisibleCustomers}
        />
      </div>

      <ListPagination
        lang={isAr ? "ar" : "en"}
        entityAr="عميل"
        entityEn="Customers"
        totalItems={filteredCustomers.length}
        page={safeCustomerPage}
        pageSize={rowsPerPage}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setRowsPerPage(size);
          setPage(1);
        }}
      />

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isAr
                ? `حذف ${selectedCustomerIds.size} عميل؟`
                : `Delete ${selectedCustomerIds.size} customers?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isAr
                ? "سيتم حذف العملاء المحددين نهائياً. تبقى الطلبات والفواتير التاريخية محفوظة بسجلاتها الحالية، ولا يمكن التراجع عن الحذف."
                : "The selected customers will be permanently deleted. Historical orders and invoices remain preserved with their current records. This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting}>
              {isAr ? "إلغاء" : "Cancel"}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={bulkDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                void deleteSelectedCustomers();
              }}
            >
              {bulkDeleting
                ? isAr
                  ? "جاري الحذف..."
                  : "Deleting..."
                : isAr
                  ? "تأكيد الحذف"
                  : "Confirm delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!customerToDelete}
        onOpenChange={(open) => !open && setCustomerToDelete(null)}
      >
        <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("common.delete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {isAr
                ? `هل أنت متأكد من رغبتك في حذف العميل "${customerToDelete?.name || ""}" نهائياً؟ لا يمكن التراجع عن هذا الإجراء.`
                : `Are you sure you want to permanently delete customer "${customerToDelete?.name || ""}"? This action cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setCustomerToDelete(null)}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (customerToDelete) {
                  void del(customerToDelete.id);
                  setCustomerToDelete(null);
                }
              }}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Customer Creation Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <CustomerDialog
          customer={null}
          onSaved={() => {
            setOpen(false);
            qc.invalidateQueries({ queryKey: queryKeys.customers.all(brandId) });
          }}
        />
      </Dialog>

      <CustomerImporterModal
        brandId={brandId}
        isOpen={isCustomerImporterOpen}
        onOpenChange={setIsCustomerImporterOpen}
        onComplete={() => void invalidateCustomers(qc, brandId)}
      />
    </div>
  );
}
