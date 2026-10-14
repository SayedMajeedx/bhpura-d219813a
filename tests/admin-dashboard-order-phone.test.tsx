import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// The dashboard and an order on a phone, measured on a real store (2026-10-14): the launch
// checklist filled the screen above today's numbers long after two of its three steps were done,
// "needs attention" said it twice when nothing needed it, the order page's one thumb bar had no
// way to reach the customer, view mode showed three greyed edit buttons above the lines, and the
// order's money was written in the store's language whatever the reader's.

const client = { supabase: { from: vi.fn(), rpc: vi.fn() } };
vi.mock("../src/integrations/supabase/client", () => client);
vi.mock("@/integrations/supabase/client", () => client);
vi.mock("../src/components/barcode-scanner", () => ({ BarcodeScanner: () => null }));
vi.mock("@/components/barcode-scanner", () => ({ BarcodeScanner: () => null }));

const { checklistView } = await import("../src/features/dashboard/lib/checklist-view");
const { OnboardingChecklistLine } =
  await import("../src/features/dashboard/components/OnboardingChecklistLine");
const { normalizePhoneForWhatsApp, whatsappChatUrl } = await import("../src/lib/whatsapp-phone");
const { OrderStickyBottomBar } = await import("../src/components/orders/OrderStickyBottomBar");
const { OrderItemsCard } = await import("../src/features/orders/components/OrderItemsCard");

describe("the launch checklist on the dashboard", () => {
  it("is the whole card at first, one line once most of it is done, gone once dismissed", () => {
    expect(checklistView({ completed: 0, dismissed: false })).toBe("full");
    expect(checklistView({ completed: 1, dismissed: false })).toBe("full");
    expect(checklistView({ completed: 2, dismissed: false })).toBe("line");
    expect(checklistView({ completed: 3, dismissed: false })).toBe("line");
    expect(checklistView({ completed: 1, dismissed: true })).toBe("hidden");
  });

  it("says how far it is in one line, and opens on a tap", () => {
    const open = vi.fn();
    const { rerender } = render(
      <OnboardingChecklistLine completed={2} total={3} isAr onOpen={open} />,
    );
    const line = screen.getByRole("button", { name: /خطوات إطلاق المتجر: 2 من 3/ });
    fireEvent.click(line);
    expect(open).toHaveBeenCalledOnce();
    rerender(<OnboardingChecklistLine completed={3} total={3} isAr={false} onOpen={open} />);
    expect(screen.getByRole("button", { name: /Launch checklist complete/ })).toBeInTheDocument();
  });
});

describe("a customer's number on WhatsApp", () => {
  it("takes the country's code a store leaves out", () => {
    expect(normalizePhoneForWhatsApp("3311 2267")).toBe("97333112267");
    expect(normalizePhoneForWhatsApp("0551234567")).toBe("966551234567");
    expect(normalizePhoneForWhatsApp("+973 3311 2267")).toBe("97333112267");
    expect(normalizePhoneForWhatsApp(null)).toBe("");
  });

  it("is a chat link, or none when there is no number to reach", () => {
    expect(whatsappChatUrl("33112267")).toBe("https://wa.me/97333112267");
    expect(whatsappChatUrl("123")).toBeNull();
    expect(whatsappChatUrl("")).toBeNull();
    expect(whatsappChatUrl(undefined)).toBeNull();
  });
});

describe("the order's thumb bar on a phone", () => {
  it("reaches the customer on WhatsApp beside the next step", () => {
    render(
      <OrderStickyBottomBar
        lang="en"
        customerPhone="33112267"
        primaryAction={<button type="button">Mark as packed</button>}
      />,
    );
    expect(screen.getByRole("button", { name: "Mark as packed" })).toBeInTheDocument();
    const chat = screen.getByRole("link", { name: "WhatsApp the customer" });
    expect(chat).toHaveAttribute("href", "https://wa.me/97333112267");
    expect(chat).toHaveAttribute("target", "_blank");
  });

  it("holds the next step in view mode, with editing the order in its menu", () => {
    const unlock = vi.fn();
    render(
      <OrderStickyBottomBar
        lang="en"
        isReadOnly
        canUnlockEditing
        onUnlock={unlock}
        customerPhone="33112267"
        primaryAction={<button type="button">Mark as shipped</button>}
      />,
    );
    expect(screen.getByRole("button", { name: "Mark as shipped" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Edit Order/ })).toBeNull();
    fireEvent.keyDown(screen.getByRole("button", { name: "More options" }), { key: "Enter" });
    fireEvent.click(screen.getByRole("menuitem", { name: /Edit Order/ }));
    expect(unlock).toHaveBeenCalledOnce();
  });

  it("is the way into editing when there is no next step", () => {
    const unlock = vi.fn();
    render(<OrderStickyBottomBar lang="en" isReadOnly canUnlockEditing onUnlock={unlock} />);
    fireEvent.click(screen.getByRole("button", { name: /Edit Order/ }));
    expect(unlock).toHaveBeenCalledOnce();
  });

  it("offers no chat without a number, nor while the order is being created", () => {
    const { rerender } = render(<OrderStickyBottomBar lang="ar" customerPhone={null} />);
    expect(screen.queryByRole("link", { name: "واتساب العميل" })).toBeNull();
    rerender(
      <OrderStickyBottomBar lang="ar" customerPhone="33112267" isCreationMode onSave={vi.fn()} />,
    );
    expect(screen.queryByRole("link", { name: "واتساب العميل" })).toBeNull();
  });
});

describe("an order's lines", () => {
  const props = (isReadOnly: boolean) =>
    ({
      isReadOnly,
      addItem: vi.fn(),
      addonDefaults: {},
      cameraStreamPromise: null,
      currency: "BHD",
      customQ: { data: [] },
      customerPassportQ: { data: null },
      editingItemSheetIdx: null,
      editingItems: {},
      handleScanned: vi.fn(),
      items: [],
      lang: "en",
      mobileTab: "items",
      openBarcodeScanner: vi.fn(),
      pickVariant: vi.fn(),
      productsQ: { data: [] },
      scannerOpen: false,
      setEditingItemSheetIdx: vi.fn(),
      setItems: vi.fn(),
      setProductSearchOpen: vi.fn(),
      setScannerOpen: vi.fn(),
      storeProfile: { modules: {} },
      t: (key: string) => key,
      toggleCustom: vi.fn(),
      updateItem: vi.fn(),
      variantsQ: { data: [] },
      vocabulary: {},
    }) as unknown as React.ComponentProps<typeof OrderItemsCard>;

  it("leave out a line's edit and remove buttons in view mode", () => {
    const line = {
      description: "Iqd abaya",
      quantity: 1,
      unit_price: 25,
      customizations: [],
      customization_total: 0,
      line_total: 25,
      location: "custom",
    };
    const { rerender } = render(<OrderItemsCard {...props(true)} items={[line] as never} />);
    expect(screen.getAllByText("Iqd abaya").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /Product \/ Edit/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove order item" })).toBeNull();
    rerender(<OrderItemsCard {...props(false)} items={[line] as never} />);
    expect(screen.getByRole("button", { name: /Product \/ Edit/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove order item" })).toBeInTheDocument();
  });

  it("show their edit tools only while the order is being edited", () => {
    const { rerender } = render(<OrderItemsCard {...props(true)} />);
    expect(screen.queryByRole("button", { name: /Search Products/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Scan Barcode/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /orderDetail.addLine/ })).toBeNull();
    rerender(<OrderItemsCard {...props(false)} />);
    expect(screen.getByRole("button", { name: /Search Products/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Scan Barcode/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /orderDetail.addLine/ })).toBeInTheDocument();
  });
});
