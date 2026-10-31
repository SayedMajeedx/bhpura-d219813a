import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Gift, Plus, Search } from "lucide-react";
import {
  AdminPageAction,
  AdminPageCount,
  AdminPageHeader,
} from "@/components/admin/AdminPageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useBrand } from "@/lib/brand-context";
import { useI18n } from "@/lib/i18n";
import { formatMoney } from "@/lib/format";
import { countOf } from "@/lib/arabic-count";
import { useStoreCurrency } from "@/hooks/use-store-currency";
import { giftCardQueries, type GiftCard } from "@/lib/data/gift-cards";
import { localToday } from "@/features/supplier-orders/lib/order-state";
import { CARD_STATE_WORDS, cardState, cardsHeld, searchCards } from "../lib/gift-cards";
import { IssueGiftCardDialog } from "./IssueGiftCardDialog";
import { GiftCardDetailsSheet } from "./GiftCardDetailsSheet";

/**
 * A store's gift cards: what it holds for them (money owed to shoppers in goods), every card with
 * what is left on it, issuing one and opening one. Taking a card as payment is on the order.
 */
export function GiftCardsPage() {
  const { lang: rawLang } = useI18n();
  const lang = rawLang === "ar" ? "ar" : "en";
  const isAr = lang === "ar";
  const brand = useBrand();
  const currency = useStoreCurrency(brand.id);
  const cardsQ = useQuery(giftCardQueries.list(brand.id));
  const [issuing, setIssuing] = useState(false);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const today = localToday();
  const cards = useMemo(() => cardsQ.data ?? [], [cardsQ.data]);
  const shown = useMemo(() => searchCards(cards, search), [cards, search]);
  const held = useMemo(() => cardsHeld(cards, today), [cards, today]);
  const open = cards.find((card) => card.id === openId) ?? null;
  const money = (n: number, cur = currency) => formatMoney(n, cur, lang);

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

      <dl className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-border bg-card p-3">
          <dt className="text-xs text-muted-foreground">
            {isAr ? "رصيد البطاقات الصالحة" : "Held on active cards"}
          </dt>
          <dd className="font-mono text-lg font-semibold" dir="ltr">
            {money(held.held)}
          </dd>
        </div>
        <div className="rounded-2xl border border-border bg-card p-3">
          <dt className="text-xs text-muted-foreground">
            {isAr ? "على بطاقات منتهية" : "On expired cards"}
          </dt>
          <dd className="font-mono text-lg font-semibold" dir="ltr">
            {money(held.expired)}
          </dd>
        </div>
      </dl>

      <div className="relative">
        <Search
          className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          aria-label={isAr ? "ابحث بالرمز أو الاسم" : "Search by code or name"}
          placeholder={isAr ? "ابحث بالرمز أو الاسم" : "Search by code or name"}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ps-9"
        />
      </div>

      {cardsQ.isLoading ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          {isAr ? "جارٍ التحميل…" : "Loading…"}
        </Card>
      ) : shown.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          {cards.length === 0
            ? isAr
              ? "لا بطاقات بعد. أصدر أول بطاقة لعميل يريد إهداءها."
              : "No cards yet. Issue the first one for a customer who wants to give it."
            : isAr
              ? "لا بطاقة تطابق البحث."
              : "No card matches the search."}
        </Card>
      ) : (
        <ul className="space-y-2">
          {shown.map((card) => (
            <GiftCardRow
              key={card.id}
              card={card}
              today={today}
              lang={lang}
              onOpen={() => setOpenId(card.id)}
              money={money}
            />
          ))}
        </ul>
      )}

      <IssueGiftCardDialog
        brandId={brand.id}
        lang={lang}
        open={issuing}
        onOpenChange={setIssuing}
      />
      <GiftCardDetailsSheet
        card={open}
        brandId={brand.id}
        lang={lang}
        onClose={() => setOpenId(null)}
      />
    </div>
  );
}

function GiftCardRow({
  card,
  today,
  lang,
  onOpen,
  money,
}: {
  card: GiftCard;
  today: string;
  lang: "ar" | "en";
  onOpen: () => void;
  money: (n: number, currency?: string) => string;
}) {
  const state = cardState(card, today);
  const isAr = lang === "ar";
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border bg-card p-3 text-start hover:bg-muted/40"
      >
        <span className="min-w-0 space-y-0.5">
          <span className="block font-mono text-sm font-semibold" dir="ltr">
            {card.code}
          </span>
          <span className="block text-xs text-muted-foreground">
            {CARD_STATE_WORDS[state][lang]}
            {card.recipient_name ? ` · ${isAr ? "لـ" : "for"} ${card.recipient_name}` : ""}
          </span>
        </span>
        <span className="text-end">
          <span className="block font-mono text-sm font-semibold" dir="ltr">
            {money(Number(card.balance), card.currency)}
          </span>
          <span className="block text-xs text-muted-foreground" dir="ltr">
            / {money(Number(card.initial_amount), card.currency)}
          </span>
        </span>
      </button>
    </li>
  );
}
