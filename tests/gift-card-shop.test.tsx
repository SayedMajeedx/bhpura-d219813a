import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buyMethods,
  buyProblems,
  emptyBuyForm,
  purchaseFailure,
  purchaseState,
  recipientMessage,
  validityLine,
} from "../src/features/gift-card-shop/lib/gift-card-shop";
import {
  amountsFromText,
  purchaseWords,
  waitingTransfers,
} from "../src/features/gift-cards/lib/online-sales";

// Buying a gift card on the storefront (step four): the shop page asks for an amount, the
// buyer's name and phone, a method the store takes (a transfer brings its receipt), then sends a
// card payment to the gateway or opens the purchase's page; the purchase's page shows the code
// once paid; and the store's own rules for amounts and waiting transfers.

const stubs = vi.hoisted(() => ({
  offer: null as unknown,
  view: null as unknown,
  start: vi.fn(),
  upload: vi.fn(async () => "receipt-1"),
  navigate: vi.fn(),
}));

const t = (_ar: string, en: string) => en;
const storefront = {
  useStorefront: () => ({
    brand: { id: "b1", slug: "pura", name_en: "Pura Line", name_ar: "بيورا لاين" },
    settings: { benefit_qr_url: null, benefit_account_number: "BH01" },
    lang: "en",
    t,
  }),
  formatPrice: (n: number, currency: string) => `${currency} ${n.toFixed(3)}`,
};
vi.mock("../src/lib/storefront-context", () => storefront);
vi.mock("@/lib/storefront-context", () => storefront);
const online = vi.hoisted(() => ({
  giftCardOnlineQueries: {
    offer: () => ({ queryKey: ["offer"], queryFn: async () => stubs.offer }),
  },
}));
vi.mock("../src/lib/data/gift-cards/online", () => online);
vi.mock("@/lib/data/gift-cards/online", () => online);
const fns = {
  startGiftCardPurchase: stubs.start,
  getGiftCardPurchase: vi.fn(async () => stubs.view),
};
vi.mock("../src/lib/gift-card-purchase.functions", () => fns);
vi.mock("@/lib/gift-card-purchase.functions", () => fns);
const receipt = { uploadBenefitReceipt: stubs.upload };
vi.mock("../src/lib/benefit-receipt", () => receipt);
vi.mock("@/lib/benefit-receipt", () => receipt);
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => stubs.navigate,
  Link: ({ children }: { children: React.ReactNode }) => <a href="/pura">{children}</a>,
}));
const designs = vi.hoisted(() => ({
  cardDesignQueries: {
    store: () => ({
      queryKey: ["designs"],
      queryFn: async () => ({
        off: ["signature:brand"],
        signature: "type:cream",
        photo_products: [],
        photos: [],
      }),
    }),
  },
}));
vi.mock("../src/lib/data/gift-cards/designs", () => designs);
vi.mock("@/lib/data/gift-cards/designs", () => designs);
vi.mock("../src/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const { GiftCardShopPage } =
  await import("../src/features/gift-card-shop/components/GiftCardShopPage");
const { GiftCardPurchasePage } =
  await import("../src/features/gift-card-shop/components/GiftCardPurchasePage");

const OFFER = {
  brandId: "b1",
  amounts: [25, 50],
  currency: "BHD",
  validMonths: 12,
  card: true,
  benefit: true,
};
const wrap = (node: React.ReactNode) =>
  render(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>);

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  stubs.offer = OFFER;
});

describe("the rules", () => {
  it("ask for an amount offered, a method taken, a name, a phone, and a transfer's receipt", () => {
    const form = {
      ...emptyBuyForm(),
      amount: 25,
      method: "benefit" as const,
      delivery: "whatsapp" as const,
      name: "Sara",
      phone: "39001122",
    };
    expect(buyProblems(form, OFFER)).toEqual(["receipt"]);
    expect(buyProblems({ ...form, delivery: "" }, OFFER)).toEqual(["delivery", "receipt"]);
    expect(buyProblems({ ...form, hasReceipt: true }, OFFER)).toEqual([]);
    expect(buyProblems({ ...form, amount: 30, hasReceipt: true }, OFFER)).toEqual(["amount"]);
    expect(
      buyProblems({ ...form, method: "card", phone: "12" }, { ...OFFER, card: false }),
    ).toEqual(["method", "phone"]);
    expect(buyMethods({ card: false, benefit: true })).toEqual(["benefit"]);
  });

  it("ask for a phone when the code goes on WhatsApp and an email when it goes by email", () => {
    const form = {
      ...emptyBuyForm(),
      amount: 25,
      method: "card" as const,
      name: "Sara",
    };
    expect(buyProblems({ ...form, delivery: "whatsapp" }, OFFER)).toEqual(["phone"]);
    expect(buyProblems({ ...form, delivery: "email" }, OFFER)).toEqual(["email"]);
    expect(buyProblems({ ...form, delivery: "email", email: "sara@" }, OFFER)).toEqual(["email"]);
    expect(buyProblems({ ...form, delivery: "email", email: "sara@mail.com" }, OFFER)).toEqual([]);
    // The other way stays optional, but a value typed in must be right.
    expect(
      buyProblems({ ...form, delivery: "email", email: "sara@mail.com", phone: "12" }, OFFER),
    ).toEqual(["phone"]);
  });

  it("say how long a card lasts, what went wrong, and where a purchase stands", () => {
    expect(validityLine(12, "en")).toBe("Valid for 12 months from purchase.");
    expect(validityLine(null, "en")).toBeNull();
    expect(purchaseFailure("GIFT_CARD_AMOUNT_NOT_OFFERED", "en")).toMatch(/no longer offered/);
    expect(purchaseState({ status: "paid", method: "card", code: "A" }, false)).toBe("ready");
    expect(purchaseState({ status: "pending", method: "benefit", code: null }, false)).toBe(
      "checking_transfer",
    );
    expect(purchaseState({ status: "pending", method: "card", code: null }, true)).toBe("failed");
    expect(purchaseState({ status: "expired", method: "card", code: null }, false)).toBe("over");
  });

  it("write the message for the person the card is for, with the buyer's own words", () => {
    const message = recipientMessage(
      {
        recipient: "Noor",
        message: "Eid Mubarak!",
        amount: "BHD 50.000",
        code: "ABCD-EFGH-JKMN",
        expiry: "31 Oct 2027",
        storeName: "Pura Line",
        storeLink: "https://pura.boutq.store/pura",
      },
      "en",
    );
    expect(message.split("\n")).toEqual([
      "Hello Noor,",
      "Eid Mubarak!",
      "Here is a BHD 50.000 gift card from Pura Line.",
      "Card code: ABCD-EFGH-JKMN",
      "Valid until 31 Oct 2027.",
      "Use it when you order at https://pura.boutq.store/pura",
    ]);
  });

  it("read the store's amounts as typed, and put the oldest transfer first", () => {
    expect(amountsFromText("50, 25 ٢٥، 100")).toEqual({ amounts: [25, 50, 100], invalid: false });
    expect(amountsFromText("25, -5").invalid).toBe(true);
    expect(amountsFromText("1,2,3,4,5,6,7,8,9").invalid).toBe(true);
    const p = (id: string, created_at: string, over = {}) =>
      ({ id, created_at, status: "pending", payment_method: "benefit", ...over }) as never;
    expect(
      waitingTransfers([
        p("b", "2026-10-02"),
        p("a", "2026-10-01"),
        p("c", "2026-10-01", { payment_method: "card" }),
      ]).map((x: { id: string }) => x.id),
    ).toEqual(["a", "b"]);
    expect(purchaseWords({ status: "pending", payment_method: "benefit" }).en).toBe(
      "Transfer to check",
    );
  });
});

describe("the shop page", () => {
  it("sends a card payment to the gateway with the purchase it started", async () => {
    stubs.start.mockResolvedValue({ ok: true, id: "p1", token: "tok", brandId: "b1" });
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ redirectUrl: "https://tap.test/pay" })),
    );
    vi.stubGlobal("fetch", fetchMock);
    const location = { href: "" };
    vi.stubGlobal("location", location);
    wrap(<GiftCardShopPage />);
    fireEvent.click(await screen.findByRole("radio", { name: "BHD 50.000" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Sara" } });
    fireEvent.click(screen.getByRole("radio", { name: "Email" }));
    fireEvent.click(screen.getByRole("radio", { name: "Card" }));
    fireEvent.click(screen.getByRole("button", { name: /Buy the card/ }));
    // By email, the email is asked for and the phone is not.
    expect(await screen.findByText(/valid email/i)).toBeInTheDocument();
    expect(stubs.start).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "sara@mail.com" } });
    fireEvent.click(screen.getByRole("button", { name: /Buy the card/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(stubs.start).toHaveBeenCalledWith({
      data: expect.objectContaining({ slug: "pura", amount: 50, method: "card", receiptId: null }),
    });
    expect(stubs.start.mock.calls[0][0].data.buyer).toEqual(
      expect.objectContaining({ delivery: "email", email: "sara@mail.com", lang: "en" }),
    );
    // The card's design goes with it: the store's signature card is offered first.
    expect(stubs.start.mock.calls[0][0].data.buyer.design).toEqual(
      expect.objectContaining({ design: "type:cream", orientation: "portrait", language: "en" }),
    );
    expect(
      JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body)),
    ).toEqual({
      purchaseId: "p1",
      brandId: "b1",
      token: "tok",
    });
  });

  it("asks for a transfer's receipt, then uploads it and opens the purchase's page", async () => {
    stubs.start.mockResolvedValue({ ok: true, id: "p2", token: "tok2", brandId: "b1" });
    const { container } = wrap(<GiftCardShopPage />);
    fireEvent.click(await screen.findByRole("radio", { name: "BHD 25.000" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Sara" } });
    fireEvent.click(screen.getByRole("radio", { name: "WhatsApp" }));
    fireEvent.change(screen.getByLabelText("Phone number (WhatsApp)"), {
      target: { value: "39001122" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "BenefitPay (transfer)" }));
    fireEvent.click(screen.getByRole("button", { name: /Buy the card/ }));
    expect(await screen.findByText("Attach the transfer receipt.")).toBeInTheDocument();
    expect(stubs.start).not.toHaveBeenCalled();
    const input = container.querySelector("input[type=file]") as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(["x"], "r.png", { type: "image/png" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: /Buy the card/ }));
    await waitFor(() => expect(stubs.navigate).toHaveBeenCalled());
    expect(stubs.upload).toHaveBeenCalled();
    expect(stubs.start).toHaveBeenCalledWith({
      data: expect.objectContaining({ method: "benefit", receiptId: "receipt-1" }),
    });
    expect(stubs.navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { slug: "pura", purchaseId: "p2" },
        search: { t: "tok2" },
      }),
    );
  });

  it("says so when the store sells no cards online", async () => {
    stubs.offer = null;
    wrap(<GiftCardShopPage />);
    expect(
      await screen.findByText("This store is not selling gift cards online right now."),
    ).toBeInTheDocument();
  });
});

describe("the purchase's page", () => {
  it("shows the code once paid, with the message to send", async () => {
    stubs.view = {
      status: "paid",
      method: "card",
      amount: 50,
      currency: "BHD",
      recipientName: "Noor",
      message: null,
      brandId: "b1",
      code: "ABCD-EFGH-JKMN",
      expiresOn: "2027-10-31",
    };
    wrap(<GiftCardPurchasePage purchaseId="p1" token={"t".repeat(64)} paymentFailed={false} />);
    // The code is on the card's back and set out under it.
    expect((await screen.findAllByText("ABCD-EFGH-JKMN")).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole("img", { name: "Front of the card" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Turn the card over/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Print on A4 to cut out/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Send on WhatsApp/ }).getAttribute("href")).toContain(
      encodeURIComponent("ABCD-EFGH-JKMN"),
    );
  });

  it("shows no code while a transfer is being checked", async () => {
    stubs.view = {
      status: "pending",
      method: "benefit",
      amount: 25,
      currency: "BHD",
      recipientName: null,
      message: null,
      brandId: "b1",
      code: null,
      expiresOn: null,
    };
    wrap(<GiftCardPurchasePage purchaseId="p2" token={"t".repeat(64)} paymentFailed={false} />);
    expect(await screen.findByText("We have your request")).toBeInTheDocument();
  });
});
