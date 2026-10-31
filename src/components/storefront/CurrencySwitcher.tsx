import { useStorefront } from "@/lib/storefront-context";
import { currencyLabel } from "@/lib/currency-label";
import { SoftText } from "@/components/motion/SoftText";
import { useDisplayCurrency } from "@/features/storefront-shell/hooks/use-display-currency";

/**
 * In the header, for a store that offers other currencies: which currency the shopper sees prices
 * in beside the store's own. Display only: the order is always charged in the store's currency.
 */
export function CurrencySwitcher() {
  const { lang, currency } = useStorefront();
  const { options, active, choose } = useDisplayCurrency();
  if (options.length < 2) return null;
  return (
    <select
      aria-label={lang === "ar" ? "عرض الأسعار بعملة" : "Show prices in"}
      className="h-11 max-w-full rounded-md border-0 bg-transparent px-1 text-xs font-semibold focus-visible:ring-2 focus-visible:ring-current/80"
      style={{ color: "var(--sf-header-fg)" }}
      value={active ?? currency}
      onChange={(event) => choose(event.target.value)}
    >
      {options.map((code) => (
        <option key={code} value={code} className="text-foreground">
          {code}
        </option>
      ))}
    </select>
  );
}

/**
 * "≈ SAR 319.15" under or beside a price in the store's currency, while the shopper has chosen
 * another currency; nothing otherwise.
 */
export function ApproxPrice({
  amount,
  className = "",
  charged = false,
}: {
  amount: number;
  className?: string;
  /** Add that the order is paid in the store's currency (checkout's total). */
  charged?: boolean;
}) {
  const { lang, currency } = useStorefront();
  const { approx } = useDisplayCurrency();
  const text = approx(amount);
  if (!text) return null;
  const paidIn = currencyLabel(currency, lang);
  const note = charged ? (lang === "ar" ? ` · الدفع بـ${paidIn}` : ` · you pay in ${paidIn}`) : "";
  return (
    // Another currency chosen: every approximate price blurs into the new one in place
    // (transitions.dev's text swap soft, the rule for "a currency changed").
    <span className={`text-xs font-normal text-muted-foreground ${className}`} dir="auto">
      <SoftText value={`${text}${note}`} />
    </span>
  );
}
