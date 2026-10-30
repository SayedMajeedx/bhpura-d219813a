import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PackagePlus, Scissors } from "lucide-react";
import {
  AdminPageAction,
  AdminPageCount,
  AdminPageHeader,
} from "@/components/admin/AdminPageHeader";
import { RoutePendingSkeleton } from "@/components/os/route-pending-skeleton";
import { combinedLoadState, OsLoadFailedState } from "@/components/os/os-load-failed-state";
import { Card } from "@/components/ui/card";
import { useBrand } from "@/lib/brand-context";
import { useI18n } from "@/lib/i18n";
import { formatMoney } from "@/lib/format";
import { useStoreCurrency } from "@/hooks/use-store-currency";
import { supplierOrderQueries } from "@/lib/data/supplier-orders";
import {
  localToday,
  ordersLabel,
  ordersInTab,
  ordersSummary,
  sortOrders,
  type SupplierOrdersTab,
} from "../lib/order-state";
import { SupplierOrderCard } from "./SupplierOrderCard";
import { SupplierBalancesList } from "./SupplierBalancesList";
import { PiecesToMakeTab } from "./PiecesToMakeTab";
import { ReorderTab } from "./ReorderTab";
import { useReorderSuggestions } from "../hooks/use-reorder";
import { CancelledPiecesNotice } from "./CancelledPiecesNotice";
import { usePiecesToMake } from "../hooks/use-pieces-to-make";
import { useProfile } from "@/lib/profile-context";
import { useAdminStoreProfile } from "@/hooks/use-store-profile";
import { supplierBalances } from "../lib/payments";
import { cn } from "@/lib/utils";

/**
 * Supplier orders: what was ordered from a supplier (a tailor, a workshop, a wholesaler), what has arrived, and what is
 * still owed. Receiving an order adds its pieces to the stock and sets their cost.
 */
type PageTab = SupplierOrdersTab | "suppliers" | "pieces" | "reorder";

export function SupplierOrdersPage() {
  const { lang: rawLang } = useI18n();
  const lang = rawLang === "ar" ? "ar" : "en";
  const isAr = lang === "ar";
  const brand = useBrand();
  const navigate = useNavigate();
  const currency = useStoreCurrency(brand.id);
  const ordersQ = useQuery(supplierOrderQueries.list(brand.id));
  const loadState = combinedLoadState([ordersQ]);
  const [tab, setTab] = useState<PageTab>("open");
  // Customers' made-to-order pieces waiting for the workshop: a store that makes to order, read
  // by staff who handle orders (they send them).
  const { hasPermission } = useProfile();
  const { profile: storeProfile } = useAdminStoreProfile(brand.id);
  const makes = Boolean(storeProfile.modules.made_to_order) && hasPermission("manage_orders");
  const waiting = usePiecesToMake(brand.id, makes);
  // Sizes about to run out, for a store that keeps stock.
  const keepsStock = Boolean(storeProfile.modules.stock);
  const today = localToday();

  const orders = useMemo(() => ordersQ.data ?? [], [ordersQ.data]);
  const reorder = useReorderSuggestions(brand.id, orders, lang, keepsStock);
  const summary = useMemo(() => ordersSummary(orders, today), [orders, today]);
  const shown = useMemo(
    () =>
      tab === "suppliers" || tab === "pieces" || tab === "reorder"
        ? []
        : sortOrders(ordersInTab(orders, tab), today),
    [orders, tab, today],
  );
  const balances = useMemo(() => supplierBalances(orders, today), [orders, today]);

  const tabs: Array<{ id: PageTab; label: string; count: number }> = [
    {
      id: "open",
      label: isAr ? "قيد الانتظار" : "Waiting",
      count: ordersInTab(orders, "open").length,
    },
    ...(makes
      ? [
          {
            id: "pieces" as const,
            label: isAr ? "قطع للتفصيل" : "Pieces to make",
            count: waiting.pieces,
          },
        ]
      : []),
    ...(keepsStock
      ? [
          {
            id: "reorder" as const,
            label: isAr ? "لإعادة الطلب" : "To reorder",
            count: reorder.lines.length,
          },
        ]
      : []),
    { id: "done", label: isAr ? "منتهية" : "Done", count: ordersInTab(orders, "done").length },
    { id: "all", label: isAr ? "الكل" : "All", count: orders.length },
    { id: "suppliers", label: isAr ? "الموردون" : "Suppliers", count: balances.length },
  ];

  const newOrder = () =>
    navigate({ to: "/admin/b/$slug/supplier-orders/$id", params: { slug: brand.slug, id: "new" } });

  return (
    <div
      className="mx-auto w-full min-w-0 max-w-4xl space-y-4 p-2 pb-32 sm:p-4 sm:pb-16"
      dir={isAr ? "rtl" : "ltr"}
    >
      <AdminPageHeader
        icon={Scissors}
        title={isAr ? "طلبيات الموردين" : "Supplier orders"}
        badges={
          loadState === "ready" && summary.open > 0 ? (
            <AdminPageCount>
              {ordersLabel(summary.open, lang)} {isAr ? "بانتظار الاستلام" : "awaiting"}
            </AdminPageCount>
          ) : null
        }
        description={
          isAr
            ? "ما طلبته من الموردين، وما وصل منه، وكم بقي عليك. الاستلام يضيف القطع للمخزون ويحفظ تكلفتها."
            : "What you ordered from suppliers, what has arrived and what you still owe. Receiving adds the pieces to stock and records their cost."
        }
        actions={
          <AdminPageAction
            icon={PackagePlus}
            label={isAr ? "طلبية جديدة" : "New order"}
            short={isAr ? "جديدة" : "New"}
            onClick={newOrder}
          />
        }
      />

      {loadState === "loading" ? (
        <RoutePendingSkeleton />
      ) : loadState === "failed" ? (
        <OsLoadFailedState
          isAr={isAr}
          title={isAr ? "تعذّر تحميل الطلبيات" : "The orders could not be loaded"}
          description={
            isAr
              ? "لم يتغير شيء. تحقق من الاتصال ثم أعد المحاولة."
              : "Nothing was changed. Check the connection and try again."
          }
          queries={[ordersQ]}
        />
      ) : orders.length === 0 && !(makes && waiting.pieces > 0) ? (
        <EmptyState isAr={isAr} slug={brand.slug} />
      ) : (
        <>
          <dl className="grid grid-cols-3 gap-2">
            <Figure
              label={isAr ? "قطع بانتظار الوصول" : "Pieces to come"}
              value={String(summary.awaited)}
            />
            <Figure
              label={isAr ? "طلبيات متأخرة" : "Late orders"}
              value={String(summary.late)}
              tone={summary.late > 0 ? "warning" : undefined}
            />
            <Figure
              label={isAr ? "باقي للموردين" : "Owed to suppliers"}
              value={formatMoney(summary.owed, currency, lang)}
            />
          </dl>

          <CancelledPiecesNotice orders={orders} slug={brand.slug} lang={lang} />

          <div
            role="tablist"
            aria-label={isAr ? "عرض الطلبيات" : "Show orders"}
            className="flex gap-1 overflow-x-auto rounded-lg bg-muted/50 p-1"
          >
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex min-h-9 flex-1 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 text-xs font-bold transition-colors pointer-coarse:min-h-11",
                  tab === t.id
                    ? "bg-background text-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
                <span className="text-muted-foreground">{t.count}</span>
              </button>
            ))}
          </div>

          {tab === "pieces" ? (
            <PiecesToMakeTab currency={currency} lang={lang} />
          ) : tab === "reorder" ? (
            <ReorderTab
              lines={reorder.lines}
              catalog={reorder.catalog}
              isLoading={reorder.isLoading}
              lang={lang}
            />
          ) : tab === "suppliers" ? (
            <SupplierBalancesList balances={balances} currency={currency} lang={lang} />
          ) : shown.length === 0 ? (
            <Card className="p-6 text-center text-sm text-muted-foreground">
              {tab === "open"
                ? isAr
                  ? "لا شيء بانتظار الوصول."
                  : "Nothing is on its way."
                : isAr
                  ? "لا توجد طلبيات هنا."
                  : "No orders here."}
            </Card>
          ) : (
            <ul className="space-y-2">
              {shown.map((order) => (
                <li key={order.id}>
                  <SupplierOrderCard order={order} today={today} currency={currency} lang={lang} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: "warning" }) {
  return (
    <div className="min-w-0 rounded-xl border border-border-subtle bg-card p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "mt-1 break-words text-sm font-bold tabular-nums sm:text-lg",
          tone === "warning" ? "text-warning" : "text-foreground",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function EmptyState({ isAr, slug }: { isAr: boolean; slug: string }) {
  return (
    <Card className="space-y-3 p-6 text-center">
      <Scissors className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
      <h2 className="font-bold">{isAr ? "لا توجد طلبيات بعد" : "No orders yet"}</h2>
      <p className="mx-auto max-w-md text-sm text-muted-foreground">
        {isAr
          ? "عندما تطلب قطعاً من مورد (خياط، مشغل، تاجر جملة)، سجّلها هنا: المنتج والمقاسات والتكلفة. وعند وصولها اضغط «استلام» لتُضاف للمخزون بتكلفتها، فلا تُنسى التكاليف."
          : "When you order pieces from a supplier (a tailor, a workshop, a wholesaler), note them here: the product, its sizes and the cost. When they arrive, press Receive: they join your stock with their cost, so no cost is forgotten."}
      </p>
      <Link
        to="/admin/b/$slug/supplier-orders/$id"
        params={{ slug, id: "new" }}
        className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground"
      >
        <PackagePlus className="h-4 w-4" aria-hidden="true" />
        {isAr ? "أول طلبية" : "First order"}
      </Link>
    </Card>
  );
}
