import React from "react";
import { fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addonPriceFromText,
  addonsPayload,
  addonsTotal,
  readGiftAddons,
  readOrderGiftAddons,
} from "../src/lib/gift-addons";
import { giftPayload, giftRefusal, orderGift } from "../src/lib/gift-order";

// Gift add-ons (step two): the store's bouquets and the like, each priced by the store. The
// checkout's reading of them (what they add, what goes to the order builder: ids, never a price),
// the picker, the store's editor and the order page's line telling staff what to prepare.

const ROSE = {
  id: "00000000-0000-4000-8000-0000000000a1",
  name_ar: "باقة ورد",
  name_en: "Flower bouquet",
  image_url: "https://media.boutq.store/rose.jpg",
  price: 12,
};
const CHOC = {
  id: "00000000-0000-4000-8000-0000000000a2",
  name_ar: "شوكولاتة",
  name_en: "Chocolates",
  image_url: null,
  price: 4.5,
};

const stubs = vi.hoisted(() => ({
  offered: [] as unknown[],
  store: [] as unknown[],
  save: vi.fn(async () => undefined),
  archive: vi.fn(async () => undefined),
  upload: vi.fn(async () => "https://media.boutq.store/new.jpg"),
}));
const data = vi.hoisted(() => ({
  giftOrderQueries: {
    storefront: (slug: string, enabled = true) => ({
      queryKey: ["gift-options", slug],
      queryFn: async () => ({ enabled: true, card: true, cardPrice: 0, prepaid: false }),
      enabled,
    }),
    addons: (slug: string, enabled = true) => ({
      queryKey: ["gift-addons", slug],
      // As the data layer hands them over: read from the database's rows.
      queryFn: async () => (await import("../src/lib/gift-addons")).readGiftAddons(stubs.offered),
      enabled,
    }),
    storeAddons: (brandId: string) => ({
      queryKey: ["gift-store-addons", brandId],
      queryFn: async () => stubs.store,
    }),
  },
  saveGiftAddon: (...args: unknown[]) => stubs.save(...(args as [])),
  archiveGiftAddon: (...args: unknown[]) => stubs.archive(...(args as [])),
  invalidateGiftAddons: vi.fn(async () => undefined),
}));
vi.mock("../src/lib/data/gift-orders", () => data);
vi.mock("@/lib/data/gift-orders", () => data);
const storefront = {
  useStorefront: () => ({ brand: { id: "b1", slug: "pura" }, settings: {}, lang: "en" }),
  formatPrice: (n: number, currency: string) => `${currency} ${n.toFixed(3)}`,
};
vi.mock("../src/lib/storefront-context", () => storefront);
vi.mock("@/lib/storefront-context", () => storefront);
const currency = { useMoneyLabel: () => "BHD", useStoreCurrency: () => "BHD" };
vi.mock("../src/hooks/use-store-currency", () => currency);
vi.mock("@/hooks/use-store-currency", () => currency);
const upload = { uploadPublicMedia: (...args: unknown[]) => stubs.upload(...(args as [])) };
vi.mock("../src/lib/r2-upload", () => upload);
vi.mock("@/lib/r2-upload", () => upload);
const confirm = { confirmDialog: vi.fn(async () => true) };
vi.mock("../src/components/ui/confirm-dialog", () => confirm);
vi.mock("@/components/ui/confirm-dialog", () => confirm);
const print = {
  PrintButton: ({ label }: { label: string }) => <button type="button">{label}</button>,
};
vi.mock("../src/features/gift-cards/components/PrintCardDialog", () => print);
vi.mock("@/features/gift-cards/components/PrintCardDialog", () => print);
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("../src/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const { useCheckoutGift, giftSummaryLines } =
  await import("../src/features/checkout/hooks/use-checkout-gift");
const { GiftAddonsPicker } = await import("../src/features/checkout/components/GiftAddonsPicker");
const { GiftAddonsEditor } = await import("../src/features/settings/tabs/orders/GiftAddonsEditor");
const { GiftMessageCardBlock } =
  await import("../src/features/gift-cards/components/GiftMessageCard");

const t = (_ar: string, en: string) => en;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);
const OPTIONS = { enabled: true, card: true, cardPrice: 1.5, prepaid: false };

beforeEach(() => {
  vi.clearAllMocks();
  stubs.offered = [ROSE, CHOC];
  stubs.store = [];
});

describe("the add-ons' rules", () => {
  const offered = readGiftAddons([ROSE, CHOC, { id: "x", price: 0 }, null]);

  it("read the store's list, leaving out what is not an add-on", () => {
    expect(offered.map((a) => a.id)).toEqual([ROSE.id, CHOC.id]);
    expect(offered[0]).toMatchObject({ nameAr: "باقة ورد", nameEn: "Flower bouquet", price: 12 });
  });

  it("add up what was chosen of what the store still offers, at most 10 of one", () => {
    expect(addonsTotal({ [ROSE.id]: 2, [CHOC.id]: 1 }, offered)).toBe(28.5);
    expect(addonsTotal({ [ROSE.id]: 0 }, offered)).toBe(0);
    // One the store took off since is not charged or sent.
    expect(addonsTotal({ gone: 1, [CHOC.id]: 1 }, offered)).toBe(4.5);
    expect(addonsPayload({ gone: 1, [ROSE.id]: 50 }, offered)).toEqual([
      { id: ROSE.id, quantity: 10 },
    ]);
  });

  it("send ids and quantities with the gift, never a price", () => {
    const choice = {
      isGift: true,
      recipient: "Noor",
      message: "",
      from: "",
      withCard: false,
      tone: "brand" as const,
    };
    expect(giftPayload(choice, OPTIONS, [{ id: ROSE.id, quantity: 1 }])).toEqual({
      recipient: "Noor",
      from: null,
      card: false,
      addons: [{ id: ROSE.id, quantity: 1 }],
    });
    expect(giftPayload(choice, OPTIONS)).not.toHaveProperty("addons");
  });

  it("read the price as typed, and what an order's gift holds", () => {
    expect(addonPriceFromText("12")).toBe(12);
    expect(addonPriceFromText("٤٫٥")).toBe(4.5);
    for (const bad of ["", "0", "-2", "abc", "20000"]) expect(addonPriceFromText(bad)).toBeNull();
    expect(
      readOrderGiftAddons([
        { name_ar: "باقة ورد", name_en: "Flower bouquet", quantity: 2 },
        { quantity: 1 },
      ]),
    ).toEqual([{ nameAr: "باقة ورد", nameEn: "Flower bouquet", quantity: 2 }]);
    expect(
      orderGift({ gift: { card: false, addons: [{ name_en: "Chocolates", name_ar: "شوكولاتة" }] } })
        ?.addons,
    ).toEqual([{ nameAr: "شوكولاتة", nameEn: "Chocolates", quantity: 1 }]);
    expect(giftRefusal("GIFT_ADDON_UNAVAILABLE", "en")).toMatch(/no longer available/);
  });
});

describe("the checkout's add-ons", () => {
  function Picker() {
    const gift = useCheckoutGift({
      slug: "pura",
      isGift: true,
      recipient: "Noor",
      message: "",
      enabled: true,
    });
    return (
      <>
        <GiftAddonsPicker gift={gift} currency="BHD" lang="en" t={t} />
        <output data-testid="fee">{gift.fee}</output>
        <output data-testid="lines">{JSON.stringify(giftSummaryLines(gift, "en"))}</output>
        <output data-testid="payload">{JSON.stringify(gift.payload)}</output>
      </>
    );
  }

  it("are added and taken off with a tap, their price joining the gift's", async () => {
    render(<Picker />, { wrapper });
    const rose = await screen.findByRole("button", {
      name: "Add Flower bouquet to the gift, BHD 12.000",
    });
    expect(rose).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(rose);
    expect(
      screen.getByRole("button", { name: "Remove Flower bouquet from the gift" }),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /Add Chocolates/ }));
    expect(screen.getByTestId("fee")).toHaveTextContent("16.5");
    expect(JSON.parse(screen.getByTestId("lines").textContent ?? "[]")).toEqual([
      { key: ROSE.id, label: "Flower bouquet", amount: 12 },
      { key: CHOC.id, label: "Chocolates", amount: 4.5 },
    ]);
    expect(JSON.parse(screen.getByTestId("payload").textContent ?? "{}").addons).toEqual([
      { id: ROSE.id, quantity: 1 },
      { id: CHOC.id, quantity: 1 },
    ]);
    fireEvent.click(screen.getByRole("button", { name: /Remove Flower bouquet/ }));
    expect(screen.getByTestId("fee")).toHaveTextContent("4.5");
  });

  it("are not drawn by a store that lists none, nor asked for an order that is not a gift", async () => {
    stubs.offered = [];
    render(<Picker />, { wrapper });
    await waitFor(() => expect(screen.queryByRole("group")).not.toBeInTheDocument());
    const notGift = renderHook(
      () =>
        useCheckoutGift({ slug: "pura", isGift: false, recipient: "", message: "", enabled: true }),
      { wrapper },
    );
    expect(notGift.result.current.addons).toEqual([]);
    expect(notGift.result.current.fee).toBe(0);
  });
});

describe("the store's add-ons editor", () => {
  const row = {
    id: ROSE.id,
    nameAr: "باقة ورد",
    nameEn: "Flower bouquet",
    descriptionAr: null,
    descriptionEn: null,
    imageUrl: ROSE.image_url,
    price: 12,
    isAvailable: true,
    sortOrder: 0,
  };

  it("adds one with its names, price and picture", async () => {
    render(<GiftAddonsEditor brandId="b1" lang="en" />, { wrapper });
    expect(await screen.findByText("No add-ons yet.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.change(screen.getByLabelText("Name in Arabic"), { target: { value: "باقة ورد" } });
    fireEvent.change(screen.getByLabelText("Name in English"), {
      target: { value: "Flower bouquet" },
    });
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Price (BHD)"), { target: { value: "0" } });
    expect(screen.getByText("Write a price above 0 and up to 10,000.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Price (BHD)"), { target: { value: "12" } });
    const file = new File(["x"], "rose.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Add a picture"), { target: { files: [file] } });
    await waitFor(() => expect(stubs.upload).toHaveBeenCalledWith("b1", file, "product"));
    await screen.findByText("Change picture");
    fireEvent.click(save);
    await waitFor(() =>
      expect(stubs.save).toHaveBeenCalledWith("b1", {
        id: null,
        nameAr: "باقة ورد",
        nameEn: "Flower bouquet",
        imageUrl: "https://media.boutq.store/new.jpg",
        price: 12,
        isAvailable: true,
        sortOrder: 0,
      }),
    );
  });

  it("switches one off, and removes one after asking", async () => {
    stubs.store = [row];
    render(<GiftAddonsEditor brandId="b1" lang="en" />, { wrapper });
    fireEvent.click(
      await screen.findByRole("switch", { name: "Flower bouquet offered to shoppers" }),
    );
    await waitFor(() =>
      expect(stubs.save).toHaveBeenCalledWith(
        "b1",
        expect.objectContaining({ id: ROSE.id, isAvailable: false }),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove Flower bouquet" }));
    await waitFor(() => expect(stubs.archive).toHaveBeenCalledWith(ROSE.id));
    expect(confirm.confirmDialog).toHaveBeenCalled();
  });
});

describe("the order page", () => {
  it("tells staff what to prepare with the gift", () => {
    render(
      <GiftMessageCardBlock
        gift={{
          recipient: "Noor",
          card: false,
          addons: [
            { name_ar: "باقة ورد", name_en: "Flower bouquet", quantity: 2 },
            { name_ar: "شوكولاتة", name_en: "Chocolates", quantity: 1 },
          ],
        }}
        notes={null}
        invoiceNumber={1}
        lang="en"
      />,
    );
    expect(screen.getByText("With: Flower bouquet × 2, Chocolates")).toBeInTheDocument();
  });
});
