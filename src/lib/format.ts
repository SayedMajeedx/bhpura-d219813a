import { getOrderStatusLabel } from "@/lib/status-labels";
import { translateOptionValue } from "@/lib/variant-i18n";

export function westernNumeralLocale(locale = "en-BH"): string {
  try {
    return new Intl.Locale(locale, { numberingSystem: "latn" }).toString();
  } catch {
    return "en-BH-u-nu-latn";
  }
}

export function toWesternDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
}

export function formatMoney(amount: number, currency = "BHD", locale = "en-BH") {
  const n = Number(amount || 0);
  const normalizedCurrency = currency.toUpperCase();
  const isThreeDecimals = ["BHD", "KWD", "OMR", "IQD", "LYD"].includes(normalizedCurrency);
  const fractionDigits = isThreeDecimals ? 3 : 2;
  try {
    return new Intl.NumberFormat(westernNumeralLocale(locale), {
      style: "currency",
      currency: normalizedCurrency,
      currencyDisplay: "symbol",
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(n);
  } catch {
    return `${normalizedCurrency} ${n.toFixed(fractionDigits)}`;
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
  return new Intl.DateTimeFormat(westernNumeralLocale(locale), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

/** Formats order status strings contextually based on fulfillment methods. */
export function formatOrderStatus(
  status: string,
  fulfillmentMethod: string | null | undefined,
  lang: "ar" | "en",
): string {
  const s = (status || "").toLowerCase();
  const f = (fulfillmentMethod || "").toLowerCase();

  if (s === "shipped") {
    if (f === "pickup") {
      return lang === "ar" ? "جاهز للاستلام" : "Ready for Pickup";
    } else if (f === "digital") {
      return lang === "ar" ? "تم الإرسال / التسليم" : "Sent / Delivered";
    } else {
      return lang === "ar" ? "تم الشحن / التوصيل" : "Shipped / Out for Delivery";
    }
  }

  return getOrderStatusLabel(status, lang);
}

export interface SplitCompositeSizeResult {
  isComposite: boolean;
  size: string;
  unit: string;
  option: string;
  cleanLabelAr: string;
  cleanLabelEn: string;
}

/**
 * Detects composite variant strings entered into the size field
 * (e.g. "700 - عادية", "700g - بدون سكر", "500 / فستق")
 * and extracts the clean numeric size, resolved unit, and option label.
 */
export function splitCompositeVariantSize(
  rawSize?: string | null,
  rawUnit?: string | null,
): SplitCompositeSizeResult {
  const str = (rawSize ?? "").trim();
  const fallbackUnit = (rawUnit ?? "").trim();

  if (!str) {
    return {
      isComposite: false,
      size: "",
      unit: fallbackUnit,
      option: "",
      cleanLabelAr: "",
      cleanLabelEn: "",
    };
  }

  const compositeMatch = str.match(
    /^(\d+(?:\.\d+)?)\s*(g|kg|ml|l|cm|mm|غرام|جرام|كيلوغرام|كغ|مل|لتر)?\s*[-–—/:]\s*(.+)$/i,
  );

  if (compositeMatch) {
    const sizeNum = compositeMatch[1];
    const embeddedUnit = compositeMatch[2] ? compositeMatch[2].toLowerCase() : "";
    const optionText = compositeMatch[3].trim();

    let resolvedUnit = fallbackUnit;
    if (embeddedUnit) {
      if (["غرام", "جرام", "g"].includes(embeddedUnit)) resolvedUnit = "g";
      else if (["كيلوغرام", "كغ", "kg"].includes(embeddedUnit)) resolvedUnit = "kg";
      else if (["مل", "ml"].includes(embeddedUnit)) resolvedUnit = "ml";
      else if (["لتر", "l"].includes(embeddedUnit)) resolvedUnit = "l";
      else if (["سم", "cm"].includes(embeddedUnit)) resolvedUnit = "cm";
    }

    const unitLabelAr =
      resolvedUnit === "g"
        ? "غرام"
        : resolvedUnit === "kg"
          ? "كيلوغرام"
          : resolvedUnit === "ml"
            ? "مل"
            : resolvedUnit === "l"
              ? "لتر"
              : resolvedUnit;

    const cleanLabelAr = unitLabelAr
      ? `${sizeNum} ${unitLabelAr} · ${translateOptionValue(optionText, "ar")}`
      : `${sizeNum} · ${translateOptionValue(optionText, "ar")}`;
    const cleanLabelEn = resolvedUnit
      ? `${sizeNum}${resolvedUnit} · ${translateOptionValue(optionText, "en")}`
      : `${sizeNum} · ${translateOptionValue(optionText, "en")}`;

    return {
      isComposite: true,
      size: sizeNum,
      unit: resolvedUnit,
      option: optionText,
      cleanLabelAr,
      cleanLabelEn,
    };
  }

  return {
    isComposite: false,
    size: str,
    unit: fallbackUnit,
    option: "",
    cleanLabelAr: translateOptionValue(str, "ar"),
    cleanLabelEn: translateOptionValue(str, "en"),
  };
}

/** Format a size value with an optional unit, translating known units and values. */
export function formatSizeWithUnit(
  size: string | null | undefined,
  unit: string | null | undefined,
  lang: "ar" | "en" = "ar",
): string {
  const s = (size ?? "").trim();
  if (!s) return "";
  const u = (unit ?? "").trim();

  // If size has composite pattern like "700 - عادية", format cleanly as "700 غرام · عادية"
  const split = splitCompositeVariantSize(s, u);
  if (split.isComposite) {
    return lang === "ar" ? split.cleanLabelAr : split.cleanLabelEn;
  }

  if (!u) return translateOptionValue(s, lang);

  const key = u.toLowerCase();
  const map: Record<string, string> = {
    cm: "سم",
    mm: "مم",
    m: "م",
    inch: "إنش",
    in: "إنش",
    ft: "قدم",
    kg: "كيلوغرام",
    g: "غرام",
    grams: "غرام",
    gram: "غرام",
    lb: "رطل",
    ml: "مل",
    l: "لتر",
  };

  const arUnit = map[key] ?? translateOptionValue(u, "ar");
  const enUnit = translateOptionValue(u, "en") || u;

  // Avoid duplicate units if size string already ends with unit
  if (
    s.toLowerCase().endsWith(key) ||
    s.toLowerCase().endsWith(` ${key}`) ||
    s.endsWith(arUnit) ||
    s.endsWith(` ${arUnit}`)
  ) {
    return translateOptionValue(s, lang);
  }

  // If size is a text descriptor like "صغير" or "بوكس", translate the word itself
  const isNumericSize = !isNaN(Number(toWesternDigits(s)));
  const translatedSize = isNumericSize ? s : translateOptionValue(s, lang);

  if (lang !== "ar") {
    // e.g. 250g or 50 inch
    const isShortAlpha = /^[a-zA-Z]{1,3}$/.test(enUnit);
    return isShortAlpha && isNumericSize ? `${translatedSize}${enUnit}` : `${translatedSize} ${enUnit}`;
  }

  return `${translatedSize} ${arUnit}`;
}
