import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SectionSkeleton } from "@/components/ui/section-skeleton";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { GiftCardPurchase } from "@/lib/data/gift-cards";
import { purchaseWords } from "../lib/online-sales";
import { FilterChips } from "./FilterChips";
import {
  ORDER_FILTERS,
  ORDER_FILTER_WORDS,
  ORDER_STEP_WORDS,
  orderCounts,
  orderGroup,
  orderReference,
  orderStep,
  ordersInFilter,
  paymentWords,
  searchOrders,
  type OrderFilter,
} from "../lib/card-orders";

const when = (value: string, lang: "ar" | "en") =>
  new Date(value).toLocaleString(lang === "ar" ? "ar-BH-u-nu-latn" : "en-GB", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });

/** Cards bought on the store: what needs a person first, then everything else, one tap from its details. */
export function GiftCardOrdersTab({
  purchases,
  loading,
  lang,
  onOpen,
}: {
  purchases: GiftCardPurchase[];
  loading: boolean;
  lang: "ar" | "en";
  onOpen: (purchaseId: string) => void;
}) {
  const isAr = lang === "ar";
  const counts = useMemo(() => orderCounts(purchases), [purchases]);
  const [chosen, setChosen] = useState<OrderFilter | null>(null);
  const [search, setSearch] = useState("");
  // Opens on what waits; a store with nothing waiting sees its orders.
  const filter: OrderFilter = chosen ?? (counts.todo > 0 ? "todo" : "all");
  const shown = useMemo(
    () => searchOrders(ordersInFilter(purchases, filter), search),
    [purchases, filter, search],
  );

  if (loading) return <SectionSkeleton />;
  if (purchases.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        {isAr
          ? "لا طلبات بعد. تظهر هنا البطاقات التي يشتريها العملاء من المتجر."
          : "No orders yet. Cards shoppers buy on the store appear here."}
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <FilterChips
        label={isAr ? "تصفية الطلبات" : "Filter orders"}
        options={ORDER_FILTERS}
        value={filter}
        count={(option) => counts[option]}
        word={(option) => ORDER_FILTER_WORDS[option][lang]}
        onChange={setChosen}
      />

      <div className="relative">
        <Search
          className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          aria-label={isAr ? "ابحث في الطلبات" : "Search orders"}
          placeholder={isAr ? "المرجع، الاسم، الهاتف، الرمز" : "Reference, name, phone, code"}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ps-9"
        />
      </div>

      {shown.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          {search.trim()
            ? isAr
              ? "لا طلب يطابق البحث."
              : "No order matches the search."
            : filter === "todo"
              ? isAr
                ? "لا شيء ينتظرك."
                : "Nothing is waiting for you."
              : isAr
                ? "لا طلبات هنا."
                : "No orders here."}
        </Card>
      ) : (
        <ul className="space-y-2">
          {shown.map((purchase) => (
            <OrderRow
              key={purchase.id}
              purchase={purchase}
              lang={lang}
              onOpen={() => onOpen(purchase.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

const TONE = {
  todo: "bg-warning/10 text-foreground",
  done: "bg-success/10 text-foreground",
  unfinished: "bg-muted text-muted-foreground",
} as const;

function OrderRow({
  purchase,
  lang,
  onOpen,
}: {
  purchase: GiftCardPurchase;
  lang: "ar" | "en";
  onOpen: () => void;
}) {
  const step = orderStep(purchase);
  const Arrow = lang === "ar" ? ChevronLeft : ChevronRight;
  return (
    <li>
      <Button
        type="button"
        variant="ghost"
        onClick={onOpen}
        className="grid h-auto w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-xl border border-border bg-card p-3 text-start whitespace-normal hover:bg-muted/40"
      >
        <span className="min-w-0 space-y-1">
          <span
            className="block line-clamp-2 break-words text-page-start text-sm font-semibold"
            dir="auto"
          >
            {purchase.buyer_name}
          </span>
          <span className="block text-xs text-muted-foreground">
            <span dir="ltr">{orderReference(purchase)}</span> · {when(purchase.created_at, lang)}
            {" · "}
            {paymentWords(purchase.payment_method, lang)}
          </span>
          <span
            className={cn(
              "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
              TONE[orderGroup(purchase)],
            )}
          >
            {step ? ORDER_STEP_WORDS[step][lang] : purchaseWords(purchase)[lang]}
          </span>
        </span>
        <span className="font-mono text-sm font-semibold" dir="ltr">
          {formatMoney(Number(purchase.amount), purchase.currency, lang)}
        </span>
        <Arrow className="size-4 text-muted-foreground" aria-hidden="true" />
      </Button>
    </li>
  );
}
