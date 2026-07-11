import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link as LinkIcon, Plus, ReceiptText, Trash2, Search, Clock3, CircleDollarSign, Truck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatMoney } from "@/lib/format";
import { toast } from "sonner";
import { useT, useI18n } from "@/lib/i18n";
import { resolvePaymentStatus, PAYMENT_BADGE_CLASSES } from "@/lib/payment-status";
import { useBrand } from "@/lib/brand-context";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { useState } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

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

function OrdersList() {
  const t = useT();
  const { lang } = useI18n();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { slug } = Route.useParams();
  const brand = useBrand();
  const brandId = brand.id;
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fulfillmentFilter, setFulfillmentFilter] = useState("all");

  useRealtimeInvalidate(
    [
      { table: "orders", brandId, queryKey: ["orders", brandId] },
      { table: "order_items", brandId, queryKey: ["orders", brandId] },
    ],
    `orders-list-${brandId}`,
  );




  const { data } = useQuery({
    queryKey: ["orders", brandId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, customers(name)")
        .eq("brand_id", brandId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const create = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: settings } = await supabase.from("business_settings").select("currency, default_tax_rate").eq("brand_id", brandId).maybeSingle();
    const currency = settings?.currency ?? "BHD";
    const taxRate = settings?.default_tax_rate ?? 15;
    const { data: order, error } = await (supabase.from("orders") as any).insert({
      // The database trigger allocates the real brand-scoped number atomically.
      user_id: user.id, brand_id: brandId, invoice_number: 0, currency, tax_rate: taxRate,
    }).select().single();
    if (error) return toast.error(error.message);
    navigate({ to: "/admin/b/$slug/orders/$id", params: { slug, id: order.id } });
  };

  const orders = data ?? [];
  const normalizedSearch = search.trim().toLowerCase();
  const filteredOrders = orders.filter((order) => {
    const matchesSearch = !normalizedSearch || [
      order.invoice_number,
      order.customers?.name,
      order.status,
      order.payment_method,
      order.digital_delivery_contact,
    ].some((value) => String(value ?? "").toLowerCase().includes(normalizedSearch));
    return matchesSearch
      && (statusFilter === "all" || order.status === statusFilter)
      && (fulfillmentFilter === "all" || order.fulfillment_method === fulfillmentFilter);
  });
  const pendingCount = orders.filter((order) => ["pending", "draft"].includes(order.status)).length;
  const unpaidCount = orders.filter((order) => resolvePaymentStatus(order.payment_status, order.status, Number(order.total), Number(order.advance_paid ?? 0)) !== "paid").length;
  const openValue = orders.filter((order) => !["cancelled", "completed"].includes(order.status)).reduce((sum, order) => sum + Number(order.total || 0), 0);
  const currency = orders[0]?.currency ?? "BHD";

  const del = async (id: string) => {
    const { error } = await supabase.from("orders").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success(t("common.delete")); setDeleteTarget(null); qc.invalidateQueries({ queryKey: ["orders"] }); }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-3xl sm:text-4xl font-display">{t("orders.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1 truncate">{t("orders.subtitle")}</p>
        </div>
        <Button onClick={create} className="shrink-0"><Plus className="h-4 w-4 mr-2" /> {t("orders.new")}</Button>
      </div>

      <div className="mb-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          [ReceiptText, t("orders.title"), String(orders.length)],
          [Clock3, t("status.pending"), String(pendingCount)],
          [CircleDollarSign, t("payStatus.unpaid"), String(unpaidCount)],
          [Truck, t("orders.total"), formatMoney(openValue, currency)],
        ].map(([Icon, label, value], index) => {
          const StatIcon = Icon as typeof ReceiptText;
          return <Card key={index} className="p-3 sm:p-4"><div className="flex items-center gap-3"><div className="rounded-lg bg-primary/10 p-2 text-primary"><StatIcon className="h-4 w-4" /></div><div className="min-w-0"><p className="text-xs text-muted-foreground truncate">{String(label)}</p><p className="font-semibold truncate">{String(value)}</p></div></div></Card>;
        })}
      </div>

      <Card className="mb-5 p-3 sm:p-4">
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(220px,1fr)_180px_190px] gap-3">
          <div className="relative"><Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="ps-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={lang === "ar" ? "ابحث بالرقم أو العميل أو جهة الاتصال" : "Search invoice, customer, or contact"} /></div>
          <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("orders.status")}: {lang === "ar" ? "الكل" : "All"}</SelectItem>{["pending", "draft", "confirmed", "paid", "shipped", "completed", "cancelled"].map((status) => <SelectItem key={status} value={status}>{t(`status.${status}`)}</SelectItem>)}</SelectContent></Select>
          <Select value={fulfillmentFilter} onValueChange={setFulfillmentFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("fulfillment.title")}: {lang === "ar" ? "الكل" : "All"}</SelectItem><SelectItem value="delivery">{t("fulfillment.delivery")}</SelectItem><SelectItem value="pickup">{t("fulfillment.pickup")}</SelectItem><SelectItem value="digital">{lang === "ar" ? "تسليم رقمي" : "Digital delivery"}</SelectItem></SelectContent></Select>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{filteredOrders.length} / {orders.length}</p>
      </Card>

      {orders.length === 0 ? (
        <Card className="p-12 text-center">
          <ReceiptText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">{t("orders.none")}</p>
        </Card>
      ) : filteredOrders.length === 0 ? (
        <Card className="p-10 text-center"><Search className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /><p className="font-medium">{lang === "ar" ? "لا توجد طلبات مطابقة" : "No matching orders"}</p><Button variant="ghost" className="mt-2" onClick={() => { setSearch(""); setStatusFilter("all"); setFulfillmentFilter("all"); }}>{lang === "ar" ? "مسح عوامل التصفية" : "Clear filters"}</Button></Card>
      ) : (
        <>
          <div className="space-y-3 sm:hidden">
            {filteredOrders.map((o) => {
              const badge = resolvePaymentStatus((o as any).payment_status, o.status, Number(o.total), Number((o as any).advance_paid ?? 0));
              return (
                <Card key={o.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <Link to="/admin/b/$slug/orders/$id" params={{ slug, id: o.id }} className="text-lg font-semibold text-primary">#{o.invoice_number}</Link>
                      <div className="mt-1 text-xs text-muted-foreground">{new Date(o.order_date).toLocaleDateString()} · {o.customers?.name ?? t("orders.noCustomer")}</div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="rounded bg-secondary px-2 py-1 text-[10px] uppercase tracking-wider">{t(`status.${o.status}`)}</span>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${PAYMENT_BADGE_CLASSES[badge]}`}>{t(`payStatus.${badge}`)}</span>
                      </div>
                      <div className="mt-3 font-semibold">{formatMoney(Number(o.total), o.currency)}</div>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                      <Button className="h-11 w-11 touch-manipulation" variant="ghost" size="icon" aria-label={t("orders.copyLink")} onClick={() => copyInvoiceLink(o.public_invoice_token, t)}><LinkIcon className="h-5 w-5" /></Button>
                      <Button className="h-11 w-11 touch-manipulation text-destructive" variant="ghost" size="icon" aria-label={t("common.delete")} onClick={() => setDeleteTarget(o.id)}><Trash2 className="h-5 w-5" /></Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
          <Card className="hidden overflow-hidden sm:block">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-secondary/50">
              <tr className="text-left">
                <th className="p-4 font-medium">{t("orders.invoice")}</th>
                <th className="p-4 font-medium">{t("orders.date")}</th>
                <th className="p-4 font-medium">{t("orders.customer")}</th>
                <th className="p-4 font-medium">{t("orders.status")}</th>
                <th className="p-4 font-medium text-right">{t("orders.total")}</th>
                <th className="p-4 text-right">{t("orders.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((o) => (
                <tr key={o.id} className="border-t border-border hover:bg-secondary/30">
                  <td className="p-4">
                    <Link to="/admin/b/$slug/orders/$id" params={{ slug, id: o.id }} className="text-primary font-medium">
                      #{o.invoice_number}
                    </Link>
                  </td>
                  <td className="p-4 text-muted-foreground">{new Date(o.order_date).toLocaleDateString()}</td>
                  <td className="p-4">{o.customers?.name ?? <span className="text-muted-foreground italic">{t("orders.noCustomer")}</span>}</td>
                  <td className="p-4"><span className="text-xs uppercase tracking-wider px-2 py-1 rounded bg-secondary">{t(`status.${o.status}`)}</span></td>
                  <td className="p-4 text-right font-medium whitespace-nowrap">
                    <div className="inline-flex items-center gap-2">
                      <span>{formatMoney(Number(o.total), o.currency)}</span>
                      {(() => {
                        const badge = resolvePaymentStatus((o as any).payment_status, o.status, Number(o.total), Number((o as any).advance_paid ?? 0));
                        return (
                          <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${PAYMENT_BADGE_CLASSES[badge]}`}>
                            {t(`payStatus.${badge}`)}
                          </span>
                        );
                      })()}
                    </div>
                  </td>
                  <td className="p-4 text-right whitespace-nowrap">
                    <Button
                      variant="ghost"
                      size="icon"
                      title={t("orders.copyLink")}
                      aria-label={t("orders.copyLink")}
                      onClick={() => copyInvoiceLink(o.public_invoice_token, t)}
                    >
                      <LinkIcon className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(o.id)}><Trash2 className="h-4 w-4" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          </Card>
        </>
      )}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
          <AlertDialogHeader><AlertDialogTitle>{t("common.delete")}</AlertDialogTitle><AlertDialogDescription>{t("orders.deleteConfirm")}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { if (deleteTarget) void del(deleteTarget); }}>{t("common.delete")}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
