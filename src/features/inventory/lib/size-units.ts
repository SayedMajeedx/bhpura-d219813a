/** Common measurement units the admin can pick from for a "size" variant. */
export const SIZE_UNITS = ["", "cm", "mm", "m", "inch", "ft", "kg", "g", "ml", "l"] as const;

export const SIZE_UNIT_LABELS: Record<string, { ar: string; en: string }> = {
  "": { ar: "— بدون وحدة —", en: "— None —" },
  g: { ar: "غرام (g)", en: "Grams (g)" },
  kg: { ar: "كيلوغرام (kg)", en: "Kilograms (kg)" },
  ml: { ar: "ملليلتر (ml)", en: "Milliliters (ml)" },
  l: { ar: "لتر (l)", en: "Liters (l)" },
  inch: { ar: "إنش (inch)", en: "Inches (in)" },
  cm: { ar: "سنتيمتر (cm)", en: "Centimeters (cm)" },
  mm: { ar: "ميليمتر (mm)", en: "Millimeters (mm)" },
  m: { ar: "متر (m)", en: "Meters (m)" },
  ft: { ar: "قدم (ft)", en: "Feet (ft)" },
};
