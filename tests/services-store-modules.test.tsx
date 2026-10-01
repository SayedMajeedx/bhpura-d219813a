import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ItemKindPicker } from "../src/features/inventory/components/ItemKindPicker";
import { placeOrderFailure } from "../src/features/checkout/lib/place-order";
import { soldOnlyByBooking } from "../src/lib/bookings/service";
import { getAdminNavItems } from "../src/config/admin-navigation";
import { inventoryScopeTabs } from "../src/features/inventory/lib/inventory-scope-tabs";
import { resolveStoreModules } from "../src/lib/store-profile";

// Services vertical, step S1: a services store was shown a shop's stock,
// incubators, packaging and returns. Those are modules now, off for services.

const navOptions = {
  activeSlug: "aurora",
  isCourier: false,
  isAdmin: true,
  hasPermission: () => true,
  t: (key: string) => key,
  lang: "ar" as const,
};

const counts = { all: 4, attention: 1, active: 3, inactive: 1, low: 1, out: 1, featured: 0 };

describe("a services store's modules", () => {
  it("leave out stock, incubators, packaging, shipping and returns", () => {
    const modules = resolveStoreModules({ store_vertical: "services" });
    expect(modules).toMatchObject({
      bookings: true,
      stock: false,
      incubators: false,
      packaging: false,
      shipping: false,
      returns: false,
    });
  });

  it("keep them on for a shop, and let a store override its vertical", () => {
    expect(resolveStoreModules({ store_vertical: "fashion" })).toMatchObject({
      stock: true,
      incubators: true,
      packaging: true,
      shipping: true,
      returns: true,
    });
    expect(
      resolveStoreModules({ store_vertical: "services", store_modules: { stock: true } }).stock,
    ).toBe(true);
    expect(resolveStoreModules({ store_vertical: "general" }).stock).toBe(true);
  });
});

describe("the admin menu", () => {
  const ids = (vertical: string) =>
    getAdminNavItems({
      ...navOptions,
      storeModules: resolveStoreModules({ store_vertical: vertical }),
    }).map((item) => item.id);

  it("has no incubators or returns for a services store, but has bookings", () => {
    const services = ids("services");
    expect(services).not.toContain("incubators");
    expect(services).not.toContain("returns");
    expect(services).toContain("bookings");
    expect(services).toContain("inventory");
  });

  it("keeps them for a shop", () => {
    const fashion = ids("fashion");
    expect(fashion).toContain("incubators");
    expect(fashion).toContain("returns");
    expect(fashion).not.toContain("bookings");
  });
});

describe("the inventory tabs", () => {
  it("drop the stock tabs for a store that does not count stock", () => {
    const withStock = inventoryScopeTabs(counts).map((tab) => tab.id);
    expect(withStock).toEqual(["all", "attention", "active", "inactive", "low", "out", "featured"]);
    const without = inventoryScopeTabs(counts, { tracksStock: false }).map((tab) => tab.id);
    expect(without).toEqual(["all", "active", "inactive", "featured"]);
  });
});

describe("a service on the storefront", () => {
  it("is sold only with a booking in a bookings store", () => {
    expect(soldOnlyByBooking({ item_kind: "service" }, { bookings: true })).toBe(true);
    expect(soldOnlyByBooking({ item_kind: "product" }, { bookings: true })).toBe(false);
    expect(soldOnlyByBooking({ item_kind: "service" }, { bookings: false })).toBe(false);
    expect(soldOnlyByBooking({}, { bookings: true })).toBe(false);
    expect(soldOnlyByBooking(null, null)).toBe(false);
  });

  it("explains a refused order with an unbooked service", () => {
    const ar = (arText: string) => arText;
    const en = (_ar: string, enText: string) => enText;
    expect(placeOrderFailure("SERVICE_NEEDS_BOOKING", ar).message).toMatch(/تُحجز بموعد/);
    expect(placeOrderFailure("SERVICE_NEEDS_BOOKING", en).message).toMatch(/booked for a date/);
  });
});

describe("the item type in a bookings store's editor", () => {
  it("shows which kind is chosen and switches", () => {
    const onChange = vi.fn();
    render(<ItemKindPicker value="service" onChange={onChange} isAr />);
    const service = screen.getByRole("button", { name: /خدمة/ });
    const product = screen.getByRole("button", { name: /منتج/ });
    expect(service.getAttribute("aria-pressed")).toBe("true");
    expect(product.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(product);
    expect(onChange).toHaveBeenCalledWith("product");
  });
});
