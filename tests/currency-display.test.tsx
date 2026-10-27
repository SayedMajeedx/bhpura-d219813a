import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import migration from "../supabase/migrations/20261027130000_currency_display.sql?raw";

// Prices in a shopper's own Gulf currency (migration 20261027130000): display only, "≈ 319 SAR"
// beside the real price. The database answers a store's choice and rates; the daily task keeps
// the rates and refuses a figure that jumped; the header's switcher and the approximation follow
// the shopper's choice.

vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });

const state = vi.hoisted(() => ({
  display: null as unknown,
  storefront: {} as Record<string, unknown>,
  rows: [] as Array<{ currency: string; per_usd: number }>,
  upserts: [] as unknown[],
}));

const currencyData = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  currencyDisplayQueries: {
    store: () => ({ queryKey: ["currency-display"], queryFn: async () => state.display }),
  },
});
vi.mock("../src/lib/data/currency-display", (io) => currencyData(io));
vi.mock("@/lib/data/currency-display", (io) => currencyData(io));
const storefrontContext = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  useStorefront: () => state.storefront,
});
vi.mock("../src/lib/storefront-context", (io) => storefrontContext(io));
vi.mock("@/lib/storefront-context", (io) => storefrontContext(io));
const adminClient = vi.hoisted(() => () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({ limit: async () => ({ data: state.rows, error: null }) }),
      upsert: async (rows: unknown[]) => {
        state.upserts.push(...rows);
        return { error: null };
      },
    }),
  },
}));
vi.mock("../src/integrations/supabase/client.server", adminClient);
vi.mock("@/integrations/supabase/client.server", adminClient);

const { approxPrice, convertAmount, ratesFromFeed } = await import("../src/lib/exchange-rates");
const { refreshExchangeRates } = await import("../src/lib/exchange-rates.server");
const { ApproxPrice, CurrencySwitcher } =
  await import("../src/components/storefront/CurrencySwitcher");

const PEGS = { USD: 1, BHD: 0.376, SAR: 3.75, AED: 3.6725, KWD: 0.3075 };

afterEach(() => {
  localStorage.clear();
  state.upserts = [];
});

describe("a price in another currency", () => {
  it("converts through the dollar and says it is approximate", () => {
    expect(convertAmount(37.6, "BHD", "SAR", PEGS)).toBeCloseTo(375, 6);
    expect(convertAmount(10, "BHD", "BHD", PEGS)).toBe(10);
    expect(convertAmount(10, "BHD", "QAR", PEGS)).toBeNull();
    expect(approxPrice(37.6, "BHD", "SAR", PEGS, "en")).toMatch(/^≈ .*375\.00/);
    expect(approxPrice(37.6, "BHD", "BHD", PEGS, "en")).toBeNull();
  });
});

describe("the daily rates", () => {
  it("takes the feed's figures and keeps the old one for a jump, a gap or nonsense", () => {
    const feed = { usd: { bhd: 0.3761, sar: 3.75, aed: 9.9, kwd: "x" } };
    const { accepted, refused } = ratesFromFeed(feed, PEGS);
    expect(accepted).toMatchObject({ USD: 1, BHD: 0.3761, SAR: 3.75 });
    expect(accepted.AED).toBeUndefined();
    expect(refused.sort()).toEqual(["AED", "KWD", "OMR", "QAR"]);
  });

  it("writes what it accepted, from the second feed when the first is down", async () => {
    state.rows = [
      { currency: "BHD", per_usd: 0.376 },
      { currency: "SAR", per_usd: 3.75 },
    ];
    const urls: string[] = [];
    const fetcher = (async (url: string) => {
      urls.push(url);
      if (urls.length === 1) return new Response("down", { status: 503 });
      return new Response(JSON.stringify({ usd: { bhd: 0.376, sar: 3.7502 } }));
    }) as unknown as typeof fetch;
    const result = await refreshExchangeRates(fetcher);
    expect(urls).toHaveLength(2);
    expect(result).toMatchObject({ ok: true, updated: 3 });
    expect(state.upserts.map((row) => (row as { currency: string }).currency).sort()).toEqual([
      "BHD",
      "SAR",
      "USD",
    ]);
  });
});

describe("what the database answers", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE public.brands (id uuid PRIMARY KEY, slug text, is_active boolean);
      INSERT INTO public.brands VALUES ('00000000-0000-4000-8000-000000000001', 'pura', true),
        ('00000000-0000-4000-8000-000000000002', 'shut', false);
      CREATE TABLE public.business_settings (brand_id uuid PRIMARY KEY, currency text);
      INSERT INTO public.business_settings VALUES ('00000000-0000-4000-8000-000000000001', 'BHD'),
        ('00000000-0000-4000-8000-000000000002', 'BHD');
    `);
    await db.exec(migration);
  });
  const answer = async (slug: string) =>
    (
      await db.query<{ r: Record<string, unknown> | null }>(
        "SELECT public.storefront_currency_display($1) AS r",
        [slug],
      )
    ).rows[0]?.r ?? null;

  it("says nothing for a store that offers no other currency", async () => {
    expect(await answer("pura")).toBeNull();
  });

  it("gives the store's currency, its choice and their rates", async () => {
    await db.query("UPDATE public.business_settings SET display_currencies = '{SAR,AED}'");
    const r = await answer("pura");
    expect(r).toMatchObject({ store: "BHD", currencies: ["SAR", "AED"] });
    expect(Object.keys(r?.rates as object).sort()).toEqual(["AED", "BHD", "SAR"]);
    expect(await answer("shut")).toBeNull();
  });

  it("refuses an unknown currency and lets no browser touch the rates table", async () => {
    await expect(
      db.query("UPDATE public.business_settings SET display_currencies = '{EUR}'"),
    ).rejects.toThrow();
    expect(migration).toMatch(/REVOKE ALL ON public\.exchange_rates FROM anon, authenticated;/);
  });
});

describe("the shopper's switcher", () => {
  const withQuery = (node: React.ReactNode) =>
    render(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>);
  const shop = {
    brand: { slug: "pura" },
    settings: { storefront_mode: "shop" },
    currency: "BHD",
    lang: "en",
  };

  it("shows nothing for a store that offers no other currency", async () => {
    state.storefront = shop;
    state.display = null;
    const { container } = withQuery(
      <>
        <CurrencySwitcher />
        <ApproxPrice amount={37.6} />
      </>,
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container.textContent).toBe("");
  });

  it("shows the approximation once the shopper picks a currency, and remembers it", async () => {
    state.storefront = shop;
    state.display = { store: "BHD", currencies: ["SAR"], rates: PEGS, updatedAt: null };
    withQuery(
      <>
        <CurrencySwitcher />
        <ApproxPrice amount={37.6} charged />
      </>,
    );
    const select = (await screen.findByLabelText("Show prices in")) as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(["BHD", "SAR"]);
    fireEvent.change(select, { target: { value: "SAR" } });
    await waitFor(() => expect(screen.getByText(/≈ .*375\.00 · you pay in BHD/)).toBeTruthy());
    expect(localStorage.getItem("boutq_display_currency_pura")).toBe("SAR");
  });
});
