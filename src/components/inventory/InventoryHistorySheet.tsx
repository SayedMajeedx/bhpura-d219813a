import { useState, useEffect, useCallback } from "react";
import { Link } from "@tanstack/react-router";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { fetchInvoiceNumbers } from "@/lib/data/orders";
import { useI18n } from "@/lib/i18n";
import {
  History,
  RotateCcw,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Filter,
  Package,
  Layers,
  ArrowDownRight,
  ArrowUpRight,
  FileText,
  User,
} from "lucide-react";

export interface InventoryMovement {
  id: string;
  brand_id: string;
  variant_id: string;
  location: string;
  delta: number;
  balance_after: number;
  reason: string;
  reference_type: string | null;
  reference_id: string | null;
  idempotency_key: string | null;
  created_by: string | null;
  note: string | null;
  created_at: string;
}

const REASON_LABELS: Record<string, { ar: string; en: string; badgeClass: string }> = {
  order_reservation: {
    ar: "حجز طلب",
    en: "Order Reservation",
    badgeClass: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
  },
  order_commitment: {
    ar: "تأكيد بيع",
    en: "Sale Commitment",
    badgeClass: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
  },
  order_release: {
    ar: "إلغاء حجز",
    en: "Reservation Release",
    badgeClass: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
  },
  order_cancellation: {
    ar: "إلغاء طلب",
    en: "Order Cancellation",
    badgeClass: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20",
  },
  order_return: {
    ar: "إرجاع منتج",
    en: "Order Return",
    badgeClass: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20",
  },
  manual_adjustment: {
    ar: "تعديل يدوي",
    en: "Manual Adjustment",
    badgeClass: "bg-primary/10 text-primary border-primary/20",
  },
  transfer_out: {
    ar: "تحويل صادر",
    en: "Transfer Out",
    badgeClass: "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/20",
  },
  transfer_in: {
    ar: "تحويل وارد",
    en: "Transfer In",
    badgeClass: "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/20",
  },
  incubator_sale: {
    ar: "مبيعات حاضنة",
    en: "Incubator Sale",
    badgeClass: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20",
  },
  incubator_reversal: {
    ar: "عكس مبيعات حاضنة",
    en: "Incubator Reversal",
    badgeClass: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20",
  },
  reconciliation_correction: {
    ar: "تصحيح مطابقة",
    en: "Reconciliation",
    badgeClass: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-300 border-yellow-500/20",
  },
  initial_baseline: {
    ar: "رصيد افتتاحي",
    en: "Initial Baseline",
    badgeClass: "bg-muted text-muted-foreground border-border",
  },
};

const PAGE_SIZE = 15;

export interface InventoryHistorySheetProps {
  isOpen: boolean;
  onClose: () => void;
  brandId: string;
  slug: string;
  variantId?: string | null;
  productId?: string | null;
  productName?: string;
  variantLabel?: string;
}

export function InventoryHistorySheet({
  isOpen,
  onClose,
  brandId,
  slug,
  variantId,
  productName,
  variantLabel,
}: InventoryHistorySheetProps) {
  const { lang } = useI18n();
  const isAr = lang === "ar";

  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [filterReason, setFilterReason] = useState<string>("all");
  const [filterLocation, setFilterLocation] = useState<string>("all");

  const [orderMap, setOrderMap] = useState<Record<string, { invoice_number: string }>>({});
  const [profileMap, setProfileMap] = useState<
    Record<string, { full_name: string; email: string }>
  >({});

  const fetchMovements = useCallback(async () => {
    if (!brandId || !isOpen) return;
    setLoading(true);

    try {
      let query = (supabase as any)
        .from("inventory_movements")
        .select("*", { count: "exact" })
        .eq("brand_id", brandId)
        .order("created_at", { ascending: false });

      if (variantId) {
        query = query.eq("variant_id", variantId);
      }

      if (filterReason !== "all") {
        query = query.eq("reason", filterReason);
      }

      if (filterLocation !== "all") {
        query = query.eq("location", filterLocation);
      }

      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      query = query.range(from, to);

      const { data, count, error } = await query;

      if (error) {
        console.error("Error fetching inventory movements:", error);
        setMovements([]);
        setTotalCount(0);
        return;
      }

      const rows: InventoryMovement[] = data || [];
      setMovements(rows);
      setTotalCount(count || 0);

      // Fetch associated orders for invoice numbers
      const orderIds = Array.from(
        new Set(
          rows
            .filter((r) => r.reference_type === "order" && r.reference_id)
            .map((r) => r.reference_id as string),
        ),
      );
      if (orderIds.length > 0) {
        const ords = await fetchInvoiceNumbers(brandId, orderIds);
        if (ords.length > 0) {
          const map: Record<string, { invoice_number: string }> = {};
          ords.forEach((o: any) => {
            map[o.id] = { invoice_number: o.invoice_number };
          });
          setOrderMap((prev) => ({ ...prev, ...map }));
        }
      }

      // Fetch actor profiles
      const userIds = Array.from(
        new Set(rows.map((r) => r.created_by).filter((uid): uid is string => Boolean(uid))),
      );
      if (userIds.length > 0) {
        const { data: profs } = await (supabase.from("profiles") as any)
          .select("id, full_name, email")
          .in("id", userIds);
        if (profs) {
          const map: Record<string, { full_name: string; email: string }> = {};
          profs.forEach((p: any) => {
            map[p.id] = { full_name: p.full_name, email: p.email };
          });
          setProfileMap((prev) => ({ ...prev, ...map }));
        }
      }
    } catch (err) {
      console.error("Unexpected error in fetchMovements:", err);
    } finally {
      setLoading(false);
    }
  }, [brandId, isOpen, variantId, filterReason, filterLocation, page]);

  useEffect(() => {
    if (isOpen) {
      fetchMovements();
    }
  }, [isOpen, fetchMovements]);

  // Reset page when filters change
  const handleReasonFilter = (val: string) => {
    setFilterReason(val);
    setPage(0);
  };

  const handleLocationFilter = (val: string) => {
    setFilterLocation(val);
    setPage(0);
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const formatTimestamp = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return new Intl.DateTimeFormat(isAr ? "ar-BH" : "en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
    } catch {
      return isoString;
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side={isAr ? "left" : "right"}
        className="w-full sm:max-w-2xl lg:max-w-4xl p-0 flex flex-col h-full bg-background border-border"
      >
        {/* Header */}
        <SheetHeader className="p-5 border-b border-border bg-card/40 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <History className="h-5 w-5" />
            </div>
            <div>
              <SheetTitle className="text-base font-bold text-foreground">
                {isAr ? "سجل حركات المخزون" : "Inventory Ledger History"}
              </SheetTitle>
              <SheetDescription className="text-xs text-muted-foreground mt-0.5">
                {productName ? `${productName}` : ""}
                {variantLabel ? ` · ${variantLabel}` : ""}
                {!productName && !variantLabel
                  ? isAr
                    ? "كافة الحركات المسجلة"
                    : "All movements"
                  : ""}
              </SheetDescription>
            </div>
          </div>

          {/* Filters strip */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-3 mt-1 border-t border-border-subtle">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-semibold">
                <Filter className="h-3.5 w-3.5" />
                <span>{isAr ? "تصفية:" : "Filter:"}</span>
              </div>

              {/* Reason filter */}
              <Select value={filterReason} onValueChange={handleReasonFilter}>
                <SelectTrigger className="h-8 text-xs w-[160px] bg-background border-input rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                  <SelectValue placeholder={isAr ? "السبب" : "Reason"} />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="all">{isAr ? "كافة الأسباب" : "All Reasons"}</SelectItem>
                  {Object.entries(REASON_LABELS).map(([k, meta]) => (
                    <SelectItem key={k} value={k}>
                      {isAr ? meta.ar : meta.en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Location filter */}
              <Select value={filterLocation} onValueChange={handleLocationFilter}>
                <SelectTrigger className="h-8 text-xs w-[130px] bg-background border-input rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                  <SelectValue placeholder={isAr ? "الموقع" : "Location"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{isAr ? "كافة المواقع" : "All Locations"}</SelectItem>
                  <SelectItem value="main">{isAr ? "المحل" : "Main Store"}</SelectItem>
                  <SelectItem value="incubator">{isAr ? "الحاضنة" : "Incubator"}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5 rounded-md"
              onClick={() => fetchMovements()}
              disabled={loading}
            >
              <RotateCcw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>{isAr ? "تحديث" : "Refresh"}</span>
            </Button>
          </div>
        </SheetHeader>

        {/* Content table */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loading && movements.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground gap-3">
              <RotateCcw className="h-6 w-6 animate-spin text-primary" />
              <p className="text-xs font-semibold">
                {isAr ? "جارٍ تحميل السجل..." : "Loading ledger..."}
              </p>
            </div>
          ) : movements.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground gap-3">
              <Package className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-bold text-foreground">
                {isAr ? "لا توجد حركات مخزون مسجلة" : "No movements found"}
              </p>
              <p className="text-xs max-w-sm">
                {isAr
                  ? "لم يتم تسجيل أي حركة تغيير للمخزون بهذا المتغير بعد."
                  : "No stock movement has been recorded for this variant yet."}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-muted sticky top-0 z-10">
                <TableRow className="border-border">
                  <TableHead className="text-xs font-bold text-muted-foreground w-36">
                    {isAr ? "التاريخ والوقت" : "Timestamp"}
                  </TableHead>
                  <TableHead className="text-xs font-bold text-muted-foreground">
                    {isAr ? "السبب" : "Reason"}
                  </TableHead>
                  <TableHead className="text-xs font-bold text-muted-foreground">
                    {isAr ? "الموقع" : "Location"}
                  </TableHead>
                  <TableHead className="text-xs font-bold text-muted-foreground text-center">
                    {isAr ? "التغيير" : "Delta"}
                  </TableHead>
                  <TableHead className="text-xs font-bold text-muted-foreground text-center">
                    {isAr ? "الرصيد بعد" : "Balance"}
                  </TableHead>
                  <TableHead className="text-xs font-bold text-muted-foreground">
                    {isAr ? "المرجع / الطلب" : "Reference"}
                  </TableHead>
                  <TableHead className="text-xs font-bold text-muted-foreground">
                    {isAr ? "المُنفِّذ" : "Actor"}
                  </TableHead>
                  <TableHead className="text-xs font-bold text-muted-foreground min-w-[120px]">
                    {isAr ? "ملاحظات" : "Notes"}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map((m) => {
                  const meta = REASON_LABELS[m.reason] || {
                    ar: m.reason,
                    en: m.reason,
                    badgeClass: "bg-muted text-muted-foreground border-border",
                  };
                  const isPositive = m.delta > 0;
                  const deltaColor = isPositive
                    ? "text-emerald-600 dark:text-emerald-400 font-mono font-bold"
                    : "text-rose-600 dark:text-rose-400 font-mono font-bold";

                  const order = m.reference_id ? orderMap[m.reference_id] : null;
                  const actor = m.created_by ? profileMap[m.created_by] : null;

                  return (
                    <TableRow key={m.id} className="border-border-subtle hover:bg-muted/30">
                      {/* Timestamp */}
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap font-mono">
                        {formatTimestamp(m.created_at)}
                      </TableCell>

                      {/* Reason */}
                      <TableCell className="whitespace-nowrap">
                        <Badge
                          variant="outline"
                          className={`text-xs font-semibold border ${meta.badgeClass} rounded-md px-2 py-0.5`}
                        >
                          {isAr ? meta.ar : meta.en}
                        </Badge>
                      </TableCell>

                      {/* Location */}
                      <TableCell className="text-xs font-semibold whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          <Layers className="h-3 w-3 text-muted-foreground" />
                          <span>
                            {m.location === "incubator"
                              ? isAr
                                ? "الحاضنة"
                                : "Incubator"
                              : isAr
                                ? "المحل"
                                : "Main Store"}
                          </span>
                        </span>
                      </TableCell>

                      {/* Delta */}
                      <TableCell className="text-center whitespace-nowrap">
                        <span className={`inline-flex items-center gap-0.5 ${deltaColor}`}>
                          {isPositive ? (
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          ) : (
                            <ArrowDownRight className="h-3.5 w-3.5" />
                          )}
                          <span>{isPositive ? `+${m.delta}` : `${m.delta}`}</span>
                        </span>
                      </TableCell>

                      {/* Balance After */}
                      <TableCell className="text-center whitespace-nowrap">
                        <span className="font-mono text-xs font-bold text-foreground bg-muted/60 px-2 py-0.5 rounded border border-border-subtle">
                          {m.balance_after}
                        </span>
                      </TableCell>

                      {/* Reference / Order */}
                      <TableCell className="whitespace-nowrap text-xs">
                        {m.reference_type === "order" && m.reference_id ? (
                          <Link
                            to="/admin/b/$slug/orders/$id"
                            params={{ slug, id: m.reference_id }}
                            className="inline-flex items-center gap-1 text-primary hover:underline font-mono font-semibold"
                            title={isAr ? "عرض تفاصيل الطلب" : "View order details"}
                          >
                            <span>#{order?.invoice_number || m.reference_id.slice(0, 8)}</span>
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        ) : m.reference_id ? (
                          <span className="font-mono text-muted-foreground text-xs">
                            {m.reference_type ? `${m.reference_type}: ` : ""}
                            {m.reference_id.slice(0, 8)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>

                      {/* Actor */}
                      <TableCell className="whitespace-nowrap text-xs">
                        {actor ? (
                          <span className="inline-flex items-center gap-1 text-foreground font-medium">
                            <User className="h-3 w-3 text-muted-foreground" />
                            <span>{actor.full_name || actor.email}</span>
                          </span>
                        ) : m.created_by ? (
                          <span className="font-mono text-muted-foreground text-xs">
                            {m.created_by.slice(0, 8)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs italic">
                            {isAr ? "نظام تلقائي" : "System"}
                          </span>
                        )}
                      </TableCell>

                      {/* Note */}
                      <TableCell
                        className="text-xs text-muted-foreground max-w-xs truncate"
                        title={m.note || ""}
                      >
                        {m.note ? (
                          <span className="inline-flex items-center gap-1">
                            <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                            <span className="truncate">{m.note}</span>
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Footer with pagination */}
        <div className="p-4 border-t border-border bg-card/40 flex items-center justify-between text-xs text-muted-foreground shrink-0">
          <div>{isAr ? `إجمالي الحركات: ${totalCount}` : `Total movements: ${totalCount}`}</div>

          <div className="flex items-center gap-2">
            <span className="font-medium">
              {isAr ? `صفحة ${page + 1} من ${totalPages}` : `Page ${page + 1} of ${totalPages}`}
            </span>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0 rounded-md"
                disabled={page <= 0 || loading}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                {isAr ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0 rounded-md"
                disabled={page >= totalPages - 1 || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                {isAr ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
