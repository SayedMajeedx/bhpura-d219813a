import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/lib/brand-context";
import { useI18n } from "@/lib/i18n";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ListPagination } from "@/components/list-pagination";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Building2,
  CircleDollarSign,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShoppingBag,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/incubators")({
  beforeLoad: async ({ context: { queryClient }, params }) => {
    const user = await queryClient.ensureQueryData({
      queryKey: ["auth_user"],
      queryFn: async () => {
        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) throw redirect({ to: "/auth" });
        return data.user;
      },
    });
    const { data: profile } = await (supabase as any)
      .from("profiles")
      .select("role,status,permissions")
      .eq("id", user.id)
      .maybeSingle();
    const permissions = (profile?.permissions as string[]) || [];
    const allowed =
      profile?.status !== "inactive" &&
      (["admin", "super_admin", "brand_admin"].includes(profile?.role) ||
        permissions.includes("manage_inventory"));
    if (!allowed) throw redirect({ to: "/admin/b/$slug/dashboard", params: { slug: params.slug } });
  },
  component: IncubatorsPage,
});

type Incubator = {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  commission_type: "percentage" | "fixed";
  commission_value: number;
  settlement_day: number | null;
  currency: string;
  notes: string | null;
  is_active: boolean;
};

type StockItem = {
  id: string;
  incubator_id: string;
  variant_id: string;
  external_code: string | null;
  quantity: number;
  consignment_price: number;
  commission_type: "percentage" | "fixed";
  commission_value: number;
  product_variants: {
    id: string;
    sku: string | null;
    barcode: string | null;
    size: string | null;
    color: string | null;
    stock_main: number;
    selling_price: number;
    products: { id: string; name: string; name_ar: string | null; image_url: string | null } | null;
  } | null;
};

type Sale = {
  id: string;
  incubator_id: string;
  variant_id: string;
  quantity: number;
  unit_price: number;
  gross_amount: number;
  commission_amount: number;
  net_due: number;
  paid_amount: number;
  sold_at: string;
  status: "confirmed" | "reversed";
  product_variants: {
    sku: string | null;
    products: { name: string; name_ar: string | null } | null;
  } | null;
};

type Payment = {
  id: string;
  incubator_id: string;
  amount: number;
  payment_date: string;
  payment_method: string | null;
  reference: string | null;
};

type ProductOption = {
  id: string;
  sku: string | null;
  barcode: string | null;
  size: string | null;
  color: string | null;
  stock_main: number;
  selling_price: number;
  products: { name: string; name_ar: string | null } | null;
};

const db = supabase as any;

function IncubatorsPage() {
  const brand = useBrand();
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<
    "incubator" | "edit_incubator" | "transfer" | "sale" | "payment" | "return" | null
  >(null);
  const [activeItem, setActiveItem] = useState<StockItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [stockPage, setStockPage] = useState(1);
  const [stockPageSize, setStockPageSize] = useState(10);
  const [salesPage, setSalesPage] = useState(1);
  const [salesPageSize, setSalesPageSize] = useState(10);
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [paymentsPageSize, setPaymentsPageSize] = useState(10);
  const locale = isAr ? "ar-BH" : "en-BH";
  const money = (amount: number, currency = "BHD") => formatMoney(amount, currency, locale);

  const incubatorsQ = useQuery({
    queryKey: ["incubators", brand.id],
    queryFn: async () => {
      const { data, error } = await db
        .from("incubators")
        .select("*")
        .eq("brand_id", brand.id)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Incubator[];
    },
  });
  const incubators = incubatorsQ.data ?? [];
  const currentId = selectedId ?? incubators[0]?.id ?? null;
  const current = incubators.find((item) => item.id === currentId) ?? null;

  const inventoryQ = useQuery({
    queryKey: ["incubator_inventory", brand.id],
    queryFn: async () => {
      const { data, error } = await db
        .from("incubator_inventory")
        .select(
          "*, product_variants(id,sku,barcode,size,color,stock_main,selling_price,products(id,name,name_ar,image_url))",
        )
        .eq("brand_id", brand.id)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as StockItem[];
    },
  });
  const salesQ = useQuery({
    queryKey: ["incubator_sales", brand.id],
    queryFn: async () => {
      const { data, error } = await db
        .from("incubator_sales")
        .select("*, product_variants(sku,products(name,name_ar))")
        .eq("brand_id", brand.id)
        .order("sold_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Sale[];
    },
  });
  const paymentsQ = useQuery({
    queryKey: ["incubator_payments", brand.id],
    queryFn: async () => {
      const { data, error } = await db
        .from("incubator_payments")
        .select("*")
        .eq("brand_id", brand.id)
        .order("payment_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Payment[];
    },
  });
  const productsQ = useQuery({
    queryKey: ["incubator_product_options", brand.id],
    queryFn: async () => {
      const { data, error } = await db
        .from("product_variants")
        .select(
          "id,sku,barcode,size,color,stock_main,selling_price,products!inner(name,name_ar,brand_id)",
        )
        .eq("products.brand_id", brand.id)
        .gt("stock_main", 0)
        .order("sku");
      if (error) throw error;
      return (data ?? []) as ProductOption[];
    },
  });

  const allStock = inventoryQ.data ?? [];
  const allSales = salesQ.data ?? [];
  const allPayments = paymentsQ.data ?? [];
  const stock = allStock.filter((item) => item.incubator_id === currentId && item.quantity > 0);
  const sales = allSales.filter((item) => item.incubator_id === currentId);
  const payments = allPayments.filter((item) => item.incubator_id === currentId);
  const summary = useMemo(() => {
    const units = stock.reduce((sum, item) => sum + Number(item.quantity), 0);
    const stockValue = stock.reduce(
      (sum, item) => sum + Number(item.quantity) * Number(item.consignment_price),
      0,
    );
    const confirmed = sales.filter((sale) => sale.status === "confirmed");
    const gross = confirmed.reduce((sum, sale) => sum + Number(sale.gross_amount), 0);
    const due = confirmed.reduce(
      (sum, sale) => sum + Number(sale.net_due) - Number(sale.paid_amount),
      0,
    );
    const paid = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
    return { units, stockValue, gross, due, paid };
  }, [stock, sales, payments]);

  const filteredStock = stock.filter((item) => {
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    const v = item.product_variants;
    return [item.external_code, v?.sku, v?.barcode, v?.products?.name, v?.products?.name_ar].some(
      (value) =>
        String(value ?? "")
          .toLowerCase()
          .includes(needle),
    );
  });
  const pagedStock = filteredStock.slice(
    (stockPage - 1) * stockPageSize,
    stockPage * stockPageSize,
  );
  const pagedSales = sales.slice((salesPage - 1) * salesPageSize, salesPage * salesPageSize);
  const pagedPayments = payments.slice(
    (paymentsPage - 1) * paymentsPageSize,
    paymentsPage * paymentsPageSize,
  );

  useEffect(() => setStockPage(1), [currentId, search]);
  useEffect(() => {
    setSalesPage(1);
    setPaymentsPage(1);
  }, [currentId]);

  async function invalidateData() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["incubators", brand.id] }),
      qc.invalidateQueries({ queryKey: ["incubator_inventory", brand.id] }),
      qc.invalidateQueries({ queryKey: ["incubator_sales", brand.id] }),
      qc.invalidateQueries({ queryKey: ["incubator_payments", brand.id] }),
      qc.invalidateQueries({ queryKey: ["incubator_product_options", brand.id] }),
      qc.invalidateQueries({ queryKey: ["products", brand.id] }),
    ]);
  }

  async function refreshPrices() {
    if (!currentId) return;
    setSyncing(true);
    try {
      const { data, error } = await db.rpc("sync_incubator_inventory_prices", {
        p_incubator_id: currentId,
      });
      if (error) throw error;
      await invalidateData();
      const count = Number(data ?? 0);
      toast.success(
        isAr
          ? count > 0
            ? `تم تحديث أسعار ${count} من المنتجات`
            : "الأسعار محدثة مسبقًا"
          : count > 0
            ? `${count} product prices updated`
            : "Prices are already up to date",
      );
    } catch (error: any) {
      toast.error(error?.message || (isAr ? "تعذرت مزامنة الأسعار" : "Could not sync prices"));
    } finally {
      setSyncing(false);
    }
  }

  async function submit(form: HTMLFormElement) {
    const values = Object.fromEntries(new FormData(form));
    setBusy(true);
    try {
      let result: { error: any };
      if (dialog === "incubator") {
        result = await db.from("incubators").insert({
          brand_id: brand.id,
          name: String(values.name).trim(),
          contact_name: String(values.contact_name || "").trim() || null,
          phone: String(values.phone || "").trim() || null,
          email: String(values.email || "").trim() || null,
          commission_type: values.commission_type,
          commission_value: Number(values.commission_value || 0),
          settlement_day: values.settlement_day ? Number(values.settlement_day) : null,
          currency: "BHD",
          notes: String(values.notes || "").trim() || null,
        });
      } else if (dialog === "edit_incubator" && currentId) {
        result = await db
          .from("incubators")
          .update({
            name: String(values.name).trim(),
            contact_name: String(values.contact_name || "").trim() || null,
            phone: String(values.phone || "").trim() || null,
            email: String(values.email || "").trim() || null,
            commission_type: values.commission_type,
            commission_value: Number(values.commission_value || 0),
            settlement_day: values.settlement_day ? Number(values.settlement_day) : null,
            notes: String(values.notes || "").trim() || null,
            is_active: values.is_active === "true",
          })
          .eq("id", currentId)
          .eq("brand_id", brand.id);
      } else if (dialog === "transfer") {
        result = await db.rpc("transfer_stock_to_incubator", {
          p_incubator_id: currentId,
          p_variant_id: values.variant_id,
          p_quantity: Number(values.quantity),
          p_external_code: String(values.external_code || "").trim() || null,
          p_price: Number(values.price),
          p_commission_type: values.commission_type,
          p_commission_value: Number(values.commission_value || 0),
          p_notes: String(values.notes || "").trim() || null,
        });
      } else if (dialog === "sale" && activeItem) {
        result = await db.rpc("record_incubator_sale", {
          p_incubator_id: currentId,
          p_variant_id: activeItem.variant_id,
          p_quantity: Number(values.quantity),
          p_unit_price: Number(values.price),
          p_sold_at: new Date(String(values.sold_at)).toISOString(),
        });
      } else if (dialog === "return" && activeItem) {
        result = await db.rpc("return_stock_from_incubator", {
          p_incubator_id: currentId,
          p_variant_id: activeItem.variant_id,
          p_quantity: Number(values.quantity),
          p_notes: String(values.notes || "").trim() || null,
        });
      } else {
        result = await db.rpc("record_incubator_payment", {
          p_incubator_id: currentId,
          p_amount: Number(values.amount),
          p_payment_date: values.payment_date,
          p_payment_method: String(values.payment_method || "").trim() || null,
          p_reference: String(values.reference || "").trim() || null,
          p_notes: String(values.notes || "").trim() || null,
        });
      }
      if (result.error) throw result.error;
      toast.success(isAr ? "تم حفظ العملية وتحديث المخزون" : "Saved and inventory updated");
      setDialog(null);
      setActiveItem(null);
      await invalidateData();
    } catch (error: any) {
      const messages: Record<string, string> = {
        INSUFFICIENT_MAIN_STOCK: "الكمية في المخزون الرئيسي غير كافية",
        INSUFFICIENT_INCUBATOR_STOCK: "الكمية الموجودة عند الحاضنة غير كافية",
        PAYMENT_EXCEEDS_AMOUNT_DUE: "الدفعة أكبر من المبلغ المستحق",
        INCUBATOR_STOCK_OUT_OF_SYNC: "يوجد فرق في المخزون؛ راجع سجل الحركات",
      };
      const key = Object.keys(messages).find((code) => String(error?.message).includes(code));
      toast.error(
        key ? messages[key] : error?.message || (isAr ? "تعذر حفظ العملية" : "Could not save"),
      );
    } finally {
      setBusy(false);
    }
  }

  const loading = incubatorsQ.isLoading || inventoryQ.isLoading || salesQ.isLoading;
  return (
    <div className="space-y-4 pb-8" dir={isAr ? "rtl" : "ltr"}>
      <header className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold">
              {isAr ? "الحاضنات والعُهد" : "Incubators & Consignment"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {isAr
                ? "البضاعة الخارجية، المبيعات، والمستحقات في مكان واحد"
                : "External stock, sales, and receivables in one place"}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={refreshPrices}
            disabled={syncing || !currentId}
            aria-label={isAr ? "تحديث" : "Refresh"}
            title={isAr ? "مزامنة الأسعار مع المخزون" : "Sync prices with inventory"}
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          </Button>
          <Button onClick={() => setDialog("incubator")}>
            <Plus className="me-2 h-4 w-4" />
            {isAr ? "حاضنة جديدة" : "New incubator"}
          </Button>
        </div>
      </header>

      <div className="space-y-4">
        <Card className="border-border p-3">
          <p className="mb-2 px-1 text-xs font-bold text-muted-foreground">
            {isAr ? "الحاضنات" : "INCUBATORS"}
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {incubators.map((item) => {
              const itemStock = allStock.filter((row) => row.incubator_id === item.id);
              const units = itemStock.reduce((sum, row) => sum + Number(row.quantity), 0);
              const due = allSales
                .filter((sale) => sale.incubator_id === item.id && sale.status === "confirmed")
                .reduce((sum, sale) => sum + Number(sale.net_due) - Number(sale.paid_amount), 0);
              return (
                <Button
                  key={item.id}
                  variant={currentId === item.id ? "secondary" : "ghost"}
                  className="h-auto min-w-56 flex-1 justify-between px-3 py-3 sm:max-w-80"
                  onClick={() => setSelectedId(item.id)}
                >
                  <span className="min-w-0 text-start">
                    <span className="block truncate font-bold">{item.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {units} {isAr ? "قطعة" : "units"}
                    </span>
                  </span>
                  <span className="text-xs font-bold text-primary">
                    {money(due, item.currency)}
                  </span>
                </Button>
              );
            })}
            {!loading && incubators.length === 0 && (
              <p className="p-4 text-center text-sm text-muted-foreground">
                {isAr ? "أضف أول حاضنة للبدء" : "Add your first incubator"}
              </p>
            )}
          </div>
        </Card>

        <div className="min-w-0 space-y-4">
          {current ? (
            <>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-bold">{current.name}</h2>
                  <p className="text-xs text-muted-foreground">
                    {[current.contact_name, current.phone].filter(Boolean).join(" · ") ||
                      (isAr ? "لا توجد بيانات تواصل" : "No contact details")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => setDialog("edit_incubator")}>
                    <Pencil className="me-2 h-4 w-4" />
                    {isAr ? "تعديل الحاضنة" : "Edit incubator"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setDialog("payment")}
                    disabled={summary.due <= 0}
                  >
                    <Wallet className="me-2 h-4 w-4" />
                    {isAr ? "تسجيل دفعة" : "Record payment"}
                  </Button>
                  <Button onClick={() => setDialog("transfer")}>
                    <Package className="me-2 h-4 w-4" />
                    {isAr ? "تحويل بضاعة" : "Transfer stock"}
                  </Button>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Metric
                  icon={Package}
                  label={isAr ? "القطع المتبقية" : "Remaining units"}
                  value={String(summary.units)}
                />
                <Metric
                  icon={ShoppingBag}
                  label={isAr ? "قيمة البضاعة المتبقية" : "Remaining stock value"}
                  value={money(summary.stockValue, current.currency)}
                />
                <Metric
                  icon={CircleDollarSign}
                  label={isAr ? "إجمالي المبيعات" : "Gross sales"}
                  value={money(summary.gross, current.currency)}
                />
                <Metric
                  icon={Wallet}
                  label={isAr ? "المبلغ المستحق" : "Amount due"}
                  value={money(summary.due, current.currency)}
                  highlight
                />
              </div>

              <Tabs defaultValue="stock" dir={isAr ? "rtl" : "ltr"}>
                <TabsList className="w-full justify-start overflow-x-auto">
                  <TabsTrigger value="stock">{isAr ? "البضاعة عندهم" : "Stock"}</TabsTrigger>
                  <TabsTrigger value="sales">{isAr ? "المبيعات" : "Sales"}</TabsTrigger>
                  <TabsTrigger value="payments">{isAr ? "الدفعات" : "Payments"}</TabsTrigger>
                </TabsList>
                <TabsContent value="stock" className="space-y-3">
                  <div className="relative">
                    <Search className="absolute start-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="ps-9"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder={
                        isAr
                          ? "ابحث بكودنا أو كود الحاضنة أو اسم المنتج"
                          : "Search by SKU, external code, or product"
                      }
                    />
                  </div>
                  <div className="overflow-x-auto rounded-md border border-border bg-card">
                    <table className="w-full min-w-[760px] text-sm">
                      <thead className="bg-muted/60 text-xs text-muted-foreground">
                        <tr>
                          <th className="p-3 text-start">{isAr ? "المنتج" : "Product"}</th>
                          <th className="p-3 text-start">{isAr ? "كودنا" : "SKU"}</th>
                          <th className="p-3 text-start">
                            {isAr ? "كود الحاضنة" : "External code"}
                          </th>
                          <th className="p-3 text-center">{isAr ? "الكمية" : "Qty"}</th>
                          <th className="p-3 text-end">{isAr ? "القيمة" : "Value"}</th>
                          <th className="p-3 text-end">{isAr ? "إجراء" : "Action"}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {pagedStock.map((item) => {
                          const v = item.product_variants;
                          return (
                            <tr key={item.id}>
                              <td className="p-3 font-medium">
                                {(isAr ? v?.products?.name_ar : v?.products?.name) ||
                                  v?.products?.name ||
                                  "—"}
                                <span className="ms-2 text-xs text-muted-foreground">
                                  {[v?.size, v?.color].filter(Boolean).join(" / ")}
                                </span>
                              </td>
                              <td className="p-3 font-mono text-xs">
                                {v?.sku || v?.barcode || "—"}
                              </td>
                              <td className="p-3 font-mono text-xs">{item.external_code || "—"}</td>
                              <td className="p-3 text-center font-bold">{item.quantity}</td>
                              <td className="p-3 text-end">
                                {money(item.quantity * item.consignment_price, current.currency)}
                              </td>
                              <td className="p-3">
                                <div className="flex justify-end gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setActiveItem(item);
                                      setDialog("return");
                                    }}
                                  >
                                    <RotateCcw className="me-1 h-3.5 w-3.5" />
                                    {isAr ? "إرجاع" : "Return"}
                                  </Button>
                                  <Button
                                    size="sm"
                                    onClick={() => {
                                      setActiveItem(item);
                                      setDialog("sale");
                                    }}
                                  >
                                    <ShoppingBag className="me-1 h-3.5 w-3.5" />
                                    {isAr ? "مباعة" : "Sold"}
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        {filteredStock.length === 0 && (
                          <tr>
                            <td colSpan={6} className="p-8 text-center text-muted-foreground">
                              {isAr
                                ? "لا توجد بضاعة عند هذه الحاضنة"
                                : "No stock at this incubator"}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <ListPagination
                    lang={lang}
                    entityAr="قطعة"
                    entityEn="Items"
                    totalItems={filteredStock.length}
                    page={stockPage}
                    pageSize={stockPageSize}
                    onPageChange={setStockPage}
                    onPageSizeChange={(size) => {
                      setStockPageSize(size);
                      setStockPage(1);
                    }}
                  />
                </TabsContent>
                <TabsContent value="sales">
                  <DataTable
                    rows={pagedSales.map((sale) => ({
                      id: sale.id,
                      primary:
                        (isAr
                          ? sale.product_variants?.products?.name_ar
                          : sale.product_variants?.products?.name) ||
                        sale.product_variants?.products?.name ||
                        "—",
                      secondary: new Date(sale.sold_at).toLocaleDateString(
                        isAr ? "ar-BH" : "en-BH",
                      ),
                      amount: money(sale.net_due, current.currency),
                      badge:
                        sale.status === "reversed"
                          ? isAr
                            ? "ملغاة"
                            : "Reversed"
                          : sale.paid_amount >= sale.net_due
                            ? isAr
                              ? "مسددة"
                              : "Paid"
                            : isAr
                              ? "مستحقة"
                              : "Due",
                    }))}
                    empty={isAr ? "لا توجد مبيعات مسجلة" : "No recorded sales"}
                  />
                  <div className="mt-3">
                    <ListPagination
                      lang={lang}
                      entityAr="عملية بيع"
                      entityEn="Sales"
                      totalItems={sales.length}
                      page={salesPage}
                      pageSize={salesPageSize}
                      onPageChange={setSalesPage}
                      onPageSizeChange={(size) => {
                        setSalesPageSize(size);
                        setSalesPage(1);
                      }}
                    />
                  </div>
                </TabsContent>
                <TabsContent value="payments">
                  <DataTable
                    rows={pagedPayments.map((payment) => ({
                      id: payment.id,
                      primary:
                        payment.reference || payment.payment_method || (isAr ? "دفعة" : "Payment"),
                      secondary: new Date(payment.payment_date).toLocaleDateString(
                        isAr ? "ar-BH" : "en-BH",
                      ),
                      amount: money(payment.amount, current.currency),
                      badge: isAr ? "مستلمة" : "Received",
                    }))}
                    empty={isAr ? "لا توجد دفعات مسجلة" : "No recorded payments"}
                  />
                  <div className="mt-3">
                    <ListPagination
                      lang={lang}
                      entityAr="دفعة"
                      entityEn="Payments"
                      totalItems={payments.length}
                      page={paymentsPage}
                      pageSize={paymentsPageSize}
                      onPageChange={setPaymentsPage}
                      onPageSizeChange={(size) => {
                        setPaymentsPageSize(size);
                        setPaymentsPage(1);
                      }}
                    />
                  </div>
                </TabsContent>
              </Tabs>
            </>
          ) : (
            <Card className="border-border p-12 text-center text-muted-foreground">
              <Building2 className="mx-auto mb-3 h-10 w-10" />
              <p>
                {isAr
                  ? "أنشئ حاضنة لبدء إدارة العُهد"
                  : "Create an incubator to start managing consignments"}
              </p>
            </Card>
          )}
        </div>
      </div>

      <OperationDialog
        dialog={dialog}
        setDialog={setDialog}
        current={current}
        activeItem={activeItem}
        products={productsQ.data ?? []}
        busy={busy}
        isAr={isAr}
        due={summary.due}
        locale={locale}
        onSubmit={submit}
      />
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  highlight = false,
}: {
  icon: typeof Package;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <Card className="border-border p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className={`h-4 w-4 ${highlight ? "text-primary" : "text-muted-foreground"}`} />
      </div>
      <p className={`text-xl font-black ${highlight ? "text-primary" : "text-foreground"}`}>
        {value}
      </p>
    </Card>
  );
}

function DataTable({
  rows,
  empty,
}: {
  rows: Array<{ id: string; primary: string; secondary: string; amount: string; badge: string }>;
  empty: string;
}) {
  return (
    <Card className="divide-y divide-border border-border">
      {rows.map((row) => (
        <div key={row.id} className="flex items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{row.primary}</p>
            <p className="text-xs text-muted-foreground">{row.secondary}</p>
          </div>
          <div className="text-end">
            <p className="font-bold">{row.amount}</p>
            <Badge variant="secondary" className="mt-1">
              {row.badge}
            </Badge>
          </div>
        </div>
      ))}
      {rows.length === 0 && (
        <p className="p-8 text-center text-sm text-muted-foreground">{empty}</p>
      )}
    </Card>
  );
}

function OperationDialog({
  dialog,
  setDialog,
  current,
  activeItem,
  products,
  busy,
  isAr,
  due,
  locale,
  onSubmit,
}: {
  dialog: "incubator" | "edit_incubator" | "transfer" | "sale" | "payment" | "return" | null;
  setDialog: (value: null) => void;
  current: Incubator | null;
  activeItem: StockItem | null;
  products: ProductOption[];
  busy: boolean;
  isAr: boolean;
  due: number;
  locale: string;
  onSubmit: (form: HTMLFormElement) => void;
}) {
  const title =
    dialog === "incubator"
      ? isAr
        ? "إضافة حاضنة"
        : "Add incubator"
      : dialog === "edit_incubator"
        ? isAr
          ? "تعديل بيانات الحاضنة"
          : "Edit incubator details"
        : dialog === "transfer"
          ? isAr
            ? "تحويل بضاعة للحاضنة"
            : "Transfer stock"
          : dialog === "sale"
            ? isAr
              ? "تسجيل قطعة مباعة"
              : "Record sale"
            : dialog === "return"
              ? isAr
                ? "إرجاع للمخزون الرئيسي"
                : "Return to main stock"
              : isAr
                ? "تسجيل دفعة"
                : "Record payment";
  const itemName =
    (isAr
      ? activeItem?.product_variants?.products?.name_ar
      : activeItem?.product_variants?.products?.name) ||
    activeItem?.product_variants?.products?.name ||
    "";
  return (
    <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
      <DialogContent className="max-w-lg" dir={isAr ? "rtl" : "ltr"}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit(event.currentTarget);
          }}
        >
          {(dialog === "incubator" || dialog === "edit_incubator") && (
            <>
              <Field
                label={isAr ? "اسم الحاضنة" : "Name"}
                name="name"
                defaultValue={dialog === "edit_incubator" ? current?.name || "" : ""}
                required
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={isAr ? "اسم المسؤول" : "Contact"}
                  name="contact_name"
                  defaultValue={dialog === "edit_incubator" ? current?.contact_name || "" : ""}
                />
                <Field
                  label={isAr ? "الهاتف" : "Phone"}
                  name="phone"
                  type="tel"
                  defaultValue={dialog === "edit_incubator" ? current?.phone || "" : ""}
                />
              </div>
              <Field
                label={isAr ? "البريد الإلكتروني" : "Email"}
                name="email"
                type="email"
                defaultValue={dialog === "edit_incubator" ? current?.email || "" : ""}
              />
              <CommissionFields
                isAr={isAr}
                current={dialog === "edit_incubator" ? current : null}
              />
              <Field
                label={isAr ? "يوم التسوية الشهري" : "Settlement day"}
                name="settlement_day"
                type="number"
                min="1"
                max="31"
                defaultValue={
                  dialog === "edit_incubator" && current?.settlement_day
                    ? String(current.settlement_day)
                    : ""
                }
              />
              {dialog === "edit_incubator" && (
                <div>
                  <Label>{isAr ? "الحالة" : "Status"}</Label>
                  <select
                    name="is_active"
                    defaultValue={String(current?.is_active ?? true)}
                    className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="true">{isAr ? "نشطة" : "Active"}</option>
                    <option value="false">{isAr ? "موقوفة" : "Inactive"}</option>
                  </select>
                </div>
              )}
              <Field
                label={isAr ? "ملاحظات" : "Notes"}
                name="notes"
                defaultValue={dialog === "edit_incubator" ? current?.notes || "" : ""}
                textarea
              />
            </>
          )}
          {dialog === "transfer" && (
            <>
              <div>
                <Label>{isAr ? "المنتج والنسخة" : "Product variant"}</Label>
                <select
                  name="variant_id"
                  required
                  className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">{isAr ? "اختر منتجًا" : "Select product"}</option>
                  {products.map((v) => (
                    <option key={v.id} value={v.id}>
                      {(isAr ? v.products?.name_ar : v.products?.name) || v.products?.name} —{" "}
                      {v.sku || v.barcode || v.id.slice(0, 8)} ({isAr ? "متاح" : "available"}:{" "}
                      {v.stock_main})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={isAr ? "الكمية" : "Quantity"}
                  name="quantity"
                  type="number"
                  min="1"
                  required
                />
                <Field label={isAr ? "كود الحاضنة" : "External code"} name="external_code" />
              </div>
              <Field
                label={isAr ? "سعر البيع المتفق" : "Consignment price"}
                name="price"
                type="number"
                min="0"
                step="0.001"
                required
              />
              <CommissionFields isAr={isAr} current={current} />
              <Field label={isAr ? "ملاحظات التسليم" : "Transfer notes"} name="notes" textarea />
            </>
          )}
          {dialog === "sale" && (
            <>
              <p className="rounded-md bg-muted p-3 text-sm font-bold">
                {itemName} · {activeItem?.external_code || activeItem?.product_variants?.sku}
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={isAr ? "الكمية المباعة" : "Sold quantity"}
                  name="quantity"
                  type="number"
                  min="1"
                  max={String(activeItem?.quantity ?? 1)}
                  defaultValue="1"
                  required
                />
                <Field
                  label={isAr ? "سعر القطعة الفعلي" : "Actual unit price"}
                  name="price"
                  type="number"
                  min="0"
                  step="0.001"
                  defaultValue={String(activeItem?.consignment_price ?? 0)}
                  required
                />
              </div>
              <Field
                label={isAr ? "تاريخ ووقت البيع" : "Sale date"}
                name="sold_at"
                type="datetime-local"
                defaultValue={new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
                  .toISOString()
                  .slice(0, 16)}
                required
              />
            </>
          )}
          {dialog === "return" && (
            <>
              <p className="rounded-md bg-muted p-3 text-sm font-bold">
                {itemName} · {isAr ? "المتوفر" : "available"}: {activeItem?.quantity}
              </p>
              <Field
                label={isAr ? "الكمية المرجعة" : "Return quantity"}
                name="quantity"
                type="number"
                min="1"
                max={String(activeItem?.quantity ?? 1)}
                defaultValue="1"
                required
              />
              <Field label={isAr ? "سبب أو ملاحظة" : "Reason or note"} name="notes" textarea />
            </>
          )}
          {dialog === "payment" && (
            <>
              <p className="rounded-md bg-muted p-3 text-sm">
                {isAr ? "المستحق حاليًا" : "Currently due"}:{" "}
                <b className="text-primary">
                  {formatMoney(due, current?.currency || "BHD", locale)}
                </b>
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={isAr ? "المبلغ المستلم" : "Amount"}
                  name="amount"
                  type="number"
                  min="0.001"
                  max={String(due)}
                  step="0.001"
                  required
                />
                <Field
                  label={isAr ? "تاريخ الاستلام" : "Payment date"}
                  name="payment_date"
                  type="date"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  required
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={isAr ? "طريقة الدفع" : "Method"} name="payment_method" />
                <Field label={isAr ? "رقم المرجع" : "Reference"} name="reference" />
              </div>
              <Field label={isAr ? "ملاحظات" : "Notes"} name="notes" textarea />
            </>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialog(null)}>
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy
                ? isAr
                  ? "جاري الحفظ..."
                  : "Saving..."
                : isAr
                  ? "حفظ وتحديث المخزون"
                  : "Save and update"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CommissionFields({ isAr, current }: { isAr: boolean; current?: Incubator | null }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <Label>{isAr ? "نوع العمولة" : "Commission type"}</Label>
        <select
          name="commission_type"
          defaultValue={current?.commission_type || "percentage"}
          className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="percentage">{isAr ? "نسبة مئوية" : "Percentage"}</option>
          <option value="fixed">{isAr ? "مبلغ ثابت لكل قطعة" : "Fixed per unit"}</option>
        </select>
      </div>
      <Field
        label={isAr ? "قيمة العمولة" : "Commission value"}
        name="commission_value"
        type="number"
        min="0"
        step="0.001"
        defaultValue={String(current?.commission_value ?? 0)}
        required
      />
    </div>
  );
}

function Field({
  label,
  name,
  textarea,
  defaultValue,
  ...props
}: {
  label: string;
  name: string;
  textarea?: boolean;
  defaultValue?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <Label htmlFor={name}>{label}</Label>
      {textarea ? (
        <Textarea id={name} name={name} defaultValue={defaultValue} className="mt-2" />
      ) : (
        <Input id={name} name={name} defaultValue={defaultValue} className="mt-2" {...props} />
      )}
    </div>
  );
}
