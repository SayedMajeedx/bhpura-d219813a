import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isDisplayCurrency, ratesFromFeed, type Rates } from "@/lib/exchange-rates";

/**
 * The worker's daily task: refreshes `exchange_rates` from a free public feed (CC0, no key) and
 * keeps the rate it had for a currency the feed lacks or that moved more than a pegged currency
 * can (`ratesFromFeed`). Display only: no order is priced from these.
 */

const FEEDS = [
  "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json",
  "https://latest.currency-api.pages.dev/v1/currencies/usd.json",
];

export type ExchangeRatesRefreshResult = {
  ok: boolean;
  updated: number;
  refused: number;
};

async function fetchFeed(fetcher: typeof fetch): Promise<unknown> {
  let lastError: unknown = null;
  for (const url of FEEDS) {
    try {
      const response = await fetcher(url, { headers: { accept: "application/json" } });
      if (response.ok) return await response.json();
      lastError = new Error(`exchange rate feed answered ${response.status}`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("no exchange rate feed answered");
}

export async function refreshExchangeRates(
  fetcher: typeof fetch = fetch,
): Promise<ExchangeRatesRefreshResult> {
  const { data: rows, error } = await supabaseAdmin
    .from("exchange_rates")
    .select("currency, per_usd")
    .limit(20);
  if (error) throw error;
  const kept: Rates = {};
  for (const row of rows ?? []) {
    if (isDisplayCurrency(row.currency)) kept[row.currency] = Number(row.per_usd);
  }

  const { accepted, refused } = ratesFromFeed(await fetchFeed(fetcher), kept);
  const now = new Date().toISOString();
  const upserts = Object.entries(accepted).map(([currency, perUsd]) => ({
    currency,
    per_usd: perUsd as number,
    source: "currency-api",
    updated_at: now,
  }));
  const { error: writeError } = await supabaseAdmin
    .from("exchange_rates")
    .upsert(upserts, { onConflict: "currency" });
  if (writeError) throw writeError;
  return { ok: true, updated: upserts.length, refused: refused.length };
}
