import { describe, expect, it } from "vitest";
import { getOrderWorkflow } from "../src/lib/order-workflow";
import { resolvePaymentStatus } from "../src/lib/payment-status";
import {
  calculateReturnFinancials,
  checkOrderReturnEligibility,
} from "../src/lib/returns.functions";
import { stockUnitsLabel, variantCountLabel } from "../src/lib/inventory-labels";

describe("Batch 1: Isolated Real Operations Lifecycle", () => {
  describe("1. Order Creation, Edit Draft, Cancel, and Recalculate Save", () => {
    type OrderItem = {
      id: string;
      product_id: string;
      title: string;
      variant_title?: string;
      quantity: number;
      price: number;
      cost_price: number;
    };

    type OrderRecord = {
      id: string;
      order_number: string;
      customer_id: string;
      status: string;
      fulfillment_status: string;
      payment_status: string;
      payment_method: string;
      items: OrderItem[];
      shipping_fee: number;
      discount_amount: number;
      subtotal: number;
      total: number;
      advance_paid: number;
    };

    const calculateTotals = (items: OrderItem[], shippingFee: number, discount: number) => {
      const subtotal = items.reduce((acc, item) => acc + item.price * item.quantity, 0);
      const total = Math.max(0, subtotal + shippingFee - discount);
      return { subtotal, total };
    };

    it("creates an isolated order with exact financial totals", () => {
      const initialItems: OrderItem[] = [
        {
          id: "item-1",
          product_id: "prod-1",
          title: "عباية حرير فاخرة",
          variant_title: "أسود / 54",
          quantity: 2,
          price: 35,
          cost_price: 15,
        },
        {
          id: "item-2",
          product_id: "prod-2",
          title: "شيلة مطرزة",
          quantity: 1,
          price: 10,
          cost_price: 3,
        },
      ];

      const { subtotal, total } = calculateTotals(initialItems, 2, 5); // shipping: 2, discount: 5
      expect(subtotal).toBe(80); // (35 * 2) + 10 = 80
      expect(total).toBe(77); // 80 + 2 - 5 = 77

      const serverOrder: OrderRecord = {
        id: "ord-isolated-101",
        order_number: "BQ-101",
        customer_id: "cust-iso-1",
        status: "confirmed",
        fulfillment_status: "pending",
        payment_status: "unpaid",
        payment_method: "benefit",
        items: initialItems,
        shipping_fee: 2,
        discount_amount: 5,
        subtotal,
        total,
        advance_paid: 0,
      };

      expect(serverOrder.total).toBe(77);
      expect(serverOrder.advance_paid).toBe(0);
    });

    it("canceling an edit restores exact server state without persisting draft mutations", () => {
      const originalServerOrder: OrderRecord = {
        id: "ord-isolated-102",
        order_number: "BQ-102",
        customer_id: "cust-iso-2",
        status: "confirmed",
        fulfillment_status: "pending",
        payment_status: "unpaid",
        payment_method: "cash_on_delivery",
        items: [
          {
            id: "item-1",
            product_id: "prod-1",
            title: "فستان سهرة",
            quantity: 1,
            price: 60,
            cost_price: 25,
          },
        ],
        shipping_fee: 2.5,
        discount_amount: 0,
        subtotal: 60,
        total: 62.5,
        advance_paid: 0,
      };

      // User enters edit mode -> cloned into working draft
      const workingDraft: OrderRecord = JSON.parse(JSON.stringify(originalServerOrder));

      // User modifies draft: adds another item and increases shipping
      workingDraft.items.push({
        id: "item-temp-99",
        product_id: "prod-99",
        title: "إكسسوار إضافي",
        quantity: 2,
        price: 15,
        cost_price: 5,
      });
      workingDraft.shipping_fee = 5;

      const draftCalculations = calculateTotals(
        workingDraft.items,
        workingDraft.shipping_fee,
        workingDraft.discount_amount,
      );
      workingDraft.subtotal = draftCalculations.subtotal;
      workingDraft.total = draftCalculations.total;

      expect(workingDraft.items.length).toBe(2);
      expect(workingDraft.total).toBe(95); // 60 + 30 + 5 = 95

      // User clicks CANCEL -> working draft is discarded and replaced with original
      const restoredState: OrderRecord = JSON.parse(JSON.stringify(originalServerOrder));
      expect(restoredState.items.length).toBe(1);
      expect(restoredState.total).toBe(62.5);
      expect(restoredState.shipping_fee).toBe(2.5);
    });

    it("saving an edit commits new quantities, items, and recalculates grand total", () => {
      const serverOrder: OrderRecord = {
        id: "ord-isolated-103",
        order_number: "BQ-103",
        customer_id: "cust-iso-3",
        status: "confirmed",
        fulfillment_status: "pending",
        payment_status: "unpaid",
        payment_method: "benefit",
        items: [
          {
            id: "item-1",
            product_id: "prod-1",
            title: "حقيبة جلدية",
            quantity: 1,
            price: 45,
            cost_price: 20,
          },
        ],
        shipping_fee: 2,
        discount_amount: 0,
        subtotal: 45,
        total: 47,
        advance_paid: 0,
      };

      // Edit: Change quantity from 1 to 3, apply 10 BHD promo discount
      const updatedItems = [{ ...serverOrder.items[0], quantity: 3 }];
      const discountAmount = 10;
      const { subtotal, total } = calculateTotals(
        updatedItems,
        serverOrder.shipping_fee,
        discountAmount,
      );

      const savedOrder: OrderRecord = {
        ...serverOrder,
        items: updatedItems,
        discount_amount: discountAmount,
        subtotal,
        total,
      };

      expect(savedOrder.subtotal).toBe(135); // 45 * 3 = 135
      expect(savedOrder.total).toBe(127); // 135 + 2 - 10 = 127
    });
  });

  describe("2. Fulfillment & Payment Transitions, Partial vs Full Payment & Profit Recognition", () => {
    it("handles partial advance deposit, marks payment partially_paid and tracks balance", () => {
      const order = {
        total: 100,
        advance_paid: 30,
        payment_method: "benefit",
        payment_status: "partially_paid",
        fulfillment_status: "processing",
        fulfillment_method: "delivery",
        cost_total: 40,
      };

      const workflow = getOrderWorkflow(order);
      expect(workflow.payment).toBe("partial");
      expect(workflow.outstanding).toBe(70); // 100 - 30 = 70

      // Financial profit recognition logic:
      // When partial payment is made, the order profit is "expected / unrealized"
      const totalExpectedProfit = order.total - order.cost_total; // 60 BHD
      const isRealized = order.payment_status === "paid" || workflow.outstanding === 0;
      expect(isRealized).toBe(false);
      expect(totalExpectedProfit).toBe(60);
    });

    it("recording full remaining payment transitions status to paid and recognizes profit", () => {
      const order = {
        total: 100,
        advance_paid: 100,
        payment_method: "benefit",
        payment_status: "paid",
        fulfillment_status: "ready_for_pickup",
        fulfillment_method: "pickup",
        cost_total: 40,
      };

      const workflow = getOrderWorkflow(order);
      expect(workflow.payment).toBe("paid");
      expect(workflow.outstanding).toBe(0);
      expect(workflow.nextAction).toBe("hand_over_pickup");

      // Now profit is 100% realized
      const isRealized = order.payment_status === "paid" && workflow.outstanding === 0;
      expect(isRealized).toBe(true);
    });

    it("transitions fulfillment states safely: processing -> ready -> out_for_delivery -> delivered", () => {
      const baseOrder = {
        total: 50,
        advance_paid: 50,
        payment_status: "paid",
        payment_method: "benefit",
        fulfillment_method: "delivery",
      };

      // 1. Pending / On Hold
      const step1 = getOrderWorkflow({ ...baseOrder, fulfillment_status: "on_hold" });
      expect(step1.fulfillment).toBe("on_hold");

      // 2. Packing / Processing
      const step2 = getOrderWorkflow({ ...baseOrder, fulfillment_status: "packing" });
      expect(step2.fulfillment).toBe("packing");

      // 3. Out for delivery / Shipped
      const step3 = getOrderWorkflow({ ...baseOrder, fulfillment_status: "out_for_delivery" });
      expect(step3.fulfillment).toBe("out_for_delivery");
      expect(step3.nextAction).toBe("mark_delivered");

      // 4. Delivered / Completed
      const step4 = getOrderWorkflow({ ...baseOrder, fulfillment_status: "delivered" });
      expect(step4.fulfillment).toBe("completed");
      expect(step4.nextAction).toBe("none");
    });
  });

  describe("3. Inventory, Variants, and Customer CRM Isolation", () => {
    it("calculates multi-variant stock accurately and formats labels", () => {
      const variants = [
        { id: "v1", title: "Small / Red", stock_main: 5, stock_incubator: 0, sku: "RED-S", barcode: "6291001" },
        { id: "v2", title: "Medium / Red", stock_main: 8, stock_incubator: 4, sku: "RED-M", barcode: "6291002" },
        { id: "v3", title: "Large / Red", stock_main: 0, stock_incubator: 0, sku: "RED-L", barcode: "6291003" },
      ];

      const totalStock = variants.reduce(
        (acc, v) => acc + Number(v.stock_main ?? 0) + Number(v.stock_incubator ?? 0),
        0,
      );
      expect(totalStock).toBe(17); // 5 + (8+4) + 0 = 17

      const variantCountText = variantCountLabel(variants.length, "ar");
      expect(variantCountText).toBe("3 خيارات");

      const stockBadgeText = stockUnitsLabel(totalStock, "available", "ar");
      expect(stockBadgeText).toContain("17");
      expect(stockBadgeText).toContain("وحدات");
    });

    it("isolates customer order history and lifetime spend to paid orders only", () => {
      const customerOrders = [
        { id: "o1", total: 40, payment_status: "paid", status: "completed" },
        { id: "o2", total: 25, payment_status: "unpaid", status: "cancelled" },
        { id: "o3", total: 60, payment_status: "paid", status: "delivered" },
        { id: "o4", total: 100, payment_status: "pending", status: "processing" },
      ];

      // Lifetime spend should only count paid/settled orders
      const paidOrders = customerOrders.filter((o) => o.payment_status === "paid");
      const lifetimeSpend = paidOrders.reduce((sum, o) => sum + o.total, 0);

      expect(paidOrders.length).toBe(2);
      expect(lifetimeSpend).toBe(100); // 40 + 60 = 100
    });
  });

  describe("4. Return Operations, Pro-rated Deductions, and Restocking", () => {
    it("handles returns with pro-rated discount deductions and restock calculations", () => {
      const policy = {
        id: "pol-test",
        brand_id: "b-test",
        return_window_days: 14,
        allow_partial_returns: true,
        allow_discounted_items: true,
        excluded_category_ids: [],
        excluded_product_ids: [],
        return_shipping_fee: 1.0,
        customer_shipping_fee_borne_by: "customer" as const,
        allowed_compensation_methods: ["refund_original" as const],
        require_images: false,
        auto_approve_policy: false,
        policy_terms_ar: "الشروط",
        policy_terms_en: "Terms",
        notify_on_status_change: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Return 1 item worth 30 BHD from an order of 2 items (subtotal 60, discount 12, tax 0, total 48)
      const financialResult = calculateReturnFinancials({
        items: [{ unitPrice: 30, quantity: 1 }],
        order: {
          subtotal: 60,
          discount: 12,
          taxAmount: 0,
          total: 48,
        },
        policy,
      });

      expect(financialResult.totalItemRefund).toBe(30);
      // Pro-rated discount: 12 * (30 / 60) = 6
      expect(financialResult.proRatedDiscount).toBe(6);
      // Net item refund: 30 - 6 = 24
      // Minus return shipping fee (1.0): 24 - 1.0 = 23
      expect(financialResult.netRefundAmount).toBe(23);
    });
  });
});
