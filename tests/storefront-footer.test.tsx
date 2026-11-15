import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hoursLines, paymentMarks } from "../src/features/storefront-shell/lib/footer-care";

// The footer review of 2026-11-15: the Join button sat a shade off Pura's near-black footer, the
// payment chips read "COD" and promised Apple Pay to every store that takes cards, the footer
// named no way to reach the store, the newsletter asked WhatsApp or email first, and the phone
// drew everything a second time.

const state = vi.hoisted(() => ({
  lang: "en" as "ar" | "en",
  settings: {} as Record<string, unknown>,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, params: _p, preload: _pl, ...props }: Record<string, unknown>) => (
    <a href={String(to)} {...(props as object)}>
      {children as React.ReactNode}
    </a>
  ),
}));

const storefrontModule = vi.hoisted(() => async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  useStorefront: () => ({
    brand: { id: "b1", slug: "pura", name_ar: "بيورا", name_en: "Pura", about_en: "Abayas." },
    settings: {
      pages: [],
      socials: [{ name: "Instagram", url: "https://instagram.com/pura" }],
      newsletter_enabled: true,
      footer_logo_size: 32,
      ...state.settings,
    },
    lang: state.lang,
    t: (ar: string, en: string) => (state.lang === "ar" ? ar : en),
  }),
  useIsServicesStore: () => false,
}));
vi.mock("../src/lib/storefront-context", (io) => storefrontModule(io));
vi.mock("@/lib/storefront-context", (io) => storefrontModule(io));

const categoriesModule = vi.hoisted(() => () => ({
  useStorefrontCategories: () => ({ data: [] }),
}));
vi.mock("../src/lib/use-storefront-categories", categoriesModule);
vi.mock("@/lib/use-storefront-categories", categoriesModule);

const giftCardsModule = vi.hoisted(() => () => ({
  giftCardOnlineQueries: {
    offer: (slug: string) => ({ queryKey: ["offer", slug], queryFn: async () => null }),
  },
}));
vi.mock("../src/lib/data/gift-cards/online", giftCardsModule);
vi.mock("@/lib/data/gift-cards/online", giftCardsModule);

vi.mock("../src/lib/storefront-leads.functions", () => ({ subscribeToNewsletter: vi.fn() }));
vi.mock("@/lib/storefront-leads.functions", () => ({ subscribeToNewsletter: vi.fn() }));
vi.mock("../src/components/addons/AddonSlot", () => ({ AddonSlot: () => null }));
vi.mock("@/components/addons/AddonSlot", () => ({ AddonSlot: () => null }));
vi.mock("../src/components/storefront/TrustBar", () => ({ TrustBar: () => null }));
vi.mock("@/components/storefront/TrustBar", () => ({ TrustBar: () => null }));

const { FooterV2 } = await import("../src/components/storefront/FooterV2");

function renderFooter() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <FooterV2 />
    </QueryClientProvider>,
  );
}

const week = (sat: object[], fri: object[]) => ({
  enabled: true,
  timezone: "Asia/Bahrain",
  days: { 0: sat, 1: sat, 2: sat, 3: sat, 4: sat, 5: fri, 6: sat },
});

beforeEach(() => {
  state.lang = "en";
  state.settings = {};
});

describe("the payment marks", () => {
  it("are the methods the store switched on, cards by Visa and Mastercard only", () => {
    expect(paymentMarks({ benefit_enabled: true, cod_enabled: true })).toEqual(["benefit", "cod"]);
    expect(paymentMarks({ card_enabled: true })).toEqual(["visa", "mastercard"]);
    expect(paymentMarks({})).toEqual([]);
  });

  it("spell out cash on delivery, and never promise Apple Pay", () => {
    state.settings = { benefit_enabled: true, card_enabled: true, cod_enabled: true };
    renderFooter();
    const list = screen.getByRole("list", { name: "Ways to pay" });
    expect(within(list).getByText("Cash on delivery")).toBeTruthy();
    expect(within(list).getByLabelText("Visa")).toBeTruthy();
    expect(within(list).getByRole("img", { name: "Mastercard" })).toBeTruthy();
    expect(screen.queryByText(/COD|Apple Pay/)).toBeNull();
  });
});

describe("the store's hours", () => {
  it("puts days with the same hours together, in the Gulf's week", () => {
    const hours = week([{ from: "10:00", to: "22:00" }], [{ from: "16:00", to: "22:00" }]);
    expect(hoursLines(hours, "en")).toEqual([
      { days: "Sat – Thu", hours: "10:00–22:00" },
      { days: "Fri", hours: "16:00–22:00" },
    ]);
    expect(hoursLines(hours, "ar")[0].days).toBe("السبت – الخميس");
  });

  it("says every day, a closed day, and nothing while hours are off", () => {
    const same = [{ from: "09:00", to: "21:00" }];
    expect(hoursLines(week(same, same), "en")).toEqual([
      { days: "Every day", hours: "09:00–21:00" },
    ]);
    expect(hoursLines(week(same, []), "en")[1]).toEqual({ days: "Fri", hours: "Closed" });
    expect(hoursLines({ ...week(same, same), enabled: false }, "en")).toEqual([]);
    expect(hoursLines(null, "en")).toEqual([]);
  });
});

describe("the footer", () => {
  it("names how to reach the store, from its own settings", () => {
    state.settings = {
      whatsapp_enabled: true,
      whatsapp_number: "97339950016",
      opening_hours: week([{ from: "10:00", to: "22:00" }], []),
    };
    renderFooter();
    expect(screen.getByRole("heading", { name: "Customer care" })).toBeTruthy();
    const chat = screen.getByRole("link", { name: /3995 0016/ });
    expect(chat.getAttribute("href")).toContain("wa.me/97339950016");
    expect(screen.getByText("Sat – Thu")).toBeTruthy();
  });

  it("has no customer care when the store set neither", () => {
    renderFooter();
    expect(screen.queryByRole("heading", { name: "Customer care" })).toBeNull();
  });

  it("draws its description and links once, not a second time for the phone", () => {
    renderFooter();
    expect(screen.getAllByText("Abayas.")).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: "Track your order" })).toHaveLength(1);
  });

  it("asks for one thing to join, and offers email beside it", () => {
    renderFooter();
    const field = screen.getByRole("textbox", { name: "WhatsApp number" });
    expect(field.getAttribute("type")).toBe("tel");
    expect(screen.getByRole("button", { name: "Join" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Or use email" }));
    expect(screen.getByRole("textbox", { name: "Email address" }).getAttribute("type")).toBe(
      "email",
    );
  });

  it("keeps Powered by Boutq OS", () => {
    renderFooter();
    expect(screen.getByRole("link", { name: "Powered by Boutq OS" })).toBeTruthy();
  });
});
