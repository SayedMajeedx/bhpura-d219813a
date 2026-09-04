import { useState } from "react";
import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/lib/brand-context";
import { useProfile } from "@/lib/profile-context";
import { useI18n, useT } from "@/lib/i18n";
import { formatMoney, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  RotateCcw,
  Search,
  SlidersHorizontal,
  Package,
  ReceiptText,
  Clock,
  ArrowRight,
  TrendingDown,
  Sparkles,
  Layers,
  ArrowUpDown,
  CircleDollarSign,
  SearchCheck,
  Building2,
  ExternalLink,
} from "lucide-react";
import { ReturnsCommandHeader } from "@/components/returns/ReturnsCommandHeader";
import { ReturnsScopeSwitcher, type ReturnsScope } from "@/components/returns/ReturnsScopeSwitcher";
import { ReturnPolicyEditor } from "@/components/returns/ReturnPolicyEditor";
import {
  RETURN_STATUS_CONFIG,
  type ReturnRequest,
  type ReturnStatus,
} from "@/lib/returns.types";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/returns/")({
  component: ReturnsIndexPage,
});

function ReturnsIndexPage() {
  const brand = useBrand();
  const slug = brand?.slug;
  const { profile } = useProfile();
  const { lang, t } = useI18n();
  const isAr = lang === "ar";
  const language = lang;
  const navigate = useNavigate();

  const [activeScope, setActiveScope] = useState<ReturnsScope>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const brandId = brand?.id;

  const settingsQ = useQuery({
    queryKey: ["business-settings-currency", brandId],
    queryFn: async () => {
      if (!brandId) return null;
      const { data } = await (supabase as any)
        .from("business_settings")
        .select("currency")
        .eq("brand_id", brandId)
        .maybeSingle();
      return data;
    },
    enabled: !!brandId,
  });
  const currency = settingsQ.data?.currency || (brand as any)?.currency || "BHD";

  // Fetch returns with related order, customer, and items
  const { data: returns = [], isLoading, refetch } = useQuery<ReturnRequest[]>({
    queryKey: ["admin-returns-list", brandId],
    queryFn: async () => {
      if (!brandId) return [];

      const { data, error } = await (supabase as any)
        .from("return_requests")
        .select(`
          *,
          order:orders (
            id,
            invoice_number,
            total,
            subtotal,
            discount,
            tax_amount,
            shipping,
            advance_paid,
            payment_status,
            status,
            created_at,
            customer_name_snapshot,
            customer_phone_snapshot,
            customer_email_snapshot
          ),
          customer:customers (
            id,
            name,
            phone,
            email
          ),
          items:return_items (
            id,
            product_id,
            variant_id,
            quantity,
            unit_price,
            total_price,
            condition,
            restocked,
            action_type,
            product:products (
              id,
              name_en,
              name_ar,
              image_url
            ),
            variant:product_variants (
              id,
              variant_name,
              sku,
              stock_quantity
            )
          )
        `)
        .eq("brand_id", brandId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data as ReturnRequest[]) || [];
    },
    enabled: !!brandId,
  });

  // Calculate scope counts
  const counts = {
    all: returns.length,
    under_review: returns.filter((r) => ["new", "under_review"].includes(r.status)).length,
    approved: returns.filter((r) => ["approved", "awaiting_shipment"].includes(r.status)).length,
    inspecting: returns.filter((r) => ["received", "under_inspection"].includes(r.status)).length,
    settled: returns.filter((r) => ["refunded", "exchanged"].includes(r.status)).length,
    completed: returns.filter((r) => r.status === "completed").length,
  };

  // Metrics
  const totalRefundedSum = returns
    .filter((r) => r.refund_status === "processed" || r.status === "refunded")
    .reduce((sum, r) => sum + Number(r.net_refund_amount || 0), 0);

  const totalInspectedItems = returns.reduce((sum, r) => {
    return sum + (r.items?.filter((i) => i.condition !== "pending").length || 0);
  }, 0);

  const totalRestockedItems = returns.reduce((sum, r) => {
    return sum + (r.items?.filter((i) => i.restocked).length || 0);
  }, 0);

  const restockRecoveryRate =
    totalInspectedItems > 0 ? Math.round((totalRestockedItems / totalInspectedItems) * 100) : 0;

  // Filter returns based on scope and search
  const filteredReturns = returns.filter((r) => {
    // Scope filter
    if (activeScope === "under_review" && !["new", "under_review"].includes(r.status)) return false;
    if (activeScope === "approved" && !["approved", "awaiting_shipment"].includes(r.status)) return false;
    if (activeScope === "inspecting" && !["received", "under_inspection"].includes(r.status)) return false;
    if (activeScope === "settled" && !["refunded", "exchanged"].includes(r.status)) return false;
    if (activeScope === "completed" && r.status !== "completed") return false;

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchNum = r.return_number.toLowerCase().includes(q);
      const matchInvoice = String(r.order?.invoice_number || "").includes(q);
      const matchCustName = (r.customer?.name || r.order?.customer_name_snapshot || "")
        .toLowerCase()
        .includes(q);
      const matchCustPhone = (r.customer?.phone || r.order?.customer_phone_snapshot || "")
        .toLowerCase()
        .includes(q);

      if (!matchNum && !matchInvoice && !matchCustName && !matchCustPhone) {
        return false;
      }
    }

    return true;
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <ReturnsCommandHeader
        lang={language}
        brandName={(isAr ? brand?.name_ar : brand?.name_en) || brand?.name_en || "Boutique"}
        totalReturns={returns.length}
        pendingReviewCount={counts.under_review}
        onOpenPolicy={() => setActiveScope("policies")}
      />

      {/* Scopes Switcher */}
      <ReturnsScopeSwitcher
        lang={language}
        activeScope={activeScope}
        onScopeChange={setActiveScope}
        counts={counts}
      />

      {activeScope === "policies" ? (
        <ReturnPolicyEditor brandId={brandId || ""} lang={language} />
      ) : (
        <>
          {/* Key Metric KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-4 rounded-xl border border-border bg-card shadow-2xs">
              <span className="text-xs text-muted-foreground block font-medium">
                {isAr ? "إجمالي طلبات الإرجاع" : "Total Return Requests"}
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-xl font-bold font-mono text-foreground">
                  {returns.length}
                </span>
                <span className="text-[11px] text-muted-foreground font-mono">
                  ({counts.under_review} {isAr ? "معلق" : "pending"})
                </span>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-border bg-card shadow-2xs">
              <span className="text-xs text-muted-foreground block font-medium">
                {isAr ? "إجمالي المبالغ المستردة" : "Total Refunded"}
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                  {formatMoney(totalRefundedSum, currency, isAr ? "ar-BH-u-nu-latn" : "en-US")}
                </span>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-border bg-card shadow-2xs">
              <span className="text-xs text-muted-foreground block font-medium">
                {isAr ? "معدل استعادة المخزون" : "Stock Recovery Rate"}
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-xl font-bold font-mono text-cyan-600 dark:text-cyan-400">
                  {restockRecoveryRate}%
                </span>
                <span className="text-[11px] text-muted-foreground">
                  ({totalRestockedItems} {isAr ? "قطعة" : "items"})
                </span>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-border bg-card shadow-2xs">
              <span className="text-xs text-muted-foreground block font-medium">
                {isAr ? "الطلبات قيد الفحص" : "Under Inspection"}
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-xl font-bold font-mono text-purple-600 dark:text-purple-400">
                  {counts.inspecting}
                </span>
              </div>
            </div>
          </div>

          {/* Search & Filters Toolbar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-xl border border-border bg-card">
            <div className="relative w-full sm:w-80">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder={
                  isAr
                    ? "بحث برقم المرتجع، الفاتورة، أو العميل..."
                    : "Search return #, invoice, customer..."
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="ps-9 h-9 text-xs"
              />
            </div>
            <div className="text-xs text-muted-foreground self-end sm:self-auto font-mono">
              {isAr
                ? `عرض ${filteredReturns.length} من أصل ${returns.length} طلب`
                : `Showing ${filteredReturns.length} of ${returns.length} returns`}
            </div>
          </div>

          {/* Returns Table */}
          {isLoading ? (
            <div className="p-12 text-center text-muted-foreground flex items-center justify-center gap-2">
              <RotateCcw className="h-5 w-5 animate-spin text-primary" />
              <span>{isAr ? "جارِ تحميل سجلات المرتجعات..." : "Loading return requests..."}</span>
            </div>
          ) : filteredReturns.length === 0 ? (
            <div className="p-12 text-center rounded-xl border border-dashed border-border bg-muted/10 space-y-3">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mx-auto text-muted-foreground">
                <RotateCcw className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-bold text-foreground">
                {isAr ? "لا توجد طلبات إرجاع مطابقة" : "No Return Requests Found"}
              </h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                {isAr
                  ? "لم يتم تسجيل أي طلبات إرجاع ضمن هذا التصنيف أو معايير البحث الحالية."
                  : "No return or exchange records match the selected scope and search criteria."}
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card overflow-hidden shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-start">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-muted-foreground font-semibold">
                      <th className="p-3.5 text-start">{isAr ? "رقم المرتجع" : "Return #"}</th>
                      <th className="p-3.5 text-start">{isAr ? "الفاتورة الأصلية" : "Invoice #"}</th>
                      <th className="p-3.5 text-start">{isAr ? "العميل" : "Customer"}</th>
                      <th className="p-3.5 text-start">{isAr ? "القطع والسبب" : "Items & Reason"}</th>
                      <th className="p-3.5 text-start">{isAr ? "النوع والتعويض" : "Type & Compensation"}</th>
                      <th className="p-3.5 text-start">{isAr ? "صافي المستحق" : "Net Refund"}</th>
                      <th className="p-3.5 text-start">{isAr ? "الحالة" : "Status"}</th>
                      <th className="p-3.5 text-start">{isAr ? "التاريخ" : "Date"}</th>
                      <th className="p-3.5 text-end">{isAr ? "إجراء" : "Action"}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredReturns.map((r) => {
                      const statusCfg = RETURN_STATUS_CONFIG[r.status] || RETURN_STATUS_CONFIG.new;
                      const custName =
                        r.customer?.name || r.order?.customer_name_snapshot || (isAr ? "عميل زائر" : "Guest");
                      const itemsCount = r.items?.reduce((s, i) => s + (i.quantity || 1), 0) || 0;

                      return (
                        <tr
                          key={r.id}
                          className="hover:bg-muted/30 transition-colors group cursor-pointer"
                          onClick={() =>
                            navigate({
                              to: (`/admin/b/${slug}/returns/${r.id}`) as any,
                            })
                          }
                        >
                          <td className="p-3.5 font-mono font-bold text-primary">
                            {r.return_number}
                          </td>
                          <td className="p-3.5 font-mono font-semibold text-foreground">
                            #{r.order?.invoice_number || "---"}
                          </td>
                          <td className="p-3.5">
                            <span className="font-semibold text-foreground block">{custName}</span>
                            <span className="text-[11px] text-muted-foreground font-mono">
                              {r.customer?.phone || r.order?.customer_phone_snapshot || ""}
                            </span>
                          </td>
                          <td className="p-3.5">
                            <span className="font-medium text-foreground block">
                              {itemsCount} {isAr ? "قطع" : "items"}
                            </span>
                            <span className="text-[11px] text-muted-foreground truncate max-w-[160px] block">
                              {r.reason}
                            </span>
                          </td>
                          <td className="p-3.5">
                            <span className="inline-flex items-center gap-1 font-semibold text-[11px] px-2 py-0.5 rounded-md bg-muted text-foreground border border-border">
                              {r.type === "exchange"
                                ? isAr
                                  ? "استبدال"
                                  : "Exchange"
                                : r.type === "both"
                                  ? isAr
                                    ? "إرجاع واستبدال"
                                    : "Both"
                                  : isAr
                                    ? "إرجاع واسترداد"
                                    : "Return"}
                            </span>
                          </td>
                          <td className="p-3.5 font-mono font-bold text-foreground">
                            {formatMoney(
                              Number(r.net_refund_amount || 0),
                              currency,
                              isAr ? "ar-BH-u-nu-latn" : "en-US",
                            )}
                          </td>
                          <td className="p-3.5">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${statusCfg.badgeClass}`}
                            >
                              {isAr ? statusCfg.labelAr : statusCfg.labelEn}
                            </span>
                          </td>
                          <td className="p-3.5 text-muted-foreground font-mono text-[11px]">
                            {formatDate(r.created_at, isAr ? "ar-BH" : "en-US")}
                          </td>
                          <td className="p-3.5 text-end">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2.5 text-xs text-primary group-hover:bg-primary/10"
                            >
                              {isAr ? "التفاصيل" : "Details"}
                              <ArrowRight className="h-3.5 w-3.5 ms-1 rtl:rotate-180" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
