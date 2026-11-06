import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SectionSkeleton } from "@/components/ui/section-skeleton";
import { formatMoney } from "@/lib/format";
import type { GiftCard } from "@/lib/data/gift-cards";
import {
  CARD_STATE_WORDS,
  ORIGIN_WORDS,
  cardOrigin,
  cardState,
  searchCards,
} from "../lib/gift-cards";
import { FilterChips } from "./FilterChips";
import { CARD_FILTERS, cardCounts, cardsInFilter, type CardFilter } from "../lib/card-orders";

/** Every card of the store, sold in person, sold online or given, by what it can still do. */
export function GiftCardCardsTab({
  cards,
  loading,
  today,
  lang,
  onOpen,
}: {
  cards: GiftCard[];
  loading: boolean;
  today: string;
  lang: "ar" | "en";
  onOpen: (cardId: string) => void;
}) {
  const isAr = lang === "ar";
  const [filter, setFilter] = useState<CardFilter>("all");
  const [search, setSearch] = useState("");
  const counts = useMemo(() => cardCounts(cards, today), [cards, today]);
  const shown = useMemo(
    () => searchCards(cardsInFilter(cards, filter, today), search),
    [cards, filter, today, search],
  );

  if (loading) return <SectionSkeleton />;
  if (cards.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        {isAr
          ? "لا بطاقات بعد. أصدر أول بطاقة لعميل يريد إهداءها."
          : "No cards yet. Issue the first one for a customer who wants to give it."}
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <FilterChips
        label={isAr ? "تصفية البطاقات" : "Filter cards"}
        options={CARD_FILTERS}
        value={filter}
        count={(option) => counts[option]}
        word={(option) =>
          option === "all" ? (isAr ? "الكل" : "All") : CARD_STATE_WORDS[option][lang]
        }
        onChange={setFilter}
      />

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

      {shown.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          {isAr ? "لا بطاقة تطابق." : "No card matches."}
        </Card>
      ) : (
        <ul className="space-y-2">
          {shown.map((card) => (
            <CardRow
              key={card.id}
              card={card}
              today={today}
              lang={lang}
              onOpen={() => onOpen(card.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function CardRow({
  card,
  today,
  lang,
  onOpen,
}: {
  card: GiftCard;
  today: string;
  lang: "ar" | "en";
  onOpen: () => void;
}) {
  const isAr = lang === "ar";
  const state = cardState(card, today);
  const person = card.recipient_name || card.purchaser_name;
  const Arrow = isAr ? ChevronLeft : ChevronRight;
  return (
    <li>
      <Button
        type="button"
        variant="ghost"
        onClick={onOpen}
        className="grid h-auto w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-xl border border-border bg-card p-3 text-start whitespace-normal hover:bg-muted/40"
      >
        <span className="min-w-0 space-y-0.5">
          <span className="block font-mono text-sm font-semibold" dir="ltr">
            {card.code}
          </span>
          <span className="block text-xs text-muted-foreground">
            {CARD_STATE_WORDS[state][lang]} · {ORIGIN_WORDS[cardOrigin(card)][lang]}
            {card.recipient_name ? ` · ${isAr ? "لـ" : "for"} ${person}` : ""}
          </span>
        </span>
        <span className="text-end">
          <span className="block font-mono text-sm font-semibold" dir="ltr">
            {formatMoney(Number(card.balance), card.currency, lang)}
          </span>
          <span className="block text-xs text-muted-foreground" dir="ltr">
            / {formatMoney(Number(card.initial_amount), card.currency, lang)}
          </span>
        </span>
        <Arrow className="size-4 text-muted-foreground" aria-hidden="true" />
      </Button>
    </li>
  );
}
