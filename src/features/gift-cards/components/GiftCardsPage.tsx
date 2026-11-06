import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Gift, Plus } from "lucide-react";
import {
  AdminPageAction,
  AdminPageCount,
  AdminPageHeader,
} from "@/components/admin/AdminPageHeader";
import { Button } from "@/components/ui/button";
import { useBrand } from "@/lib/brand-context";
import { useProfile } from "@/lib/profile-context";
import { useI18n } from "@/lib/i18n";
import { formatMoney } from "@/lib/format";
import { countOf } from "@/lib/arabic-count";
import { cn } from "@/lib/utils";
import { replaceUrlQuietly } from "@/lib/quiet-url";
import { useStoreCurrency } from "@/hooks/use-store-currency";
import { giftCardOnlineQueries, giftCardQueries } from "@/lib/data/gift-cards";
import { localToday } from "@/features/supplier-orders/lib/order-state";
import { cardsHeld } from "../lib/gift-cards";
import { orderCounts, pageViewSearch, readPageView, type PageTab } from "../lib/card-orders";
import { IssueGiftCardDialog } from "./IssueGiftCardDialog";
import { GiftCardDetailsSheet } from "./GiftCardDetailsSheet";
import { GiftCardOrderSheet } from "./GiftCardOrderSheet";
import { GiftCardOrdersTab } from "./GiftCardOrdersTab";
import { GiftCardCardsTab } from "./GiftCardCardsTab";
import { GiftCardSettingsTab } from "./GiftCardSettingsTab";

/**
 * A store's gift cards, in three parts: the orders shoppers placed on the store, what needs a
 * person first; every card with what is left on it; and how the store sells them. Taking a card
 * as payment is on the order. The part open and the order open are in the address, so a link
 * brings staff back to the same place.
 */
export function GiftCardsPage() {
  const { lang: rawLang } = useI18n();
  const lang = rawLang === "ar" ? "ar" : "en";
  const isAr = lang === "ar";
  const brand = useBrand();
  const { hasPermission } = useProfile();
  const maySetUp = hasPermission("manage_settings");
  const currency = useStoreCurrency(brand.id);
  const cardsQ = useQuery(giftCardQueries.list(brand.id));
  const purchasesQ = useQuery(giftCardOnlineQueries.purchases(brand.id));
  const [issuing, setIssuing] = useState(false);
  const [tab, setTab] = useState<PageTab>("orders");
  const [orderId, setOrderId] = useState<string | null>(null);
  const [cardId, setCardId] = useState<string | null>(null);
  const today = localToday();
  const cards = useMemo(() => cardsQ.data ?? [], [cardsQ.data]);
  const purchases = useMemo(() => purchasesQ.data ?? [], [purchasesQ.data]);
  const held = useMemo(() => cardsHeld(cards, today), [cards, today]);
  const toDo = useMemo(() => orderCounts(purchases).todo, [purchases]);
  const openCard = cards.find((card) => card.id === cardId) ?? null;
  const openOrder = purchases.find((purchase) => purchase.id === orderId) ?? null;
  const orderOfCard = openCard
    ? (purchases.find((purchase) => purchase.gift_card_id === openCard.id) ?? null)
    : null;

  // The address after the first paint: the page is sent before a browser's address is known.
  useEffect(() => {
    const view = readPageView(window.location.search);
    setTab(view.tab === "settings" && !maySetUp ? "orders" : view.tab);
    setOrderId(view.orderId);
  }, [maySetUp]);

  const show = (nextTab: PageTab, nextOrder: string | null) => {
    setTab(nextTab);
    setOrderId(nextOrder);
    const search = pageViewSearch(window.location.search, { tab: nextTab, orderId: nextOrder });
    replaceUrlQuietly(`${window.location.pathname}${search}`);
  };

  const tabs: { id: PageTab; label: string; count: number | null }[] = [
    { id: "orders", label: isAr ? "الطلبات" : "Orders", count: toDo > 0 ? toDo : null },
    { id: "cards", label: isAr ? "البطاقات" : "Cards", count: null },
    ...(maySetUp
      ? [{ id: "settings" as const, label: isAr ? "الإعدادات" : "Settings", count: null }]
      : []),
  ];

  return (
    <div
      className="mx-auto w-full min-w-0 max-w-4xl space-y-4 p-2 pb-24 sm:p-4"
      dir={isAr ? "rtl" : "ltr"}
    >
      <AdminPageHeader
        icon={Gift}
        title={isAr ? "بطاقات الهدايا" : "Gift cards"}
        badges={
          held.active > 0 ? (
            <AdminPageCount>{countOf(held.active, "card", lang)}</AdminPageCount>
          ) : null
        }
        description={
          isAr
            ? "بطاقة الهدية دفعة: يُدفع بها الطلب بسعره كاملًا وتبقى قيمتها أمانة لدى المتجر حتى تُستخدم."
            : "A gift card is a payment: it pays an order at its full price, and its value is held by the store until it is used."
        }
        actions={
          <AdminPageAction
            icon={Plus}
            label={isAr ? "إصدار بطاقة" : "Issue a card"}
            short={isAr ? "إصدار" : "Issue"}
            onClick={() => setIssuing(true)}
          />
        }
      />

      <dl className="grid grid-cols-3 gap-2">
        <Figure
          label={isAr ? "طلبات تنتظرك" : "Orders to act on"}
          value={String(toDo)}
          urgent={toDo > 0}
        />
        <Figure
          label={isAr ? "رصيد البطاقات الصالحة" : "Held on active cards"}
          value={formatMoney(held.held, currency, lang)}
        />
        <Figure
          label={isAr ? "على بطاقات منتهية" : "On expired cards"}
          value={formatMoney(held.expired, currency, lang)}
        />
      </dl>

      <div
        role="tablist"
        aria-label={isAr ? "أقسام بطاقات الهدايا" : "Gift card sections"}
        className="flex gap-1 rounded-lg bg-muted/50 p-1"
      >
        {tabs.map((option) => (
          <Button
            key={option.id}
            type="button"
            variant="ghost"
            role="tab"
            aria-selected={tab === option.id}
            onClick={() => show(option.id, null)}
            className={cn(
              "h-auto min-h-9 flex-1 gap-1.5 whitespace-nowrap rounded-md px-3 text-xs font-bold pointer-coarse:min-h-11",
              tab === option.id
                ? "bg-background text-foreground shadow-2xs hover:bg-background"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
            {option.count !== null && (
              <span className="rounded-full bg-warning/20 px-1.5 font-mono text-foreground">
                {option.count}
              </span>
            )}
          </Button>
        ))}
      </div>

      {tab === "orders" && (
        <GiftCardOrdersTab
          purchases={purchases}
          loading={purchasesQ.isLoading}
          lang={lang}
          onOpen={(id) => show("orders", id)}
        />
      )}
      {tab === "cards" && (
        <GiftCardCardsTab
          cards={cards}
          loading={cardsQ.isLoading}
          today={today}
          lang={lang}
          onOpen={setCardId}
        />
      )}
      {tab === "settings" && maySetUp && <GiftCardSettingsTab lang={lang} />}

      <IssueGiftCardDialog
        brandId={brand.id}
        lang={lang}
        open={issuing}
        onOpenChange={setIssuing}
      />
      <GiftCardOrderSheet
        key={orderId ?? "none"}
        purchase={openOrder}
        lang={lang}
        onClose={() => show(tab, null)}
        onOpenCard={(id) => {
          show(tab, null);
          setCardId(id);
        }}
      />
      <GiftCardDetailsSheet
        card={openCard}
        brandId={brand.id}
        slug={brand.slug}
        lang={lang}
        onClose={() => setCardId(null)}
        onOpenOrder={
          orderOfCard
            ? () => {
                setCardId(null);
                show("orders", orderOfCard.id);
              }
            : null
        }
      />
    </div>
  );
}

function Figure({
  label,
  value,
  urgent = false,
}: {
  label: string;
  value: string;
  urgent?: boolean;
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-2xl border bg-card p-3",
        urgent ? "border-warning/50 bg-warning/10" : "border-border",
      )}
    >
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-mono text-base font-semibold sm:text-lg">
        <span dir="ltr">{value}</span>
      </dd>
    </div>
  );
}
