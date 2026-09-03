export type FitProfileType = "abaya" | "dress";
export type FitMeasurements = Record<string, string | number>;
export type FitProfiles = Record<FitProfileType, FitMeasurements>;

export const FIT_PROFILE_FIELDS = {
  abaya: [
    ["length", "الطول", "Length", true],
    ["bust", "الصدر", "Bust", true],
    ["sleeve", "طول الكم", "Sleeve length", true],
    ["shoulder", "عرض الكتف", "Shoulder", true],
    ["waist", "الخصر", "Waist", false],
    ["hips", "الأرداف", "Hips", false],
    ["arm_width", "عرض الذراع", "Arm width", false],
  ],
  dress: [
    ["length", "الطول", "Length", true],
    ["bust", "الصدر", "Bust", true],
    ["waist", "الخصر", "Waist", true],
    ["shoulder", "عرض الكتف", "Shoulder", true],
    ["sleeve", "طول الكم", "Sleeve length", false],
    ["hips", "الأرداف", "Hips", false],
    ["arm_width", "عرض الذراع", "Arm width", false],
  ],
} as const;

export function normalizeFitProfiles(value: unknown): FitProfiles {
  const raw = value && typeof value === "object" ? (value as Record<string, any>) : {};
  if (raw.abaya || raw.dress) {
    return { abaya: raw.abaya ?? {}, dress: raw.dress ?? {} };
  }
  // Legacy passports used height and abaya_length for the same measurement.
  const { height, abaya_length, ...rest } = raw;
  return {
    abaya: { ...rest, ...(height || abaya_length ? { length: height || abaya_length } : {}) },
    dress: {},
  };
}

export function fitProfileForProduct(
  category?: string | null,
  name?: string | null,
): FitProfileType {
  const text = `${category ?? ""} ${name ?? ""}`.toLowerCase();
  return /dress|فساتين|فستان|دريس/.test(text) ? "dress" : "abaya";
}

export function missingFitFields(type: FitProfileType, values: FitMeasurements) {
  return FIT_PROFILE_FIELDS[type]
    .filter(([, , , required]) => required)
    .filter(([key]) => !String(values[key] ?? "").trim())
    .map(([key]) => key);
}

export function matchCustomFieldToMeasurement(field: {
  key: string;
  label_ar?: string | null;
  label_en?: string | null;
}) {
  const text = `${field.key} ${field.label_ar ?? ""} ${field.label_en ?? ""}`.toLowerCase();
  if (/sleeve|طول\s*الكم|الكم/.test(text)) return "sleeve";
  if (/shoulder|كتف/.test(text)) return "shoulder";
  if (/bust|chest|صدر/.test(text)) return "bust";
  if (/waist|خصر/.test(text)) return "waist";
  if (/hips?|أرداف|ارداف|ورك/.test(text)) return "hips";
  if (/arm.?width|عرض\s*الذراع/.test(text)) return "arm_width";
  if (/length|height|طول/.test(text)) return "length";
  return null;
}
