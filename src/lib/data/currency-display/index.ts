import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isDisplayCurrency, type DisplayCurrency, type Rates } from "@/lib/exchange-rates";

/**
 * What a shopper needs to see prices in another currency (migration 20261027130000): the store's
 * own currency, the ones it offers and their rates. Null for a store that offers none.
 */
export type CurrencyDisplay = {
  store: string;
  currencies: DisplayCurrency[];
  rates: Rates;
  updatedAt: string | null;
};

export async function fetchCurrencyDisplay(slug: string): Promise<CurrencyDisplay | null> {
  const { data, error } = await supabase.rpc("storefront_currency_display", {
    p_brand_slug: slug,
  });
  if (error) throw error;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const raw = data as Record<string, unknown>;
  const rates: Rates = {};
  if (raw.rates && typeof raw.rates === "object") {
    for (const [code, value] of Object.entries(raw.rates as Record<string, unknown>)) {
      if (isDisplayCurrency(code) && Number(value) > 0) rates[code] = Number(value);
    }
  }
  const currencies = Array.isArray(raw.currencies) ? raw.currencies.filter(isDisplayCurrency) : [];
  if (currencies.length === 0) return null;
  return {
    store: String(raw.store ?? "BHD"),
    currencies,
    rates,
    updatedAt: typeof raw.updated_at === "string" ? raw.updated_at : null,
  };
}

export const currencyDisplayQueries = {
  store: (slug: string) =>
    queryOptions({
      queryKey: ["storefront", slug, "currency-display"] as const,
      queryFn: () => fetchCurrencyDisplay(slug),
      enabled: Boolean(slug),
      staleTime: 60 * 60_000,
    }),
};
