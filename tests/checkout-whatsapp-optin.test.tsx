import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The checkout offered "Send me updates for this order on WhatsApp" to one store by its name,
// whether or not anything could be sent. It is offered now only by a store whose WhatsApp
// connection can really send, and the checkout asks the database for that one answer.

const rpc = vi.fn();
const client = { supabase: { rpc } };
vi.mock("../src/integrations/supabase/client", () => client);
vi.mock("@/integrations/supabase/client", () => client);
const storefront = { useIsServicesStore: () => false };
vi.mock("../src/lib/storefront-context", () => storefront);
vi.mock("@/lib/storefront-context", () => storefront);

const { CustomerDetailsCard } =
  await import("../src/features/checkout/components/CustomerDetailsCard");
const { checkoutQueries, fetchWhatsappUpdatesReady } = await import("../src/lib/data/checkout");

const t = (_ar: string, en: string) => en;
const BOX = "Send me updates for this order on WhatsApp";

function card(over: Record<string, unknown> = {}) {
  const props = {
    checkRegisteredAccount: vi.fn(),
    form: { name: "", phone: "", email: "" },
    fulfillment: "delivery",
    giftMessage: "",
    giftRecipient: "",
    isGift: false,
    saveToProfile: false,
    session: null,
    setForm: vi.fn(),
    setGiftMessage: vi.fn(),
    setGiftRecipient: vi.fn(),
    setIsGift: vi.fn(),
    setSaveToProfile: vi.fn(),
    setWhatsappOrderUpdates: vi.fn(),
    t,
    whatsappOrderUpdates: false,
    whatsappUpdatesReady: false,
    ...over,
  };
  render(<CustomerDetailsCard {...(props as never)} />);
  return props;
}

beforeEach(() => rpc.mockReset());

describe("the opt-in at checkout", () => {
  it("is not offered by a store that cannot send WhatsApp updates", () => {
    card({ whatsappUpdatesReady: false });
    expect(screen.queryByText(BOX)).toBeNull();
  });

  it("is offered by a store that can, and records the shopper's choice", () => {
    const props = card({ whatsappUpdatesReady: true });
    expect(screen.getByText(BOX)).toBeInTheDocument();
    fireEvent.click(screen.getByText(BOX));
    expect(props.setWhatsappOrderUpdates).toHaveBeenCalledWith(true);
  });
});

describe("asking whether a store can send", () => {
  it("asks the database for the store, and takes only a clear yes", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    expect(await fetchWhatsappUpdatesReady("brand-1")).toBe(true);
    expect(rpc).toHaveBeenCalledWith("storefront_whatsapp_updates_ready", {
      p_brand_id: "brand-1",
    });

    rpc.mockResolvedValue({ data: false, error: null });
    expect(await fetchWhatsappUpdatesReady("brand-1")).toBe(false);
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await fetchWhatsappUpdatesReady("brand-1")).toBe(false);
  });

  it("offers nothing when the question could not be asked", async () => {
    rpc.mockResolvedValue({ data: true, error: { message: "network" } });
    expect(await fetchWhatsappUpdatesReady("brand-1")).toBe(false);
  });

  it("keeps the answer per store", () => {
    expect(checkoutQueries.whatsappUpdatesReady("a").queryKey).not.toEqual(
      checkoutQueries.whatsappUpdatesReady("b").queryKey,
    );
  });
});
