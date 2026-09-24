import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { RoutePendingSkeleton } from "@/components/os/route-pending-skeleton";
import { Button } from "@/components/ui/button";
import {
  ReceiptText,
  Trash2,
  AlertCircle,
  Download,
  Clock3,
  CircleDollarSign,
  Truck,
  ChevronLeft,
  ChevronRight,
  Package,
  CheckSquare,
  Square,
  CheckCircle2,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { matchesPaymentMethodFilter, type PaymentMethodFilter } from "@/lib/payment-method";
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
import { cn } from "@/lib/utils";
import { getOrderCustomerContact, getOrderCustomerName } from "@/lib/order-customer-snapshot";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { getOrderWorkflow } from "@/lib/order-workflow";
import { getFulfillmentBadgeDetails } from "@/lib/status-labels";
import { orderRequiresCourier } from "@/lib/order-fulfillment";
import { useVocabulary } from "@/hooks/use-vocabulary";
import { useAddons } from "@/components/addons/AddonsProvider";

import { OrderQuickInspectSheet } from "@/features/orders/components/OrderQuickInspectSheet";
import { OrderImporterModal } from "@/features/orders/components/OrderImporterModal";
import { renderOrderQueueAction } from "@/features/orders/components/order-queue-action";
import { useBrandCouriers } from "@/features/orders/hooks/use-brand-couriers";
import { OrderFulfillmentModal } from "@/features/orders/components/OrderFulfillmentModal";
import { CashCollectionModal } from "@/features/orders/components/CashCollectionModal";
import {
  normalizedFulfillmentStage,
  orderNeedsOperatorAction,
} from "@/features/orders/lib/order-queue";
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

  const handleCompleteDelivery = async (order: any, amountToCollect: number, notes?: string) => {
    if (amountToCollect < 0) {
      toast.error(
        lang === "ar"
          ? "لا يمكن أن يكون المبلغ المحصل بالسالب"
          : "Collected amount cannot be negative",
      );
      return;
    }
    const ordersQueryKey = ["orders", brandId, isCourier ? "assigned-courier" : "office"];
    const previousOrders = qc.getQueryData<any[]>(ordersQueryKey);
    setUpdatingOrderId(order.id);
    setIsSubmittingCash(true);
    qc.setQueryData<any[]>(ordersQueryKey, (current) =>
      current?.map((item) =>
        item.id === order.id
          ? {
              ...item,
              status: "completed",
              fulfillment_status: "COMPLETED",
              delivered_at: new Date().toISOString(),
            }
          : item,
      ),
    );
    try {
      // 1. Try atomic RPC first
      const { error: rpcErr } = await (supabase.rpc as any)("courier_complete_delivery", {
        p_order_id: order.id,
        p_collected_amount: amountToCollect,
        p_notes: notes || null,
      });

      if (rpcErr) {
        // 2. Direct table update fallback if RPC function missing or column schema mismatch
        const currentPaid = Number(order.advance_paid ?? order.paid_amount ?? 0);
        const newPaid = currentPaid + amountToCollect;
        const total = Number(order.total || 0);
        const newStatus =
          newPaid >= total
            ? "paid"
            : newPaid > 0
              ? "partially_paid"
              : order.payment_status || "unpaid";

        let updatedNotes = order.delivery_notes || "";
        if (notes && notes.trim()) {
          const timestamp = new Date().toISOString().slice(0, 16).replace("T", " ");
          updatedNotes = updatedNotes
            ? `${updatedNotes}\n[${timestamp}]: ${notes.trim()}`
            : notes.trim();
        }

        const { error: updateErr } = await supabase
          .from("orders")
          .update({
            advance_paid: newPaid,
            cod_collected_amount: amountToCollect,
            cod_collected_at: new Date().toISOString(),
            payment_status: newStatus,
            fulfillment_status: "COMPLETED",
            status: "completed",
            delivery_notes: updatedNotes || null,
            delivered_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as any)
          .eq("id", order.id);

        if (updateErr) throw updateErr;
      }

      toast.success(
        lang === "ar"
          ? "تم تسجيل تسليم الطلب وتأكيد التحصيل بنجاح!"
          : "Delivery completed and payment confirmed!",
      );
      setCashModalOrder(null);
      setCashCollectedAmount("");
      setCashModalNotes("");
      qc.invalidateQueries({ queryKey: ["orders", brandId] });
    } catch (err: any) {
      qc.setQueryData(ordersQueryKey, previousOrders);
      toast.error(err.message || "Failed to complete delivery");
    } finally {
      setUpdatingOrderId(null);
      setIsSubmittingCash(false);
    }
  };

  const del = async (id: string) => {
    try {
      await deleteOrderWithPrivateReceipt({ data: { orderId: id } });
      toast.success(lang === "ar" ? "تم حذف الطلب بنجاح" : "Order deleted successfully");
      qc.invalidateQueries({ queryKey: ["orders", brandId] });
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
      await qc.invalidateQueries({ queryKey: ["orders", brandId] });
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
    const targetOrder = orders.find((order: any) => order.id === orderId);
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
      qc.invalidateQueries({ queryKey: ["orders", brandId] });
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
      await qc.invalidateQueries({ queryKey: ["orders", brandId] });
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
      await qc.invalidateQueries({ queryKey: ["orders", brandId] });
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
      { table: "orders", brandId, queryKey: ["orders", brandId] },
      { table: "order_items", brandId, queryKey: ["orders", brandId] },
    ],
    `orders-list-${brandId}`,
  );

  const ordersQ = useQuery({
    queryKey: ["orders", brandId, isCourier ? "assigned-courier" : "office"],
    // Realtime can briefly disconnect on a courier's mobile device. A small
    // interval makes order state changes reliably appear in every workspace.
    refetchInterval: isCourier ? 10_000 : 30_000,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      let query: any = supabase
        .from("orders")
        .select("*, customers(*), order_items(*)")
        .eq("brand_id", brandId);
      if (isCourier) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return [];
        query = query.eq("assigned_to", user.id).eq("fulfillment_method", "delivery");
      }
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const create = async () => {
    navigate({ to: "/admin/b/$slug/orders/$id", params: { slug, id: "new" } });
  };

  const orders = useMemo(() => ordersQ.data ?? [], [ordersQ.data]);
  const deferredSearch = useDeferredValue(search);
  const normalizedSearch = deferredSearch.trim().toLowerCase();

  // Premium Quick Tabs counts in real time
  const tabCounts = useMemo(() => {
    let all = 0;
    let unpaid = 0;
    let action_required = 0;
    let to_prepare = 0;
    let shipped = 0;
    let completed = 0;

    for (const order of orders) {
      if (order.status === "archived_historical" && !includeHistorical) {
        continue;
      }

      const workflow = getOrderWorkflow(order, { productionStages: hasMadeToOrder });

      all++;
      if (workflow.awaitingPayment) unpaid++;
      if (workflow.needsAttention) action_required++;
      if (
        !workflow.terminal &&
        [
          "pending",
          "packing",
          "on_hold",
          "needs_packing",
          ...(hasMadeToOrder
            ? [
                "received_from_workshop",
                "sent_to_workshop",
                "received_from_tailor",
                "sent_to_tailor",
              ]
            : []),
        ].includes(workflow.fulfillment) &&
        (!workflow.awaitingPayment || workflow.isCod)
      ) {
        to_prepare++;
      }
      if (workflow.withCourier) shipped++;
      if (workflow.fulfillment === "completed") completed++;
    }

    return { all, unpaid, action_required, to_prepare, shipped, completed };
  }, [orders, includeHistorical, hasMadeToOrder]);

  // Combined search, standard drop-down filters, and our premium quick tab filter
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      // Hide archived historical orders by default unless includeHistorical is toggled on
      if (order.status === "archived_historical" && !includeHistorical) {
        return false;
      }

      const matchesSearch =
        !normalizedSearch ||
        [
          order.invoice_number,
          getOrderCustomerName(order),
          order.status,
          order.payment_method,
          order.digital_delivery_contact,
        ].some((value) =>
          String(value ?? "")
            .toLowerCase()
            .includes(normalizedSearch),
        );

      if (!matchesSearch) return false;
      const paymentBadge = resolvePaymentStatus(
        order.payment_status,
        order.status,
        Number(order.total),
        Number(order.advance_paid ?? 0),
      );
      const ff = String(order.fulfillment_status || "").toUpperCase();
      const isPendingVerification =
        String(order.status ?? "").toLowerCase() === "pending_verification" &&
        paymentBadge === "unpaid" &&
        !["COMPLETED", "DELIVERED", "CANCELLED"].includes(ff);
      if (
        paymentFilter !== "all" &&
        (paymentFilter === "pending_verification"
          ? !isPendingVerification
          : paymentBadge !== paymentFilter || isPendingVerification)
      ) {
        return false;
      }
      if (
        fulfillmentStatusFilter !== "all" &&
        normalizedFulfillmentStage(order) !== fulfillmentStatusFilter
      ) {
        return false;
      }
      if (
        fulfillmentMethodFilter !== "all" &&
        order.fulfillment_method !== fulfillmentMethodFilter
      ) {
        return false;
      }
      if (!matchesPaymentMethodFilter(order.payment_method, gatewayFilter)) return false;

      // Quick tab routing
      if (tabFilter === "unpaid") {
        return getOrderWorkflow(order, { productionStages: hasMadeToOrder }).awaitingPayment;
      }
      if (tabFilter === "action_required") {
        return orderNeedsOperatorAction(order, hasMadeToOrder);
      }
      if (tabFilter === "to_prepare") {
        const wf = getOrderWorkflow(order, { productionStages: hasMadeToOrder });
        return (
          !wf.terminal &&
          [
            "pending",
            "packing",
            "on_hold",
            "needs_packing",
            ...(hasMadeToOrder
              ? [
                  "received_from_workshop",
                  "sent_to_workshop",
                  "received_from_tailor",
                  "sent_to_tailor",
                ]
              : []),
          ].includes(wf.fulfillment) &&
          (!wf.awaitingPayment || wf.isCod)
        );
      }
      if (tabFilter === "shipped") {
        return normalizedFulfillmentStage(order) === "out_for_delivery";
      }
      if (tabFilter === "completed") {
        return normalizedFulfillmentStage(order) === "completed";
      }

      return true; // tabFilter === "all"
    });
  }, [
    orders,
    normalizedSearch,
    paymentFilter,
    fulfillmentStatusFilter,
    fulfillmentMethodFilter,
    gatewayFilter,
    tabFilter,
    includeHistorical,
    hasMadeToOrder,
  ]);

  const sortedOrders = useMemo(() => {
    const list = [...filteredOrders];
    list.sort((a, b) => {
      let valA: any = "";
      let valB: any = "";

      if (sortField === "invoice_number") {
        valA = a.invoice_number ?? 0;
        valB = b.invoice_number ?? 0;
        return sortDirection === "asc" ? valA - valB : valB - valA;
      } else if (sortField === "created_at") {
        valA = new Date(a.created_at ?? a.order_date).getTime();
        valB = new Date(b.created_at ?? b.order_date).getTime();
        return sortDirection === "asc" ? valA - valB : valB - valA;
      } else if (sortField === "customer") {
        valA = getOrderCustomerName(a);
        valB = getOrderCustomerName(b);
      } else if (sortField === "status") {
        valA = a.status ?? "";
        valB = b.status ?? "";
      } else if (sortField === "total") {
        valA = Number(a.total ?? 0);
        valB = Number(b.total ?? 0);
        return sortDirection === "asc" ? valA - valB : valB - valA;
      }

      valA = String(valA).toLowerCase();
      valB = String(valB).toLowerCase();

      if (valA < valB) return sortDirection === "asc" ? -1 : 1;
      if (valA > valB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [filteredOrders, sortField, sortDirection]);

  const paginatedOrders = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedOrders.slice(start, start + pageSize);
  }, [sortedOrders, page, pageSize]);

  const allFilteredOrdersSelected =
    sortedOrders.length > 0 && sortedOrders.every((order) => selectedOrderIds.has(order.id));

  const totalPages = Math.ceil(sortedOrders.length / pageSize) || 1;

  const tabsList = [
    {
      id: "action_required",
      label_en: "Needs attention",
      label_ar: "يحتاج متابعة",
      count: tabCounts.action_required,
      icon: Clock3,
    },
    {
      id: "unpaid",
      label_en: "Awaiting payment",
      label_ar: "بانتظار الدفع",
      count: tabCounts.unpaid,
      icon: CircleDollarSign,
    },
    {
      id: "to_prepare",
      label_en: "To prepare",
      label_ar: "قيد التجهيز",
      count: tabCounts.to_prepare,
      icon: Package,
    },
    {
      id: "shipped",
      label_en: "With courier",
      label_ar: "مع المندوب",
      count: tabCounts.shipped,
      icon: Truck,
    },
    {
      id: "completed",
      label_en: "Completed",
      label_ar: "مكتملة",
      count: tabCounts.completed,
      icon: CheckCircle2,
    },
    {
      id: "all",
      label_en: "All orders",
      label_ar: "كل الطلبات",
      count: tabCounts.all,
      icon: ReceiptText,
    },
  ] as const;

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

  const renderContextualButton = (o: any) =>
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
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="text-xs font-medium">
              <span className="font-bold">
                {lang === "ar"
                  ? `تنبيه: ${tabCounts.action_required} طلب يحتاج إجراءً فورياً`
                  : `Attention: ${tabCounts.action_required} order(s) require immediate action`}
              </span>
              <span className="opacity-80 ms-1.5 hidden sm:inline">
                {lang === "ar"
                  ? hasMadeToOrder
                    ? "(تحصيل عند الاستلام، تسليم غير مكتمل، أو تفاصيل الطلب)"
                    : "(تحصيل عند الاستلام، تسليم غير مكتمل، أو تأكيد الدفع)"
                  : hasMadeToOrder
                    ? "(COD collection, failed delivery, or custom specifications)"
                    : "(COD collection, failed delivery, or payment verification)"}
              </span>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setTabFilter("action_required");
              setPage(1);
            }}
            className="h-7 text-xs font-bold border-amber-500/40 hover:bg-amber-500/20 text-amber-900 dark:text-amber-100 shrink-0"
          >
            {lang === "ar" ? "معالجة التنبيهات الآن" : "Resolve Exceptions Now"}
          </Button>
        </div>
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
        <div
          className={cn(
            "flex-col gap-2 rounded-xl border border-border-strong bg-card p-3 shadow-sm sm:flex sm:flex-row sm:items-center sm:justify-between",
            selectedOrderIds.size > 0 ? "flex" : "hidden",
          )}
        >
          <div className="flex items-center gap-2 text-xs font-semibold">
            <CheckSquare className="h-4 w-4 text-primary" />
            <span>
              {lang === "ar"
                ? `${selectedOrderIds.size} طلب محدد`
                : `${selectedOrderIds.size} selected`}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              disabled={allFilteredOrdersSelected}
              onClick={() =>
                setSelectedOrderIds(new Set(sortedOrders.map((order: any) => order.id)))
              }
            >
              <CheckSquare className="h-3.5 w-3.5" />
              {lang === "ar" ? "تحديد الكل" : "Select all"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              disabled={selectedOrderIds.size === 0}
              onClick={() => setSelectedOrderIds(new Set())}
            >
              <Square className="h-3.5 w-3.5" />
              {lang === "ar" ? "إلغاء تحديد الكل" : "Deselect all"}
            </Button>
            {selectedOrderIds.size > 0 && (
              <>
                {/* Batch Fulfillment Status Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isBatchUpdating}
                      className="h-8 gap-1.5 text-xs font-semibold"
                    >
                      <Package className="h-3.5 w-3.5 text-primary" />
                      {lang === "ar" ? "تحديث حالة التجهيز" : "Update fulfillment"}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem
                      onClick={() => handleBatchFulfillmentUpdate("PACKING")}
                      className="text-xs cursor-pointer"
                    >
                      {lang === "ar" ? "قيد التجهيز والتغليف" : "Mark as Packing"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleBatchFulfillmentUpdate("READY_FOR_PICKUP")}
                      className="text-xs cursor-pointer"
                    >
                      {lang === "ar" ? "جاهز للتسليم / للشحن" : "Ready for pickup / dispatch"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleBatchFulfillmentUpdate("OUT_FOR_DELIVERY")}
                      className="text-xs cursor-pointer"
                    >
                      {lang === "ar" ? "خرج مع المندوب للتوصيل" : "Out for delivery"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleBatchFulfillmentUpdate("COMPLETED", "completed")}
                      className="text-xs cursor-pointer font-semibold text-emerald-600 dark:text-emerald-400"
                    >
                      {lang === "ar" ? "اكتمال وتسليم الطلب" : "Mark as Completed"}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Batch Assign Courier Dropdown */}
                {(couriersQ.data?.length ?? 0) > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isBatchUpdating}
                        className="h-8 gap-1.5 text-xs font-semibold"
                      >
                        <Truck className="h-3.5 w-3.5 text-blue-600" />
                        {lang === "ar" ? "تعيين المندوب" : "Assign courier"}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      {(couriersQ.data ?? []).map((courier: any) => (
                        <DropdownMenuItem
                          key={courier.id}
                          onClick={() => handleBatchAssignCourier(courier.id)}
                          className="text-xs cursor-pointer"
                        >
                          {courier.name || courier.email}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="h-8 gap-1.5 text-xs font-semibold"
                  onClick={() => setBulkDeleteOpen(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {lang === "ar"
                    ? `حذف المحدد (${selectedOrderIds.size})`
                    : `Delete selected (${selectedOrderIds.size})`}
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {/* 4. Mobile Purpose-Built Order Cards (375px) */}
      <div className="space-y-3 block sm:hidden">
        {paginatedOrders.map((o: any) => {
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
          getPaymentBadge={(o: any) => {
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
          getFulfillmentBadge={(o: any) =>
            getFulfillmentBadgeDetails(
              getOrderWorkflow(o, { productionStages: hasMadeToOrder }).fulfillment,
              lang,
              (o as any).fulfillment_method,
              vocabulary,
            )
          }
          renderPrimaryAction={(o: any) => renderContextualButton(o)}
          onCopyInvoice={(id: string) => {
            const ord = orders.find((x: any) => x.id === id);
            if (ord) copyInvoiceLink((ord as any).public_invoice_token, t);
          }}
          onPrintThermal={(o: any) => {
            setInspectOrder(o);
          }}
          onWhatsAppCustomer={(o: any) => {
            const phone = getOrderCustomerContact(o)?.phone;
            const waUrl = buildWhatsAppLink(phone);
            if (waUrl) window.open(waUrl, "_blank");
          }}
          couriers={couriersQ.data ?? []}
          onQuickViewOrder={(o: any) => setInspectOrder(o)}
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
      <div className="mt-4 flex flex-col items-center justify-between gap-3 rounded-2xl border border-border-strong bg-card p-3 text-sm shadow-sm select-none sm:flex-row sm:p-4">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs sm:text-sm">
            {lang === "ar" ? "الطلبات لكل صفحة:" : "Orders per page:"}
          </span>
          <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
            <SelectTrigger className="h-8 w-20 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="20">20</SelectItem>
              <SelectItem value="50">50</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-muted-foreground text-xs ms-2">
            {lang === "ar"
              ? `عرض ${Math.min((page - 1) * pageSize + 1, sortedOrders.length)}-${Math.min(page * pageSize, sortedOrders.length)} من ${sortedOrders.length} طلب`
              : `Showing ${Math.min((page - 1) * pageSize + 1, sortedOrders.length)}-${Math.min(page * pageSize, sortedOrders.length)} of ${sortedOrders.length} orders`}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 px-2.5 text-xs font-semibold gap-1 rounded-lg"
            onClick={() => setPage((p) => Math.max(p - 1, 1))}
            disabled={page <= 1}
          >
            {lang === "ar" ? (
              <>
                <span>السابق</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </>
            ) : (
              <>
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>Previous</span>
              </>
            )}
          </Button>
          <div className="text-xs px-2 font-medium text-foreground">
            {lang === "ar" ? `صفحة ${page} من ${totalPages}` : `Page ${page} of ${totalPages}`}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 px-2.5 text-xs font-semibold gap-1 rounded-lg"
            onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
            disabled={page >= totalPages}
          >
            {lang === "ar" ? (
              <>
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>التالي</span>
              </>
            ) : (
              <>
                <span>Next</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </>
            )}
          </Button>
        </div>
      </div>
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
            await qc.invalidateQueries({ queryKey: ["orders", brandId] });
            await qc.invalidateQueries({ queryKey: ["activity_logs"] });
          }}
        />
      )}

      <OrderImporterModal
        brandId={brandId}
        isOpen={isOrderImporterOpen}
        onOpenChange={setIsOrderImporterOpen}
        onComplete={() => qc.invalidateQueries({ queryKey: ["orders", brandId] })}
      />
    </div>
  );
}
