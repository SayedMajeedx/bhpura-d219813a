import { describe, expect, it } from "vitest";
import {
  orderNumberLabel,
  orderNumberQuery,
  orderNumberText,
  readOrderNumberFormat,
} from "../src/lib/order-number";
import * as emailTwin from "../supabase/functions/send-order-email/order-number";
import { cleanPrefix } from "../src/features/settings/tabs/orders/OrderNumberField";
import { workStartedMessage } from "../src/features/orders/lib/stage-messages";
import { reminderMessage } from "../src/features/advance-report/lib/advance-report";
import { reviewRequestMessage } from "../src/lib/review-reward";
import { onMyWayMessage } from "../src/features/courier-delivery/lib/courier-delivery";
import { customerOrderName } from "../src/features/supplier-orders/lib/customer-pieces";
import { filterQueueOrders } from "../src/features/orders/lib/order-queue";

const PL = { order_number_prefix: "PL-", order_number_digits: 5 };

describe("how a store writes its order numbers", () => {
  it("writes #1042 for a store that chose nothing, as before", () => {
    expect(orderNumberLabel(1042)).toBe("#1042");
    expect(orderNumberLabel(1042, null)).toBe("#1042");
    expect(orderNumberLabel("1042", { order_number_prefix: "", order_number_digits: null })).toBe(
      "#1042",
    );
    expect(orderNumberText(1042)).toBe("1042");
  });

  it("puts the prefix first and pads to the least number of digits", () => {
    expect(orderNumberLabel(1042, PL)).toBe("PL-01042");
    expect(orderNumberLabel(1042, { order_number_prefix: "INV" })).toBe("INV1042");
    expect(orderNumberLabel(7, { order_number_digits: 4 })).toBe("#0007");
    // A number longer than the digits is never cut.
    expect(orderNumberLabel(123456, PL)).toBe("PL-123456");
    expect(orderNumberText(1042, PL)).toBe("PL-01042");
    expect(orderNumberText(7, { order_number_digits: 3 })).toBe("007");
  });

  it("leaves out a prefix or digit count the column would refuse", () => {
    expect(readOrderNumberFormat({ order_number_prefix: "PL 1", order_number_digits: 9 })).toEqual({
      prefix: null,
      digits: null,
    });
    expect(
      readOrderNumberFormat({ order_number_prefix: "TOOLONG", order_number_digits: 0 }),
    ).toEqual({ prefix: null, digits: null });
    expect(
      readOrderNumberFormat({ order_number_prefix: " PL- ", order_number_digits: "5" }),
    ).toEqual({ prefix: "PL-", digits: 5 });
  });

  it("names an order with no number by the start of its id", () => {
    expect(orderNumberLabel(null, PL, "a1b2c3d4-e5f6")).toBe("#a1b2c3d4");
    expect(orderNumberLabel(undefined)).toBe("—");
  });

  it("finds an order by the number as the store writes it", () => {
    expect(orderNumberQuery("PL-01042", PL)).toBe("1042");
    expect(orderNumberQuery("pl-01042", PL)).toBe("1042");
    expect(orderNumberQuery("#1042", PL)).toBe("1042");
    expect(orderNumberQuery("1042")).toBe("1042");
    expect(orderNumberQuery("Sara")).toBe("Sara");

    const orders = [
      { id: "1", invoice_number: 1042, status: "pending" },
      { id: "2", invoice_number: 2000, status: "pending" },
    ] as never[];
    const filters = {
      paymentFilter: "all",
      fulfillmentStatusFilter: "all",
      fulfillmentMethodFilter: "all",
      gatewayFilter: "all",
      tabFilter: "all",
      includeHistorical: false,
      hasMadeToOrder: false,
      numberFormat: PL,
    } as const;
    const found = filterQueueOrders(orders, { ...filters, search: "pl-0104" } as never);
    expect(found.map((o: { id: string }) => o.id)).toEqual(["1"]);
  });

  it("keeps a typed prefix to what the column takes", () => {
    expect(cleanPrefix("PL-")).toBe("PL-");
    expect(cleanPrefix("بوتيك PL #1")).toBe("PL1");
    expect(cleanPrefix("ABCDEFGH")).toBe("ABCDEF");
    expect(cleanPrefix("  ")).toBeNull();
  });

  it("is written the same way by the order email (its own copy of the rule)", () => {
    const formats = [null, PL, { order_number_prefix: "INV" }, { order_number_digits: 6 }];
    for (const format of formats) {
      for (const number of [1, 42, 1042, 123456789, "77", null]) {
        expect(emailTwin.orderNumberLabel(number, format, "abcdef123")).toBe(
          orderNumberLabel(number, format, "abcdef123"),
        );
        expect(emailTwin.orderNumberText(number, format)).toBe(orderNumberText(number, format));
      }
    }
  });
});

describe("the messages a person sends", () => {
  it("say the number as the store writes it, and as before when it chose nothing", () => {
    const work = (numberFormat?: typeof PL) =>
      workStartedMessage({ isAr: false, brandName: "Pura", invoiceNumber: 1042, numberFormat });
    expect(work()).toContain("order #1042 from");
    expect(work(PL)).toContain("order PL-01042 from");
    expect(
      workStartedMessage({ isAr: true, brandName: "Pura", invoiceNumber: 1042, numberFormat: PL }),
    ).toContain("طلبك رقم PL-01042");

    const remind = reminderMessage({
      isAr: false,
      brandName: "Pura",
      invoiceNumber: 1042,
      numberFormat: PL,
      stage: "balance",
      balance: 5,
      currency: "BHD",
      link: "https://x",
    });
    expect(remind).toContain("on order PL-01042");

    const review = reviewRequestMessage({
      lang: "en",
      customerName: "Sara",
      brandName: "Pura",
      invoiceNumber: 1042,
      numberFormat: PL,
      reviewUrl: "https://x",
      offer: null,
    });
    expect(review).toContain("review of order PL-01042");

    expect(
      onMyWayMessage({ isAr: false, storeName: "Pura", customerName: "Sara", number: "1042" }),
    ).toContain("Your order #1042 is");
    expect(customerOrderName(1042, false, PL)).toBe("Customer piece · order PL-01042");
    expect(customerOrderName(1042, false)).toBe("Customer piece · order #1042");
  });
});
