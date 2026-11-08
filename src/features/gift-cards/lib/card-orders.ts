import type { GiftCard, GiftCardPurchase } from "@/lib/data/gift-cards";
import { cardState, type CardState } from "./gift-cards";
import { codesToSend, waitingTransfers } from "./online-sales";

/**
 * Gift cards ordered on the store, as the page's Orders tab reads them: a reference to quote, the
 * groups they fall in, what each still needs from a person, and its record. A card is its own
 * purchase and never an order (no VAT, stock or points), so it keeps its own list.
 */

export type OrderGroup = "todo" | "done" | "unfinished";
export type OrderFilter = OrderGroup | "all";
export const ORDER_FILTERS: readonly OrderFilter[] = ["todo", "done", "unfinished", "all"];

export const ORDER_FILTER_WORDS: Record<OrderFilter, { ar: string; en: string }> = {
  todo: { ar: "بحاجة لإجراء", en: "To do" },
  done: { ar: "مكتملة", en: "Completed" },
  unfinished: { ar: "لم تكتمل", en: "Not completed" },
  all: { ar: "الكل", en: "All" },
};

/** A purchase has no number of its own: the start of its id, as staff can say it to a buyer. */
export function orderReference(purchase: Pick<GiftCardPurchase, "id">): string {
  return `GC-${purchase.id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

/** What the store must do for this order, or null when nothing waits on it. */
export type OrderStep = "check_transfer" | "send_code" | "print_card" | "deliver_card";

/** A paid card the store prints: still to print, then still to deliver (null once delivered). */
export function printStep(purchase: GiftCardPurchase): "print_card" | "deliver_card" | null {
  if (!purchase.print_by_store || purchase.status !== "paid" || purchase.print_delivered_at) {
    return null;
  }
  return purchase.printed_at ? "deliver_card" : "print_card";
}

export function orderStep(purchase: GiftCardPurchase): OrderStep | null {
  if (waitingTransfers([purchase]).length > 0) return "check_transfer";
  if (codesToSend([purchase]).length > 0) return "send_code";
  return printStep(purchase);
}

export const ORDER_STEP_WORDS: Record<OrderStep, { ar: string; en: string }> = {
  check_transfer: { ar: "تحقق من التحويل", en: "Check the transfer" },
  send_code: { ar: "أرسل الرمز على واتساب", en: "Send the code on WhatsApp" },
  print_card: { ar: "اطبع البطاقة", en: "Print the card" },
  deliver_card: { ar: "وصّل البطاقة المطبوعة", en: "Deliver the printed card" },
};

/** What the buyer paid: the card's value, plus the store's fee when it prints the card. */
export function orderTotal(purchase: Pick<GiftCardPurchase, "amount" | "print_fee">): number {
  return Math.round((Number(purchase.amount) + Number(purchase.print_fee ?? 0)) * 1000) / 1000;
}

export function orderGroup(purchase: GiftCardPurchase): OrderGroup {
  if (orderStep(purchase)) return "todo";
  return purchase.status === "paid" ? "done" : "unfinished";
}

export function ordersInFilter(
  purchases: readonly GiftCardPurchase[],
  filter: OrderFilter,
): GiftCardPurchase[] {
  if (filter === "all") return [...purchases];
  const shown = purchases.filter((purchase) => orderGroup(purchase) === filter);
  // What waits longest comes first; the rest as they arrived, the newest first.
  return filter === "todo" ? shown.sort((a, b) => a.created_at.localeCompare(b.created_at)) : shown;
}

export function orderCounts(purchases: readonly GiftCardPurchase[]): Record<OrderFilter, number> {
  const counts: Record<OrderFilter, number> = {
    todo: 0,
    done: 0,
    unfinished: 0,
    all: purchases.length,
  };
  for (const purchase of purchases) counts[orderGroup(purchase)] += 1;
  return counts;
}

/** The orders a search finds: by reference, buyer, phone, email, recipient or card code. */
export function searchOrders(
  purchases: readonly GiftCardPurchase[],
  term: string,
): GiftCardPurchase[] {
  const raw = term.trim().toLowerCase();
  if (!raw) return [...purchases];
  const compact = raw.replace(/[^a-z0-9]/g, "");
  const digits = raw.replace(/\D/g, "");
  return purchases.filter((purchase) => {
    const named = [
      purchase.buyer_name,
      purchase.buyer_email,
      purchase.recipient_name,
      orderReference(purchase),
    ].some((text) =>
      String(text ?? "")
        .toLowerCase()
        .includes(raw),
    );
    if (named) return true;
    if (digits.length >= 4 && String(purchase.buyer_phone ?? "").includes(digits)) return true;
    const code = purchase.gift_cards?.code?.toLowerCase().replace(/-/g, "") ?? "";
    return compact.length >= 3 && code.includes(compact);
  });
}

export const PAYMENT_WORDS: Record<string, { ar: string; en: string }> = {
  benefit: { ar: "تحويل BenefitPay", en: "BenefitPay transfer" },
  card: { ar: "بطاقة", en: "Card" },
};

export function paymentWords(method: string | null | undefined, lang: "ar" | "en"): string {
  return PAYMENT_WORDS[method ?? ""]?.[lang] ?? method ?? "";
}

/** The steps an order has been through, in order, from what its row records. */
export type OrderMoment = { key: string; at: string; ar: string; en: string };

export function orderTimeline(purchase: GiftCardPurchase): OrderMoment[] {
  const moments: OrderMoment[] = [
    { key: "placed", at: purchase.created_at, ar: "طُلبت البطاقة", en: "Card ordered" },
  ];
  if (purchase.paid_at) {
    moments.push({ key: "paid", at: purchase.paid_at, ar: "دُفعت وصدرت", en: "Paid and issued" });
  }
  if (purchase.code_sent_at) {
    moments.push({
      key: "sent",
      at: purchase.code_sent_at,
      ar: "أُرسل الرمز على واتساب",
      en: "Code sent on WhatsApp",
    });
  }
  if (purchase.printed_at) {
    moments.push({
      key: "printed",
      at: purchase.printed_at,
      ar: "طُبعت البطاقة",
      en: "Card printed",
    });
  }
  if (purchase.print_delivered_at) {
    moments.push({
      key: "delivered",
      at: purchase.print_delivered_at,
      ar: "وصلت البطاقة المطبوعة",
      en: "Printed card delivered",
    });
  }
  if (purchase.cancelled_at) {
    moments.push({ key: "cancelled", at: purchase.cancelled_at, ar: "أُلغيت", en: "Cancelled" });
  }
  return moments.sort((a, b) => a.at.localeCompare(b.at));
}

/** How the buyer's email stands, from the outbox the server reads (`getGiftCardOrderRecord`). */
export type EmailState = "sent" | "waiting" | "failed" | "no_mailbox" | "none";

export const EMAIL_STATE_WORDS: Record<EmailState, { ar: string; en: string }> = {
  sent: { ar: "أُرسل الرمز بالبريد", en: "Code emailed" },
  waiting: { ar: "البريد في الانتظار", en: "Email is waiting to go" },
  failed: { ar: "تعذّر إرسال البريد", en: "The email could not be sent" },
  no_mailbox: {
    ar: "لم يُرسل البريد: بريد المتجر غير مربوط",
    en: "Not emailed: the store's mailbox is not set up",
  },
  none: { ar: "لا بريد مسجّل", en: "No email recorded" },
};

/** The email of a paid order's outbox event, as staff should read it. */
export function emailState(
  event: { status: string; customer_done: boolean; last_error: string | null } | null | undefined,
  hasMailbox: boolean,
): EmailState {
  if (!hasMailbox) return "no_mailbox";
  if (!event) return "none";
  if (event.customer_done) return "sent";
  return event.status === "failed" || event.last_error ? "failed" : "waiting";
}

/** The Cards tab's filters: every state a card can be in, the usable ones first. */
export type CardFilter = CardState | "all";
export const CARD_FILTERS: readonly CardFilter[] = ["active", "used", "expired", "voided", "all"];

export function cardsInFilter(
  cards: readonly GiftCard[],
  filter: CardFilter,
  today: string,
): GiftCard[] {
  return filter === "all" ? [...cards] : cards.filter((card) => cardState(card, today) === filter);
}

export function cardCounts(cards: readonly GiftCard[], today: string): Record<CardFilter, number> {
  const counts: Record<CardFilter, number> = {
    active: 0,
    used: 0,
    expired: 0,
    voided: 0,
    all: cards.length,
  };
  for (const card of cards) counts[cardState(card, today)] += 1;
  return counts;
}

/** The page's three parts, kept in the address so a link or a refresh returns to the same one. */
export type PageTab = "orders" | "cards" | "settings";

export type PageView = { tab: PageTab; orderId: string | null };

export function readPageView(search: string): PageView {
  const params = new URLSearchParams(search);
  const tab = params.get("tab");
  return {
    tab: tab === "cards" || tab === "settings" ? tab : "orders",
    orderId: params.get("order"),
  };
}

export function pageViewSearch(search: string, view: PageView): string {
  const params = new URLSearchParams(search);
  if (view.tab === "orders") params.delete("tab");
  else params.set("tab", view.tab);
  if (view.orderId) params.set("order", view.orderId);
  else params.delete("order");
  const text = params.toString();
  return text ? `?${text}` : "";
}
