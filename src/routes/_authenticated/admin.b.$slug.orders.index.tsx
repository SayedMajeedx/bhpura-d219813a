import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RoutePendingSkeleton } from "@/components/os/route-pending-skeleton";
import { Download } from "lucide-react";
import { buildWhatsAppLink } from "@/lib/os-formatting";
import { OrdersCommandHeader } from "@/components/orders/OrdersCommandHeader";
import { OrdersScopeSwitcher } from "@/components/orders/OrdersScopeSwitcher";
import { OrdersToolbar } from "@/components/orders/OrdersToolbar";
import { OrdersWorkQueue } from "@/components/orders/OrdersWorkQueue";
import { OrderMobileCard } from "@/components/orders/OrderMobileCard";
import { toast } from "sonner";
import { CourierWhatsAppModal } from "@/components/courier/CourierWhatsAppModal";
import { useT, useI18n } from "@/lib/i18n";
import { resolvePaymentStatus, PAYMENT_BADGE_CLASSES } from "@/lib/payment-status";
import { type PaymentMethodFilter } from "@/lib/payment-method";
import { useBrand } from "@/lib/brand-context";
import { useProfile } from "@/lib/profile-context";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { useEffect, useMemo, useState, useDeferredValue } from "react";
import { getNavFilterContext, saveNavFilterContext } from "@/lib/os-productivity";
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
import {
  deleteOrderWithPrivateReceipt,
  deleteOrdersWithPrivateReceipts,
} from "@/lib/benefit-receipt.functions";
import { Sparkles } from "lucide-react";
import { getOrderCustomerContact } from "@/lib/order-customer-snapshot";
import { getOrderWorkflow } from "@/lib/order-workflow";
import { getFulfillmentBadgeDetails } from "@/lib/status-labels";
import { orderRequiresCourier } from "@/lib/order-fulfillment";
import { useVocabulary } from "@/hooks/use-vocabulary";
import { useAddons } from "@/components/addons/AddonsProvider";
import { invalidateOrders, ordersKeys, ordersQueries, type OrderListRow } from "@/lib/data/orders";

import { OrderQuickInspectSheet } from "@/features/orders/components/OrderQuickInspectSheet";
import { OrderImporterModal } from "@/features/orders/components/OrderImporterModal";
import { renderOrderQueueAction } from "@/features/orders/components/order-queue-action";
import { useBrandCouriers } from "@/features/orders/hooks/use-brand-couriers";
import {
  filterQueueOrders,
  orderTabCounts,
  sortQueueOrders,
} from "@/features/orders/lib/order-queue";
import { orderQueueTabs } from "@/features/orders/lib/order-queue-tabs";
import { useCompleteDelivery } from "@/features/orders/hooks/use-complete-delivery";
import { UrgentOrdersBanner } from "@/features/orders/components/UrgentOrdersBanner";
import { OrderBatchActionsBar } from "@/features/orders/components/OrderBatchActionsBar";
import { OrderListPagination } from "@/features/orders/components/OrderListPagination";
import { OrderFulfillmentModal } from "@/features/orders/components/OrderFulfillmentModal";
import { CashCollectionModal } from "@/features/orders/components/CashCollectionModal";
import { authenticatedJsonHeaders, copyInvoiceLink } from "@/features/orders/actions/order-links";
type OrdersSearch = {
  tab?: string;
  queue?: string;
  fulfillment_status?: string;
  filter?: string;
  action?: string;
};

export const Route = createFileRoute("/_authenticated/admin/b/$slug/orders/")({
  validateSearch: (search: Record<string, unknown>): OrdersSearch => {
    const result: OrdersSearch = {};
    if (typeof search.tab === "string") result.tab = search.tab;
    if (typeof search.queue === "string") result.queue = search.queue;
    if (typeof search.fulfillment_status === "string")
      result.fulfillment_status = search.fulfillment_status;
    if (typeof search.filter === "string") result.filter = search.filter;
    if (typeof search.action === "string") result.action = search.action;
    return result;
  },
  component: OrdersList,
});

function OrdersList() {
  const t = useT();
  const { lang } = useI18n();
  const locale = lang === "ar" ? "ar-BH-u-nu-latn" : "en-BH";
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { slug } = Route.useParams();
  const brand = useBrand();
  const { isCourier, isAdmin } = useProfile();
  const brandId = brand.id;
  const { vocabulary } = useVocabulary();
  const { isInstalled } = useAddons();
  const hasMadeToOrder = isInstalled("made-to-order");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  // Feature 7: Context-preserving return navigation (restore saved search & filters)
  const savedContext = getNavFilterContext("orders");

  const [search, setSearch] = useState(savedContext?.search || "");
  const [paymentFilter, setPaymentFilter] = useState(savedContext?.paymentFilter || "all");
  const [fulfillmentStatusFilter, setFulfillmentStatusFilter] = useState(
    savedContext?.fulfillmentStatusFilter || "all",
  );
  const [fulfillmentMethodFilter, setFulfillmentMethodFilter] = useState(
    savedContext?.fulfillmentMethodFilter || "all",
  );
  const [gatewayFilter, setGatewayFilter] = useState<PaymentMethodFilter>(
    savedContext?.gatewayFilter || "all",
  );
  const [inspectOrder, setInspectOrder] = useState<any | null>(null);
  const [includeHistorical, setIncludeHistorical] = useState(false);
  const [isOrderImporterOpen, setIsOrderImporterOpen] = useState(false);

  // Route search parameter integration for direct tab selection from dashboard
  const routeSearch = Route.useSearch();

  useEffect(() => {
    if (routeSearch?.action === "new_manual" || routeSearch?.action === "new") {
      navigate({
        to: "/admin/b/$slug/orders/$id",
        params: { slug, id: "new" },
        replace: true,
      });
    }
  }, [routeSearch?.action, slug, navigate]);

  const initialTabFilter = useMemo<
    "all" | "unpaid" | "to_prepare" | "action_required" | "shipped" | "completed"
  >(() => {
    if (
      routeSearch?.tab === "to_prepare" ||
      routeSearch?.queue === "to_prepare" ||
      routeSearch?.fulfillment_status === "unfulfilled" ||
      routeSearch?.filter === "unfulfilled"
    ) {
      return "to_prepare";
    }
    if (routeSearch?.tab === "unpaid" || routeSearch?.filter === "unpaid") return "unpaid";
    if (routeSearch?.tab === "action_required") return "action_required";
    if (routeSearch?.tab === "shipped") return "shipped";
    if (routeSearch?.tab === "completed") return "completed";
    return (
      (savedContext?.tabFilter as
        "all" | "unpaid" | "to_prepare" | "action_required" | "shipped" | "completed") || "all"
    );
  }, [routeSearch, savedContext?.tabFilter]);

  // Quick Tab filter
  const [tabFilter, setTabFilter] = useState<
    "all" | "unpaid" | "to_prepare" | "action_required" | "shipped" | "completed"
  >(initialTabFilter);

  // Sync tab filter whenever route search params change
  useEffect(() => {
    if (
      routeSearch?.tab === "to_prepare" ||
      routeSearch?.queue === "to_prepare" ||
      routeSearch?.fulfillment_status === "unfulfilled" ||
      routeSearch?.filter === "unfulfilled"
    ) {
      setTabFilter("to_prepare");
    } else if (routeSearch?.tab === "unpaid" || routeSearch?.filter === "unpaid") {
      setTabFilter("unpaid");
    } else if (routeSearch?.tab === "action_required") {
      setTabFilter("action_required");
    } else if (routeSearch?.tab === "shipped") {
      setTabFilter("shipped");
    } else if (routeSearch?.tab === "completed") {
      setTabFilter("completed");
    }
  }, [routeSearch?.tab, routeSearch?.queue, routeSearch?.fulfillment_status, routeSearch?.filter]);

  // Save navigation filters when they change
  useEffect(() => {
    saveNavFilterContext("orders", {
      search,
      paymentFilter,
      fulfillmentStatusFilter,
      fulfillmentMethodFilter,
      gatewayFilter,
      tabFilter,
    });
  }, [
    search,
    paymentFilter,
    fulfillmentStatusFilter,
    fulfillmentMethodFilter,
    gatewayFilter,
    tabFilter,
  ]);

  // New Fulfill states
  const [isFulfillModalOpen, setIsFulfillModalOpen] = useState(false);
  const [waModalState, setWaModalState] = useState<{
    isOpen: boolean;
    order: any;
    courier: any;
  }>({
    isOpen: false,
    order: null,
    courier: null,
  });
  const [selectedFulfillOrder, setSelectedFulfillOrder] = useState<any | null>(null);
  const [selectedCourierId, setSelectedCourierId] = useState<string>("unassigned");
  const [fulfillNotes, setFulfillNotes] = useState<string>("");
  const [isFulfilling, setIsFulfilling] = useState(false);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (selectedFulfillOrder) {
      const items = selectedFulfillOrder.order_items ?? [];
      const initial: Record<string, boolean> = {};
      items.forEach((it: any) => {
        initial[it.id] = false;
      });
      setCheckedItems(initial);
      setSelectedCourierId(selectedFulfillOrder.assigned_to || "unassigned");
      setFulfillNotes("");
    }
  }, [selectedFulfillOrder]);

  // Cash Collection Modal State for Couriers
  const [cashModalOrder, setCashModalOrder] = useState<any | null>(null);
  const [cashCollectedInput, setCashCollectedAmount] = useState<string>("");
  const [cashModalNotes, setCashModalNotes] = useState<string>("");
  const [isSubmittingCash, setIsSubmittingCash] = useState<boolean>(false);

  const { handleCompleteDelivery } = useCompleteDelivery({
    brandId,
    isCourier,
    lang,
    qc,
    setCashCollectedAmount,
    setCashModalNotes,
    setCashModalOrder,
    setIsSubmittingCash,
    setUpdatingOrderId,
  });

  const del = async (id: string) => {
    try {
      await deleteOrderWithPrivateReceipt({ data: { orderId: id } });
      toast.success(lang === "ar" ? "تم حذف الطلب بنجاح" : "Order deleted successfully");
      invalidateOrders(qc, brandId);
    } catch (err: any) {
      toast.error(err.message || "Failed to delete order");
    } finally {
      setDeleteTarget(null);
    }
  };

  const deleteSelectedOrders = async () => {
    const orderIds = [...selectedOrderIds];
    if (orderIds.length === 0) return;
    setIsBulkDeleting(true);
    try {
      const result = await deleteOrdersWithPrivateReceipts({
        data: { brandId, orderIds },
      });
      toast.success(
        lang === "ar"
          ? `تم حذف ${result.deleted} طلب بنجاح`
          : `${result.deleted} orders deleted successfully`,
      );
      setSelectedOrderIds(new Set());
      setBulkDeleteOpen(false);
      await invalidateOrders(qc, brandId);
    } catch (error: any) {
      toast.error(
        error?.message || (lang === "ar" ? "تعذر حذف الطلبات" : "Unable to delete orders"),
      );
    } finally {
      setIsBulkDeleting(false);
    }
  };

  // Fetch Couriers Query
  const couriersQ = useBrandCouriers(brandId);

  const handleQuickAssignCourier = async (orderId: string, courierId: string) => {
    const targetOrder = orders.find((order) => order.id === orderId);
    if (!targetOrder || !orderRequiresCourier(targetOrder)) {
      toast.error(
        lang === "ar"
          ? "يمكن تعيين المندوب لطلبات التوصيل فقط"
          : "Couriers can only be assigned to delivery orders",
      );
      return;
    }
    try {
      const res = await fetch("/api/orders/status", {
        method: "PATCH",
        headers: await authenticatedJsonHeaders(),
        body: JSON.stringify({
          id: orderId,
          fulfillment_status: "ASSIGNED",
          assigned_to: courierId,
        }),
      });
      if (!res.ok) throw new Error("Failed to assign courier");
      toast.success(lang === "ar" ? "تم تعيين المندوب بنجاح!" : "Courier assigned successfully!");
      const courierObj = (couriersQ.data ?? []).find((c: any) => c.id === courierId);
      if (targetOrder && courierObj) {
        setWaModalState({ isOpen: true, order: targetOrder, courier: courierObj });
      }
      invalidateOrders(qc, brandId);
    } catch {
      toast.error(lang === "ar" ? "فشل تعيين المندوب" : "Failed to assign courier");
    }
  };

  const [isBatchUpdating, setIsBatchUpdating] = useState(false);

  const handleBatchFulfillmentUpdate = async (
    newFulfillmentStatus: string,
    newOrderStatus?: string,
  ) => {
    const orderIds = [...selectedOrderIds];
    if (orderIds.length === 0) return;
    setIsBatchUpdating(true);
    try {
      const headers = await authenticatedJsonHeaders();
      const updates = orderIds.map((id) =>
        fetch("/api/orders/status", {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            id,
            fulfillment_status: newFulfillmentStatus,
            ...(newOrderStatus ? { status: newOrderStatus } : {}),
            admin_override: true,
          }),
        }),
      );
      await Promise.all(updates);
      toast.success(
        lang === "ar"
          ? `تم تحديث حالة ${orderIds.length} طلب بنجاح`
          : `Updated fulfillment status for ${orderIds.length} orders`,
      );
      setSelectedOrderIds(new Set());
      await invalidateOrders(qc, brandId);
    } catch (error: any) {
      toast.error(
        error?.message || (lang === "ar" ? "فشل تحديث الطلبات" : "Failed to update orders"),
      );
    } finally {
      setIsBatchUpdating(false);
    }
  };

  const handleBatchAssignCourier = async (courierId: string) => {
    const orderIds = [...selectedOrderIds];
    if (orderIds.length === 0) return;
    setIsBatchUpdating(true);
    try {
      const headers = await authenticatedJsonHeaders();
      const updates = orderIds.map((id) =>
        fetch("/api/orders/status", {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            id,
            fulfillment_status: "ASSIGNED",
            assigned_to: courierId,
          }),
        }),
      );
      await Promise.all(updates);
      toast.success(
        lang === "ar"
          ? `تم تعيين المندوب لـ ${orderIds.length} طلب بنجاح`
          : `Courier assigned to ${orderIds.length} orders`,
      );
      setSelectedOrderIds(new Set());
      await invalidateOrders(qc, brandId);
    } catch (error: any) {
      toast.error(
        error?.message || (lang === "ar" ? "فشل تعيين المندوب" : "Failed to assign courier"),
      );
    } finally {
      setIsBatchUpdating(false);
    }
  };

  const [sortField, _setSortField] = useState<
    "invoice_number" | "created_at" | "customer" | "status" | "total"
  >("created_at");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Reset page when sorting, search, filters or page size change
  useEffect(() => {
    if (page !== 1) setPage(1);
  }, [
    search,
    paymentFilter,
    fulfillmentStatusFilter,
    fulfillmentMethodFilter,
    sortField,
    sortDirection,
    pageSize,
    page,
  ]);

  useRealtimeInvalidate(
    [
      { table: "orders", brandId, queryKey: ordersKeys.all(brandId) },
      { table: "order_items", brandId, queryKey: ordersKeys.all(brandId) },
    ],
    `orders-list-${brandId}`,
  );

  const ordersQ = useQuery(ordersQueries.list(brandId, isCourier ? "assigned-courier" : "office"));

  const create = async () => {
    navigate({ to: "/admin/b/$slug/orders/$id", params: { slug, id: "new" } });
  };

  const orders = useMemo(() => ordersQ.data ?? [], [ordersQ.data]);
  const deferredSearch = useDeferredValue(search);
  const normalizedSearch = deferredSearch.trim().toLowerCase();

  // Premium Quick Tabs counts in real time
  const tabCounts = useMemo(
    () => orderTabCounts(orders, { includeHistorical, hasMadeToOrder }),
    [orders, includeHistorical, hasMadeToOrder],
  );

  // Combined search, standard drop-down filters, and our premium quick tab filter
  const filteredOrders = useMemo(
    () =>
      filterQueueOrders(orders, {
        search: normalizedSearch,
        paymentFilter,
        fulfillmentStatusFilter,
        fulfillmentMethodFilter,
        gatewayFilter,
        tabFilter,
        includeHistorical,
        hasMadeToOrder,
      }),
    [
      orders,
      normalizedSearch,
      paymentFilter,
      fulfillmentStatusFilter,
      fulfillmentMethodFilter,
      gatewayFilter,
      tabFilter,
      includeHistorical,
      hasMadeToOrder,
    ],
  );

  const sortedOrders = useMemo(
    () => sortQueueOrders(filteredOrders, sortField, sortDirection),
    [filteredOrders, sortField, sortDirection],
  );

  const paginatedOrders = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedOrders.slice(start, start + pageSize);
  }, [sortedOrders, page, pageSize]);

  const allFilteredOrdersSelected =
    sortedOrders.length > 0 && sortedOrders.every((order) => selectedOrderIds.has(order.id));

  const totalPages = Math.ceil(sortedOrders.length / pageSize) || 1;

  const tabsList = orderQueueTabs(tabCounts);

  const activeFilterCount = [
    paymentFilter !== "all",
    fulfillmentStatusFilter !== "all",
    fulfillmentMethodFilter !== "all",
    gatewayFilter !== "all",
    includeHistorical,
    Boolean(search.trim()),
  ].filter(Boolean).length;

  const clearFilters = () => {
    setSearch("");
    setPaymentFilter("all");
    setFulfillmentStatusFilter("all");
    setFulfillmentMethodFilter("all");
    setGatewayFilter("all");
    setIncludeHistorical(false);
    setTabFilter("all");
    setPage(1);
  };

  const renderContextualButton = (o: OrderListRow) =>
    renderOrderQueueAction(
      {
        brandId,
        handleCompleteDelivery,
        hasMadeToOrder,
        isSubmittingCash,
        lang,
        qc,
        setCashCollectedAmount,
        setCashModalNotes,
        setCashModalOrder,
        setFulfillNotes,
        setIsFulfillModalOpen,
        setSelectedCourierId,
        setSelectedFulfillOrder,
        setUpdatingOrderId,
        slug,
        updatingOrderId,
        vocabulary,
      },
      o,
    );

  if (ordersQ.isLoading) {
    return <RoutePendingSkeleton />;
  }

  return (
    <div
      className="mx-auto max-w-[1500px] space-y-3.5 p-1 sm:p-2 animate-fade-in"
      dir={lang === "ar" ? "rtl" : "ltr"}
    >
      {/* 1. Integrated Application Command Header */}
      <OrdersCommandHeader
        lang={lang}
        filteredCount={filteredOrders.length}
        isCourier={isCourier}
        onCreateNew={create}
        renderImporter={
          <>
            <div
              onClick={() => setIsOrderImporterOpen(true)}
              className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-xs font-semibold text-primary hover:bg-muted"
            >
              <Sparkles className="h-4 w-4 shrink-0 text-primary" />
              <span>{lang === "ar" ? "استيراد طلبات سابقة" : "Import Past Orders"}</span>
            </div>
            <Link
              to="/admin/b/$slug/export"
              params={{ slug }}
              className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-xs font-semibold text-primary hover:bg-muted"
            >
              <Download className="h-4 w-4 shrink-0 text-primary" />
              <span>
                {lang === "ar"
                  ? "تصدير الطلبات (إكسل / كشف حساب)"
                  : "Export Orders (Excel / Ledger)"}
              </span>
            </Link>
          </>
        }
      />

      {/* 2. Segmented Operational Scope Switcher */}
      <OrdersScopeSwitcher
        lang={lang}
        tabs={tabsList}
        activeTab={tabFilter}
        onTabChange={(tabId) => {
          setTabFilter(tabId as any);
          setPage(1);
        }}
      />

      {/* 2b. Urgent Order Exceptions Banner */}
      {tabCounts.action_required > 0 && tabFilter !== "action_required" && (
        <UrgentOrdersBanner
          hasMadeToOrder={hasMadeToOrder}
          lang={lang}
          setPage={setPage}
          setTabFilter={setTabFilter}
          tabCounts={tabCounts}
        />
      )}

      {/* 3. Compact Command Toolbar */}
      <OrdersToolbar
        lang={lang}
        search={search}
        onSearchChange={(val) => {
          setSearch(val);
          setPage(1);
        }}
        paymentFilter={paymentFilter}
        onPaymentFilterChange={(val) => {
          setPaymentFilter(val);
          setPage(1);
        }}
        fulfillmentStatusFilter={fulfillmentStatusFilter}
        onFulfillmentStatusFilterChange={(val) => {
          setFulfillmentStatusFilter(val);
          setPage(1);
        }}
        fulfillmentMethodFilter={fulfillmentMethodFilter}
        onFulfillmentMethodFilterChange={(val) => {
          setFulfillmentMethodFilter(val);
          setPage(1);
        }}
        gatewayFilter={gatewayFilter}
        onGatewayFilterChange={(val) => {
          setGatewayFilter(val);
          setPage(1);
        }}
        includeHistorical={includeHistorical}
        onIncludeHistoricalChange={(val) => setIncludeHistorical(val)}
        sortOrder={sortDirection === "asc" ? "oldest" : "newest"}
        onSortOrderChange={(val) => setSortDirection(val === "oldest" ? "asc" : "desc")}
        activeFilterCount={activeFilterCount}
        onClearFilters={clearFilters}
      />

      {isAdmin && (
        <OrderBatchActionsBar
          allFilteredOrdersSelected={allFilteredOrdersSelected}
          couriersQ={couriersQ}
          handleBatchAssignCourier={handleBatchAssignCourier}
          handleBatchFulfillmentUpdate={handleBatchFulfillmentUpdate}
          isBatchUpdating={isBatchUpdating}
          lang={lang}
          selectedOrderIds={selectedOrderIds}
          setBulkDeleteOpen={setBulkDeleteOpen}
          setSelectedOrderIds={setSelectedOrderIds}
          sortedOrders={sortedOrders}
        />
      )}

      {/* 4. Mobile Purpose-Built Order Cards (375px) */}
      <div className="space-y-3 block sm:hidden">
        {paginatedOrders.map((o) => {
          const paymentBadge = resolvePaymentStatus(
            (o as any).payment_status,
            o.status,
            Number(o.total),
            Number((o as any).advance_paid ?? 0),
          );
          const fulfillmentDetails = getFulfillmentBadgeDetails(
            getOrderWorkflow(o, { productionStages: hasMadeToOrder }).fulfillment,
            lang,
            (o as any).fulfillment_method,
            vocabulary,
          );

          return (
            <OrderMobileCard
              key={o.id}
              lang={lang}
              slug={slug}
              order={o}
              paymentBadge={
                paymentBadge
                  ? {
                      label: t(`payStatus.${paymentBadge}`),
                      className: PAYMENT_BADGE_CLASSES[paymentBadge],
                    }
                  : null
              }
              fulfillmentBadge={fulfillmentDetails}
              renderPrimaryAction={(ord: any) => renderContextualButton(ord)}
              selected={selectedOrderIds.has(o.id)}
              onSelectedChange={(selected) =>
                setSelectedOrderIds((current) => {
                  const next = new Set(current);
                  if (selected) next.add(o.id);
                  else next.delete(o.id);
                  return next;
                })
              }
            />
          );
        })}
      </div>

      {/* 5. High-Density Desktop Work Queue Table */}
      <div className="hidden sm:block">
        <OrdersWorkQueue
          lang={lang}
          slug={slug}
          orders={paginatedOrders}
          isLoading={ordersQ.isLoading}
          isError={ordersQ.isError}
          getPaymentBadge={(o) => {
            const pb = resolvePaymentStatus(
              (o as any).payment_status,
              o.status,
              Number(o.total),
              Number((o as any).advance_paid ?? 0),
            );
            return pb
              ? {
                  label: t(`payStatus.${pb}`),
                  className: PAYMENT_BADGE_CLASSES[pb],
                }
              : null;
          }}
          getFulfillmentBadge={(o) =>
            getFulfillmentBadgeDetails(
              getOrderWorkflow(o, { productionStages: hasMadeToOrder }).fulfillment,
              lang,
              (o as any).fulfillment_method,
              vocabulary,
            )
          }
          renderPrimaryAction={(o) => renderContextualButton(o)}
          onCopyInvoice={(id: string) => {
            const ord = orders.find((x: any) => x.id === id);
            if (ord) copyInvoiceLink((ord as any).public_invoice_token, t);
          }}
          onPrintThermal={(o) => {
            setInspectOrder(o);
          }}
          onWhatsAppCustomer={(o) => {
            const phone = getOrderCustomerContact(o)?.phone;
            const waUrl = buildWhatsAppLink(phone);
            if (waUrl) window.open(waUrl, "_blank");
          }}
          couriers={couriersQ.data ?? []}
          onQuickViewOrder={(o) => setInspectOrder(o)}
          onWhatsAppCourier={(o: any, courier: any) =>
            setWaModalState({ isOpen: true, order: o, courier })
          }
          onAssignCourier={handleQuickAssignCourier}
          onDeleteOrder={isAdmin ? (id: string) => setDeleteTarget(id) : undefined}
          selectedOrderIds={selectedOrderIds}
          onToggleOrder={(id, selected) =>
            setSelectedOrderIds((current) => {
              const next = new Set(current);
              if (selected) next.add(id);
              else next.delete(id);
              return next;
            })
          }
          onToggleAll={(selected) =>
            setSelectedOrderIds((current) => {
              const next = new Set(current);
              for (const order of paginatedOrders) {
                if (selected) next.add(order.id);
                else next.delete(order.id);
              }
              return next;
            })
          }
        />
      </div>

      {/* Pagination Controls */}
      <OrderListPagination
        lang={lang}
        page={page}
        pageSize={pageSize}
        setPage={setPage}
        setPageSize={setPageSize}
        sortedOrders={sortedOrders}
        totalPages={totalPages}
      />
      {isAdmin && (
        <AlertDialog
          open={deleteTarget !== null}
          onOpenChange={(open) => {
            if (!open) {
              setDeleteTarget(null);
            } else {
              setInspectOrder(null);
            }
          }}
        >
          <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg z-[100]">
            <AlertDialogHeader>
              <AlertDialogTitle>{t("common.delete")}</AlertDialogTitle>
              <AlertDialogDescription>{t("orders.deleteConfirm")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  if (deleteTarget) void del(deleteTarget);
                }}
              >
                {t("common.delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {isAdmin && (
        <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
          <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
            <AlertDialogHeader>
              <AlertDialogTitle>
                {lang === "ar"
                  ? `حذف ${selectedOrderIds.size} طلب؟`
                  : `Delete ${selectedOrderIds.size} orders?`}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {lang === "ar"
                  ? "سيتم حذف الطلبات المحددة نهائياً واستعادة مخزونها حسب سجلات الحجز. لا يمكن التراجع عن هذا الإجراء."
                  : "The selected orders will be permanently deleted and reserved stock will be restored according to the inventory records. This cannot be undone."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isBulkDeleting}>
                {lang === "ar" ? "إلغاء" : "Cancel"}
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={isBulkDeleting || selectedOrderIds.size === 0}
                onClick={(event) => {
                  event.preventDefault();
                  void deleteSelectedOrders();
                }}
              >
                {isBulkDeleting
                  ? lang === "ar"
                    ? "جارٍ الحذف..."
                    : "Deleting..."
                  : lang === "ar"
                    ? "تأكيد الحذف"
                    : "Confirm delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Interactive Packing Verification & Fulfillment Modal */}
      <OrderFulfillmentModal
        brandId={brandId}
        checkedItems={checkedItems}
        couriersQ={couriersQ}
        fulfillNotes={fulfillNotes}
        isFulfillModalOpen={isFulfillModalOpen}
        isFulfilling={isFulfilling}
        lang={lang}
        locale={locale}
        qc={qc}
        selectedCourierId={selectedCourierId}
        selectedFulfillOrder={selectedFulfillOrder}
        setCheckedItems={setCheckedItems}
        setFulfillNotes={setFulfillNotes}
        setIsFulfillModalOpen={setIsFulfillModalOpen}
        setIsFulfilling={setIsFulfilling}
        setSelectedCourierId={setSelectedCourierId}
        slug={slug}
      />

      {/* 💵 Cash Collection & Courier Delivery Completion Modal */}
      <CashCollectionModal
        cashCollectedInput={cashCollectedInput}
        cashModalNotes={cashModalNotes}
        cashModalOrder={cashModalOrder}
        handleCompleteDelivery={handleCompleteDelivery}
        isSubmittingCash={isSubmittingCash}
        lang={lang}
        locale={locale}
        setCashCollectedAmount={setCashCollectedAmount}
        setCashModalNotes={setCashModalNotes}
        setCashModalOrder={setCashModalOrder}
      />
      <OrderQuickInspectSheet
        order={inspectOrder}
        slug={slug}
        lang={lang}
        locale={locale}
        onClose={() => setInspectOrder(null)}
      />
      {waModalState.isOpen && waModalState.order && waModalState.courier && (
        <CourierWhatsAppModal
          isOpen={waModalState.isOpen}
          onClose={() => setWaModalState({ isOpen: false, order: null, courier: null })}
          order={waModalState.order}
          courier={waModalState.courier}
          lang={lang}
          brandSlug={slug}
          onNotified={async () => {
            await invalidateOrders(qc, brandId);
            await qc.invalidateQueries({ queryKey: ["activity_logs"] });
          }}
        />
      )}

      <OrderImporterModal
        brandId={brandId}
        isOpen={isOrderImporterOpen}
        onOpenChange={setIsOrderImporterOpen}
        onComplete={() => invalidateOrders(qc, brandId)}
      />
    </div>
  );
}
