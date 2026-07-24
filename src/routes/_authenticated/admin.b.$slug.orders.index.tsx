import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Link as LinkIcon,
  Plus,
  ReceiptText,
  Trash2,
  Search,
  Clock3,
  CircleDollarSign,
  Truck,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  Package,
  PackageCheck,
  CheckSquare,
  Square,
  Check,
  CheckCircle2,
  MoreHorizontal,
  ExternalLink,
  Copy,
  Phone,
  MessageCircle,
  MapPin,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate, formatMoney, formatOrderStatus } from "@/lib/format";
import { toast } from "sonner";
import { useT, useI18n } from "@/lib/i18n";
import { resolvePaymentStatus, PAYMENT_BADGE_CLASSES } from "@/lib/payment-status";
import { useBrand } from "@/lib/brand-context";
import { useProfile } from "@/lib/profile-context";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { useEffect, useMemo, useState } from "react";
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
import { deleteOrderWithPrivateReceipt } from "@/lib/benefit-receipt.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Sparkles, Upload, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/orders/")({
  component: OrdersList,
});

async function copyInvoiceLink(id: string, t: (k: string) => string) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = `${origin}/invoice/${id}`;
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
    } else {
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    toast.success(t("orders.linkCopied"));
  } catch {
    toast.error(t("orders.linkFailed"));
  }
}

function deliveryStatusPresentation(status: string | null | undefined, lang: "en" | "ar") {
  const normalized = String(status ?? "").toLowerCase();
  const labels: Record<string, { en: string; ar: string; className: string }> = {
    assigned: {
      en: "Assigned",
      ar: "تم التعيين",
      className: "bg-slate-100 text-slate-700 ring-slate-200",
    },
    out_for_delivery: {
      en: "Out for delivery",
      ar: "خرج للتوصيل",
      className: "bg-blue-50 text-blue-800 ring-blue-200",
    },
    delivered: {
      en: "Delivered",
      ar: "تم التوصيل",
      className: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    },
    failed: {
      en: "Delivery failed",
      ar: "فشل التوصيل",
      className: "bg-red-50 text-red-800 ring-red-200",
    },
    delivery_failed: {
      en: "Delivery failed",
      ar: "فشل التوصيل",
      className: "bg-red-50 text-red-800 ring-red-200",
    },
    returned: {
      en: "Returned",
      ar: "مرتجع",
      className: "bg-amber-50 text-amber-800 ring-amber-200",
    },
  };
  const item = labels[normalized];
  return item ? { label: item[lang], className: item.className } : null;
}

const getFulfillmentBadgeDetails = (status: string | null | undefined, lang: "en" | "ar") => {
  const s = String(status || "ON_HOLD").toUpperCase();
  if (s === "NEEDS_PACKING") {
    return {
      label: lang === "ar" ? "بحاجة للتعبئة" : "Needs Packing",
      classes: "bg-[#FFF3CD] text-[#856404] border-none font-semibold animate-pulse shadow-sm",
    };
  }
  if (s === "READY_FOR_PICKUP") {
    return {
      label: lang === "ar" ? "جاهز للاستلام" : "Ready for Pickup",
      classes: "bg-[#E0E7FF] text-[#3730A3] border-none font-semibold shadow-sm",
    };
  }
  if (s === "SHIPPED") {
    return {
      label: lang === "ar" ? "تم الشحن" : "Shipped",
      classes: "bg-[#CCE5FF] text-[#004085] border-none font-semibold shadow-sm",
    };
  }
  if (s === "COMPLETED") {
    return {
      label: lang === "ar" ? "مكتمل" : "Completed",
      classes: "bg-[#E8F5E9] text-[#2E7D32] border-none font-semibold shadow-sm",
    };
  }
  if (s === "CANCELLED") {
    return {
      label: lang === "ar" ? "ملغي" : "Cancelled",
      classes: "bg-[#F8D7DA] text-[#721C24] border-none shadow-sm",
    };
  }
  // ON_HOLD / default
  return {
    label: lang === "ar" ? "قيد الانتظار" : "On Hold",
    classes: "bg-[#E2E3E5] text-[#383D41] border-none",
  };
};

const renderPaymentMethodBadge = (paymentMethod: string | null | undefined, lang: "en" | "ar") => {
  const method = String(paymentMethod ?? "").toLowerCase();
  const isCard = ["card", "apple_pay", "google_pay"].includes(method);
  const isBenefit = ["benefit", "benefitpay", "benefit_pay", "bank_transfer"].includes(method);
  const isCod = ["cash", "cod"].includes(method);

  if (isCard) {
    return (
      <div className="mt-1">
        <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-900 shadow-xs">
          💳 {lang === "ar" ? "بطاقة (أونلاين)" : "Card (Online)"}
        </span>
      </div>
    );
  }
  if (isBenefit) {
    return (
      <div className="mt-1">
        <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-950/30 dark:text-violet-300 dark:border-violet-900 shadow-xs">
          📲 {lang === "ar" ? "بنفت بي (يدوي)" : "BenefitPay (Manual)"}
        </span>
      </div>
    );
  }
  if (isCod) {
    return (
      <div className="mt-1">
        <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900 shadow-xs">
          💵 {lang === "ar" ? "الدفع عند الاستلام" : "COD"}
        </span>
      </div>
    );
  }
  
  return null;
};

function CustomerContactActions({ customer, lang }: { customer: any; lang: "en" | "ar" }) {
  if (!customer?.phone) return null;
  const rawPhone = String(customer.phone);
  const cleanPhone = rawPhone.replace(/[^0-9+]/g, "");
  const waPhone = cleanPhone.startsWith("+") ? cleanPhone.replace("+", "") : cleanPhone.length === 8 ? `973${cleanPhone}` : cleanPhone;

  return (
    <div className="flex items-center gap-1.5 mt-1.5">
      <a
        href={`tel:${cleanPhone}`}
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-md bg-slate-100 text-slate-800 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 transition-colors shadow-xs"
      >
        <Phone className="h-3 w-3 text-blue-600 dark:text-blue-400 shrink-0" />
        {lang === "ar" ? "اتصال" : "Call"}
      </a>
      <a
        href={`https://wa.me/${waPhone}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200/60 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800 transition-colors shadow-xs"
      >
        <MessageCircle className="h-3 w-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
        {lang === "ar" ? "واتساب" : "WhatsApp"}
      </a>
    </div>
  );
}

function DeliveryAddressSnapshot({ customer, lang }: { customer: any; lang: "en" | "ar" }) {
  if (!customer) return null;
  const parts = [];
  if (customer.house) parts.push(`${lang === "ar" ? "م" : "Bldg/House"} ${customer.house}`);
  if (customer.road) parts.push(`${lang === "ar" ? "ط" : "Rd"} ${customer.road}`);
  if (customer.block || customer.region) parts.push(`${lang === "ar" ? "مجمع" : "Blk"} ${customer.block || customer.region}`);
  if (customer.city) parts.push(customer.city);
  if (customer.flat) parts.push(`${lang === "ar" ? "شقة" : "Flat"} ${customer.flat}`);

  const text = parts.length > 0 ? parts.join(", ") : customer.address || null;
  if (!text) return null;

  return (
    <div className="text-xs text-muted-foreground mt-1 flex items-start gap-1">
      <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5 text-rose-500" />
      <span className="line-clamp-2">{text}</span>
    </div>
  );
}

function OrderItemsSummary({ items, lang }: { items: any[] | undefined | null; lang: "en" | "ar" }) {
  if (!items || items.length === 0) return null;

  const totalQty = items.reduce((sum: number, it: any) => sum + (Number(it.quantity) || 1), 0);
  const descriptions = items
    .map((it: any) => {
      const name = it.description || it.products?.title || (lang === "ar" ? "منتج" : "Item");
      const qty = Number(it.quantity) > 1 ? `${it.quantity}x ` : "";
      return `${qty}${name}`;
    })
    .join(", ");

  const truncated = descriptions.length > 35 ? descriptions.slice(0, 35) + "..." : descriptions;

  return (
    <div className="mt-1.5 text-[11px] font-medium text-muted-foreground flex items-center gap-1.5 bg-secondary/50 px-2 py-0.5 rounded-md w-fit max-w-full">
      <Package className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />
      <span className="font-bold text-foreground">{totalQty} {lang === "ar" ? "منتج" : totalQty === 1 ? "item" : "items"}</span>
      <span className="truncate text-muted-foreground">({truncated})</span>
    </div>
  );
}

function OrdersList() {
  const t = useT();
  const { lang } = useI18n();
  const locale = lang === "ar" ? "ar-BH" : "en-BH";
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { slug } = Route.useParams();
  const brand = useBrand();
  const { isCourier, isAdmin } = useProfile();
  const brandId = brand.id;
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fulfillmentFilter, setFulfillmentFilter] = useState("all");
  const [includeHistorical, setIncludeHistorical] = useState(false);

  // New Quick Tab filter
  const [tabFilter, setTabFilter] = useState<"all" | "unpaid" | "action_required" | "shipped" | "completed">("all");

  // New Fulfill states
  const [isFulfillModalOpen, setIsFulfillModalOpen] = useState(false);
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
      toast.error(lang === "ar" ? "لا يمكن أن يكون المبلغ المحصل بالسالب" : "Collected amount cannot be negative");
      return;
    }
    setIsSubmittingCash(true);
    try {
      const { data: res, error } = await supabase.rpc("courier_complete_delivery", {
        p_order_id: order.id,
        p_collected_amount: amountToCollect,
        p_notes: notes || null,
      });

      if (error) throw error;

      toast.success(
        lang === "ar"
          ? "تم تسجيل تسليم الطلب وتأكيد التحصيل بنجاح!"
          : "Delivery completed and payment confirmed!"
      );
      setCashModalOrder(null);
      setCashCollectedAmount("");
      setCashModalNotes("");
      qc.invalidateQueries({ queryKey: ["orders", brandId] });
    } catch (err: any) {
      toast.error(err.message || "Failed to complete delivery");
    } finally {
      setIsSubmittingCash(false);
    }
  };

  // Fetch Couriers Query
  const couriersQ = useQuery({
    queryKey: ["couriers", brandId],
    enabled: Boolean(brandId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, email")
        .eq("brand_id", brandId)
        .eq("role", "courier")
        .eq("status", "active")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });


  const [sortField, setSortField] = useState<"invoice_number" | "created_at" | "customer" | "status" | "total">("created_at");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(7);

  // Reset page when sorting, search, filters or page size change
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, fulfillmentFilter, sortField, sortDirection, pageSize]);

  useRealtimeInvalidate(
    [
      { table: "orders", brandId, queryKey: ["orders", brandId] },
      { table: "order_items", brandId, queryKey: ["orders", brandId] },
    ],
    `orders-list-${brandId}`,
  );

  const { data } = useQuery({
    queryKey: ["orders", brandId, isCourier ? "assigned-courier" : "office"],
    // Realtime can briefly disconnect on a courier's mobile device. A small
    // interval makes order state changes reliably appear in every workspace.
    refetchInterval: isCourier ? 10_000 : 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      let query: any = supabase
        .from("orders")
        .select("*, customers(name, phone, region, road, house, flat, address, city), order_items(*)")
        .eq("brand_id", brandId);
      if (isCourier) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];
        query = query.eq("assigned_to", user.id).eq("fulfillment_method", "delivery");
      }
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const create = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data: settings } = await supabase
      .from("business_settings")
      .select(
        "currency, default_tax_rate, delivery_enabled, pickup_enabled, digital_delivery_enabled, delivery_fee",
      )
      .eq("brand_id", brandId)
      .maybeSingle();
    const currency = settings?.currency ?? "BHD";
    const taxRate = settings?.default_tax_rate ?? 15;
    const fulfillmentMethod = settings?.delivery_enabled
      ? "delivery"
      : settings?.pickup_enabled
        ? "pickup"
        : (settings as any)?.digital_delivery_enabled
          ? "digital"
          : "delivery";
    const deliveryFee = fulfillmentMethod === "delivery" ? Number(settings?.delivery_fee ?? 0) : 0;
    const { data: order, error } = await (supabase.from("orders") as any)
      .insert({
        // The database trigger allocates the real brand-scoped number atomically.
        user_id: user.id,
        brand_id: brandId,
        invoice_number: 0,
        currency,
        tax_rate: taxRate,
        fulfillment_method: fulfillmentMethod,
        shipping: deliveryFee,
        total: deliveryFee,
      })
      .select()
      .single();
    if (error) return toast.error(error.message);
    navigate({ to: "/admin/b/$slug/orders/$id", params: { slug, id: order.id } });
  };

  const orders = data ?? [];
  const normalizedSearch = search.trim().toLowerCase();

  // Premium Quick Tabs counts in real time
  const tabCounts = useMemo(() => {
    let all = 0;
    let unpaid = 0;
    let action_required = 0;
    let shipped = 0;
    let completed = 0;

    for (const order of orders) {
      if (order.status === "archived_historical" && !includeHistorical) {
        continue;
      }
      
      const paymentBadge = resolvePaymentStatus(
        order.payment_status,
        order.status,
        Number(order.total),
        Number(order.advance_paid ?? 0),
      );
      const ff = String(order.fulfillment_status || "").toUpperCase();

      all++;
      if (paymentBadge !== "paid") {
        unpaid++;
      }
      if (paymentBadge === "paid" && ["NEEDS_PACKING", "ON_HOLD", "needs_packing", "on_hold", "unassigned"].includes(ff)) {
        action_required++;
      }
      if (["SHIPPED", "shipped"].includes(ff)) {
        shipped++;
      }
      if (["COMPLETED", "completed"].includes(ff) || order.status === "completed") {
        completed++;
      }
    }

    return { all, unpaid, action_required, shipped, completed };
  }, [orders, includeHistorical]);

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
          order.customers?.name,
          order.status,
          order.payment_method,
          order.digital_delivery_contact,
        ].some((value) =>
          String(value ?? "")
            .toLowerCase()
            .includes(normalizedSearch),
        );

      if (!matchesSearch) return false;
      if (statusFilter !== "all" && order.status !== statusFilter) return false;
      if (fulfillmentFilter !== "all" && order.fulfillment_method !== fulfillmentFilter) return false;

      const paymentBadge = resolvePaymentStatus(
        order.payment_status,
        order.status,
        Number(order.total),
        Number(order.advance_paid ?? 0),
      );
      const ff = String(order.fulfillment_status || "").toUpperCase();

      // Quick tab routing
      if (tabFilter === "unpaid") {
        return paymentBadge !== "paid";
      }
      if (tabFilter === "action_required") {
        return paymentBadge === "paid" && ["NEEDS_PACKING", "ON_HOLD", "needs_packing", "on_hold", "unassigned"].includes(ff);
      }
      if (tabFilter === "shipped") {
        return ["SHIPPED", "shipped"].includes(ff);
      }
      if (tabFilter === "completed") {
        return ["COMPLETED", "completed"].includes(ff) || order.status === "completed";
      }

      return true; // tabFilter === "all"
    });
  }, [orders, normalizedSearch, statusFilter, fulfillmentFilter, tabFilter, includeHistorical]);

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
        valA = a.customers?.name ?? "";
        valB = b.customers?.name ?? "";
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

  const totalPages = Math.ceil(sortedOrders.length / pageSize) || 1;

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const renderSortIcon = (field: typeof sortField) => {
    if (sortField !== field) return <ArrowUpDown className="ms-1.5 h-3.5 w-3.5 opacity-50 shrink-0 inline text-muted-foreground" />;
    return sortDirection === "asc" 
      ? <ArrowUp className="ms-1.5 h-3.5 w-3.5 text-primary shrink-0 inline" /> 
      : <ArrowDown className="ms-1.5 h-3.5 w-3.5 text-primary shrink-0 inline" />;
  };

  const pendingCount = orders.filter((order) =>
    ["pending", "pending_verification", "draft"].includes(order.status),
  ).length;

  const unpaidCount = tabCounts.unpaid;

  const openValue = orders
    .filter((order) => !["cancelled", "completed"].includes(order.status))
    .reduce((sum, order) => sum + Number(order.total || 0), 0);
  const currency = orders[0]?.currency ?? "BHD";

  const tabsList = [
    { id: "all", label_en: "All", label_ar: "الكل", count: tabCounts.all, activeColor: "bg-primary text-primary-foreground" },
    { id: "unpaid", label_en: "Unpaid", label_ar: "غير مدفوع", count: tabCounts.unpaid, activeColor: "bg-red-600 text-white dark:bg-red-950 dark:text-red-200" },
    { id: "action_required", label_en: "Action Required", label_ar: "مطلوب إجراء", count: tabCounts.action_required, activeColor: "bg-amber-500 text-black dark:bg-amber-950 dark:text-amber-200" },
    { id: "shipped", label_en: "Shipped", label_ar: "تم الشحن", count: tabCounts.shipped, activeColor: "bg-blue-600 text-white dark:bg-blue-950 dark:text-blue-200" },
    { id: "completed", label_en: "Completed", label_ar: "مكتمل", count: tabCounts.completed, activeColor: "bg-emerald-600 text-white dark:bg-emerald-950 dark:text-emerald-200" },
  ] as const;

  const renderContextualButton = (o: any) => {
    const paymentBadge = resolvePaymentStatus(
      o.payment_status,
      o.status,
      Number(o.total),
      Number(o.advance_paid ?? 0),
    );
    const isPaid = paymentBadge === "paid";
    const isUnpaid = !isPaid;
    const ff = String(o.fulfillment_status || "ON_HOLD").toUpperCase();
    const isUpdating = updatingOrderId === o.id;

    const method = String(o.payment_method || "").toLowerCase();
    const isCard = ["card", "apple_pay", "google_pay"].includes(method);
    const isBenefit = ["benefit", "benefitpay", "benefit_pay", "bank_transfer"].includes(method);
    const isCod = ["cash", "cod"].includes(method);

    const isPickup = String(o.fulfillment_method || "").toLowerCase() === "pickup";

    const handleStatusUpdate = async (payload: Record<string, any>, successMsg: string) => {
      setUpdatingOrderId(o.id);
      try {
        const res = await fetch("/api/orders/status", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: o.id, ...payload }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error_ar && lang === "ar" ? data.error_ar : data.error);
        toast.success(successMsg);
        qc.invalidateQueries({ queryKey: ["orders", brandId] });
      } catch (err: any) {
        toast.error(err.message || "Failed to update order status");
      } finally {
        setUpdatingOrderId(null);
      }
    };

    if (isPickup) {
      // B. STORE PICKUP WORKFLOW
      
      // 1. BenefitPay Manual Validation (Pickup)
      if (isBenefit && isUnpaid) {
        return (
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs px-3 border-violet-300 text-violet-800 bg-violet-50 hover:bg-violet-100 dark:border-violet-800 dark:text-violet-200 dark:bg-violet-950/20 font-semibold"
            disabled={updatingOrderId !== null}
            onClick={() => handleStatusUpdate(
              { payment_status: "paid", fulfillment_status: "READY_FOR_PICKUP" },
              lang === "ar" ? "تم تأكيد الدفع وتجهيز الطلب للاستلام!" : "Payment validated and pickup prepared!"
            )}
          >
            {isUpdating ? <Loader2 className="animate-spin h-3.5 w-3.5" /> : (lang === "ar" ? "تأكيد وتجهيز" : "Validate & Prepare")}
          </Button>
        );
      }

      // 2. Card Pickup Preparation
      if (isPaid && ff === "ON_HOLD") {
        return (
          <Button
            size="sm"
            className="h-8 text-xs px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold dark:bg-indigo-800 dark:hover:bg-indigo-900"
            disabled={updatingOrderId !== null}
            onClick={() => handleStatusUpdate(
              { fulfillment_status: "READY_FOR_PICKUP" },
              lang === "ar" ? "تم تحديد الطلب كجاهز للاستلام!" : "Order marked ready for pickup!"
            )}
          >
            {isUpdating ? <Loader2 className="animate-spin h-3.5 w-3.5" /> : (lang === "ar" ? "جاهز للاستلام" : "Mark Ready")}
          </Button>
        );
      }

      // 3. Pay at Store Preparation
      if (isCod && ff === "ON_HOLD") {
        return (
          <Button
            size="sm"
            className="h-8 text-xs px-3 bg-amber-600 hover:bg-amber-700 text-white font-semibold dark:bg-amber-800 dark:hover:bg-amber-900"
            disabled={updatingOrderId !== null}
            onClick={() => handleStatusUpdate(
              { fulfillment_status: "READY_FOR_PICKUP" },
              lang === "ar" ? "تم تجهيز الطلب للاستلام!" : "Order prepared!"
            )}
          >
            {isUpdating ? <Loader2 className="animate-spin h-3.5 w-3.5" /> : (lang === "ar" ? "تجهيز الطلب" : "Prepare Order")}
          </Button>
        );
      }

      // 4. Pickup Handover
      if (ff === "READY_FOR_PICKUP") {
        if (isUnpaid) {
          return (
            <Button
              size="sm"
              className="h-8 text-xs px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold dark:bg-emerald-800 dark:hover:bg-emerald-900"
              disabled={updatingOrderId !== null}
              onClick={() => handleStatusUpdate(
                { payment_status: "paid", fulfillment_status: "COMPLETED" },
                lang === "ar" ? "تم تحصيل المبلغ وتسليم الطلب!" : "Payment collected and order handed over!"
              )}
            >
              {isUpdating ? <Loader2 className="animate-spin h-3.5 w-3.5" /> : (lang === "ar" ? "تحصيل وتسليم" : "Collect & Hand Over")}
            </Button>
          );
        } else {
          return (
            <Button
              size="sm"
              className="h-8 text-xs px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold dark:bg-emerald-800 dark:hover:bg-emerald-900"
              disabled={updatingOrderId !== null}
              onClick={() => handleStatusUpdate(
                { fulfillment_status: "COMPLETED" },
                lang === "ar" ? "تم تسليم الطلب بالكامل!" : "Handover completed!"
              )}
            >
              {isUpdating ? <Loader2 className="animate-spin h-3.5 w-3.5" /> : (lang === "ar" ? "إتمام التسليم" : "Complete Handover")}
            </Button>
          );
        }
      }
    } else {
      // A. DELIVERY WORKFLOW
      
      // 1. BenefitPay Manual Validation
      if (isBenefit && isUnpaid) {
        return (
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs px-3 border-emerald-300 text-emerald-800 bg-emerald-50 hover:bg-emerald-100 dark:border-emerald-800 dark:text-emerald-200 dark:bg-emerald-950/20 font-semibold"
            disabled={updatingOrderId !== null}
            onClick={() => handleStatusUpdate(
              { payment_status: "paid" },
              lang === "ar" ? "تم تسجيل الدفع بنجاح!" : "Order payment marked as Paid!"
            )}
          >
            {isUpdating ? <Loader2 className="animate-spin h-3.5 w-3.5" /> : (lang === "ar" ? "تأكيد الدفع" : "Validate Payment")}
          </Button>
        );
      }

      // 2. Packing & Shipping (Card or Validated BenefitPay)
      if (isPaid && ff === "NEEDS_PACKING") {
        return (
          <Button
            size="sm"
            className="h-8 font-semibold bg-primary hover:bg-primary/90 text-primary-foreground text-xs px-3 shadow"
            disabled={updatingOrderId !== null}
            onClick={() => {
              setSelectedFulfillOrder(o);
              setSelectedCourierId(o.assigned_to ?? "unassigned");
              setFulfillNotes(o.delivery_notes ?? "");
              setIsFulfillModalOpen(true);
            }}
          >
            {lang === "ar" ? "تعبئة وشحن" : "Fulfill / Pack"}
          </Button>
        );
      }

      // 3. COD Dispatch
      if (isCod && ff === "ON_HOLD") {
        return (
          <Button
            size="sm"
            className="h-8 font-semibold bg-amber-500 hover:bg-amber-600 text-black text-xs px-3 shadow"
            disabled={updatingOrderId !== null}
            onClick={() => {
              setSelectedFulfillOrder(o);
              setSelectedCourierId(o.assigned_to ?? "unassigned");
              setFulfillNotes(o.delivery_notes ?? "");
              setIsFulfillModalOpen(true);
            }}
          >
            {lang === "ar" ? "تجهيز وشحن COD" : "Pack & Ship COD"}
          </Button>
        );
      }

      // 4. Delivery Handover & Cash Collection Actions (Courier / Driver)
      if (ff === "SHIPPED" || isCourier) {
        const totalAmt = Number(o.total || 0);
        const paidAmt = Number(o.paid_amount ?? o.advance_paid ?? 0);
        const remainingBal = Math.max(0, totalAmt - paidAmt);

        if (isPaid || remainingBal <= 0) {
          return (
            <Button
              size="sm"
              className="h-8 font-semibold bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3 shadow dark:bg-emerald-800 dark:hover:bg-emerald-900"
              disabled={updatingOrderId !== null || isSubmittingCash}
              onClick={() => handleCompleteDelivery(o, 0)}
            >
              {isSubmittingCash && updatingOrderId === o.id ? (
                <Loader2 className="animate-spin h-3.5 w-3.5" />
              ) : (
                <span className="flex items-center gap-1">
                  <Check className="h-3.5 w-3.5" />
                  {lang === "ar" ? "تأكيد التسليم" : "Mark as Delivered"}
                </span>
              )}
            </Button>
          );
        }

        if (isPartiallyPaid || (paidAmt > 0 && remainingBal > 0)) {
          return (
            <Button
              size="sm"
              className="h-8 font-semibold bg-amber-500 hover:bg-amber-600 text-black text-xs px-3 shadow"
              disabled={updatingOrderId !== null || isSubmittingCash}
              onClick={() => {
                setCashModalOrder(o);
                setCashCollectedAmount(remainingBal.toFixed(3));
                setCashModalNotes("");
              }}
            >
              <span className="flex items-center gap-1">
                <CircleDollarSign className="h-3.5 w-3.5" />
                {lang === "ar"
                  ? `تحصيل المتبقي ${formatMoney(remainingBal, o.currency ?? "BHD", locale)} والتسليم`
                  : `Collect BHD ${remainingBal.toFixed(3)} & Complete`}
              </span>
            </Button>
          );
        }

        // Unpaid COD Order
        return (
          <Button
            size="sm"
            className="h-8 font-semibold bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3 shadow dark:bg-emerald-800 dark:hover:bg-emerald-900"
            disabled={updatingOrderId !== null || isSubmittingCash}
            onClick={() => {
              setCashModalOrder(o);
              setCashCollectedAmount(totalAmt.toFixed(3));
              setCashModalNotes("");
            }}
          >
            <span className="flex items-center gap-1">
              <CircleDollarSign className="h-3.5 w-3.5" />
              {lang === "ar"
                ? `تحصيل ${formatMoney(totalAmt, o.currency ?? "BHD", locale)} نقد والتسليم`
                : `Collect BHD ${totalAmt.toFixed(3)} Cash & Complete`}
            </span>
          </Button>
        );
      }
    }

    // Shipped Track button fallback
    if (ff === "SHIPPED") {
      return (
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs px-3"
          asChild
        >
          <Link to="/admin/b/$slug/orders/$id" params={{ slug, id: o.id }}>
            {lang === "ar" ? "تتبع" : "Track"}
          </Link>
        </Button>
      );
    }

    // General fallback -> details
    return (
      <Button
        size="sm"
        variant="ghost"
        className="h-8 text-xs px-3"
        asChild
      >
        <Link to="/admin/b/$slug/orders/$id" params={{ slug, id: o.id }}>
          {lang === "ar" ? "تفاصيل" : "View"}
        </Link>
      </Button>
    );
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8 animate-fade-in" dir={lang === "ar" ? "rtl" : "ltr"}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-extrabold tracking-tight bg-clip-text bg-gradient-to-r from-slate-900 via-slate-800 to-slate-950 dark:from-slate-50 dark:to-slate-300">
            {t("orders.title")}
          </h1>
          <p className="mt-1.5 text-muted-foreground text-sm max-w-md">
            {t("orders.subtitle")}
          </p>
        </div>
        {!isCourier && (
          <div className="flex items-center gap-2 shrink-0">
            <OrderImporterModal brandId={brandId} onComplete={() => qc.invalidateQueries({ queryKey: ["orders", brandId] })} />
            <Button onClick={create} className="shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95 gap-2">
              <Plus className="h-4 w-4" /> {t("orders.new")}
            </Button>
          </div>
        )}
      </div>

      {!isCourier && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            [ReceiptText, t("orders.title"), String(orders.length)],
            [Clock3, t("status.pending"), String(pendingCount)],
            [CircleDollarSign, t("payStatus.unpaid"), String(unpaidCount)],
            [Truck, t("orders.total"), formatMoney(openValue, currency)],
          ].map(([Icon, label, value], index) => {
            const StatIcon = Icon as typeof ReceiptText;
            return (
              <Card key={index} className="overflow-hidden border-border/60 shadow-md hover:shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm p-4 transition-all duration-300 hover:-translate-y-0.5">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-primary/10 p-2.5 text-primary shadow-inner">
                    <StatIcon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">{String(label)}</p>
                    <p className="font-semibold text-lg truncate mt-0.5">{String(value)}</p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Premium Quick Filter Tabs */}
      <div className="flex flex-wrap gap-1.5 border-b pb-3 select-none overflow-x-auto no-scrollbar">
        {tabsList.map((tab) => {
          const isActive = tabFilter === tab.id;
          const label = lang === "ar" ? tab.label_ar : tab.label_en;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setTabFilter(tab.id);
                setPage(1); // reset pagination when tab changes
              }}
              className={cn(
                "relative flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all duration-200 outline-none shrink-0 border border-transparent shadow-sm",
                isActive
                  ? tab.activeColor
                  : "bg-card text-card-foreground border-border hover:bg-secondary/80"
              )}
            >
              <span>{label}</span>
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none",
                  isActive
                    ? "bg-black/15 text-white dark:bg-white/15 dark:text-white"
                    : "bg-secondary text-secondary-foreground"
                )}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      <Card className="overflow-hidden border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm p-4 sm:p-5">
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(220px,1fr)_150px_160px_auto] gap-3 items-center">
          <div className="relative">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="ps-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                lang === "ar"
                  ? "ابحث بالرقم أو العميل أو جهة الاتصال"
                  : "Search invoice, customer, or contact"
              }
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {t("orders.status")}: {lang === "ar" ? "الكل" : "All"}
              </SelectItem>
              {[
                "pending",
                "pending_verification",
                "draft",
                "confirmed",
                "paid",
                "shipped",
                "completed",
                "cancelled",
              ].map((status) => (
                <SelectItem key={status} value={status}>
                  {status === "pending_verification"
                    ? lang === "ar"
                      ? "بانتظار التحقق"
                      : "Pending verification"
                    : t(`status.${status}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={fulfillmentFilter} onValueChange={setFulfillmentFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {t("fulfillment.title")}: {lang === "ar" ? "الكل" : "All"}
              </SelectItem>
              <SelectItem value="delivery">{t("fulfillment.delivery")}</SelectItem>
              <SelectItem value="pickup">{t("fulfillment.pickup")}</SelectItem>
              <SelectItem value="digital">
                {lang === "ar" ? "تسليم رقمي" : "Digital delivery"}
              </SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 select-none border border-zinc-100 dark:border-zinc-800 p-2 rounded-xl bg-zinc-50/50 dark:bg-zinc-900/20 max-w-[200px] h-10 shrink-0">
            <Switch
              id="include-historical"
              checked={includeHistorical}
              onCheckedChange={setIncludeHistorical}
            />
            <label htmlFor="include-historical" className="text-[11px] font-semibold cursor-pointer text-muted-foreground whitespace-nowrap">
              {lang === "ar" ? "شمل الأرشيف التاريخي" : "Include Historical"}
            </label>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {filteredOrders.length} / {orders.length}
        </p>
      </Card>

      {orders.length === 0 ? (
        <Card className="p-12 text-center">
          <ReceiptText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">{t("orders.none")}</p>
        </Card>
      ) : filteredOrders.length === 0 ? (
        <Card className="p-10 text-center">
          <Search className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="font-medium">
            {lang === "ar" ? "لا توجد طلبات مطابقة" : "No matching orders"}
          </p>
          <Button
            variant="ghost"
            className="mt-2"
            onClick={() => {
              setSearch("");
              setStatusFilter("all");
              setFulfillmentFilter("all");
              setTabFilter("all");
            }}
          >
            {lang === "ar" ? "مسح عوامل التصفية" : "Clear filters"}
          </Button>
        </Card>
      ) : (
        <>
          <div className="space-y-3 sm:hidden">
            {paginatedOrders.map((o) => {
              const paymentBadge = resolvePaymentStatus(
                (o as any).payment_status,
                o.status,
                Number(o.total),
                Number((o as any).advance_paid ?? 0),
              );
              const fulfillmentDetails = getFulfillmentBadgeDetails((o as any).fulfillment_status, lang);
              const isCompleted = ["COMPLETED", "completed"].includes((o as any).fulfillment_status || "") || o.status === "completed";

              return (
                <Card
                  key={o.id}
                  className={cn(
                    "p-4 transition-all duration-200 relative border border-border bg-card",
                    isCompleted && "opacity-70 dark:opacity-60"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Link
                          to="/admin/b/$slug/orders/$id"
                          params={{ slug, id: o.id }}
                          className="text-lg font-semibold text-primary hover:underline"
                        >
                          #{o.invoice_number}
                        </Link>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(o.created_at ?? o.order_date, locale)}
                        </span>
                      </div>
                      <div className="mt-1 text-xs font-medium text-muted-foreground">
                        <div>
                          {o.customers?.name ?? (
                            <span className="text-muted-foreground italic">
                              {t("orders.noCustomer")}
                            </span>
                          )}
                        </div>
                        {renderPaymentMethodBadge(o.payment_method, lang)}
                        <CustomerContactActions customer={o.customers} lang={lang} />
                        <DeliveryAddressSnapshot customer={o.customers} lang={lang} />
                        <OrderItemsSummary items={o.order_items} lang={lang} />
                      </div>
                      
                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider font-bold border",
                            PAYMENT_BADGE_CLASSES[paymentBadge]
                          )}
                        >
                          {t(`payStatus.${paymentBadge}`)}
                        </span>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider font-bold border",
                            fulfillmentDetails.classes
                          )}
                        >
                          {fulfillmentDetails.label}
                        </span>
                      </div>

                      <div className="mt-4 flex items-center justify-between gap-2 pt-2 border-t border-border/50">
                        <div className="font-semibold text-sm">
                          {formatMoney(Number(o.total), o.currency)}
                        </div>
                        <div className="flex items-center gap-1.5">
                          {renderContextualButton(o)}
                          
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                                <MoreHorizontal className="h-4 w-4" />
                                <span className="sr-only">Open menu</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => copyInvoiceLink(o.public_invoice_token, t)}>
                                <Copy className="me-2 h-4 w-4" />
                                {lang === "ar" ? "نسخ رابط الفاتورة" : "Copy invoice link"}
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link to="/admin/b/$slug/orders/$id" params={{ slug, id: o.id }}>
                                  <ExternalLink className="me-2 h-4 w-4" />
                                  {lang === "ar" ? "تفاصيل الطلب" : "Order details"}
                                </Link>
                              </DropdownMenuItem>
                              {!isCourier && (
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive focus:bg-destructive/10"
                                  onClick={() => setDeleteTarget(o.id)}
                                >
                                  <Trash2 className="me-2 h-4 w-4" />
                                  {t("common.delete")}
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          <Card className="hidden overflow-hidden sm:block border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm">
            <div className="overflow-x-auto">
              <table className="w-full table-auto text-sm">
                <colgroup>
                  <col className="w-[8%]" />
                  <col className="w-[12%]" />
                  <col className="w-[24%]" />
                  <col className="w-[15%]" />
                  <col className="w-[15%]" />
                  <col className="w-[11%]" />
                  <col className="w-[15%]" />
                </colgroup>
                <thead className="bg-muted/40 border-b select-none text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                  <tr>
                    <th className="p-4 text-start font-semibold cursor-pointer hover:bg-muted/60 transition-colors" onClick={() => toggleSort("invoice_number")}>
                      <span className="flex items-center">{t("orders.invoice")} {renderSortIcon("invoice_number")}</span>
                    </th>
                    <th className="p-4 text-start font-semibold cursor-pointer hover:bg-muted/60 transition-colors" onClick={() => toggleSort("created_at")}>
                      <span className="flex items-center">{t("orders.date")} {renderSortIcon("created_at")}</span>
                    </th>
                    <th className="p-4 text-start font-semibold cursor-pointer hover:bg-muted/60 transition-colors" onClick={() => toggleSort("customer")}>
                      <span className="flex items-center">{t("orders.customer")} {renderSortIcon("customer")}</span>
                    </th>
                    <th className="p-4 text-start font-semibold">{lang === "ar" ? "حالة الدفع" : "Payment Status"}</th>
                    <th className="p-4 text-start font-semibold">{lang === "ar" ? "حالة التوصيل" : "Fulfillment Status"}</th>
                    <th className="p-4 text-end font-semibold cursor-pointer hover:bg-muted/60 transition-colors" onClick={() => toggleSort("total")}>
                      <span className="flex items-center justify-end">{t("orders.total")} {renderSortIcon("total")}</span>
                    </th>
                    <th className="p-4 text-end font-semibold">{t("orders.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedOrders.map((o) => {
                    const paymentBadge = resolvePaymentStatus(
                      (o as any).payment_status,
                      o.status,
                      Number(o.total),
                      Number((o as any).advance_paid ?? 0),
                    );
                    const fulfillmentDetails = getFulfillmentBadgeDetails((o as any).fulfillment_status, lang);
                    const isCompleted = ["COMPLETED", "completed"].includes((o as any).fulfillment_status || "") || o.status === "completed";

                    return (
                      <tr
                        key={o.id}
                        className={cn(
                          "border-t border-border hover:bg-secondary/30 transition-all duration-200",
                          isCompleted && "opacity-70 dark:opacity-60"
                        )}
                      >
                        <td className="p-4 font-semibold">
                          <Link
                            to="/admin/b/$slug/orders/$id"
                            params={{ slug, id: o.id }}
                            className="text-primary hover:underline"
                          >
                            #{o.invoice_number}
                          </Link>
                        </td>
                        <td className="p-4 text-muted-foreground whitespace-nowrap">
                          {formatDate(o.created_at ?? o.order_date, locale)}
                        </td>
                        <td className="p-4 font-medium">
                          <div>
                            {o.customers?.name ?? (
                              <span className="text-muted-foreground italic">
                                {t("orders.noCustomer")}
                              </span>
                            )}
                          </div>
                          {renderPaymentMethodBadge(o.payment_method, lang)}
                          <CustomerContactActions customer={o.customers} lang={lang} />
                          <DeliveryAddressSnapshot customer={o.customers} lang={lang} />
                          <OrderItemsSummary items={o.order_items} lang={lang} />
                        </td>
                        <td className="p-4">
                          <span
                            className={cn(
                              "text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full font-bold border",
                              PAYMENT_BADGE_CLASSES[paymentBadge]
                            )}
                          >
                            {t(`payStatus.${paymentBadge}`)}
                          </span>
                        </td>
                        <td className="p-4">
                          <span
                            className={cn(
                              "text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full font-bold border",
                              fulfillmentDetails.classes
                            )}
                          >
                            {fulfillmentDetails.label}
                          </span>
                        </td>
                        <td className="p-4 text-end font-bold whitespace-nowrap">
                          {formatMoney(Number(o.total), o.currency)}
                        </td>
                        <td className="p-4 text-end whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            {renderContextualButton(o)}
                            
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreHorizontal className="h-4 w-4" />
                                  <span className="sr-only">Open menu</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align={lang === "ar" ? "start" : "end"}>
                                <DropdownMenuItem onClick={() => copyInvoiceLink(o.public_invoice_token, t)}>
                                  <Copy className="me-2 h-4 w-4" />
                                  {lang === "ar" ? "نسخ رابط الفاتورة" : "Copy invoice link"}
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                  <Link to="/admin/b/$slug/orders/$id" params={{ slug, id: o.id }}>
                                    <ExternalLink className="me-2 h-4 w-4" />
                                    {lang === "ar" ? "تفاصيل الطلب" : "Order details"}
                                  </Link>
                                </DropdownMenuItem>
                                {!isCourier && (
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive focus:bg-destructive/10"
                                    onClick={() => setDeleteTarget(o.id)}
                                  >
                                    <Trash2 className="me-2 h-4 w-4" />
                                    {t("common.delete")}
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Pagination Controls */}
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 mt-4 bg-card rounded-lg border border-border text-sm select-none">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs sm:text-sm">
                {lang === "ar" ? "الطلبات لكل صفحة:" : "Orders per page:"}
              </span>
              <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                <SelectTrigger className="h-8 w-20 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7</SelectItem>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-muted-foreground text-xs ms-2">
                {lang === "ar" 
                  ? `عرض ${Math.min((page - 1) * pageSize + 1, sortedOrders.length)}-${Math.min(page * pageSize, sortedOrders.length)} من ${sortedOrders.length} طلب`
                  : `Showing ${Math.min((page - 1) * pageSize + 1, sortedOrders.length)}-${Math.min(page * pageSize, sortedOrders.length)} of ${sortedOrders.length} orders`}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setPage((p) => Math.max(p - 1, 1))} disabled={page === 1}>
                {lang === "ar" ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                <span className="sr-only">Previous page</span>
              </Button>
              <div className="text-xs px-2 text-muted-foreground">
                {lang === "ar" ? `صفحة ${page} من ${totalPages}` : `Page ${page} of ${totalPages}`}
              </div>
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setPage((p) => Math.min(p + 1, totalPages))} disabled={page === totalPages}>
                {lang === "ar" ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <span className="sr-only">Next page</span>
              </Button>
            </div>
          </div>
        </>
      )}
      {!isCourier && <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
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
      </AlertDialog>}

      {/* Interactive Packing Verification & Fulfillment Modal */}
      <Dialog open={isFulfillModalOpen} onOpenChange={setIsFulfillModalOpen}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg bg-background border rounded-2xl shadow-2xl p-6 overflow-hidden max-h-[90vh] flex flex-col" dir={lang === "ar" ? "rtl" : "ltr"}>
          {selectedFulfillOrder && (
            <>
              {/* Header: Order Number, Customer Name & Address Snapshot */}
              <DialogHeader className="pb-3 border-b shrink-0">
                <div className="flex items-center justify-between gap-2">
                  <DialogTitle className="text-lg font-bold flex items-center gap-2">
                    <PackageCheck className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span>{lang === "ar" ? `قائمة التعبئة والتجهيز #${selectedFulfillOrder.invoice_number}` : `Packing Slip Verification #${selectedFulfillOrder.invoice_number}`}</span>
                  </DialogTitle>
                </div>
                <div className="mt-1 text-xs text-muted-foreground flex flex-col gap-0.5">
                  <div className="font-semibold text-foreground text-sm flex items-center gap-1.5">
                    <span>{selectedFulfillOrder.customers?.name || (lang === "ar" ? "عميل زائر" : "Customer")}</span>
                    {selectedFulfillOrder.customers?.phone && (
                      <span className="text-xs font-normal text-muted-foreground">({selectedFulfillOrder.customers.phone})</span>
                    )}
                  </div>
                  <DeliveryAddressSnapshot customer={selectedFulfillOrder.customers} lang={lang} />
                </div>
              </DialogHeader>

              <div className="space-y-4 py-3 overflow-y-auto flex-1 pr-1 text-sm">
                {/* Pick Checklist Header */}
                {(() => {
                  const modalItems = selectedFulfillOrder.order_items ?? [];
                  const checkedCount = modalItems.filter((it: any) => checkedItems[it.id]).length;
                  const allChecked = modalItems.length > 0 && checkedCount === modalItems.length;

                  const toggleAll = () => {
                    const nextState = !allChecked;
                    const next: Record<string, boolean> = {};
                    modalItems.forEach((it: any) => {
                      next[it.id] = nextState;
                    });
                    setCheckedItems(next);
                  };

                  return (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2 bg-muted/40 p-2.5 rounded-xl border">
                        <div className="flex items-center gap-2">
                          <CheckSquare className="h-4 w-4 text-primary shrink-0" />
                          <span className="font-semibold text-xs text-foreground">
                            {lang === "ar" ? "قائمة فحص المنتجات" : "Pick & Pack Checklist"}
                          </span>
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                            {checkedCount} / {modalItems.length} {lang === "ar" ? "جاهز" : "packed"}
                          </span>
                        </div>
                        {modalItems.length > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            type="button"
                            onClick={toggleAll}
                            className="h-7 text-xs font-semibold px-2 text-primary hover:text-primary/90"
                          >
                            {allChecked
                              ? (lang === "ar" ? "إلغاء تحديد الكل" : "Uncheck All")
                              : (lang === "ar" ? "تحديد الكل" : "Check All")}
                          </Button>
                        )}
                      </div>

                      {/* Items List */}
                      {modalItems.length === 0 ? (
                        <div className="p-4 text-center text-xs text-muted-foreground border rounded-xl bg-muted/20">
                          {lang === "ar" ? "لا توجد تفاصيل منتجات مسجلة لهذا الطلب." : "No item line details recorded for this order."}
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                          {modalItems.map((item: any, idx: number) => {
                            const isChecked = Boolean(checkedItems[item.id]);
                            const imgUrl = item.products?.main_image || item.products?.image_url || item.product_variants?.products?.main_image || item.selected_variant?.image_url;
                            const sku = item.product_variants?.sku || item.sku || null;
                            const title = item.description || item.products?.title || (lang === "ar" ? "منتج" : "Product");

                            return (
                              <div
                                key={item.id || idx}
                                onClick={() => setCheckedItems((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}
                                className={cn(
                                  "flex items-center gap-3 p-2.5 rounded-xl border transition-all cursor-pointer select-none",
                                  isChecked
                                    ? "bg-emerald-50/80 border-emerald-300 dark:bg-emerald-950/30 dark:border-emerald-800"
                                    : "bg-card border-border hover:border-primary/50"
                                )}
                              >
                                <Checkbox
                                  checked={isChecked}
                                  onCheckedChange={(checked) => setCheckedItems((prev) => ({ ...prev, [item.id]: Boolean(checked) }))}
                                  onClick={(e) => e.stopPropagation()}
                                  className="h-5 w-5 rounded-md border-primary/50"
                                />

                                {imgUrl ? (
                                  <img src={imgUrl} alt={title} className="h-10 w-10 object-cover rounded-lg border shrink-0 bg-background" />
                                ) : (
                                  <div className="h-10 w-10 rounded-lg border bg-muted/60 flex items-center justify-center shrink-0">
                                    <Package className="h-5 w-5 text-muted-foreground" />
                                  </div>
                                )}

                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className={cn("font-semibold text-xs sm:text-sm truncate", isChecked && "line-through text-muted-foreground")}>
                                      <span className="font-bold text-primary mr-1">{item.quantity}x</span> {title}
                                    </span>
                                    <span className="text-xs font-mono font-bold shrink-0 text-muted-foreground">
                                      {formatMoney(Number(item.line_total || item.unit_price * item.quantity), selectedFulfillOrder.currency || "BHD", locale)}
                                    </span>
                                  </div>
                                  {sku && (
                                    <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                                      SKU: {sku}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Courier & Shipping Details */}
                <div className="space-y-3 pt-2 border-t">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground block">
                      {lang === "ar" ? "تعيين مندوب التوصيل" : "Driver / Courier"}
                    </label>
                    <Select value={selectedCourierId} onValueChange={setSelectedCourierId}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={lang === "ar" ? "اختر مندوب التوصيل" : "Select a courier"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">
                          {lang === "ar" ? "غير مسند (تعبئة بدون تعيين)" : "Unassigned (Pack without assigning)"}
                        </SelectItem>
                        {(couriersQ.data ?? []).map((courier: any) => (
                          <SelectItem key={courier.id} value={courier.id}>
                            {courier.name || courier.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground block">
                      {lang === "ar" ? "ملاحظات الشحن أو رقم التتبع" : "Delivery Notes or Tracking"}
                    </label>
                    <Input
                      value={fulfillNotes}
                      onChange={(e) => setFulfillNotes(e.target.value)}
                      placeholder={lang === "ar" ? "أدخل رقم التتبع أو أي تعليمات خاصة للتوصيل..." : "Enter tracking number or special packing notes..."}
                    />
                  </div>
                </div>
              </div>

              {/* Primary Action Button Footer */}
              <div className="pt-3 border-t shrink-0 flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isFulfilling}
                  onClick={() => setIsFulfillModalOpen(false)}
                >
                  {lang === "ar" ? "إلغاء" : "Cancel"}
                </Button>
                <Button
                  size="sm"
                  className={cn(
                    "font-bold shadow-md transition-all px-4",
                    (selectedFulfillOrder.order_items ?? []).every((it: any) => checkedItems[it.id])
                      ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                      : "bg-amber-600 hover:bg-amber-700 text-white"
                  )}
                  disabled={isFulfilling}
                  onClick={async () => {
                    if (!selectedFulfillOrder) return;
                    setIsFulfilling(true);
                    try {
                      const res = await fetch("/api/orders/status", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          id: selectedFulfillOrder.id,
                          fulfillment_status: "SHIPPED",
                          assigned_to: selectedCourierId === "unassigned" ? null : selectedCourierId,
                          delivery_notes: fulfillNotes,
                          admin_override: ["cash", "cod"].includes(String(selectedFulfillOrder.payment_method || "").toLowerCase()),
                        }),
                      });
                      const data = await res.json();
                      if (!res.ok) throw new Error(data.error_ar && lang === "ar" ? data.error_ar : data.error);
                      toast.success(lang === "ar" ? "تم تأكيد تعبئة الطلب وتجهيزه للشحن!" : "Order packed and dispatched successfully!");
                      qc.invalidateQueries({ queryKey: ["orders", brandId] });
                      setIsFulfillModalOpen(false);
                    } catch (err: any) {
                      toast.error(err.message || "Failed to fulfill order");
                    } finally {
                      setIsFulfilling(false);
                    }
                  }}
                >
                  {isFulfilling ? <Loader2 className="animate-spin h-4 w-4 mr-1.5 inline" /> : <PackageCheck className="h-4 w-4 mr-1.5 inline" />}
                  {lang === "ar" ? "تأكيد التعبئة والتجهيز للشحن" : "Confirm Packed & Dispatch"}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* 💵 Cash Collection & Courier Delivery Completion Modal */}
      <Dialog open={Boolean(cashModalOrder)} onOpenChange={(open) => { if (!open) setCashModalOrder(null); }}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md bg-background border rounded-2xl shadow-xl" dir={lang === "ar" ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <CircleDollarSign className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              {lang === "ar" ? "تأكيد تحصيل المبلغ والتسليم" : "Confirm Cash & Delivery"}
            </DialogTitle>
          </DialogHeader>

          {cashModalOrder && (
            <div className="space-y-4 py-2">
              <div className="rounded-xl bg-muted/60 border p-3.5 space-y-1.5 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">{lang === "ar" ? "رقم الفاتورة / الطلب:" : "Invoice / Order #"}</span>
                  <span className="font-mono font-bold text-primary">#{cashModalOrder.invoice_number || cashModalOrder.id.slice(0, 8)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">{lang === "ar" ? "العميل:" : "Customer:"}</span>
                  <span className="font-semibold">{cashModalOrder.customers?.name || (lang === "ar" ? "عميل" : "Customer")}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">{lang === "ar" ? "إجمالي الطلب:" : "Total Amount:"}</span>
                  <span className="font-semibold">{formatMoney(Number(cashModalOrder.total), cashModalOrder.currency ?? "BHD", locale)}</span>
                </div>
                <div className="flex justify-between items-center text-emerald-700 dark:text-emerald-400 font-bold border-t pt-2 mt-1">
                  <span>{lang === "ar" ? "المبلغ المتبقي للتحصيل:" : "Remaining Balance:"}</span>
                  <span className="text-base font-extrabold">{formatMoney(Math.max(0, Number(cashModalOrder.total) - Number(cashModalOrder.paid_amount ?? cashModalOrder.advance_paid ?? 0)), cashModalOrder.currency ?? "BHD", locale)}</span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-foreground block">
                  {lang === "ar" ? "المبلغ المستلم نقداً (د.ب)" : "Cash Amount Received (BHD)"}
                </label>
                <Input
                  type="number"
                  step="0.001"
                  min="0"
                  value={cashCollectedInput}
                  onChange={(e) => setCashCollectedAmount(e.target.value)}
                  placeholder="0.000"
                  className="font-mono text-lg font-extrabold h-11 border-emerald-300 focus:border-emerald-500 dark:border-emerald-800"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground block">
                  {lang === "ar" ? "ملاحظات التوصيل (اختياري)" : "Delivery Notes (Optional)"}
                </label>
                <Input
                  value={cashModalNotes}
                  onChange={(e) => setCashModalNotes(e.target.value)}
                  placeholder={lang === "ar" ? "مثال: تم الاستلام من البواب / تحصيل عبر بنفت باج" : "e.g. Received at gate / BenefitPay transfer"}
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCashModalOrder(null)}
                  disabled={isSubmittingCash}
                >
                  {lang === "ar" ? "إلغاء" : "Cancel"}
                </Button>
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md"
                  disabled={isSubmittingCash}
                  onClick={() => {
                    const amt = Number(cashCollectedInput);
                    if (isNaN(amt) || amt < 0) {
                      toast.error(lang === "ar" ? "يرجى إدخال مبلغ صحيح (غير سالب)" : "Please enter a valid non-negative amount");
                      return;
                    }
                    handleCompleteDelivery(cashModalOrder, amt, cashModalNotes);
                  }}
                >
                  {isSubmittingCash ? <Loader2 className="animate-spin h-4 w-4 mr-1.5 inline" /> : null}
                  {lang === "ar" ? "تأكيد التحصيل والتسليم" : "Confirm Cash & Complete"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

const ORDER_HEADER_MAPS = {
  order_number: ["name", "order number", "order_number", "رقم الطلب", "id"],
  order_date: ["created at", "created_at", "order date", "order_date", "تاريخ الطلب", "date"],
  customer_name: ["billing name", "shipping name", "customer name", "اسم العميل", "الاسم الكامل", "name"],
  customer_phone: ["billing phone", "shipping phone", "phone", "جوال العميل", "رقم الهاتف", "جوال"],
  customer_email: ["email", "billing email", "البريد الالكتروني", "البريد الإلكتروني"],
  total_price: ["total", "order total", "الإجمالي", "إجمالي الطلب", "total_price"],
  item_name: ["lineitem name", "item name", "اسم المنتج", "عنوان المنتج", "product_name"],
  item_quantity: ["lineitem quantity", "quantity", "الكمية", "item quantity"],
  item_price: ["lineitem price", "item price", "سعر المنتج", "السعر"],
};

function sanitizeGCCPhone(phoneStr: string | null): string | null {
  if (!phoneStr) return null;
  let clean = phoneStr.replace(/[^\d]/g, "");
  clean = clean.replace(/^0+/, "");

  if (clean.length === 8) {
    return `+973${clean}`;
  }
  if (clean.length === 9 && clean.startsWith("5")) {
    return `+966${clean}`;
  }
  if (clean.startsWith("973") || clean.startsWith("966")) {
    return `+${clean}`;
  }
  return `+${clean}`;
}

function parseCSV(text: string): string[][] {
  const lines: string[][] = [];
  let row: string[] = [];
  let inQuotes = false;
  let currentVal = "";

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentVal += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(currentVal.trim());
      currentVal = "";
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      row.push(currentVal.trim());
      currentVal = "";
      if (row.length > 0 && row.some(val => val !== "")) {
        lines.push(row);
      }
      row = [];
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
    } else {
      currentVal += char;
    }
  }
  if (currentVal || row.length > 0) {
    row.push(currentVal.trim());
    lines.push(row);
  }
  return lines.filter(r => r.length > 0 && r.some(val => val !== ""));
}

function OrderImporterModal({ brandId, onComplete }: { brandId: string; onComplete: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<"preset" | "mapper" | "importing" | "success">("preset");
  const [preset, setPreset] = useState<"shopify" | "woocommerce" | "salla" | "zid" | "custom">("shopify");
  const [parsedRows, setParsedRows] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mappings, setMappings] = useState<Record<string, number>>({
    order_number: -1,
    order_date: -1,
    customer_name: -1,
    customer_phone: -1,
    customer_email: -1,
    total_price: -1,
    item_name: -1,
    item_quantity: -1,
    item_price: -1,
  });
  const [progress, setProgress] = useState("");
  const [successCount, setSuccessCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const { lang } = useI18n();
  const isAr = lang === "ar";

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const rows = parseCSV(text);
      if (rows.length < 2) {
        toast.error(isAr ? "ملف الـ CSV فارغ أو يحتوي على صف الرأس فقط." : "CSV file is empty or only contains the header row.");
        return;
      }

      const fileHeaders = rows[0].map(h => h.trim());
      setParsedRows(rows.slice(1));
      setHeaders(fileHeaders);

      // Smart Header Mapping Detector
      const newMappings = {
        order_number: -1,
        order_date: -1,
        customer_name: -1,
        customer_phone: -1,
        customer_email: -1,
        total_price: -1,
        item_name: -1,
        item_quantity: -1,
        item_price: -1,
      };

      Object.entries(ORDER_HEADER_MAPS).forEach(([field, aliases]) => {
        const foundIdx = fileHeaders.findIndex(h =>
          aliases.some(alias => h.toLowerCase() === alias.toLowerCase() || h.toLowerCase().includes(alias.toLowerCase()))
        );
        newMappings[field as keyof typeof newMappings] = foundIdx;
      });

      setMappings(newMappings);

      const mandatoryMapped = newMappings.order_number !== -1 && newMappings.item_name !== -1;
      if (mandatoryMapped && preset !== "custom") {
        startImport(rows.slice(1), newMappings, fileHeaders);
      } else {
        setStep("mapper");
      }
    };
    reader.readAsText(file);
  };

  const startImport = async (dataRows: string[][], finalMappings: Record<string, number>, headersList: string[] = headers) => {
    setStep("importing");
    setProgress(isAr ? "بدء عملية استيراد الطلبات الفاخرة..." : "Starting premium order import pipeline...");

    const findHeaderIdx = (names: string[]) => {
      return headersList.findIndex(h =>
        names.some(name => h.trim().toLowerCase() === name.toLowerCase())
      );
    };

    const ordersMap = new Map<string, any>();

    dataRows.forEach((row) => {
      let orderNum = "";
      let orderDate = new Date().toISOString();
      let customerName = null;
      let customerPhone = null;
      let customerEmail = null;
      let totalPrice = 0.0;
      let itemName = "";
      let itemQty = 1;
      let itemPrice = 0.0;
      let notesVal = null;

      if (preset === "shopify") {
        const orderNumIdx = findHeaderIdx(["name"]);
        const dateIdx = findHeaderIdx(["created at", "created_at"]);
        const phoneIdx = findHeaderIdx(["billing phone", "shipping phone", "phone"]);
        const emailIdx = findHeaderIdx(["email"]);
        const billingNameIdx = findHeaderIdx(["billing name", "shipping name", "customer name"]);
        const itemQtyIdx = findHeaderIdx(["lineitem quantity", "quantity"]);
        const itemNameIdx = findHeaderIdx(["lineitem name", "item name"]);
        const itemPriceIdx = findHeaderIdx(["lineitem price", "item price"]);
        const totalIdx = findHeaderIdx(["total"]);
        const notesIdx = findHeaderIdx(["note", "notes"]);

        orderNum = orderNumIdx !== -1 ? row[orderNumIdx] : "";
        orderDate = dateIdx !== -1 && row[dateIdx] ? new Date(row[dateIdx]).toISOString() : new Date().toISOString();
        customerPhone = phoneIdx !== -1 ? sanitizeGCCPhone(row[phoneIdx]) : null;
        customerEmail = emailIdx !== -1 ? row[emailIdx] || null : null;
        customerName = billingNameIdx !== -1 ? row[billingNameIdx] || null : null;
        itemQty = itemQtyIdx !== -1 ? parseInt(row[itemQtyIdx]?.replace(/[^\d]/g, "") || "1") || 1 : 1;
        itemName = itemNameIdx !== -1 ? row[itemNameIdx] : "Line Item";
        itemPrice = itemPriceIdx !== -1 ? parseFloat(row[itemPriceIdx]?.replace(/[^\d.]/g, "") || "0") || 0.0 : 0.0;
        totalPrice = totalIdx !== -1 ? parseFloat(row[totalIdx]?.replace(/[^\d.]/g, "") || "0") || 0.0 : 0.0;
        notesVal = notesIdx !== -1 ? row[notesIdx] || null : null;

      } else if (preset === "woocommerce") {
        const orderNumIdx = findHeaderIdx(["order number", "order_number", "id", "post_id"]);
        const dateIdx = findHeaderIdx(["order date", "order_date", "post_date"]);
        const phoneIdx = findHeaderIdx(["billing phone", "_billing_phone", "phone"]);
        const emailIdx = findHeaderIdx(["billing email", "_billing_email", "email"]);
        const firstNameIdx = findHeaderIdx(["billing first name", "_billing_first_name"]);
        const lastNameIdx = findHeaderIdx(["billing last name", "_billing_last_name"]);
        const itemQtyIdx = findHeaderIdx(["item quantity", "quantity"]);
        const itemNameIdx = findHeaderIdx(["item name", "name"]);
        const itemPriceIdx = findHeaderIdx(["item price", "price"]);
        const totalIdx = findHeaderIdx(["order total", "_order_total", "total"]);

        orderNum = orderNumIdx !== -1 ? row[orderNumIdx] : "";
        orderDate = dateIdx !== -1 && row[dateIdx] ? new Date(row[dateIdx]).toISOString() : new Date().toISOString();
        customerPhone = phoneIdx !== -1 ? sanitizeGCCPhone(row[phoneIdx]) : null;
        customerEmail = emailIdx !== -1 ? row[emailIdx] || null : null;
        
        const first = firstNameIdx !== -1 ? row[firstNameIdx] : "";
        const last = lastNameIdx !== -1 ? row[lastNameIdx] : "";
        customerName = `${first} ${last}`.trim() || null;

        itemQty = itemQtyIdx !== -1 ? parseInt(row[itemQtyIdx]?.replace(/[^\d]/g, "") || "1") || 1 : 1;
        itemName = itemNameIdx !== -1 ? row[itemNameIdx] : "Line Item";
        itemPrice = itemPriceIdx !== -1 ? parseFloat(row[itemPriceIdx]?.replace(/[^\d.]/g, "") || "0") || 0.0 : 0.0;
        totalPrice = totalIdx !== -1 ? parseFloat(row[totalIdx]?.replace(/[^\d.]/g, "") || "0") || 0.0 : 0.0;

      } else if (preset === "salla" || preset === "zid") {
        const orderNumIdx = findHeaderIdx(["رقم الطلب", "رقم طلب سلة", "id", "order_id"]);
        const dateIdx = findHeaderIdx(["تاريخ الطلب", "تاريخ طلب سلة", "date", "created_at"]);
        const phoneIdx = findHeaderIdx(["جوال العميل", "رقم الجوال", "رقم الهاتف", "phone"]);
        const emailIdx = findHeaderIdx(["البريد الالكتروني", "البريد الإلكتروني", "email"]);
        const nameIdx = findHeaderIdx(["اسم العميل", "الاسم الكامل", "name"]);
        const itemQtyIdx = findHeaderIdx(["الكمية", "كمية المنتج", "quantity"]);
        const itemNameIdx = findHeaderIdx(["اسم المنتج", "عنوان المنتج", "product_name"]);
        const itemPriceIdx = findHeaderIdx(["سعر المنتج", "السعر", "price"]);
        const totalIdx = findHeaderIdx(["إجمالي الطلب", "الإجمالي", "total"]);

        orderNum = orderNumIdx !== -1 ? row[orderNumIdx] : "";
        orderDate = dateIdx !== -1 && row[dateIdx] ? new Date(row[dateIdx]).toISOString() : new Date().toISOString();
        customerPhone = phoneIdx !== -1 ? sanitizeGCCPhone(row[phoneIdx]) : null;
        customerEmail = emailIdx !== -1 ? row[emailIdx] || null : null;
        customerName = nameIdx !== -1 ? row[nameIdx] || null : null;
        itemQty = itemQtyIdx !== -1 ? parseInt(row[itemQtyIdx]?.replace(/[^\d]/g, "") || "1") || 1 : 1;
        itemName = itemNameIdx !== -1 ? row[itemNameIdx] : "Line Item";
        itemPrice = itemPriceIdx !== -1 ? parseFloat(row[itemPriceIdx]?.replace(/[^\d.]/g, "") || "0") || 0.0 : 0.0;
        totalPrice = totalIdx !== -1 ? parseFloat(row[totalIdx]?.replace(/[^\d.]/g, "") || "0") || 0.0 : 0.0;

      } else {
        orderNum = finalMappings.order_number !== -1 ? row[finalMappings.order_number] : "";
        orderDate = finalMappings.order_date !== -1 && row[finalMappings.order_date] ? new Date(row[finalMappings.order_date]).toISOString() : new Date().toISOString();
        customerPhone = finalMappings.customer_phone !== -1 ? sanitizeGCCPhone(row[finalMappings.customer_phone]) : null;
        customerEmail = finalMappings.customer_email !== -1 ? row[finalMappings.customer_email] || null : null;
        customerName = finalMappings.customer_name !== -1 ? row[finalMappings.customer_name] || null : null;
        itemQty = finalMappings.item_quantity !== -1 ? parseInt(row[finalMappings.item_quantity]?.replace(/[^\d]/g, "") || "1") || 1 : 1;
        itemName = finalMappings.item_name !== -1 ? row[finalMappings.item_name] : "Line Item";
        itemPrice = finalMappings.item_price !== -1 ? parseFloat(row[finalMappings.item_price]?.replace(/[^\d.]/g, "") || "0") || 0.0 : 0.0;
        totalPrice = finalMappings.total_price !== -1 ? parseFloat(row[finalMappings.total_price]?.replace(/[^\d.]/g, "") || "0") || 0.0 : 0.0;
      }

      if (!orderNum) return;

      if (ordersMap.has(orderNum)) {
        const existing = ordersMap.get(orderNum);
        existing.items.push({
          name: itemName,
          quantity: itemQty,
          price: itemPrice
        });
      } else {
        ordersMap.set(orderNum, {
          orderNumber: orderNum,
          orderDate,
          customerName,
          customerPhone,
          customerEmail,
          totalPrice,
          paymentStatus: "paid",
          source: preset,
          notes: notesVal,
          items: [
            {
              name: itemName,
              quantity: itemQty,
              price: itemPrice
            }
          ]
        });
      }
    });

    const parsedOrders = Array.from(ordersMap.values());
    setTotalCount(parsedOrders.length);

    if (parsedOrders.length === 0) {
      toast.error(isAr ? "لم نتمكن من تحديد أي طلبات صالحة في هذا الملف." : "No valid orders could be parsed from this file.");
      setStep("preset");
      return;
    }

    try {
      const { importHistoricalOrders } = await import("@/lib/order-importer");
      
      const batchSize = 25;
      let totalSuccess = 0;

      for (let i = 0; i < parsedOrders.length; i += batchSize) {
        const chunk = parsedOrders.slice(i, i + batchSize);
        setProgress(
          isAr
            ? `جاري استيراد ${i} من أصل ${parsedOrders.length} طلب تاريخي...`
            : `Importing ${i} / ${parsedOrders.length} legacy orders...`
        );

        const result = await importHistoricalOrders({
          data: {
            brandId,
            orders: chunk
          }
        });

        totalSuccess += result.successCount;
        setSuccessCount(totalSuccess);
      }

      setStep("success");
      onComplete();
    } catch (err: any) {
      console.error(err);
      toast.error(isAr ? "فشل استيراد الطلبات" : "Order importer pipeline failed");
      setStep("preset");
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setStep("preset");
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="border border-primary/20 hover:border-primary/50 text-xs font-semibold px-4 py-2.5 rounded-xl transition-all shadow-sm flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-primary animate-pulse" />
          {isAr ? "استيراد طلبات سابقة" : "Import Past Orders"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-xl p-6 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-900 shadow-2xl">
        <DialogHeader className="pb-4 border-b border-zinc-100 dark:border-zinc-900">
          <DialogTitle className="text-lg font-bold font-display flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {isAr ? "معالج ترحيل واستيراد الطلبات السابقة" : "Historical Orders Migration Engine"}
          </DialogTitle>
        </DialogHeader>

        {step === "preset" && (
          <div className="space-y-5 pt-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              {isAr
                ? "ارفع ملفات الطلبات السابقة للتصدير من Shopify، WooCommerce، Salla، أو Zid مباشرة لتهيئة سجلات مبيعاتك بالكامل مع مطابقة العملاء."
                : "Upload legacy order CSV exports from Shopify, WooCommerce, Salla, or Zid to populate sales history with zero downtime."}
            </p>

            <div className="grid grid-cols-2 gap-3">
              {[
                { id: "shopify", label: "🛒 Shopify Orders", desc: "orders_export.csv" },
                { id: "woocommerce", label: "📦 WooCommerce CSV", desc: "wc_orders.csv" },
                { id: "salla", label: "🟢 Salla (سلة)", desc: "salla_orders.csv" },
                { id: "zid", label: "🟣 Zid (زد)", desc: "zid_orders.csv" },
              ].map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPreset(p.id as any)}
                  className={`p-4 rounded-xl border text-start transition-all ${
                    preset === p.id
                      ? "border-primary bg-primary/5 text-foreground ring-1 ring-primary"
                      : "border-zinc-100 dark:border-zinc-900 hover:border-zinc-200 hover:bg-zinc-50/50"
                  }`}
                >
                  <p className="text-xs font-semibold">{p.label}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">{p.desc}</p>
                </button>
              ))}
            </div>

            <div className="pt-4 border-t border-zinc-100 dark:border-zinc-900 flex justify-between items-center">
              <Button
                variant="ghost"
                onClick={() => setPreset("custom")}
                className="text-xs text-muted-foreground font-semibold"
              >
                {isAr ? "استخدام مطابقة مخصصة..." : "Use custom column mapper..."}
              </Button>

              <label className="bg-primary text-primary-foreground text-xs font-semibold px-5 py-2.5 rounded-xl shadow-lg shadow-primary/15 hover:shadow-xl transition-all cursor-pointer flex items-center gap-2">
                <Upload className="h-4 w-4" />
                {isAr ? "اختر ملف الـ CSV" : "Select CSV File"}
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        )}

        {step === "mapper" && (
          <div className="space-y-4 pt-4">
            <p className="text-xs text-muted-foreground">
              {isAr
                ? "طابق أعمدة ملف الـ CSV المخصص الخاص بك مع الحقول المطلوبة لترحيل مبيعاتك بنجاح."
                : "Map your custom CSV file columns to match required fields in our historical sales engine."}
            </p>

            <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
              {[
                { key: "order_number", label: isAr ? "رقم الطلب" : "Order Number", required: true },
                { key: "order_date", label: isAr ? "تاريخ الطلب" : "Order Date", required: true },
                { key: "customer_name", label: isAr ? "اسم العميل" : "Customer Name", required: false },
                { key: "customer_phone", label: isAr ? "رقم جوال العميل" : "Customer Phone", required: false },
                { key: "customer_email", label: isAr ? "البريد الإلكتروني" : "Customer Email", required: false },
                { key: "total_price", label: isAr ? "إجمالي الطلب" : "Total Price", required: true },
                { key: "item_name", label: isAr ? "اسم المنتج" : "Item Name", required: true },
                { key: "item_quantity", label: isAr ? "كمية المنتج" : "Item Quantity", required: true },
                { key: "item_price", label: isAr ? "سعر المنتج" : "Item Price", required: true },
              ].map((field) => (
                <div key={field.key} className="flex items-center justify-between gap-4 p-3 bg-zinc-50 dark:bg-zinc-900/40 rounded-xl border border-zinc-100 dark:border-zinc-800">
                  <span className="text-xs font-semibold text-foreground">
                    {field.label} {field.required && <span className="text-rose-500">*</span>}
                  </span>
                  <Select
                    value={mappings[field.key]?.toString() || "-1"}
                    onValueChange={(val) => setMappings(m => ({ ...m, [field.key]: parseInt(val) }))}
                  >
                    <SelectTrigger className="w-[180px] h-8 text-xs">
                      <SelectValue placeholder={isAr ? "اختر العمود..." : "Select..."} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="-1">-- {isAr ? "تجاوز" : "Skip"} --</SelectItem>
                      {headers.map((h, idx) => (
                        <SelectItem key={idx} value={idx.toString()}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setStep("preset")} className="text-xs font-semibold">
                {isAr ? "رجوع" : "Back"}
              </Button>
              <Button
                onClick={() => {
                  if (mappings.order_number === -1 || mappings.item_name === -1) {
                    toast.error(isAr ? "رقم الطلب واسم المنتج حقول إلزامية للتجهيز." : "Order Number and Item Name are mandatory fields.");
                    return;
                  }
                  startImport(parsedRows, mappings);
                }}
                className="bg-primary text-xs text-primary-foreground font-semibold px-5 py-2"
              >
                {isAr ? "بدء الاستيراد" : "Start Import"}
              </Button>
            </div>
          </div>
        )}

        {step === "importing" && (
          <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
            <div className="space-y-1">
              <p className="font-semibold text-sm">{isAr ? "جاري استيراد تاريخ مبيعاتك..." : "Processing order database migration..."}</p>
              <p className="text-xs text-muted-foreground">{progress}</p>
            </div>
          </div>
        )}

        {step === "success" && (
          <div className="py-8 flex flex-col items-center justify-center text-center space-y-5 pt-6">
            <div className="h-12 w-12 rounded-full bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 flex items-center justify-center border border-emerald-100 dark:border-emerald-900">
              <Check className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <p className="font-bold text-lg">{isAr ? "اكتمل الترحيل بنجاح وافر!" : "Historical Migration Completed!"}</p>
              <p className="text-xs text-muted-foreground leading-relaxed max-w-sm">
                {isAr
                  ? `تم بنجاح ترحيل واستيراد ${successCount} من أصل ${totalCount} طلبات سابقة مع مطابقتها بالعملاء بنجاح.`
                  : `Successfully imported ${successCount} out of ${totalCount} historical sales, matching billing phone entries directly.`}
              </p>
            </div>
            <Button onClick={handleClose} className="bg-primary text-xs font-semibold px-6 py-2.5 rounded-xl shadow-lg shadow-primary/10">
              {isAr ? "استمرار إلى اللوحة" : "Proceed to Dashboard"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
