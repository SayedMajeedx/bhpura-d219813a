import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { currencyDisplayQueries } from "@/lib/data/currency-display";
import { approxPrice } from "@/lib/exchange-rates";
import { useStorefront } from "@/lib/storefront-context";
import { isCatalogMode, shouldShowPrices } from "@/lib/storefront-mode";

const EVENT = "boutq:display-currency";
const keyOf = (slug: string) => `boutq_display_currency_${slug}`;

const read = (slug: string): string | null => {
  try {
    return localStorage.getItem(keyOf(slug));
  } catch {
    return null;
  }
};

/**
 * The currency a shopper chose to see prices in (display only: the store charges in its own),
 * remembered per store in this browser. `approx(amount)` is "≈ SAR 319.15" for an amount in the
 * store's currency, or null when the shopper sees the store's own (or the store offers none).
 */
export function useDisplayCurrency() {
  const { brand, settings, currency, lang } = useStorefront();
  const shows = shouldShowPrices(settings) && !isCatalogMode(settings);
  const display = useQuery({ ...currencyDisplayQueries.store(brand.slug), enabled: shows }).data;
  const [chosen, setChosen] = useState<string | null>(null);
  useEffect(() => {
    setChosen(read(brand.slug));
    const sync = () => setChosen(read(brand.slug));
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, [brand.slug]);

  const choose = useCallback(
    (code: string) => {
      try {
        if (code === currency) localStorage.removeItem(keyOf(brand.slug));
        else localStorage.setItem(keyOf(brand.slug), code);
      } catch {
        // No storage (private mode): the choice lasts for this page only.
      }
      setChosen(code === currency ? null : code);
      window.dispatchEvent(new Event(EVENT));
    },
    [brand.slug, currency],
  );

  const active =
    display &&
    chosen &&
    chosen !== currency &&
    (display.currencies as readonly string[]).includes(chosen)
      ? chosen
      : null;
  const approx = useCallback(
    (amount: number) =>
      active && display ? approxPrice(amount, currency, active, display.rates, lang) : null,
    [active, display, currency, lang],
  );

  return {
    /** The currencies the shopper may pick (the store's own first); empty when none is offered. */
    options: display ? [currency, ...display.currencies.filter((c) => c !== currency)] : [],
    active,
    choose,
    approx,
  };
}
