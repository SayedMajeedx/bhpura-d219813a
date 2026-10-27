import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The orders board and the new-order sound (the owner's decisions of 2026-10-27): open orders in
// columns by stage with the list's own next-step button; a card dragged only where its next step
// takes it, the drop pressing that button; and a chime for a shopper's new order or booking, for a
// member who switched it on.

const state = vi.hoisted(() => ({
  arrival: null as null | ((table: "orders" | "bookings", row: Record<string, unknown>) => void),
  toast: vi.fn(),
}));

const ordersData = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  subscribeToArrivals: (
    _brand: string,
    onArrival: (table: "orders" | "bookings", row: Record<string, unknown>) => void,
  ) => {
    state.arrival = onArrival;
    return () => {
      state.arrival = null;
    };
  },
});
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

vi.mock("../src/lib/data/orders", (io) => ordersData(io));
vi.mock("@/lib/data/orders", (io) => ordersData(io));
vi.mock("sonner", () => ({ toast: { success: state.toast, error: state.toast } }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="#order">{children}</a>,
  useNavigate: () => vi.fn(),
}));
vi.mock("../src/lib/i18n", () => ({ useI18n: () => ({ lang: "en" }) }));
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ lang: "en" }) }));
vi.mock("../src/lib/profile-context", () => ({ useProfileOptional: () => ({ isCourier: false }) }));
vi.mock("@/lib/profile-context", () => ({ useProfileOptional: () => ({ isCourier: false }) }));

const { boardColumns, canDrop, columnAfter, columnOf } =
  await import("../src/features/orders/lib/order-board");
const { OrdersBoard } = await import("../src/features/orders/components/OrdersBoard");
const { NewOrderAlert } = await import("../src/features/orders/components/NewOrderAlert");
const sound = await import("../src/lib/new-order-sound");

const NOW = new Date("2026-10-27T10:00:00Z");
const order = (over: Record<string, unknown>) => ({
  id: String(over.id ?? "o1"),
  invoice_number: 1042,
  created_at: "2026-10-27T08:00:00Z",
  total: 32,
  currency: "BHD",
  status: "pending",
  payment_status: "paid",
  payment_method: "card",
  fulfillment_status: "pending",
  fulfillment_method: "delivery",
  advance_paid: 32,
  customer_name_snapshot: "Mariam",
  order_items: [{ description: "Abaya", quantity: 1 }],
  ...over,
});

afterEach(() => {
  localStorage.clear();
  state.toast.mockClear();
});

describe("which column an order is in", () => {
  it("follows the list's own reading of where it stands", () => {
    expect(columnOf(order({}), NOW)).toBe("to_confirm");
    expect(columnOf(order({ fulfillment_status: "packing" }), NOW)).toBe("preparing");
    expect(columnOf(order({ fulfillment_status: "ready_for_pickup" }), NOW)).toBe("ready");
    expect(columnOf(order({ fulfillment_status: "shipped" }), NOW)).toBe("on_the_way");
    expect(columnOf(order({ fulfillment_method: "appointment" }), NOW)).toBe("scheduled");
    expect(columnOf(order({ fulfillment_status: "cancelled" }), NOW)).toBeNull();
  });

  it("shows an order done today, and leaves older ones off the board", () => {
    const done = { status: "completed", fulfillment_status: "delivered" };
    expect(columnOf(order({ ...done, completed_at: "2026-10-27T09:00:00Z" }), NOW)).toBe("done");
    expect(columnOf(order({ ...done, completed_at: "2026-10-20T09:00:00Z" }), NOW)).toBeNull();
  });

  it("lets a card move only where its next step takes it", () => {
    expect(columnAfter("start_packing")).toBe("preparing");
    expect(columnAfter("validate_payment")).toBeNull();
    const fresh = order({});
    expect(canDrop(fresh, "preparing")).toBe(true);
    expect(canDrop(fresh, "on_the_way")).toBe(false);
    expect(canDrop(fresh, "to_confirm")).toBe(false);
  });

  it("shows the workshop only with made-to-order pieces, appointments only with bookings", () => {
    const ids = (opts: { madeToOrder: boolean; bookings: boolean }) =>
      boardColumns([], opts, NOW).map((c) => c.id);
    expect(ids({ madeToOrder: false, bookings: false })).toEqual([
      "to_confirm",
      "preparing",
      "ready",
      "on_the_way",
      "done",
    ]);
    expect(ids({ madeToOrder: true, bookings: true })).toContain("workshop");
    expect(ids({ madeToOrder: true, bookings: true })).toContain("scheduled");
  });
});

describe("the board", () => {
  const props = (orders: ReturnType<typeof order>[], press = vi.fn()) => ({
    orders,
    slug: "pura",
    lang: "en" as const,
    currency: "BHD",
    madeToOrder: false,
    bookings: false,
    renderAction: () => (
      <button type="button" onClick={press}>
        Start packing
      </button>
    ),
  });

  it("puts each order in its column with its button", () => {
    render(
      <OrdersBoard
        {...props([order({ id: "a" }), order({ id: "b", fulfillment_status: "packing" })])}
      />,
    );
    const toConfirm = screen.getByRole("region", { name: "To confirm" });
    expect(within(toConfirm).getByText("Mariam")).toBeTruthy();
    expect(within(toConfirm).getByRole("button", { name: "Start packing" })).toBeTruthy();
    expect(
      within(screen.getByRole("region", { name: "Preparing" })).getByText("#1042"),
    ).toBeTruthy();
  });

  it("presses the card's own button when it is dropped where its next step goes, and refuses elsewhere", () => {
    const press = vi.fn();
    const { container } = render(<OrdersBoard {...props([order({ id: "a" })], press)} />);
    const card = container.querySelector("li[draggable]") as HTMLElement;
    const drag = (to: string) => {
      fireEvent.dragStart(card, { dataTransfer: { effectAllowed: "" } });
      const column = screen.getByRole("region", { name: to });
      fireEvent.dragOver(column);
      fireEvent.drop(column);
    };
    drag("On the way");
    expect(press).not.toHaveBeenCalled();
    expect(state.toast).toHaveBeenCalledWith(
      "This order can't move here now. Use its next-step button.",
    );
    drag("Preparing");
    expect(press).toHaveBeenCalledTimes(1);
  });
});

describe("the new-order sound", () => {
  it("tells of a shopper's new order only when the member switched the sound on", () => {
    const chime = vi.spyOn(sound, "playNewOrderChime").mockReturnValue(true);
    render(<NewOrderAlert brandId="b1" slug="pura" />);
    act(() => state.arrival?.("orders", { id: "o9", channel: "storefront", invoice_number: 7 }));
    expect(state.toast).not.toHaveBeenCalled();
    sound.setNewOrderSound(true);
    act(() => state.arrival?.("orders", { id: "o9", channel: "admin", invoice_number: 7 }));
    expect(state.toast).not.toHaveBeenCalled();
    act(() => state.arrival?.("orders", { id: "o9", channel: "storefront", invoice_number: 7 }));
    expect(state.toast).toHaveBeenCalledWith("New order #7", expect.anything());
    act(() => state.arrival?.("bookings", { id: "k1", source: "storefront" }));
    expect(state.toast).toHaveBeenLastCalledWith("New booking request", expect.anything());
    expect(chime).toHaveBeenCalledTimes(2);
  });

  it("keeps the switch in this browser, off by default", () => {
    expect(sound.newOrderSoundOn()).toBe(false);
    sound.setNewOrderSound(true);
    expect(sound.newOrderSoundOn()).toBe(true);
    sound.setNewOrderSound(false);
    expect(sound.newOrderSoundOn()).toBe(false);
    expect(sound.isShopperArrival("bookings", { source: "admin" })).toBe(false);
  });
});
