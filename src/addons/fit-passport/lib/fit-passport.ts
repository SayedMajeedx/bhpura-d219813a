export type FitProfileField = {
  key: string;
  label_ar: string;
  label_en: string;
  required: boolean;
  aliases?: string[];
};

export type FitProfileMatch = {
  keywords: string[];
};

export type FitProfileDefinition = {
  key: string;
  label_ar: string;
  label_en: string;
  match?: FitProfileMatch;
  fields: FitProfileField[];
};

export type FitProfileType = "abaya" | "dress" | string;
export type FitMeasurements = Record<string, string | number>;
export type FitProfiles = Record<string, FitMeasurements>;

export const FASHION_FIT_PROFILES: FitProfileDefinition[] = [
  {
    key: "abaya",
    label_ar: "عباية",
    label_en: "Abaya",
    match: {
      keywords: ["abaya", "عباية", "عبايات", "قفطان", "kaftan", "jalabiya", "جلابية"],
    },
    fields: [
      {
        key: "length",
        label_ar: "الطول",
        label_en: "Length",
        required: true,
        aliases: ["length", "height", "طول"],
      },
      {
        key: "bust",
        label_ar: "الصدر",
        label_en: "Bust",
        required: true,
        aliases: ["bust", "chest", "صدر"],
      },
      {
        key: "sleeve",
        label_ar: "طول الكم",
        label_en: "Sleeve length",
        required: true,
        aliases: ["sleeve", "كم"],
      },
      {
        key: "shoulder",
        label_ar: "عرض الكتف",
        label_en: "Shoulder",
        required: true,
        aliases: ["shoulder", "كتف"],
      },
      {
        key: "waist",
        label_ar: "الخصر",
        label_en: "Waist",
        required: false,
        aliases: ["waist", "خصر"],
      },
      {
        key: "hips",
        label_ar: "الأرداف",
        label_en: "Hips",
        required: false,
        aliases: ["hips", "أرداف", "ارداف", "ورك"],
      },
      {
        key: "arm_width",
        label_ar: "عرض الذراع",
        label_en: "Arm width",
        required: false,
        aliases: ["arm_width", "arm width", "عرض الذراع", "ذراع"],
      },
    ],
  },
  {
    key: "dress",
    label_ar: "فستان",
    label_en: "Dress",
    match: {
      keywords: ["dress", "فساتين", "فستان", "دريس", "ثوب", "gown", "maxi"],
    },
    fields: [
      {
        key: "length",
        label_ar: "الطول",
        label_en: "Length",
        required: true,
        aliases: ["length", "height", "طول"],
      },
      {
        key: "bust",
        label_ar: "الصدر",
        label_en: "Bust",
        required: true,
        aliases: ["bust", "chest", "صدر"],
      },
      {
        key: "waist",
        label_ar: "الخصر",
        label_en: "Waist",
        required: true,
        aliases: ["waist", "خصر"],
      },
      {
        key: "shoulder",
        label_ar: "عرض الكتف",
        label_en: "Shoulder",
        required: true,
        aliases: ["shoulder", "كتف"],
      },
      {
        key: "sleeve",
        label_ar: "طول الكم",
        label_en: "Sleeve length",
        required: false,
        aliases: ["sleeve", "كم"],
      },
      {
        key: "hips",
        label_ar: "الأرداف",
        label_en: "Hips",
        required: false,
        aliases: ["hips", "أرداف", "ارداف", "ورك"],
      },
      {
        key: "arm_width",
        label_ar: "عرض الذراع",
        label_en: "Arm width",
        required: false,
        aliases: ["arm_width", "arm width", "عرض الذراع", "ذراع"],
      },
    ],
  },
];

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

export function resolveFitProfiles(raw: unknown): FitProfileDefinition[] {
  if (Array.isArray(raw) && raw.length > 0) {
    const valid = raw.filter(
      (p) =>
        p &&
        typeof p === "object" &&
        typeof p.key === "string" &&
        p.key.trim().length > 0 &&
        Array.isArray(p.fields),
    );
    if (valid.length > 0) {
      return valid as FitProfileDefinition[];
    }
  }
  return FASHION_FIT_PROFILES;
}

export function normalizeFitProfiles(
  profilesOrValue?: unknown,
  maybeValue?: unknown,
): Record<string, FitMeasurements> {
  let profiles: FitProfileDefinition[] = FASHION_FIT_PROFILES;
  let value: unknown = profilesOrValue;

  if (
    Array.isArray(profilesOrValue) &&
    profilesOrValue.length > 0 &&
    typeof profilesOrValue[0] === "object" &&
    "fields" in profilesOrValue[0]
  ) {
    profiles = profilesOrValue as FitProfileDefinition[];
    value = maybeValue;
  }

  const raw = value && typeof value === "object" ? (value as Record<string, any>) : {};
  const result: Record<string, FitMeasurements> = {};

  for (const p of profiles) {
    result[p.key] = raw[p.key] && typeof raw[p.key] === "object" ? { ...raw[p.key] } : {};
  }

  // If raw contains any existing top-level profile key
  const hasProfileKey = profiles.some((p) => raw[p.key] !== undefined);
  if (hasProfileKey) {
    return result;
  }

  // Legacy passports stored measurements flat, or used height / abaya_length
  const { height, abaya_length, ...rest } = raw;
  const legacyLength = height || abaya_length;
  const legacyMeasurements = {
    ...rest,
    ...(legacyLength ? { length: legacyLength } : {}),
  };

  const primaryKey = profiles[0]?.key || "abaya";
  result[primaryKey] = {
    ...(result[primaryKey] || {}),
    ...legacyMeasurements,
  };

  return result;
}

export function fitProfileForProduct(
  profilesOrCategory?: FitProfileDefinition[] | string | null,
  categoryOrName?: string | null,
  maybeName?: string | null,
): string {
  let profiles: FitProfileDefinition[] = FASHION_FIT_PROFILES;
  let category: string | null = null;
  let name: string | null = null;

  if (Array.isArray(profilesOrCategory)) {
    profiles = profilesOrCategory;
    category = categoryOrName ?? null;
    name = maybeName ?? null;
  } else {
    category = (profilesOrCategory as string | null) ?? null;
    name = categoryOrName ?? null;
  }

  const text = `${category ?? ""} ${name ?? ""}`.toLowerCase();
  for (const p of profiles) {
    const kws = p.match?.keywords ?? [p.key, p.label_en.toLowerCase(), p.label_ar.toLowerCase()];
    if (kws.some((kw) => text.includes(kw.toLowerCase()))) {
      return p.key;
    }
  }

  return profiles[0]?.key ?? "abaya";
}

export function missingFitFields(
  profilesOrType: FitProfileDefinition[] | string,
  typeOrValues: string | FitMeasurements,
  maybeValues?: FitMeasurements,
): string[] {
  let profiles: FitProfileDefinition[] = FASHION_FIT_PROFILES;
  let type: string;
  let values: FitMeasurements;

  if (Array.isArray(profilesOrType)) {
    profiles = profilesOrType;
    type = typeOrValues as string;
    values = maybeValues || {};
  } else {
    type = profilesOrType as string;
    values = (typeOrValues as FitMeasurements) || {};
  }

  const profileDef = profiles.find((p) => p.key === type);
  if (!profileDef) {
    const fallbackFields = (FIT_PROFILE_FIELDS as Record<string, any>)[type];
    if (fallbackFields) {
      return fallbackFields
        .filter(([, , , required]: any[]) => required)
        .filter(([key]: any[]) => {
          const value = Number(values[key]);
          return !Number.isFinite(value) || value <= 0;
        })
        .map(([key]: any[]) => key);
    }
    return [];
  }

  return profileDef.fields
    .filter((f) => f.required)
    .filter((f) => {
      const val = Number(values[f.key]);
      return !Number.isFinite(val) || val <= 0;
    })
    .map((f) => f.key);
}

export function matchCustomFieldToMeasurement(
  profilesOrField:
    FitProfileDefinition[] | { key: string; label_ar?: string | null; label_en?: string | null },
  maybeField?: { key: string; label_ar?: string | null; label_en?: string | null },
): string | null {
  let profiles: FitProfileDefinition[] = FASHION_FIT_PROFILES;
  let field: { key: string; label_ar?: string | null; label_en?: string | null };

  if (Array.isArray(profilesOrField)) {
    profiles = profilesOrField;
    field = maybeField!;
  } else {
    field = profilesOrField;
  }

  if (!field) return null;
  const text = `${field.key} ${field.label_ar ?? ""} ${field.label_en ?? ""}`.toLowerCase();
  const normalizedKey = field.key.toLowerCase();

  // 1. Exact key / prefix / suffix match
  for (const p of profiles) {
    for (const f of p.fields) {
      const fieldKeyLower = f.key.toLowerCase();
      if (
        normalizedKey === fieldKeyLower ||
        normalizedKey.endsWith(`_${fieldKeyLower}`) ||
        normalizedKey.includes(`_${fieldKeyLower}_`)
      ) {
        return f.key;
      }
    }
  }

  // 2. Sort candidate phrases by length descending to prevent shorter words like "طول"
  // from incorrectly shadowing compound phrases like "طول الكم"
  const allCandidates: Array<{ fieldKey: string; phrase: string }> = [];
  for (const p of profiles) {
    for (const f of p.fields) {
      const candidates = [f.label_ar, f.label_en, ...(f.aliases ?? [])].filter(Boolean);
      for (const c of candidates) {
        allCandidates.push({ fieldKey: f.key, phrase: c.toLowerCase() });
      }
    }
  }
  allCandidates.sort((a, b) => b.phrase.length - a.phrase.length);

  for (const item of allCandidates) {
    if (text.includes(item.phrase)) {
      return item.fieldKey;
    }
  }

  // Built-in fashion alias checks as robust fallback
  if (/sleeve|طول\s*الكم|الكم/.test(text)) return "sleeve";
  if (/shoulder|كتف/.test(text)) return "shoulder";
  if (/bust|chest|صدر/.test(text)) return "bust";
  if (/waist|خصر/.test(text)) return "waist";
  if (/hips?|أرداف|ارداف|ورك/.test(text)) return "hips";
  if (/arm.?width|عرض\s*الذراع/.test(text)) return "arm_width";
  if (/length|height|طول/.test(text)) return "length";

  return null;
}

/**
 * What a measurement can plausibly be, so a slip of the finger (a bust of 655, a length of 12)
 * is caught before a piece is cut to it. The bounds are wide on purpose: they cover children
 * and adults, and a width measured flat as well as a full circumference. Inches; a field the
 * list does not know gets the general bounds.
 */
const FIT_RANGES_IN: Record<string, readonly [number, number]> = {
  length: [20, 75],
  bust: [10, 80],
  sleeve: [8, 40],
  shoulder: [8, 30],
  waist: [10, 80],
  hips: [10, 90],
  arm_width: [3, 30],
};
const GENERAL_FIT_RANGE_IN: readonly [number, number] = [1, 120];
const CM_PER_INCH = 2.54;

export type FitUnit = "in" | "cm";
export type FitRangeProblem = { key: string; value: number; min: number; max: number };

/** The least and most a field can be, in the unit the shopper is typing in. */
export function fitFieldRange(key: string, unit: FitUnit): { min: number; max: number } {
  const [min, max] = FIT_RANGES_IN[key] ?? GENERAL_FIT_RANGE_IN;
  return unit === "cm"
    ? { min: Math.round(min * CM_PER_INCH), max: Math.round(max * CM_PER_INCH) }
    : { min, max };
}

/** The filled-in measurements that cannot be right, each with the bounds it broke. */
export function fitRangeProblems(
  values: FitMeasurements | null | undefined,
  unit: FitUnit,
): FitRangeProblem[] {
  const problems: FitRangeProblem[] = [];
  for (const [key, raw] of Object.entries(values ?? {})) {
    if (raw === "" || raw === null || raw === undefined) continue;
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) continue; // "missing" is another check
    const { min, max } = fitFieldRange(key, unit);
    if (value < min || value > max) problems.push({ key, value, min, max });
  }
  return problems;
}

/** One sentence naming each measurement to check and what it can be. */
export function fitRangeMessage(
  problems: readonly FitRangeProblem[],
  labelOf: (key: string) => string,
  unit: FitUnit,
  isAr: boolean,
): string {
  const unitWord = unit === "cm" ? (isAr ? "سم" : "cm") : isAr ? "إنش" : "in";
  const parts = problems.map((problem) =>
    isAr
      ? `${labelOf(problem.key)} (من ${problem.min} إلى ${problem.max} ${unitWord})`
      : `${labelOf(problem.key)} (${problem.min} to ${problem.max} ${unitWord})`,
  );
  return isAr
    ? `تحقق من هذه القياسات: ${parts.join("، ")}`
    : `Check these measurements: ${parts.join(", ")}`;
}
