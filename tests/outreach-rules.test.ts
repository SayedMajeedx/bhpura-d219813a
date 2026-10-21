import { describe, expect, it } from "vitest";
import {
  guessLang,
  outreachContact,
  outreachToday,
  type OutreachCustomer,
  type OutreachInput,
  type OutreachOrder,
} from "../src/features/outreach/lib/outreach";
import {
  arCount,
  outreachMessage,
  outreachWhy,
  type MessageContext,
} from "../src/features/outreach/lib/outreach-messages";

// Who is worth a message today: the store's knowledge of its clients, read from what Boutq
// already holds. A suggestion needs the client's consent; what they asked for does not.

const NOW = Date.parse("2026-10-20T09:00:00Z");
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();
const hoursAgo = (n: number) => new Date(NOW - n * 3_600_000).toISOString();

const customer = (id: string, over: Partial<OutreachCustomer> = {}): OutreachCustomer => ({
  id,
  name: "فاطمة علي",
  phone: `3${id.padStart(7, "0")}`,
  marketing_consent: true,
  opted_out_at: null,
  ...over,
});

const order = (id: string, customerId: string, at: string, over: Partial<OutreachOrder> = {}) => ({
  id,
  customer_id: customerId,
  created_at: at,
  status: "completed",
  delivered_at: null,
  completed_at: null,
  items: [{ product_id: "old-abaya", variant_id: "v-old", size: "56" }],
  ...over,
});

const input = (over: Partial<OutreachInput> = {}): OutreachInput => ({
  now: NOW,
  customers: [],
  orders: [],
  carts: [],
  requests: [],
  products: [],
  variants: [],
  log: [],
  ...over,
});

const newAbaya = {
  id: "new-abaya",
  name: "Abaya Sahab",
  name_ar: "عباية سحاب",
  is_active: true,
  created_at: daysAgo(3),
};

describe("the client's number and language", () => {
  it("is a WhatsApp number with the country code, or nothing", () => {
    expect(outreachContact("3399 0016")).toBe("97333990016");
    expect(outreachContact("+966 512345678")).toBe("966512345678");
    expect(outreachContact("123")).toBe("");
  });

  it("is guessed from the script of the name", () => {
    expect(guessLang("فاطمة")).toBe("ar");
    expect(guessLang("Fatima")).toBe("en");
    expect(guessLang(null)).toBe("ar");
  });
});

describe("what the client asked for", () => {
  it("offers a size that is back to whoever asked on WhatsApp, in their language", () => {
    const { today } = outreachToday(
      input({
        products: [{ id: "p1", name: "Abaya", is_active: true }],
        variants: [{ id: "v1", product_id: "p1", size: "54", stock_main: 2 }],
        requests: [
          {
            id: "r1",
            product_id: "p1",
            variant_id: "v1",
            channel: "whatsapp",
            contact: "33990016",
            lang: "en",
            notified_at: null,
            created_at: daysAgo(5),
          },
          {
            id: "r2",
            product_id: "p1",
            variant_id: "v1",
            channel: "email",
            contact: "a@b.c",
            lang: "ar",
            notified_at: null,
            created_at: daysAgo(5),
          },
        ],
      }),
    );
    expect(today.map((card) => card.key)).toEqual(["back_in_stock:r1"]);
    expect(today[0].lang).toBe("en");
  });

  it("offers a cart left an hour to three days ago, only with the client's agreement", () => {
    const cart = (id: string, at: string, consent: boolean) => ({
      id,
      customer_id: null,
      guest_name: "Noor",
      guest_phone: `3300000${id}`,
      marketing_consent: consent,
      last_activity_at: at,
      recovered_at: null,
      status: "abandoned",
      cart_items: [{ title: "فستان", size: "52", quantity: 1 }],
      subtotal: 45,
      currency: "BHD",
      recovery_token: `t${id}`,
    });
    const { today } = outreachToday(
      input({
        carts: [
          cart("1", hoursAgo(5), true),
          cart("2", hoursAgo(5), false), // no agreement
          cart("3", daysAgo(4), true), // too old
          cart("4", new Date(NOW - 10 * 60_000).toISOString(), true), // still shopping
        ],
      }),
    );
    expect(today.map((card) => card.key)).toEqual(["cart:1"]);
  });

  it("never offers a cart the shopper emptied, ordered or asked to stop", () => {
    const cart = (id: string, status: string) => ({
      id,
      customer_id: null,
      guest_name: "Noor",
      guest_phone: `3300001${id}`,
      marketing_consent: true,
      last_activity_at: hoursAgo(5),
      recovered_at: null,
      status,
      cart_items: [{ title: "فستان", size: "52", quantity: 1 }],
      subtotal: 45,
      currency: "BHD",
      recovery_token: `t${id}`,
    });
    const { today } = outreachToday(
      input({
        carts: [
          cart("1", "abandoned"),
          cart("2", "expired"), // emptied by the shopper: the items are kept for history only
          cart("3", "converted"), // went straight to checkout
          cart("4", "unsubscribed"),
          cart("5", "recovering"),
        ],
      }),
    );
    expect(today.map((card) => card.key).sort()).toEqual(["cart:1", "cart:5"]);
  });

  it("follows a first order up three to ten days after it was handed over", () => {
    const { today } = outreachToday(
      input({
        customers: [customer("1", { marketing_consent: false }), customer("2"), customer("3")],
        orders: [
          order("a", "1", daysAgo(10), { delivered_at: daysAgo(5) }),
          order("b", "2", daysAgo(20), { delivered_at: daysAgo(15) }), // too long ago
          order("c", "3", daysAgo(40)),
          order("d", "3", daysAgo(6), { delivered_at: daysAgo(4) }), // not their first
        ],
      }),
    );
    // Aftercare needs no consent: customer 1 never agreed and is still offered.
    expect(today.map((card) => card.key)).toEqual(["aftercare:a"]);
  });
});

describe("suggestions", () => {
  const variants = [
    { id: "nv1", product_id: "new-abaya", size: "56", stock_main: 1 },
    { id: "nv2", product_id: "new-abaya", size: "58", stock_main: 3 },
  ];

  it("names new pieces in the size the client buys, and never one they already bought", () => {
    const { today } = outreachToday(
      input({
        customers: [customer("1")],
        orders: [order("a", "1", daysAgo(20))],
        products: [newAbaya, { ...newAbaya, id: "old-abaya", created_at: daysAgo(2) }],
        variants: [
          ...variants,
          { id: "v-old", product_id: "old-abaya", size: "56", stock_main: 5 },
        ],
      }),
    );
    expect(today).toHaveLength(1);
    expect(today[0].detail).toMatchObject({ reason: "new_in_size", size: "56" });
    expect(
      today[0].detail.reason === "new_in_size" && today[0].detail.products.map((p) => p.id),
    ).toEqual(["new-abaya"]);
  });

  it("are never offered without consent, or to a client who opted out", () => {
    const base = {
      orders: [order("a", "1", daysAgo(20))],
      products: [newAbaya],
      variants,
    };
    expect(
      outreachToday(input({ ...base, customers: [customer("1", { marketing_consent: false })] }))
        .today,
    ).toEqual([]);
    expect(
      outreachToday(input({ ...base, customers: [customer("1", { opted_out_at: daysAgo(1) })] }))
        .today,
    ).toEqual([]);
  });

  it("call a client back past their own usual gap, not a month after a weekly buyer", () => {
    const monthly = [daysAgo(130), daysAgo(100), daysAgo(70)].map((at, i) =>
      order(`m${i}`, "1", at),
    );
    const { today } = outreachToday(input({ customers: [customer("1")], orders: monthly }));
    expect(today[0].detail).toMatchObject({ reason: "due_back", usualGapDays: 30, orders: 3 });

    const recent = [daysAgo(60), daysAgo(30), daysAgo(20)].map((at, i) => order(`r${i}`, "2", at));
    expect(outreachToday(input({ customers: [customer("2")], orders: recent })).today).toEqual([]);
  });

  it("leave cancelled orders out of a client's history", () => {
    const orders = [
      order("a", "1", daysAgo(130)),
      order("b", "1", daysAgo(70), { status: "cancelled" }),
    ];
    // One real order: neither due back (needs two) nor a first-order follow-up (no hand-over).
    expect(outreachToday(input({ customers: [customer("1")], orders })).today).toEqual([]);
  });
});

describe("one message a week", () => {
  const waiting = {
    customers: [customer("1")],
    orders: [order("a", "1", daysAgo(10), { delivered_at: daysAgo(5) })],
  };

  it("offers one card per client, the reason they asked for first", () => {
    const { today } = outreachToday(
      input({
        ...waiting,
        products: [{ id: "p1", name: "Abaya", is_active: true }],
        variants: [{ id: "v1", product_id: "p1", size: "56", stock_main: 1 }],
        requests: [
          {
            id: "r1",
            product_id: "p1",
            variant_id: "v1",
            channel: "whatsapp",
            contact: customer("1").phone as string,
            lang: "ar",
            notified_at: null,
            created_at: daysAgo(2),
          },
        ],
      }),
    );
    expect(today.map((card) => card.reason)).toEqual(["back_in_stock"]);
    expect(today[0].customerId).toBe("1");
  });

  it("is quiet for a week after a message, and a reason put away stays away a week", () => {
    const contact = outreachContact(customer("1").phone);
    const sent = outreachToday(
      input({ ...waiting, log: [{ contact, reason: "cart", kind: "sent", at: daysAgo(2) }] }),
    );
    expect(sent.today).toEqual([]);
    const skipped = outreachToday(
      input({
        ...waiting,
        log: [{ contact, reason: "aftercare", kind: "skipped", at: daysAgo(6) }],
      }),
    );
    expect(skipped.today).toEqual([]);
    const later = outreachToday(
      input({
        ...waiting,
        log: [{ contact, reason: "aftercare", kind: "skipped", at: daysAgo(8) }],
      }),
    );
    expect(later.today.map((card) => card.reason)).toEqual(["aftercare"]);
  });
});

describe("asking for consent", () => {
  it("lists past buyers of the last year who never said yes or no, once every three months", () => {
    const customers = [
      customer("1", { marketing_consent: null }),
      customer("2", { marketing_consent: true }),
      customer("3", { marketing_consent: null, opted_out_at: daysAgo(30) }),
      customer("4", { marketing_consent: null }),
      customer("5", { marketing_consent: null }),
    ];
    const orders = ["1", "2", "3", "4", "5"].map((id) =>
      order(`o${id}`, id, daysAgo(id === "4" ? 400 : 40)),
    );
    const asked = {
      contact: outreachContact(customers[4].phone),
      reason: "ask_consent" as const,
      kind: "sent" as const,
      at: daysAgo(60),
    };
    const { askConsent } = outreachToday(input({ customers, orders, log: [asked] }));
    expect(askConsent.map((card) => card.customerId)).toEqual(["1"]);
  });
});

describe("the messages", () => {
  const ctx: MessageContext = {
    storeName: "Pura Line",
    productLink: (id) => `https://pura.boutq.store/product/${id}`,
    cartLink: (token) => `https://pura.boutq.store/checkout?recover=${token}`,
    storeLink: "https://pura.boutq.store",
    sizeLabel: (lang) => (lang === "ar" ? "المقاس" : "Size"),
    money: (amount, currency) => `${currency} ${amount.toFixed(3)}`,
    productName: (product, lang) =>
      lang === "ar" ? product.name_ar || product.name || "" : product.name || "",
  };

  const suggestion = outreachToday(
    input({
      customers: [customer("1", { name: "Fatima Ali" })],
      orders: [order("a", "1", daysAgo(20))],
      products: [newAbaya],
      variants: [{ id: "nv1", product_id: "new-abaya", size: "56", stock_main: 1 }],
    }),
  ).today[0];

  it("greet by first name, name the piece and the size, link to it, and say how to stop", () => {
    expect(suggestion.lang).toBe("en");
    expect(outreachMessage(suggestion, "en", ctx)).toBe(
      "Hi Fatima, new pieces just arrived at Pura Line in your size 56: Abaya Sahab.\n" +
        "https://pura.boutq.store/product/new-abaya\n\nReply STOP to stop these messages.",
    );
    const ar = outreachMessage(suggestion, "ar", ctx);
    expect(ar).toContain("مرحباً Fatima،");
    expect(ar).toContain("عباية سحاب");
    expect(ar).toContain("المقاس 56");
    expect(ar).toContain("لإيقاف هذه الرسائل");
  });

  it("never add the stop line to what the client asked for", () => {
    const aftercare = outreachToday(
      input({
        customers: [customer("1")],
        orders: [order("a", "1", daysAgo(10), { delivered_at: daysAgo(5) })],
      }),
    ).today[0];
    expect(outreachMessage(aftercare, "ar", ctx)).not.toContain("إيقاف");
    expect(outreachMessage(aftercare, "ar", ctx)).toContain("مرحباً فاطمة،");
  });

  it("count in Arabic as Arabic counts", () => {
    const forms = { one: "يوم", two: "يومين", few: "أيام", many: "يوماً" };
    expect(arCount(1, forms)).toBe("يوم");
    expect(arCount(2, forms)).toBe("يومين");
    expect(arCount(7, forms)).toBe("7 أيام");
    expect(arCount(30, forms)).toBe("30 يوماً");
    expect(outreachWhy(suggestion, "ar", ctx)).toBe("وصلت قطعة جديدة في المقاس 56 الذي يشتري به.");
  });
});
