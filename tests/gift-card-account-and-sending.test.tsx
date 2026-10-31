import React from "react";
import { fireEvent, render as rtlRender, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { codeSentWords, codesToSend } from "../src/features/gift-cards/lib/online-sales";

// The gift card refinement of 2026-10-31: a signed-in shopper reveals the codes of the cards they
// bought in their account (`storefront_my_gift_cards`, run in a real Postgres by
// tests/gift-card-purchase-notices-migration.test.ts), and the store sends by hand the codes a
// buyer asked for on WhatsApp (an emailed one goes by itself).

const t = (_ar: string, en: string) => en;
const storefront = {
  useStorefront: () => ({ brand: { id: "b1", slug: "pura" }, lang: "en", t }),
  formatPrice: (n: number, currency: string) => `${currency} ${n.toFixed(3)}`,
};
vi.mock("../src/lib/storefront-context", () => storefront);
vi.mock("@/lib/storefront-context", () => storefront);
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/pura/gift-cards">{children}</a>,
}));

const designs = {
  cardDesignQueries: {
    store: () => ({
      queryKey: ["designs"],
      queryFn: async () => ({ off: [], signature: null, photo_products: [], photos: [] }),
    }),
  },
};
vi.mock("../src/lib/data/gift-cards/designs", () => designs);
vi.mock("@/lib/data/gift-cards/designs", () => designs);
vi.mock("../src/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
const render = (node: React.ReactNode) =>
  rtlRender(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>);

const { GiftCardsSection } =
  await import("../src/features/storefront-account/components/GiftCardsSection");

const mine = (overrides: Record<string, unknown> = {}) => ({
  id: "p1",
  created_at: "2026-10-31T10:00:00Z",
  amount: 50,
  currency: "BHD",
  status: "paid",
  payment_method: "card",
  delivery_channel: "email",
  recipient_name: "Noor",
  code: "ABCD-EFGH-JKMN",
  balance: 30,
  expires_on: "2027-10-31",
  card_status: "active",
  ...overrides,
});

describe("the shopper's gift cards", () => {
  it("keeps a paid card's code hidden until asked, then shows it with what is left", () => {
    render(<GiftCardsSection cards={[mine()]} isLoading={false} />);
    expect(screen.queryByText("ABCD-EFGH-JKMN")).toBeNull();
    expect(screen.getByText("Ready")).toBeInTheDocument();
    // The card is drawn in the design it was bought in.
    expect(screen.getByRole("img", { name: "The gift card" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show the code" }));
    expect(screen.getByText("ABCD-EFGH-JKMN")).toBeInTheDocument();
    expect(screen.getByText(/BHD 30\.000 left/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Copy the code ABCD-EFGH-JKMN" }),
    ).toBeInTheDocument();
  });

  it("shows no code while a transfer is being checked, and offers a card when there are none", () => {
    render(
      <GiftCardsSection
        cards={[mine({ status: "pending", payment_method: "benefit", code: null, balance: null })]}
        isLoading={false}
      />,
    );
    expect(screen.getByText("The store is checking the transfer")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show the code" })).toBeNull();
  });

  it("offers to buy one when the shopper has none", () => {
    render(<GiftCardsSection cards={[]} isLoading={false} />);
    expect(screen.getByText("No gift cards yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Buy a gift card" })).toBeInTheDocument();
  });
});

describe("the codes the store sends by hand", () => {
  const purchase = (id: string, over: Record<string, unknown> = {}) =>
    ({
      id,
      status: "paid",
      delivery_channel: "whatsapp",
      code_sent_at: null,
      created_at: "2026-10-31T10:00:00Z",
      paid_at: "2026-10-31T10:00:00Z",
      gift_cards: { code: "X", expires_on: null },
      ...over,
    }) as never;

  it("are the paid WhatsApp ones not sent yet, the oldest first", () => {
    const list = codesToSend([
      purchase("late", { paid_at: "2026-10-31T12:00:00Z" }),
      purchase("early", { paid_at: "2026-10-31T09:00:00Z" }),
      purchase("sent", { code_sent_at: "2026-10-31T13:00:00Z" }),
      purchase("email", { delivery_channel: "email" }),
      purchase("unpaid", { status: "pending", gift_cards: null }),
    ]);
    expect(list.map((p: { id: string }) => p.id)).toEqual(["early", "late"]);
  });

  it("say where a paid code stands, and nothing before it is paid", () => {
    expect(codeSentWords(purchase("a"), "en")).toBe("Code not sent yet");
    expect(codeSentWords(purchase("b", { code_sent_at: "x" }), "en")).toBe("Code sent on WhatsApp");
    expect(codeSentWords(purchase("c", { delivery_channel: "email" }), "en")).toBe(
      "Code emailed automatically",
    );
    expect(codeSentWords(purchase("d", { status: "pending" }), "en")).toBeNull();
  });
});
