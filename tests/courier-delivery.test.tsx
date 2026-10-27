import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

// A courier's view of one delivery: what it says (who, where, what, how much to collect) and
// what its buttons do at each stage, with the data layer faked.

const state = vi.hoisted(() => ({
  order: null as Record<string, unknown> | null,
  confirmPickup: vi.fn(async () => undefined),
  completeDelivery: vi.fn(async () => null as unknown),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));
// The store's order number format (use-order-number.ts): none here, so "#1042" as before.
vi.mock("../src/hooks/use-order-number", async () => {
  const { orderNumberLabel } = await import("../src/lib/order-number");
  return {
    useOrderNumber: () => (n: number | string | null | undefined, id?: string | null) =>
      orderNumberLabel(n, null, id),
    useOrderNumberFormat: () => null,
  };
});
vi.mock("@/hooks/use-order-number", async () => {
  const { orderNumberLabel } = await import("../src/lib/order-number");
  return {
    useOrderNumber: () => (n: number | string | null | undefined, id?: string | null) =>
      orderNumberLabel(n, null, id),
    useOrderNumberFormat: () => null,
  };
});

vi.mock("sonner", () => ({ toast: { success: state.toastSuccess, error: state.toastError } }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/list">{children}</a>,
  useNavigate: () => vi.fn(),
}));
const ordersData = vi.hoisted(() => ({
  ordersQueries: {
    detail: (_brand: string, id: string, scope: string) => ({
      queryKey: ["courier-test", id, scope],
      queryFn: async () => {
        if (!state.order) throw new Error("Order not found. It may have been deleted.");
        return state.order;
      },
      retry: false,
    }),
  },
  courierConfirmPickup: state.confirmPickup,
  courierCompleteDelivery: state.completeDelivery,
  invalidateOrders: vi.fn(async () => undefined),
}));
vi.mock("../src/lib/data/orders", () => ordersData);
vi.mock("@/lib/data/orders", () => ordersData);
const brandContext = vi.hoisted(() => ({
  useBrand: () => ({ id: "b1", slug: "pura", name_ar: "بيورا", name_en: "Pura" }),
}));
vi.mock("../src/lib/brand-context", () => brandContext);
vi.mock("@/lib/brand-context", () => brandContext);
const i18n = vi.hoisted(() => ({ lang: "en" as "ar" | "en" }));
vi.mock("../src/lib/i18n", () => ({ useI18n: () => ({ lang: i18n.lang }) }));
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ lang: i18n.lang }) }));

import {
  courierDelivery,
  courierNextStep,
  courierStage,
  dialablePhone,
} from "../src/features/courier-delivery/lib/courier-delivery";
import { CourierDeliveryPage } from "../src/features/courier-delivery/components/CourierDeliveryPage";
import { OsQuickActions } from "../src/components/os/os-quick-actions";

const ORDER = {
  id: "11111111-1111-4111-8111-111111111111",
  invoice_number: 1100,
  status: "confirmed",
  fulfillment_status: "ASSIGNED",
  payment_status: "partially_paid",
  payment_method: "benefit",
  total: 62,
  advance_paid: 30,
  currency: "BHD",
  notes: "Call before coming",
  delivery_notes: null,
  customer_name_snapshot: "Sayed Majeed",
  customer_phone_snapshot: "39955508",
  shipping_address: {
    region: "Riffa",
    block: "905",
    road: "512",
    house: "14",
    flat: "2",
    delivery_notes: "Side door",
    latitude: 26.13,
    longitude: 50.55,
  },
  order_items: [
    { id: "i1", description: "Abaya | Sahab", quantity: 2, selected_variant: { color: "Black" } },
    { id: "i2", description: "Scarf", quantity: 1, selected_variant: { size: "Standard" } },
  ],
};

function show(order: Record<string, unknown> | null = ORDER, lang: "ar" | "en" = "en") {
  state.order = order;
  i18n.lang = lang;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CourierDeliveryPage orderId={ORDER.id} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  state.confirmPickup.mockClear();
  state.completeDelivery.mockClear();
  state.completeDelivery.mockResolvedValue(null);
  state.toastSuccess.mockClear();
  state.toastError.mockClear();
});

describe("what a delivery says", () => {
  it("collects only what is still owed, and nothing on a paid order", () => {
    expect(courierDelivery(ORDER, "en").toCollect).toBe(32);
    expect(courierDelivery({ ...ORDER, payment_status: "paid" }, "en").toCollect).toBe(0);
    expect(courierDelivery({ ...ORDER, advance_paid: 0 }, "en").toCollect).toBe(62);
    expect(courierDelivery({ ...ORDER, total: 53.6, advance_paid: 26.8 }, "en").toCollect).toBe(
      26.8,
    );
  });

  it("writes the address in the courier's language and gives a map link to the pin", () => {
    const en = courierDelivery(ORDER, "en");
    expect(en.addressLines).toEqual(["Riffa", "Block 905, Road 512, Building 14", "Flat 2"]);
    expect(en.addressNote).toBe("Side door");
    expect(en.mapsUrl).toBe("https://www.google.com/maps/search/?api=1&query=26.13,50.55");
    expect(courierDelivery(ORDER, "ar").addressLines[1]).toBe("مجمع 905، طريق 512، مبنى 14");
  });

  it("finds the street by its text when there is no pin, and admits when there is no address", () => {
    const noPin = { ...ORDER.shipping_address, latitude: null, longitude: null };
    expect(courierDelivery({ ...ORDER, shipping_address: noPin }, "en").mapsUrl).toContain(
      encodeURIComponent("Riffa, Block 905"),
    );
    const none = courierDelivery(
      { ...ORDER, shipping_address: null, delivery_address_snapshot: { shipping_zone: "Local" } },
      "en",
    );
    expect(none.addressLines).toEqual([]);
    expect(none.mapsUrl).toBeNull();
  });

  it("lists what is in the parcel without the placeholder size", () => {
    const delivery = courierDelivery(ORDER, "en");
    expect(delivery.pieces).toBe(3);
    expect(delivery.items.map((i) => [i.title, i.quantity, i.detail])).toEqual([
      ["Abaya | Sahab", 2, "Black"],
      ["Scarf", 1, ""],
    ]);
  });

  it("makes a local number dialable", () => {
    expect(dialablePhone("39955508")).toBe("97339955508");
    expect(dialablePhone("+973 3995 5508")).toBe("97339955508");
    expect(dialablePhone("0097339955508")).toBe("97339955508");
    expect(dialablePhone("123")).toBeNull();
    expect(dialablePhone(null)).toBeNull();
  });

  it("knows the stage and the one next step", () => {
    expect(courierStage({ fulfillment_status: "ASSIGNED" })).toBe("pick_up");
    expect(courierStage({ fulfillment_status: "SHIPPED" })).toBe("on_the_way");
    expect(courierStage({ fulfillment_status: "OUT_FOR_DELIVERY" })).toBe("on_the_way");
    expect(courierStage({ fulfillment_status: "COMPLETED" })).toBe("delivered");
    expect(courierStage({ status: "cancelled", fulfillment_status: "ASSIGNED" })).toBe("cancelled");
    expect(courierNextStep("pick_up")).toBe("confirm_pickup");
    expect(courierNextStep("on_the_way")).toBe("deliver");
    expect(courierNextStep("delivered")).toBeNull();
    expect(courierNextStep("cancelled")).toBeNull();
  });
});

describe("the courier's page", () => {
  it("shows the delivery instead of loading for ever", async () => {
    show();
    expect(await screen.findByText("Order #1100")).toBeTruthy();
    expect(screen.getByText("Sayed Majeed")).toBeTruthy();
    expect(screen.getByText("BHD 32.000")).toBeTruthy();
    expect(screen.getByText("Block 905, Road 512, Building 14")).toBeTruthy();
    expect(screen.getByText("Side door")).toBeTruthy();
    expect(screen.getByText("Call before coming")).toBeTruthy();
    expect(screen.getByText("Abaya | Sahab")).toBeTruthy();
  });

  it("lets the courier call, message and navigate", async () => {
    show();
    const call = await screen.findByRole("link", { name: "Call" });
    expect(call.getAttribute("href")).toBe("tel:+97339955508");
    const whatsapp = screen.getByRole("link", { name: "WhatsApp" }).getAttribute("href") ?? "";
    expect(whatsapp.startsWith("https://wa.me/97339955508?text=")).toBe(true);
    expect(decodeURIComponent(whatsapp)).toContain("order #1100 is on its way");
    expect(screen.getByRole("link", { name: "Open in Maps" }).getAttribute("href")).toContain(
      "query=26.13,50.55",
    );
  });

  it("first step: the courier takes the parcel", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: "I have the parcel, on my way" }));
    await waitFor(() => expect(state.confirmPickup).toHaveBeenCalledWith(ORDER.id, "en"));
    expect(state.completeDelivery).not.toHaveBeenCalled();
  });

  it("second step: collects what is owed and records the delivery", async () => {
    show({ ...ORDER, fulfillment_status: "SHIPPED" });
    fireEvent.click(await screen.findByRole("button", { name: "Collected and delivered" }));
    const amount = screen.getByLabelText("Amount received (BHD)") as HTMLInputElement;
    expect(amount.value).toBe("32.000");
    fireEvent.change(screen.getByLabelText("Note (optional)"), {
      target: { value: " at the door " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm delivery" }));
    await waitFor(() =>
      expect(state.completeDelivery).toHaveBeenCalledWith(ORDER.id, 32, "at the door"),
    );
  });

  it("warns when the amount received differs, and refuses an amount that is not a number", async () => {
    show({ ...ORDER, fulfillment_status: "SHIPPED" });
    fireEvent.click(await screen.findByRole("button", { name: "Collected and delivered" }));
    const amount = screen.getByLabelText("Amount received (BHD)");
    fireEvent.change(amount, { target: { value: "30" } });
    expect(screen.getByText(/differs from the amount due/)).toBeTruthy();
    fireEvent.change(amount, { target: { value: "abc" } });
    expect(
      (screen.getByRole("button", { name: "Confirm delivery" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("a paid order is handed over with nothing to collect", async () => {
    show({ ...ORDER, fulfillment_status: "SHIPPED", payment_status: "paid", advance_paid: 62 });
    expect(await screen.findByText("Paid in full, collect nothing")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delivered" }));
    expect(screen.queryByLabelText(/Amount received/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Confirm delivery" }));
    await waitFor(() => expect(state.completeDelivery).toHaveBeenCalledWith(ORDER.id, 0, null));
  });

  it("offers nothing to press once delivered, or on a cancelled order", async () => {
    const { unmount } = show({ ...ORDER, fulfillment_status: "COMPLETED", payment_status: "paid" });
    expect(await screen.findByText("This order is delivered. Thank you.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /parcel|delivered/i })).toBeNull();
    unmount();
    show({ ...ORDER, status: "cancelled" });
    expect(await screen.findByText("This order is cancelled. Do not deliver it.")).toBeTruthy();
  });

  it("says so when the order is not the courier's, instead of a blank page", async () => {
    show(null);
    expect(await screen.findByText("This order is not one of your deliveries")).toBeTruthy();
  });

  it("speaks Arabic", async () => {
    show(ORDER, "ar");
    expect(await screen.findByText("طلب #1100")).toBeTruthy();
    expect(screen.getByRole("button", { name: "استلمت الطلب، أنا في الطريق" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "اتصال" })).toBeTruthy();
  });
});

describe("the office's New button", () => {
  it("is shown to staff and not to a courier", () => {
    const { unmount } = render(<OsQuickActions slug="pura" lang="en" />);
    expect(screen.getAllByRole("button").length).toBeGreaterThan(0);
    unmount();
    const { container } = render(<OsQuickActions slug="pura" lang="en" isCourier />);
    expect(container.innerHTML).toBe("");
  });
});
