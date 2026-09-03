import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useMemo, useRef } from "react";
import {
  ArrowLeft,
  CalendarDays,
  Mail,
  MessageCircle,
  MapPin,
  Pencil,
  Phone,
  ReceiptText,
  StickyNote,
  UserRound,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  RotateCw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/lib/brand-context";
import { useI18n, useT } from "@/lib/i18n";
import { formatAddressLine, regionLabel } from "@/lib/bahrain-regions";
import { formatMoney } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PhoneInput } from "@/components/phone-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  CustomerAddressManager,
  type ManagedCustomerAddress,
} from "@/components/customer-address-manager";
import { CustomerFitPassport } from "@/components/customers/CustomerFitPassport";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/customers/$customerId")({
  component: CustomerProfilePage,
});

type CustomerProfile = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
};

type CustomerAddress = ManagedCustomerAddress;

type CustomerOrder = {
  id: string;
  invoice_number: number;
  order_date: string;
  status: string;
  payment_method: string | null;
  total: number;
  currency: string;
};

const PAYMENT_LABELS: Record<string, { en: string; ar: string }> = {
  cod: { en: "Cash on delivery", ar: "الدفع عند الاستلام" },
  cash: { en: "Cash", ar: "نقداً" },
  card: { en: "Card", ar: "بطاقة" },
  bank_transfer: { en: "Bank transfer", ar: "تحويل بنكي" },
  benefit_pay: { en: "BenefitPay", ar: "بنفت بي" },
};

function formatArabicOrderStatus(status: string | null | undefined, lang: "en" | "ar") {
  const s = String(status || "").toLowerCase();
  if (lang === "ar") {
    switch (s) {
      case "pending":
      case "unpaid":
        return "غير مدفوع";
      case "pending_verification":
        return "بانتظار التحقق";
      case "confirmed":
      case "paid":
        return "مؤكد";
      case "completed":
      case "delivered":
        return "مكتمل";
      case "cancelled":
        return "ملغي";
      case "refunded":
        return "مسترجع";
      default:
        return status || "مؤكد";
    }
  }
  switch (s) {
    case "pending":
    case "unpaid":
      return "Unpaid";
    case "pending_verification":
      return "Pending Verification";
    case "confirmed":
    case "paid":
      return "Confirmed";
    case "completed":
    case "delivered":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    case "refunded":
      return "Refunded";
    default:
      return status || "Confirmed";
  }
}

function CustomerProfilePage() {
  const { slug, customerId } = Route.useParams();
  const { lang } = useI18n();
  const brand = useBrand();
  const router = useRouter();
  const t = useT();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);

  const customerQ = useQuery({
    queryKey: ["customer-profile", brand.id, customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, phone, email, notes")
        .eq("brand_id", brand.id)
        .eq("id", customerId)
        .maybeSingle();
      if (error) throw error;
      return data as CustomerProfile | null;
    },
  });

  const addressesQ = useQuery({
    queryKey: ["customer-profile-addresses", brand.id, customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_addresses")
        .select("id, label, region, block, road, house, flat, delivery_notes, is_default")
        .eq("brand_id", brand.id)
        .eq("customer_id", customerId)
        .order("is_default", { ascending: false })
        .order("created_at");
      if (error) throw error;
      return data as CustomerAddress[];
    },
  });

  const ordersQ = useQuery({
    queryKey: ["customer-profile-orders", brand.id, customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, invoice_number, order_date, status, payment_method, total, currency")
        .eq("brand_id", brand.id)
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as CustomerOrder[];
    },
  });

  const PAGE_SIZE = 8;
  const [currentPage, setCurrentPage] = useState(1);

  const customer = customerQ.data;
  const orders = useMemo(() => ordersQ.data ?? [], [ordersQ.data]);
  const totalSpent = useMemo(
    () => orders.reduce((sum, o) => sum + Number(o.total || 0), 0),
    [orders],
  );
  const totalPages = Math.max(1, Math.ceil(orders.length / PAGE_SIZE));
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return orders.slice(start, start + PAGE_SIZE);
  }, [orders, currentPage]);

  if (customerQ.isLoading)
    return (
      <div className="mx-auto max-w-7xl p-6 animate-pulse space-y-4">
        <Skeleton className="h-10 w-64 rounded-xl" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Skeleton className="h-96 rounded-2xl lg:col-span-2" />
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      </div>
    );

  if (customerQ.isError) {
    return (
      <div className="mx-auto max-w-xl p-8 animate-fade-in">
        <Card className="overflow-hidden border border-border/60 shadow-lg rounded-2xl bg-card/80 backdrop-blur-sm p-8 text-center space-y-4">
          <AlertTriangle className="mx-auto h-10 w-10 text-amber-500 animate-pulse" />
          <div className="space-y-1">
            <h1 className="font-display text-xl font-bold">
              {lang === "ar" ? "تعذر تحميل ملف العميل" : "Unable to load customer profile"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {customerQ.error?.message ||
                (lang === "ar"
                  ? "حدث خطأ في الاتصال بالشبكة"
                  : "Connection or query error occurred")}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            <Button
              type="button"
              onClick={() => customerQ.refetch()}
              className="gap-2 font-bold shadow-sm"
            >
              <RotateCw className="h-4 w-4" />
              {lang === "ar" ? "إعادة المحاولة" : "Try Again"}
            </Button>
            <Button asChild variant="outline" className="gap-2">
              <Link to="/admin/b/$slug/customers" params={{ slug }}>
                {lang === "ar" ? "العودة إلى العملاء" : "Back to customers"}
              </Link>
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="mx-auto max-w-xl p-8 animate-fade-in">
        <Card className="overflow-hidden border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm p-8 text-center">
          <UserRound className="mx-auto mb-3 h-10 w-10 text-muted-foreground animate-pulse" />
          <h1 className="font-display text-2xl font-bold">
            {lang === "ar" ? "ملف العميل غير موجود" : "Customer profile not found"}
          </h1>
          <Button
            asChild
            className="mt-5 shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95"
          >
            <Link to="/admin/b/$slug/customers" params={{ slug }}>
              {lang === "ar" ? "العودة إلى العملاء" : "Back to customers"}
            </Link>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div
      className="mx-auto max-w-7xl space-y-4 p-1 sm:p-2 animate-fade-in"
      dir={lang === "ar" ? "rtl" : "ltr"}
    >
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              if (window.history.length > 2) {
                router.history.back();
              } else {
                router.navigate({ to: `/admin/b/${slug}/customers` });
              }
            }}
            className="mb-3 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
            {lang === "ar" ? "العودة إلى العملاء" : "Back to customers"}
          </button>
          <h1 className="font-display text-4xl font-extrabold tracking-tight bg-clip-text bg-gradient-to-r from-slate-900 via-slate-800 to-slate-950 dark:from-slate-50 dark:to-slate-300">
            {customer.name}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {lang === "ar"
              ? `${orders.length} طلب مرتبط بهذا العميل`
              : `${orders.length} order${orders.length === 1 ? "" : "s"} linked to this customer`}
          </p>
        </div>
        <div className="flex gap-2">
          {/* Desktop Actions */}
          <div className="hidden sm:flex items-center gap-2">
            {customer.phone && (
              <Button asChild variant="outline" className="min-h-11 px-3">
                <a
                  href={`tel:${customer.phone}`}
                  aria-label={lang === "ar" ? "الاتصال بالعميل" : "Call customer"}
                >
                  <Phone className="h-4 w-4 me-2" />
                  <span>{lang === "ar" ? "اتصال" : "Call"}</span>
                </a>
              </Button>
            )}
            {customer.phone && (
              <Button asChild variant="outline" className="min-h-11 px-3 text-emerald-700">
                <a
                  href={`https://wa.me/${customer.phone.replace(/[^\d]/g, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={
                    lang === "ar" ? "مراسلة العميل عبر واتساب" : "Message customer on WhatsApp"
                  }
                >
                  <MessageCircle className="h-4 w-4 me-2" />
                  <span>{lang === "ar" ? "واتساب" : "WhatsApp"}</span>
                </a>
              </Button>
            )}
          </div>

          <Button
            onClick={() => setEditing(true)}
            className="min-h-11 shadow-sm transition-all duration-200 hover:shadow active:scale-95 px-3"
          >
            <Pencil className="h-4 w-4 sm:me-2" />
            <span className="hidden sm:inline">
              {lang === "ar" ? "تعديل الملف" : "Edit Profile"}
            </span>
            <span className="sm:hidden">{lang === "ar" ? "تعديل" : "Edit"}</span>
          </Button>

          {/* Mobile More Actions */}
          {customer.phone && (
            <div className="sm:hidden">
              <Button
                variant="outline"
                className="min-h-11 w-11 p-0"
                onClick={() => setMobileActionsOpen(true)}
                aria-label={lang === "ar" ? "المزيد من إجراءات العميل" : "More customer actions"}
                title={lang === "ar" ? "المزيد من إجراءات العميل" : "More customer actions"}
              >
                <MoreHorizontal className="h-5 w-5" />
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card className="overflow-hidden border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm">
            <div className="bg-primary/5 p-5 border-b border-border/50">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <UserRound className="h-6 w-6" />
                </div>
                {/* VIP / Segment Badges */}
                <div className="flex flex-wrap gap-1 justify-end">
                  {orders.length >= 3 || totalSpent >= 100 ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-300 dark:border-amber-800">
                      👑 {lang === "ar" ? "عميل مميز (VIP)" : "VIP Customer"}
                    </span>
                  ) : orders.length > 0 ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800">
                      ✨ {lang === "ar" ? "عميل متكرر" : "Repeat Buyer"}
                    </span>
                  ) : null}
                </div>
              </div>
              <h2 className="font-display text-xl font-bold">
                {lang === "ar" ? "بيانات العميل" : "Customer Details"}
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                {lang === "ar" ? "إجمالي الإنفاق:" : "Lifetime Spend:"}{" "}
                <span className="font-bold text-primary font-mono">
                  {formatMoney(totalSpent, "BHD")}
                </span>{" "}
                ({orders.length} {lang === "ar" ? "طلبات" : "orders"})
              </p>
            </div>
            <div className="space-y-4 p-5 text-sm">
              <Detail
                icon={Phone}
                label={lang === "ar" ? "الهاتف" : "Phone"}
                value={customer.phone}
                ltr
              />
              <Detail
                icon={Mail}
                label={lang === "ar" ? "البريد الإلكتروني" : "Email"}
                value={customer.email}
                ltr
              />
              <Detail
                icon={StickyNote}
                label={lang === "ar" ? "ملاحظات طاقم العمل" : "Internal Staff Notes"}
                value={customer.notes}
              />
            </div>
          </Card>

          <Card className="overflow-hidden border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm p-5">
            <CustomerAddressManager
              addresses={addressesQ.data ?? []}
              loading={addressesQ.isLoading}
              customerId={customerId}
              brandId={brand.id}
              lang={lang}
              onChanged={() =>
                qc.invalidateQueries({
                  queryKey: ["customer-profile-addresses", brand.id, customerId],
                })
              }
            />
          </Card>
        </div>

        <div className="space-y-6">
          <CustomerFitPassport brandId={brand.id} customerId={customerId} isAr={lang === "ar"} />
          <Card className="overflow-hidden border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-3 border-b border-border/50 p-5 bg-primary/5">
              <div>
                <h2 className="font-display text-xl font-bold">
                  {lang === "ar" ? "سجل الطلبات" : "Order History"}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {lang === "ar"
                    ? "اضغط على أي طلب لفتح تفاصيله."
                    : "Select any order to open its full details."}
                </p>
              </div>
              <ReceiptText className="h-6 w-6 text-primary" />
            </div>
            {ordersQ.isLoading ? (
              <div className="p-8 text-center text-muted-foreground">
                {lang === "ar" ? "جاري تحميل الطلبات…" : "Loading orders…"}
              </div>
            ) : orders.length === 0 ? (
              <div className="p-12 text-center">
                <ReceiptText className="mx-auto mb-3 h-9 w-9 text-muted-foreground" />
                <p className="text-muted-foreground">
                  {lang === "ar"
                    ? "لا توجد طلبات لهذا العميل بعد."
                    : "This customer has no orders yet."}
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-2 p-3 sm:hidden">
                  {paginatedOrders.map((order) => (
                    <button
                      key={order.id}
                      type="button"
                      onClick={() =>
                        navigate({
                          to: "/admin/b/$slug/orders/$id",
                          params: { slug, id: order.id },
                        })
                      }
                      className="w-full rounded-xl border border-border/60 bg-background/70 p-3 text-start transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-mono text-sm font-bold text-primary">
                            #{order.invoice_number}
                          </p>
                          <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <CalendarDays className="h-3.5 w-3.5" />
                            {new Date(order.order_date).toLocaleDateString(
                              lang === "ar" ? "ar-BH-u-nu-latn" : "en-BH",
                            )}
                          </p>
                        </div>
                        <p className="font-mono text-sm font-extrabold">
                          {formatMoney(Number(order.total), order.currency || "BHD")}
                        </p>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/50 pt-2.5">
                        <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-bold">
                          {formatArabicOrderStatus(order.status, lang)}
                        </span>
                        <span className="truncate text-[11px] text-muted-foreground">
                          {paymentLabel(order.payment_method, lang)}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
                <div className="hidden overflow-x-auto sm:block">
                  <table className="w-full min-w-[680px] text-sm whitespace-nowrap">
                    <thead className="border-b bg-muted/40 font-semibold text-muted-foreground">
                      <tr>
                        <th className="p-4 text-start font-semibold text-xs uppercase tracking-wider whitespace-nowrap">
                          {lang === "ar" ? "رقم الطلب" : "Order ID #"}
                        </th>
                        <th className="p-4 text-start font-semibold text-xs uppercase tracking-wider whitespace-nowrap">
                          {lang === "ar" ? "التاريخ" : "Date"}
                        </th>
                        <th className="p-4 text-start font-semibold text-xs uppercase tracking-wider whitespace-nowrap">
                          {lang === "ar" ? "الحالة" : "Status"}
                        </th>
                        <th className="p-4 text-start font-semibold text-xs uppercase tracking-wider whitespace-nowrap">
                          {lang === "ar" ? "طريقة الدفع" : "Payment Method"}
                        </th>
                        <th className="p-4 text-end font-semibold text-xs uppercase tracking-wider whitespace-nowrap">
                          {lang === "ar" ? "الإجمالي" : "Total Amount"}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedOrders.map((order) => (
                        <tr
                          key={order.id}
                          tabIndex={0}
                          className="cursor-pointer border-t border-border transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
                          onClick={() =>
                            navigate({
                              to: "/admin/b/$slug/orders/$id",
                              params: { slug, id: order.id },
                            })
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ")
                              navigate({
                                to: "/admin/b/$slug/orders/$id",
                                params: { slug, id: order.id },
                              });
                          }}
                        >
                          <td className="p-4 whitespace-nowrap font-mono font-bold">
                            <Link
                              to="/admin/b/$slug/orders/$id"
                              params={{ slug, id: order.id }}
                              className="font-semibold text-primary hover:underline"
                            >
                              #{order.invoice_number}
                            </Link>
                          </td>
                          <td className="p-4 text-muted-foreground whitespace-nowrap">
                            <span className="inline-flex items-center gap-2">
                              <CalendarDays className="h-4 w-4" />
                              {new Date(order.order_date).toLocaleDateString(
                                lang === "ar" ? "ar-BH-u-nu-latn" : "en-BH",
                              )}
                            </span>
                          </td>
                          <td className="p-4 whitespace-nowrap">
                            <span className="rounded-full bg-secondary px-3 py-1 text-xs font-bold text-foreground">
                              {formatArabicOrderStatus(order.status, lang)}
                            </span>
                          </td>
                          <td className="p-4 text-muted-foreground whitespace-nowrap">
                            {paymentLabel(order.payment_method, lang)}
                          </td>
                          <td className="p-4 text-end font-semibold text-foreground whitespace-nowrap font-mono">
                            {formatMoney(Number(order.total), order.currency || "BHD")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between border-t border-border/60 bg-muted/20 px-4 py-3 text-xs">
                    <p className="text-muted-foreground font-medium">
                      {lang === "ar"
                        ? `عرض ${Math.min(orders.length, (currentPage - 1) * PAGE_SIZE + 1)}–${Math.min(orders.length, currentPage * PAGE_SIZE)} من إجمالي ${orders.length} طلب`
                        : `Showing ${Math.min(orders.length, (currentPage - 1) * PAGE_SIZE + 1)}–${Math.min(orders.length, currentPage * PAGE_SIZE)} of ${orders.length} orders`}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        className="h-8 px-2.5 text-xs font-semibold flex items-center gap-1"
                      >
                        {lang === "ar" ? (
                          <>
                            <span className="hidden sm:inline">السابق</span>
                            <ChevronRight className="h-3.5 w-3.5" />
                          </>
                        ) : (
                          <>
                            <ChevronLeft className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Previous</span>
                          </>
                        )}
                      </Button>
                      <span className="px-2 font-bold text-foreground">
                        {currentPage} / {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage === totalPages}
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        className="h-8 px-2.5 text-xs font-semibold flex items-center gap-1"
                      >
                        {lang === "ar" ? (
                          <>
                            <ChevronLeft className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">التالي</span>
                          </>
                        ) : (
                          <>
                            <span className="hidden sm:inline">Next</span>
                            <ChevronRight className="h-3.5 w-3.5" />
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </Card>
        </div>
      </div>

      <EditCustomerDialog
        customer={customer}
        brandId={brand.id}
        open={editing}
        onOpenChange={setEditing}
        onSaved={() => {
          setEditing(false);
          qc.invalidateQueries({ queryKey: ["customer-profile", brand.id, customerId] });
          qc.invalidateQueries({ queryKey: ["customers", brand.id] });
        }}
      />

      <Dialog open={mobileActionsOpen} onOpenChange={setMobileActionsOpen}>
        <DialogContent
          closeLabel={lang === "ar" ? "إغلاق" : "Close"}
          className="top-auto bottom-0 w-full max-w-none translate-y-0 rounded-b-none rounded-t-3xl border-x-0 border-b-0 p-5 sm:hidden"
        >
          <DialogHeader>
            <DialogTitle>{lang === "ar" ? "إجراءات العميل" : "Customer actions"}</DialogTitle>
            <DialogDescription>
              {lang === "ar" ? "أدوات التواصل مع العميل" : "Communication tools"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            {customer.phone && (
              <Button
                variant="outline"
                className="min-h-12 justify-start rounded-xl"
                asChild
                onClick={() => setMobileActionsOpen(false)}
              >
                <a href={`tel:${customer.phone}`}>
                  <Phone className="me-2 h-4 w-4" />
                  {lang === "ar" ? "اتصال" : "Call"}
                </a>
              </Button>
            )}
            {customer.phone && (
              <Button
                variant="outline"
                className="min-h-12 justify-start rounded-xl text-emerald-700"
                asChild
                onClick={() => setMobileActionsOpen(false)}
              >
                <a href={`https://wa.me/${customer.phone.replace(/[^\d]/g, "")}`}>
                  <MessageCircle className="me-2 h-4 w-4" />
                  {lang === "ar" ? "واتساب" : "WhatsApp"}
                </a>
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Detail({
  icon: Icon,
  label,
  value,
  ltr = false,
}: {
  icon: typeof Phone;
  label: string;
  value: string | null;
  ltr?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="break-words font-medium" dir={ltr ? "ltr" : undefined}>
          {value || "—"}
        </p>
      </div>
    </div>
  );
}

function paymentLabel(value: string | null, lang: "en" | "ar") {
  if (!value) return "—";
  const label = PAYMENT_LABELS[value];
  return label?.[lang] ?? value.replace(/_/g, " ");
}

function EditCustomerDialog({
  customer,
  brandId,
  open,
  onOpenChange,
  onSaved,
}: {
  customer: CustomerProfile;
  brandId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const { lang } = useI18n();
  const [form, setForm] = useState({
    name: customer.name,
    phone: customer.phone ?? "",
    email: customer.email ?? "",
    notes: customer.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const saveRef = useRef<() => Promise<unknown>>(async () => undefined);

  const isDirty =
    form.name !== customer.name ||
    form.phone !== (customer.phone ?? "") ||
    form.email !== (customer.email ?? "") ||
    form.notes !== (customer.notes ?? "");

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty && open && !saving) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty, open, saving]);

  useEffect(
    () =>
      setForm({
        name: customer.name,
        phone: customer.phone ?? "",
        email: customer.email ?? "",
        notes: customer.notes ?? "",
      }),
    [customer, open],
  );

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (!saving) {
          void saveRef.current();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, saving, form, customer, brandId, onSaved, lang]);

  const save = async () => {
    if (!form.name.trim())
      return toast.error(lang === "ar" ? "اسم العميل مطلوب." : "Customer name is required.");
    const phone = form.phone.replace(/\D/g, "");
    const email = form.email.trim().toLowerCase();
    if (phone || email) {
      const { data, error } = await supabase
        .from("customers")
        .select("id, phone, email")
        .eq("brand_id", brandId);
      if (error) return toast.error(error.message);
      if (
        phone &&
        (data ?? []).some(
          (row) => row.id !== customer.id && String(row.phone ?? "").replace(/\D/g, "") === phone,
        )
      )
        return toast.error(
          lang === "ar"
            ? "رقم الهاتف مرتبط بملف عميل آخر."
            : "This phone number belongs to another customer profile.",
        );
      if (
        email &&
        (data ?? []).some(
          (row) =>
            row.id !== customer.id &&
            String(row.email ?? "")
              .trim()
              .toLowerCase() === email,
        )
      )
        return toast.error(
          lang === "ar"
            ? "البريد الإلكتروني مرتبط بملف عميل آخر."
            : "This email belongs to another customer profile.",
        );
    }
    setSaving(true);
    const { error } = await supabase
      .from("customers")
      .update({
        name: form.name.trim(),
        phone: phone || null,
        email: email || null,
        notes: form.notes.trim() || null,
      })
      .eq("brand_id", brandId)
      .eq("id", customer.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(lang === "ar" ? "تم تحديث ملف العميل" : "Customer profile updated");
    onSaved();
  };
  saveRef.current = save;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{lang === "ar" ? "تعديل ملف العميل" : "Edit Customer Profile"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>{lang === "ar" ? "الاسم" : "Name"}</Label>
            <Input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>{lang === "ar" ? "الهاتف" : "Phone"}</Label>
              <PhoneInput value={form.phone} onChange={(phone) => setForm({ ...form, phone })} />
            </div>
            <div>
              <Label>{lang === "ar" ? "البريد الإلكتروني" : "Email"}</Label>
              <Input
                dir="ltr"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
              />
            </div>
          </div>
          <div>
            <Label>{lang === "ar" ? "ملاحظات" : "Notes"}</Label>
            <Textarea
              rows={5}
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {lang === "ar" ? "إلغاء" : "Cancel"}
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving
              ? lang === "ar"
                ? "جاري الحفظ…"
                : "Saving…"
              : lang === "ar"
                ? "حفظ التغييرات"
                : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
