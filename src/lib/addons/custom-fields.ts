export interface CustomFieldItem {
  key: string;
  label_ar?: string | null;
  label_en?: string | null;
  value: string;
  type?: string | null;
  price_delta?: number | null;
}

export interface FormattedCustomField {
  key: string;
  label: string;
  value: string;
  isLink: boolean;
  isUrl: boolean;
}

const MEASUREMENT_KEY_LABELS: Record<string, { ar: string; en: string }> = {
  length: { ar: "الطول", en: "Length" },
  bust: { ar: "محيط الصدر", en: "Bust" },
  waist: { ar: "محيط الخصر", en: "Waist" },
  hips: { ar: "محيط الأرداف", en: "Hips" },
  sleeve: { ar: "طول الكم", en: "Sleeve Length" },
  shoulder: { ar: "عرض الكتف", en: "Shoulder Width" },
  arm_width: { ar: "عرض الذراع", en: "Arm Width" },
  height: { ar: "الطول الكامل", en: "Full Height" },
  chest: { ar: "محيط الصدر", en: "Chest" },
};

/**
 * Format custom fields and bespoke tailor measurements into luxury presentation strings.
 * Filters out internal metadata keys (e.g. unit/version tracking) and localizes numbers & units.
 */
export function formatCustomField(
  field: CustomFieldItem,
  lang: "ar" | "en" = "ar"
): FormattedCustomField | null {
  const rawKey = (field.key || "").trim().toLowerCase();

  // 1. Filter out internal system metadata fields
  if (
    rawKey.endsWith("_unit") ||
    rawKey === "fit_passport_unit" ||
    rawKey === "fit_unit" ||
    rawKey.endsWith("_version") ||
    rawKey === "fit_passport_version" ||
    !field.value ||
    !field.value.trim()
  ) {
    return null;
  }

  // 2. Resolve human-readable label
  let label = "";
  const existingAr = field.label_ar?.trim();
  const existingEn = field.label_en?.trim();

  // If already has a clean human label (not a raw snake_case key)
  const isRawKey = (l?: string) => !l || l === field.key || l.includes("_") || l.startsWith("fit_");

  if (lang === "ar" && existingAr && !isRawKey(existingAr)) {
    label = existingAr;
  } else if (lang === "en" && existingEn && !isRawKey(existingEn)) {
    label = existingEn;
  } else {
    // Determine from key suffix
    let matched = false;
    for (const [subKey, labels] of Object.entries(MEASUREMENT_KEY_LABELS)) {
      if (rawKey === subKey || rawKey.endsWith(`_${subKey}`)) {
        label = lang === "ar" ? labels.ar : labels.en;
        matched = true;
        break;
      }
    }

    if (!matched) {
      if (rawKey.includes("profile")) {
        label = lang === "ar" ? "ملف المقاس" : "Fit Profile";
      } else {
        // Fallback: clean the key string
        const cleaned = rawKey
          .replace(/^fit_passport_/, "")
          .replace(/^fit_/, "")
          .replace(/^cf_/, "")
          .replace(/_/g, " ");
        label = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
      }
    }
  }

  // 3. Format value cleanly (handle unit localization and bi-directional text)
  let val = field.value.trim();
  const isLink = val.startsWith("http://") || val.startsWith("https://");

  if (!isLink) {
    // If it's a bilingual profile like "عباية / Abaya"
    if (val.includes(" / ")) {
      const parts = val.split(" / ");
      val = lang === "ar" ? parts[0] : parts[1] || parts[0];
    } else if (/\d+\s*(?:in|inch|inches)$/i.test(val)) {
      // Localize inch unit
      const num = val.replace(/[^\d.]/g, "");
      val = lang === "ar" ? `${num} إنش` : `${num} in`;
    } else if (/\d+\s*(?:cm)$/i.test(val)) {
      // Localize cm unit
      const num = val.replace(/[^\d.]/g, "");
      val = lang === "ar" ? `${num} سم` : `${num} cm`;
    }
  }

  return {
    key: field.key,
    label,
    value: val,
    isLink,
    isUrl: isLink,
  };
}

/**
 * Filter and format an array of custom fields for customer display.
 */
export function formatCustomFieldsList(
  fields: CustomFieldItem[] | undefined | null,
  lang: "ar" | "en" = "ar"
): FormattedCustomField[] {
  if (!fields || !Array.isArray(fields)) return [];
  return fields
    .map((f) => formatCustomField(f, lang))
    .filter((f): f is FormattedCustomField => f !== null);
}
