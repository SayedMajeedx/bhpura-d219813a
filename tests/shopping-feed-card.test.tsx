import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

// The integrations' Pixels tab offers the store's shopping catalog: the two links to paste into
// Meta Commerce Manager and Google Merchant Center, how, and what is left out. A store that hides
// its prices is told why it has none instead.

const brand = { id: "b1", slug: "pura", custom_domain: null };
vi.mock("../src/lib/brand-context", () => ({ useBrand: () => brand }));
vi.mock("@/lib/brand-context", () => ({ useBrand: () => brand }));

const settings = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
const businessSettings = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  businessSettingsQueries: {
    detail: () => ({
      queryKey: ["feed-card-settings", JSON.stringify(settings.current)],
      queryFn: async () => settings.current,
    }),
  },
});
vi.mock("../src/lib/data/business-settings", (io) => businessSettings(io));
vi.mock("@/lib/data/business-settings", (io) => businessSettings(io));

const { ShoppingFeedCard } = await import("../src/components/integrations/ShoppingFeedCard");

const renderCard = (isAr = false) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ShoppingFeedCard brandId="b1" isAr={isAr} />
    </QueryClientProvider>,
  );

describe("the shopping catalog card", () => {
  it("gives the Arabic and English links, each with its copy button", async () => {
    settings.current = { storefront_mode: "shop" };
    renderCard();
    const arabic = await screen.findByLabelText("Arabic catalog");
    expect((arabic as HTMLInputElement).value).toMatch(/\/pura\/products\.xml$/);
    expect((screen.getByLabelText("English catalog") as HTMLInputElement).value).toMatch(
      /\/pura\/products\.xml\?lang=en$/,
    );
    expect(
      screen.getByRole("button", { name: "Copy the Arabic catalog link" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Scheduled feed/)).toBeInTheDocument();
    expect(screen.getByText(/A sold-out size stays in, marked out of stock/)).toBeInTheDocument();
  });

  it("tells a store that hides its prices why it has no catalog", async () => {
    settings.current = { storefront_mode: "catalog", catalog_show_prices: false };
    renderCard();
    expect(await screen.findByText(/Your store hides its prices/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Arabic catalog")).not.toBeInTheDocument();
  });

  it("speaks Arabic on an Arabic page", async () => {
    settings.current = { storefront_mode: "shop" };
    renderCard(true);
    expect(await screen.findByText("كتالوج انستغرام وجوجل")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "نسخ رابط الكتالوج بالعربية" })).toBeInTheDocument();
  });
});
