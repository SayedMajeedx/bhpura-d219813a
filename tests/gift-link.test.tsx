import React from "react";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  giftAddress,
  giftHead,
  giftLinkForBuyerMessage,
  giftLinkMessage,
  giftState,
  isGiftToken,
  rememberGiftCode,
  rememberedGiftCode,
} from "../src/lib/gift-link";

// A gift card as the person it is for receives it: a link that opens the card in its design, its
// code on a tap, and a way to shop with it. Every message a person sends carries the link and
// never the code, and the store's checkout fills in the code of a gift opened in the same tab.

const TOKEN = "ab".repeat(32);
const stubs = vi.hoisted(() => ({
  view: null as unknown,
  open: vi.fn(),
  navigate: vi.fn(),
  check: vi.fn(),
}));

const t = (_ar: string, en: string) => en;
const storefront = {
  useStorefront: () => ({
    brand: { id: "b1", slug: "pura", name_en: "Pura Line", name_ar: "بيورا لاين" },
    settings: {},
    lang: "en",
    t,
  }),
  formatPrice: (n: number, currency: string) => `${currency} ${n.toFixed(3)}`,
};
vi.mock("../src/lib/storefront-context", () => storefront);
vi.mock("@/lib/storefront-context", () => storefront);
const linkFns = { getGift: vi.fn(async () => stubs.view), openGiftCode: stubs.open };
vi.mock("../src/lib/gift-link.functions", () => linkFns);
vi.mock("@/lib/gift-link.functions", () => linkFns);
const checkout = {
  checkGiftCard: stubs.check,
  storeTakesGiftCards: vi.fn(async () => true),
};
vi.mock("../src/lib/gift-card-checkout.functions", () => checkout);
vi.mock("@/lib/gift-card-checkout.functions", () => checkout);
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => stubs.navigate,
  Link: ({ children }: { children: React.ReactNode }) => <a href="/pura">{children}</a>,
}));
const designs = vi.hoisted(() => ({
  cardDesignQueries: {
    store: () => ({
      queryKey: ["designs"],
      queryFn: async () => ({ off: [], signature: "type:cream", photo_products: [], photos: [] }),
    }),
  },
}));
vi.mock("../src/lib/data/gift-cards/designs", () => designs);
vi.mock("@/lib/data/gift-cards/designs", () => designs);
vi.mock("../src/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const { GiftPage } = await import("../src/features/gift-card-shop/components/GiftPage");
const { useCheckoutGiftCard } =
  await import("../src/features/checkout/hooks/use-checkout-gift-card");

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);
const gift = (overrides: Record<string, unknown> = {}) => ({
  brandId: "b1",
  state: "ready",
  amount: 50,
  balance: 50,
  currency: "BHD",
  to: "Noor",
  message: "Eid Mubarak, dear",
  from: "Sara",
  expiresOn: "2027-10-31",
  design: null,
  lang: "en",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  stubs.view = gift();
  stubs.open.mockResolvedValue({ ok: true, code: "ABCD-EFGH-JKMN" });
});

describe("the gift link's rules", () => {
  it("know a token's shape and write the link on the store's own address", () => {
    expect(isGiftToken(TOKEN)).toBe(true);
    expect(isGiftToken("ABCD")).toBe(false);
    expect(isGiftToken(null)).toBe(false);
    expect(giftAddress("pura", TOKEN)).toBe(`https://pura.boutq.store/pura/gift/${TOKEN}`);
  });

  it("say what a card can still do", () => {
    const card = { status: "active", balance: 10, expires_on: "2026-12-01" };
    expect(giftState(card, "2026-11-11")).toBe("ready");
    expect(giftState(card, "2026-12-01")).toBe("ready");
    expect(giftState(card, "2026-12-02")).toBe("expired");
    expect(giftState({ ...card, balance: 0 }, "2026-11-11")).toBe("used");
    expect(giftState({ ...card, status: "voided" }, "2026-11-11")).toBe("voided");
  });

  it("write both messages with the link and without the code or, for the recipient, the amount", () => {
    const link = giftAddress("pura", TOKEN);
    const forRecipient = giftLinkMessage(
      { recipient: "نور", message: "عيدك مبارك", storeName: "بيورا لاين", link },
      "ar",
    );
    expect(forRecipient.split("\n")).toEqual([
      "مرحبًا نور،",
      "عيدك مبارك",
      "لك بطاقة هدية من بيورا لاين. افتحها من هنا:",
      link,
    ]);
    const forBuyer = giftLinkForBuyerMessage(
      { buyer: "Sara", recipient: "Noor", amount: "BHD 50.000", storeName: "Pura Line", link },
      "en",
    );
    expect(forBuyer).toContain("Hello Sara,");
    expect(forBuyer).toContain("Here is the gift link to send to Noor:");
    expect(forBuyer).toContain(link);
    expect(
      giftLinkForBuyerMessage(
        { buyer: null, recipient: null, amount: "x", storeName: "Pura Line", link },
        "en",
      ),
    ).toContain("to send to someone or to keep");
  });

  it("preview the link as the store's gift, out of search, with nothing of the card", () => {
    const head = giftHead({
      matches: [
        {
          routeId: "/$slug",
          loaderData: { brand: { slug: "pura", name_ar: "بيورا لاين" }, initialLang: "ar" },
        },
      ],
    });
    expect(head.meta).toContainEqual({ title: "وصلتك هدية من بيورا لاين" });
    expect(head.meta).toContainEqual({ name: "robots", content: "noindex, nofollow" });
    expect(giftHead({ matches: [] }).meta).toContainEqual({ title: "وصلتك هدية" });
  });
});

describe("the gift page", () => {
  it("opens as a gift, then shows the card and the giver's words, the code only on a tap", async () => {
    render(<GiftPage token={TOKEN} />, { wrapper });
    expect(
      await screen.findByRole("heading", { name: "Noor, a gift for you" }),
    ).toBeInTheDocument();
    expect(screen.getByText("From Sara · Pura Line")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Front of the card" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open your gift" }));
    expect(screen.getByRole("img", { name: "Front of the card" })).toBeInTheDocument();
    expect(screen.getAllByText("Eid Mubarak, dear").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("BHD 50.000").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Valid until 31 Oct 2027").length).toBeGreaterThanOrEqual(1);
    // Nothing asked for the code yet, and none is on the page.
    expect(stubs.open).not.toHaveBeenCalled();
    expect(screen.queryByText("ABCD-EFGH-JKMN")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show the card's code" }));
    expect((await screen.findAllByText("ABCD-EFGH-JKMN")).length).toBeGreaterThanOrEqual(1);
    expect(stubs.open).toHaveBeenCalledWith({ data: { slug: "pura", token: TOKEN } });
    expect(screen.getByRole("button", { name: "Copy the code" })).toBeInTheDocument();
  });

  it("takes the code to the store's checkout when the recipient shops with the card", async () => {
    render(<GiftPage token={TOKEN} />, { wrapper });
    fireEvent.click(await screen.findByRole("button", { name: "Open your gift" }));
    fireEvent.click(screen.getByRole("button", { name: "Shop with your card" }));
    await waitFor(() =>
      expect(stubs.navigate).toHaveBeenCalledWith({ to: "/$slug", params: { slug: "pura" } }),
    );
    expect(rememberedGiftCode("pura")).toBe("ABCD-EFGH-JKMN");
  });

  it("says what is left of a card partly spent", async () => {
    stubs.view = gift({ balance: 12.5 });
    render(<GiftPage token={TOKEN} />, { wrapper });
    fireEvent.click(await screen.findByRole("button", { name: "Open your gift" }));
    expect(screen.getByText(/BHD 12\.500 left/)).toBeInTheDocument();
  });

  it("shows a card that can no longer be used without a code or a way to shop", async () => {
    stubs.view = gift({ state: "expired" });
    render(<GiftPage token={TOKEN} />, { wrapper });
    fireEvent.click(await screen.findByRole("button", { name: "Open your gift" }));
    expect(screen.getByRole("status")).toHaveTextContent("This card expired on 31 Oct 2027.");
    expect(screen.queryByRole("button", { name: "Show the card's code" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Shop with your card" })).not.toBeInTheDocument();
  });

  it("says a replaced link no longer works, and asks nothing for a token of the wrong shape", async () => {
    stubs.view = null;
    render(<GiftPage token={TOKEN} />, { wrapper });
    expect(await screen.findByText(/This link no longer works/)).toBeInTheDocument();
    linkFns.getGift.mockClear();
    render(<GiftPage token="nonsense" />, { wrapper });
    expect(linkFns.getGift).not.toHaveBeenCalled();
  });
});

describe("the checkout's gift card", () => {
  const brand = { id: "b1", slug: "pura" };

  it("applies by itself the code of a gift opened in this tab", async () => {
    stubs.check.mockResolvedValue({ found: true, balance: 50, currency: "BHD" });
    rememberGiftCode("pura", "ABCD-EFGH-JKMN");
    const { result } = renderHook(() => useCheckoutGiftCard(brand, "BHD"), { wrapper });
    expect(result.current.input).toBe("ABCD-EFGH-JKMN");
    await waitFor(() =>
      expect(result.current.card).toEqual({ code: "ABCD-EFGH-JKMN", balance: 50, currency: "BHD" }),
    );
    expect(stubs.check).toHaveBeenCalledWith({ data: { slug: "pura", code: "ABCD-EFGH-JKMN" } });
    // Taking the card off forgets it for this tab.
    act(() => result.current.remove());
    expect(rememberedGiftCode("pura")).toBeNull();
    expect(result.current.card).toBeNull();
  });

  it("asks nothing with no gift opened, and stays quiet when the remembered code is refused", async () => {
    const plain = renderHook(() => useCheckoutGiftCard(brand, "BHD"), { wrapper });
    await waitFor(() => expect(plain.result.current.offered).toBe(true));
    expect(stubs.check).not.toHaveBeenCalled();

    stubs.check.mockResolvedValue({ found: false });
    rememberGiftCode("pura", "ABCD-EFGH-JKMN");
    const refused = renderHook(() => useCheckoutGiftCard(brand, "BHD"), { wrapper });
    await waitFor(() => expect(stubs.check).toHaveBeenCalled());
    expect(refused.result.current.card).toBeNull();
    expect(refused.result.current.refusal).toBeNull();
  });
});
