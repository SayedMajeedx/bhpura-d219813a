export function variantCountLabel(count: number, lang: "ar" | "en"): string {
  if (lang === "ar") {
    if (count === 0) return "لا توجد خيارات";
    if (count === 1) return "خيار واحد";
    if (count === 2) return "خياران";
    return `${count} خيارات`;
  }

  return `${count} ${count === 1 ? "variant" : "variants"}`;
}

export function stockUnitsLabel(
  totalStock: number,
  status: "low" | "available",
  lang: "ar" | "en",
): string {
  if (lang === "ar") {
    if (totalStock === 1) {
      return status === "low" ? "وحدة واحدة متبقية" : "وحدة واحدة متوفرة";
    }
    if (totalStock === 2) {
      return status === "low" ? "وحدتان متبقيتان" : "وحدتان متوفرتان";
    }
    return status === "low"
      ? `${totalStock} وحدات متبقية`
      : `${totalStock} وحدات متوفرة`;
  }

  return status === "low"
    ? `${totalStock} units remaining`
    : `${totalStock} units available`;
}
