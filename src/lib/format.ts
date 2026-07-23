export function formatMoney(amount: number, currency = "BHD", locale = "en-BH") {
  const n = Number(amount || 0);
  const normalizedCurrency = currency.toUpperCase();
  const isThreeDecimals = ["BHD", "KWD", "OMR", "IQD", "LYD"].includes(normalizedCurrency);
  const fractionDigits = isThreeDecimals ? 3 : 2;
  try {
    return new Intl.NumberFormat(locale, {
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
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

/** Formats order status strings contextually based on fulfillment methods. */
export function formatOrderStatus(status: string, fulfillmentMethod: string | null | undefined, lang: "ar" | "en"): string {
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

  switch (s) {
    case "draft":
      return lang === "ar" ? "مسودة" : "Draft";
    case "confirmed":
      return lang === "ar" ? "مؤكد" : "Confirmed";
    case "paid":
      return lang === "ar" ? "مدفوع" : "Paid";
    case "completed":
      return lang === "ar" ? "مكتمل" : "Completed";
    case "cancelled":
      return lang === "ar" ? "ملغى" : "Cancelled";
    case "pending_verification":
      return lang === "ar" ? "في انتظار التحقق" : "Pending Verification";
    case "archived_historical":
      return lang === "ar" ? "أرشيف تاريخي" : "Archived Historical";
    default:
      return status;
  }
}
