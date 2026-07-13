export function formatMoney(amount: number, currency = "BHD", locale = "en-BH") {
  const n = Number(amount || 0);
  const normalizedCurrency = currency.toUpperCase();
  const fractionDigits = normalizedCurrency === "BHD" ? 3 : undefined;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: normalizedCurrency,
      currencyDisplay: "symbol",
      ...(fractionDigits == null ? {} : {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
      }),
    }).format(n);
  } catch {
    return `${normalizedCurrency} ${n.toFixed(fractionDigits ?? 2)}`;
  }
}

/** Formats date-only database values without UTC shifting them a day. */
export function formatDate(value: string | Date | null | undefined, locale = "en-BH") {
  if (!value) return "—";
  let date: Date;
  if (value instanceof Date) {
    date = value;
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    date = new Date(year, month - 1, day);
  } else {
    date = new Date(value);
  }
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}
