export function formatMoney(amount: number | string | null | undefined, currency = "BHD") {
  const n = Number(amount || 0);
  const normalized = (currency || "BHD").toUpperCase();
  const isThreeDecimals = ["BHD", "KWD", "OMR", "IQD", "LYD"].includes(normalized);
  const fractionDigits = isThreeDecimals ? 3 : 2;
  const symbol = normalized === "BHD" ? "د.ب." : normalized;
  return `${n.toFixed(fractionDigits)} ${symbol}`;
}

export function formatDate(value: string | Date | null | undefined, includeTime = false) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  const options: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  };
  return date.toLocaleDateString("ar-BH", options);
}

export function formatTimeAgo(value: string | Date | null | undefined) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "الآن";
  if (diffMins < 60) return `منذ ${diffMins} د`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `منذ ${diffHours} س`;
  const diffDays = Math.floor(diffHours / 24);
  return `منذ ${diffDays} يوم`;
}

export function cleanPhoneNumber(phone: string | null | undefined) {
  if (!phone) return "";
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length === 8 && !cleaned.startsWith("973")) {
    return `973${cleaned}`;
  }
  return cleaned;
}
