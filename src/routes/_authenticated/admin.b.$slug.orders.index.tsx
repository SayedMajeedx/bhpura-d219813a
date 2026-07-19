import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate, formatMoney } from "@/lib/format";
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

function OrdersList() {
  const t = useT();
  const { lang } = useI18n();
  const locale = lang === "ar" ? "ar-BH" : "en-BH";
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { slug } = Route.useParams();
  const brand = useBrand();
  const { isCourier } = useProfile();
  const brandId = brand.id;
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fulfillmentFilter, setFulfillmentFilter] = useState("all");

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
      let query = supabase
        .from("orders")
        .select("*, customers(name, phone, region, road, house, flat, address, city)")
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
  const filteredOrders = orders.filter((order) => {
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
    return (
      matchesSearch &&
      (statusFilter === "all" || order.status === statusFilter) &&
      (fulfillmentFilter === "all" || order.fulfillment_method === fulfillmentFilter)
    );
  });

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
  const unpaidCount = orders.filter(
    (order) =>
      resolvePaymentStatus(
        order.payment_status,
        order.status,
        Number(order.total),
        Number(order.advance_paid ?? 0),
      ) !== "paid",
  ).length;
  const openValue = orders
    .filter((order) => !["cancelled", "completed"].includes(order.status))
    .reduce((sum, order) => sum + Number(order.total || 0), 0);
  const currency = orders[0]?.currency ?? "BHD";

  const del = async (id: string) => {
    try {
      await deleteOrderWithPrivateReceipt({ data: { orderId: id } });
      toast.success(t("common.delete"));
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ["orders"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete order");
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-3xl sm:text-4xl font-display">{t("orders.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1 truncate">{t("orders.subtitle")}</p>
        </div>
        {!isCourier && <Button onClick={create} className="shrink-0">
          <Plus className="h-4 w-4 mr-2" /> {t("orders.new")}
        </Button>}
      </div>

      {!isCourier && <div className="mb-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          [ReceiptText, t("orders.title"), String(orders.length)],
          [Clock3, t("status.pending"), String(pendingCount)],
          [CircleDollarSign, t("payStatus.unpaid"), String(unpaidCount)],
          [Truck, t("orders.total"), formatMoney(openValue, currency)],
        ].map(([Icon, label, value], index) => {
          const StatIcon = Icon as typeof ReceiptText;
          return (
            <Card key={index} className="p-3 sm:p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                  <StatIcon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground truncate">{String(label)}</p>
                  <p className="font-semibold truncate">{String(value)}</p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>}

      <Card className="mb-5 p-3 sm:p-4">
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(220px,1fr)_180px_190px] gap-3">
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
            }}
          >
            {lang === "ar" ? "مسح عوامل التصفية" : "Clear filters"}
          </Button>
        </Card>
      ) : (
        <>
          <div className="space-y-3 sm:hidden">
            {paginatedOrders.map((o) => {
              const badge = resolvePaymentStatus(
                (o as any).payment_status,
                o.status,
                Number(o.total),
                Number((o as any).advance_paid ?? 0),
              );
              const deliveryBadge =
                o.fulfillment_method === "delivery"
                  ? deliveryStatusPresentation((o as any).fulfillment_status, lang)
                  : null;
              return (
                <Card key={o.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <Link
                        to="/admin/b/$slug/orders/$id"
                        params={{ slug, id: o.id }}
                        className="text-lg font-semibold text-primary"
                      >
                        #{o.invoice_number}
                      </Link>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {formatDate(o.created_at ?? o.order_date, locale)} ·{" "}
                        {o.customers?.name ?? t("orders.noCustomer")}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded px-2 py-1 text-[10px] uppercase tracking-wider ${o.status === "pending_verification" ? "bg-amber-100 text-amber-900 ring-1 ring-amber-300" : "bg-secondary"}`}
                        >
                          {o.status === "pending_verification"
                            ? lang === "ar"
                              ? "بانتظار التحقق"
                              : "Pending verification"
                            : t(`status.${o.status}`)}
                        </span>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${PAYMENT_BADGE_CLASSES[badge]}`}
                        >
                          {t(`payStatus.${badge}`)}
                        </span>
                        {deliveryBadge && (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${deliveryBadge.className}`}
                          >
                            {deliveryBadge.label}
                          </span>
                        )}
                      </div>
                      <div className="mt-3 font-semibold">
                        {formatMoney(Number(o.total), o.currency)}
                      </div>
                    </div>
                    {!isCourier && <div className="flex shrink-0 flex-col gap-1">
                      <Button
                        className="h-11 w-11 touch-manipulation"
                        variant="ghost"
                        size="icon"
                        aria-label={t("orders.copyLink")}
                        onClick={() => copyInvoiceLink(o.public_invoice_token, t)}
                      >
                        <LinkIcon className="h-5 w-5" />
                      </Button>
                      <Button
                        className="h-11 w-11 touch-manipulation text-destructive"
                        variant="ghost"
                        size="icon"
                        aria-label={t("common.delete")}
                        onClick={() => setDeleteTarget(o.id)}
                      >
                        <Trash2 className="h-5 w-5" />
                      </Button>
                    </div>}
                  </div>
                </Card>
              );
            })}
          </div>
          <Card className="hidden overflow-hidden sm:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] table-fixed text-sm">
                <colgroup>
                  <col className="w-[13%]" />
                  <col className="w-[16%]" />
                  <col className="w-[23%]" />
                  <col className="w-[17%]" />
                  <col className="w-[19%]" />
                  <col className="w-[12%]" />
                </colgroup>
                <thead className="bg-secondary/50 select-none text-xs uppercase tracking-wide">
                  <tr>
                    <th className="p-4 text-start font-medium cursor-pointer hover:bg-secondary/75 transition-colors" onClick={() => toggleSort("invoice_number")}>
                      <span className="flex items-center">{t("orders.invoice")} {renderSortIcon("invoice_number")}</span>
                    </th>
                    <th className="p-4 text-start font-medium cursor-pointer hover:bg-secondary/75 transition-colors" onClick={() => toggleSort("created_at")}>
                      <span className="flex items-center">{t("orders.date")} {renderSortIcon("created_at")}</span>
                    </th>
                    <th className="p-4 text-start font-medium cursor-pointer hover:bg-secondary/75 transition-colors" onClick={() => toggleSort("customer")}>
                      <span className="flex items-center">{t("orders.customer")} {renderSortIcon("customer")}</span>
                    </th>
                    <th className="p-4 text-start font-medium cursor-pointer hover:bg-secondary/75 transition-colors" onClick={() => toggleSort("status")}>
                      <span className="flex items-center">{t("orders.status")} {renderSortIcon("status")}</span>
                    </th>
                    <th className="p-4 text-end font-medium cursor-pointer hover:bg-secondary/75 transition-colors" onClick={() => toggleSort("total")}>
                      <span className="flex items-center justify-end">{t("orders.total")} {renderSortIcon("total")}</span>
                    </th>
                    <th className="p-4 text-end font-medium">{t("orders.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedOrders.map((o) => {
                    const deliveryBadge =
                      o.fulfillment_method === "delivery"
                        ? deliveryStatusPresentation((o as any).fulfillment_status, lang)
                        : null;
                    return (
                    <tr key={o.id} className="border-t border-border hover:bg-secondary/30">
                      <td className="p-4">
                        <Link
                          to="/admin/b/$slug/orders/$id"
                          params={{ slug, id: o.id }}
                          className="text-primary font-medium"
                        >
                          #{o.invoice_number}
                        </Link>
                      </td>
                      <td className="p-4 text-muted-foreground">
                        {formatDate(o.created_at ?? o.order_date, locale)}
                      </td>
                      <td className="p-4">
                        {o.customers?.name ?? (
                          <span className="text-muted-foreground italic">
                            {t("orders.noCustomer")}
                          </span>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="flex flex-wrap gap-1.5">
                          <span
                            className={`text-xs uppercase tracking-wider px-2 py-1 rounded ${o.status === "pending_verification" ? "bg-amber-100 text-amber-900 ring-1 ring-amber-300" : "bg-secondary"}`}
                          >
                            {o.status === "pending_verification"
                              ? lang === "ar"
                                ? "بانتظار التحقق"
                                : "Pending verification"
                              : t(`status.${o.status}`)}
                          </span>
                          {deliveryBadge && (
                            <span
                              className={`rounded-full px-2 py-1 text-[10px] font-medium ring-1 ${deliveryBadge.className}`}
                            >
                              {deliveryBadge.label}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-end font-medium whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          <span>{formatMoney(Number(o.total), o.currency)}</span>
                          {(() => {
                            const badge = resolvePaymentStatus(
                              (o as any).payment_status,
                              o.status,
                              Number(o.total),
                              Number((o as any).advance_paid ?? 0),
                            );
                            return (
                              <span
                                className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${PAYMENT_BADGE_CLASSES[badge]}`}
                              >
                                {t(`payStatus.${badge}`)}
                              </span>
                            );
                          })()}
                        </div>
                      </td>
                      <td className="p-4 text-end whitespace-nowrap">
                        {!isCourier && <>
                        <Button
                          variant="ghost"
                          size="icon"
                          title={t("orders.copyLink")}
                          aria-label={t("orders.copyLink")}
                          onClick={() => copyInvoiceLink(o.public_invoice_token, t)}
                        >
                          <LinkIcon className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(o.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        </>}
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
    </div>
  );
}
