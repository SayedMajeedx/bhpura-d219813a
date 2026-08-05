import { describe, expect, it } from "vitest";
import {
  getOrderCustomerContact,
  getOrderCustomerEmail,
  getOrderCustomerName,
  getOrderCustomerPhone,
} from "../src/lib/order-customer-snapshot";

describe("immutable order customer identity", () => {
  it("keeps the order-time snapshot when the linked CRM customer later changes", () => {
    const order = {
      customer_name_snapshot: "Original Buyer",
      customer_email_snapshot: "original@example.test",
      customer_phone_snapshot: "97330000001",
      customers: {
        name: "Later Checkout Buyer",
        email: "later@example.test",
        phone: "97330000001",
      },
    };

    expect(getOrderCustomerContact(order)).toEqual({
      name: "Original Buyer",
      email: "original@example.test",
      phone: "97330000001",
    });
  });

  it("prefers order-local legacy fields over a mutable CRM relation", () => {
    const order = {
      customer_name: "Legacy Order Buyer",
      customer_email: "legacy@example.test",
      customer_phone: "97330000002",
      customers: {
        name: "Changed CRM Buyer",
        email: "changed@example.test",
        phone: "97339999999",
      },
    };

    expect(getOrderCustomerName(order)).toBe("Legacy Order Buyer");
    expect(getOrderCustomerEmail(order)).toBe("legacy@example.test");
    expect(getOrderCustomerPhone(order)).toBe("97330000002");
  });

  it("falls back to the linked CRM customer only for truly legacy orders", () => {
    const order = {
      customers: {
        name: "Legacy CRM Buyer",
        email: "crm@example.test",
        phone: "97330000003",
      },
    };

    expect(getOrderCustomerContact(order)).toEqual({
      name: "Legacy CRM Buyer",
      email: "crm@example.test",
      phone: "97330000003",
    });
  });
});
