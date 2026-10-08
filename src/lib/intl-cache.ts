/**
 * `Intl` formatters, built once per locale and options.
 *
 * Creating an `Intl.NumberFormat` (or an `Intl.Locale`) costs far more than using one, and a store
 * page formats a price for every product card, so building one per call was the single largest cost
 * of hydrating the home page on a phone (about 13% of its script time, measured). The number of
 * distinct locale and option combinations is tiny, so nothing here needs eviction.
 */

const locales = new Map<string, string>();
const numberFormats = new Map<string, Intl.NumberFormat>();
const dateFormats = new Map<string, Intl.DateTimeFormat>();

/** A locale with Western (Latin) digits, e.g. `ar-BH-u-nu-latn`, or the English fallback. */
export function westernNumeralLocale(locale = "en-BH"): string {
  const known = locales.get(locale);
  if (known !== undefined) return known;
  let resolved: string;
  if (locale.includes("-u-nu-latn")) {
    // Already says Western digits: what Intl.Locale would answer, without waking its locale data.
    resolved = locale;
  } else if (/^[a-z]{2,3}(-[A-Z]{2})?$/.test(locale)) {
    resolved = `${locale}-u-nu-latn`;
  } else {
    try {
      resolved = new Intl.Locale(locale, { numberingSystem: "latn" }).toString();
    } catch {
      resolved = "en-BH-u-nu-latn";
    }
  }
  locales.set(locale, resolved);
  return resolved;
}

/** The same formatter as `new Intl.NumberFormat(locale, options)`, reused. Throws like it for bad options. */
export function cachedNumberFormat(
  locale: string,
  options: Intl.NumberFormatOptions,
): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let format = numberFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(locale, options);
    numberFormats.set(key, format);
  }
  return format;
}

/** The same formatter as `new Intl.DateTimeFormat(locale, options)`, reused. */
export function cachedDateFormat(
  locale: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let format = dateFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, options);
    dateFormats.set(key, format);
  }
  return format;
}
