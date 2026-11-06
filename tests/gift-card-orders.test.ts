import { describe, expect, it } from "vitest";
import type { GiftCard, GiftCardPurchase } from "../src/lib/data/gift-cards";
import {
  cardCounts,
  cardsInFilter,
  emailState,
  orderCounts,
  orderGroup,
  orderReference,
  orderStep,
  orderTimeline,
  ordersInFilter,
  pageViewSearch,
  readPageView,
  searchOrders,
} from "../src/features/gift-cards/lib/card-orders";

const order = (id: string, over: Partial<GiftCardPurchase> = {}) =>
  ({
    id,
    status: "paid",
    payment_method: "card",
    delivery_channel: "email",
    buyer_name: "Sara",
    buyer_phone: "+97339001122",
    buyer_email: "sara@mail.com",
    recipient_name: "Noor",
    created_at: "2026-11-01T10:00:00Z",
    paid_at: "2026-11-01T10:05:00Z",
    code_sent_at: null,
    cancelled_at: null,
    gift_cards: { code: "ABCD-EFGH-JKMN", expires_on: null },
    ...over,
  }) as unknown as GiftCardPurchase;

const transfer = (id: string, created_at = "2026-11-01T10:00:00Z") =>
  order(id, { status: "pending", payment_method: "benefit", gift_cards: null, created_at });
const whatsapp = (id: string) => order(id, { delivery_channel: "whatsapp" });

describe("an order's reference", () => {
  it("is short, and the same every time", () => {
    expect(orderReference({ id: "9f1c2d3e-aaaa-4000-8000-000000000001" })).toBe("GC-9F1C2D");
  });
});

describe("what an order needs", () => {
  it("is checking a transfer, sending a code, or nothing", () => {
    expect(orderStep(transfer("a"))).toBe("check_transfer");
    expect(orderStep(whatsapp("b"))).toBe("send_code");
    expect(orderStep(order("c"))).toBeNull();
    expect(orderStep(order("d", { code_sent_at: "x", delivery_channel: "whatsapp" }))).toBeNull();
  });

  it("puts each order in one group", () => {
    expect(orderGroup(transfer("a"))).toBe("todo");
    expect(orderGroup(whatsapp("b"))).toBe("todo");
    expect(orderGroup(order("c"))).toBe("done");
    expect(orderGroup(order("d", { status: "cancelled", gift_cards: null }))).toBe("unfinished");
    expect(orderGroup(order("e", { status: "expired", gift_cards: null }))).toBe("unfinished");
    expect(orderGroup(order("f", { status: "pending", gift_cards: null }))).toBe("unfinished");
  });

  it("counts every group and shows what waits longest first", () => {
    const list = [transfer("new", "2026-11-03T10:00:00Z"), transfer("old"), order("done")];
    expect(orderCounts(list)).toEqual({ todo: 2, done: 1, unfinished: 0, all: 3 });
    expect(ordersInFilter(list, "todo").map((o) => o.id)).toEqual(["old", "new"]);
    expect(ordersInFilter(list, "all").map((o) => o.id)).toEqual(["new", "old", "done"]);
  });
});

describe("searching orders", () => {
  const list = [order("9f1c2d3e-aaaa"), order("b", { buyer_name: "Mona", gift_cards: null })];

  it("finds a reference, a name, a phone, an email, a recipient and a code", () => {
    expect(searchOrders(list, "gc-9f1c")).toHaveLength(1);
    expect(searchOrders(list, "mona")).toHaveLength(1);
    expect(searchOrders(list, "39001122")).toHaveLength(2);
    expect(searchOrders(list, "sara@mail")).toHaveLength(2);
    expect(searchOrders(list, "noor")).toHaveLength(2);
    expect(searchOrders(list, "abcd efgh")).toHaveLength(1);
    expect(searchOrders(list, "nobody")).toEqual([]);
    expect(searchOrders(list, "  ")).toHaveLength(2);
  });
});

describe("an order's history", () => {
  it("is what its row recorded, in order", () => {
    const moments = orderTimeline(
      order("a", {
        delivery_channel: "whatsapp",
        code_sent_at: "2026-11-02T09:00:00Z",
      }),
    );
    expect(moments.map((moment) => moment.key)).toEqual(["placed", "paid", "sent"]);
    expect(
      orderTimeline(
        transfer("b", "2026-11-01T10:00:00Z") && {
          ...transfer("b"),
          paid_at: null,
          cancelled_at: "2026-11-02T10:00:00Z",
        },
      ).map((moment) => moment.key),
    ).toEqual(["placed", "cancelled"]);
  });
});

describe("the buyer's email", () => {
  const sent = { status: "processed", customer_done: true, last_error: null };

  it("reads as sent only when it went through a mailbox", () => {
    expect(emailState(sent, true)).toBe("sent");
    // The outbox marks an email skipped as finished: without a mailbox nothing was sent.
    expect(emailState(sent, false)).toBe("no_mailbox");
    expect(emailState({ status: "pending", customer_done: false, last_error: null }, true)).toBe(
      "waiting",
    );
    expect(emailState({ status: "failed", customer_done: false, last_error: "x" }, true)).toBe(
      "failed",
    );
    expect(emailState(null, true)).toBe("none");
  });
});

describe("the Cards tab's filters", () => {
  const card = (over: Partial<GiftCard>) =>
    ({ status: "active", balance: 10, expires_on: null, ...over }) as GiftCard;
  const today = "2026-11-06";
  const cards = [
    card({}),
    card({ balance: 0 }),
    card({ expires_on: "2026-01-01" }),
    card({ status: "voided" }),
  ];

  it("read a card by what it can still do", () => {
    expect(cardCounts(cards, today)).toEqual({
      active: 1,
      used: 1,
      expired: 1,
      voided: 1,
      all: 4,
    });
    expect(cardsInFilter(cards, "expired", today)).toHaveLength(1);
    expect(cardsInFilter(cards, "all", today)).toHaveLength(4);
  });
});

describe("the page's address", () => {
  it("opens on the orders, and reads a part and an order", () => {
    expect(readPageView("")).toEqual({ tab: "orders", orderId: null });
    expect(readPageView("?tab=cards")).toEqual({ tab: "cards", orderId: null });
    expect(readPageView("?order=abc")).toEqual({ tab: "orders", orderId: "abc" });
    expect(readPageView("?tab=nonsense").tab).toBe("orders");
  });

  it("writes them, keeping what else is there", () => {
    expect(pageViewSearch("?x=1", { tab: "settings", orderId: null })).toBe("?x=1&tab=settings");
    expect(pageViewSearch("?tab=cards", { tab: "orders", orderId: "abc" })).toBe("?order=abc");
    expect(pageViewSearch("?order=abc", { tab: "orders", orderId: null })).toBe("");
  });
});
