import { parseCSV } from "@/lib/csv-parser";

export type SizeGuideUnit = "cm" | "in" | "none";

export type SizeGuideColumn = {
  key: string;
  label_ar: string;
  label_en: string;
  kind: "measurement" | "text" | "size_label";
  measurement_key?: string | null;
};

export type SizeGuideCell = number | { min: number; max: number } | string | null;

export type SizeGuideRow = {
  label: string;
  size_label?: string;
  values: Record<string, SizeGuideCell>;
  note_ar?: string | null;
  note_en?: string | null;
};

export type SizeGuideStep = {
  title_ar: string;
  title_en: string;
  body_ar: string;
  body_en: string;
  description_ar?: string;
  description_en?: string;
  step_number?: number;
};

export type SizeGuidePlacement = "modal" | "inline" | "both";

export type SizeGuide = {
  id: string;
  brand_id: string;
  name_ar: string;
  name_en: string;
  template_key: string | null;
  base_unit: SizeGuideUnit;
  columns: SizeGuideColumn[];
  rows: SizeGuideRow[];
  how_to_measure: SizeGuideStep[];
  diagram_url: string | null;
  video_url: string | null;
  notes_ar: string | null;
  notes_en: string | null;
  placement: SizeGuidePlacement;
  recommender_enabled: boolean;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
};

export type SizeRecommendation = {
  size: string | null;
  confidence: "high" | "medium" | "low";
  confidenceScore?: number;
  between?: [string, string];
  oversize?: boolean;
  reasons: Array<{
    column: SizeGuideColumn;
    customer: number;
    row: SizeGuideCell;
  }>;
};

/**
 * Normalizes and validates a raw object conforming to SizeGuide with safe fallbacks.
 */
export function normalizeSizeGuide(raw: unknown): SizeGuide {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      id: "default-guide",
      brand_id: "default-brand",
      name_ar: "دليل المقاسات",
      name_en: "Size Guide",
      template_key: null,
      base_unit: "in",
      columns: [],
      rows: [],
      how_to_measure: [],
      diagram_url: null,
      video_url: null,
      notes_ar: null,
      notes_en: null,
      placement: "both",
      recommender_enabled: true,
      is_default: false,
      is_active: true,
      sort_order: 0,
    };
  }
  const r = raw as Record<string, unknown>;

  const id = typeof r.id === "string" && r.id.trim() ? r.id.trim() : "default-guide";
  const brand_id =
    typeof r.brand_id === "string" && r.brand_id.trim() ? r.brand_id.trim() : "default-brand";
  const name_ar =
    typeof r.name_ar === "string" && r.name_ar.trim()
      ? r.name_ar.trim()
      : typeof r.name_en === "string"
        ? r.name_en
        : "دليل المقاسات";
  const name_en =
    typeof r.name_en === "string" && r.name_en.trim()
      ? r.name_en.trim()
      : typeof r.name_ar === "string"
        ? r.name_ar
        : "Size Guide";

  const validUnits: SizeGuideUnit[] = ["cm", "in", "none"];
  const base_unit: SizeGuideUnit = validUnits.includes(r.base_unit as SizeGuideUnit)
    ? (r.base_unit as SizeGuideUnit)
    : "in";

  const validPlacements: SizeGuidePlacement[] = ["modal", "inline", "both"];
  const placement: SizeGuidePlacement = validPlacements.includes(r.placement as SizeGuidePlacement)
    ? (r.placement as SizeGuidePlacement)
    : "both";

  // Validate columns
  const rawCols = Array.isArray(r.columns) ? r.columns : [];
  const columns: SizeGuideColumn[] = [];
  for (const c of rawCols) {
    if (!c || typeof c !== "object" || Array.isArray(c)) continue;
    const col = c as Record<string, unknown>;
    const key =
      typeof col.key === "string" && col.key.trim() ? col.key.trim() : `col_${columns.length}`;
    columns.push({
      key,
      label_ar: typeof col.label_ar === "string" ? col.label_ar : key,
      label_en: typeof col.label_en === "string" ? col.label_en : key,
      kind: col.kind === "text" ? "text" : col.kind === "size_label" ? "size_label" : "measurement",
      measurement_key:
        typeof col.measurement_key === "string" && col.measurement_key.trim()
          ? col.measurement_key.trim()
          : null,
    });
  }

  // Validate rows
  const rawRows = Array.isArray(r.rows) ? r.rows : [];
  const rows: SizeGuideRow[] = [];
  for (const rowItem of rawRows) {
    if (!rowItem || typeof rowItem !== "object" || Array.isArray(rowItem)) continue;
    const row = rowItem as Record<string, unknown>;
    const rawLabel = row.label ?? row.size_label;
    const label = rawLabel !== undefined && rawLabel !== null ? String(rawLabel).trim() : "";
    if (!label) continue;

    const valuesObj =
      row.values && typeof row.values === "object" && !Array.isArray(row.values)
        ? (row.values as Record<string, unknown>)
        : {};

    const values: Record<string, SizeGuideCell> = {};
    for (const [k, v] of Object.entries(valuesObj)) {
      if (v === null || v === undefined) {
        values[k] = null;
      } else if (typeof v === "number" && !isNaN(v)) {
        values[k] = v;
      } else if (typeof v === "string") {
        values[k] = v;
      } else if (
        typeof v === "object" &&
        v !== null &&
        "min" in v &&
        "max" in v &&
        typeof (v as any).min === "number" &&
        typeof (v as any).max === "number"
      ) {
        values[k] = { min: (v as any).min, max: (v as any).max };
      } else {
        values[k] = null;
      }
    }

    rows.push({
      label,
      size_label: label,
      values,
      note_ar: typeof row.note_ar === "string" ? row.note_ar : null,
      note_en: typeof row.note_en === "string" ? row.note_en : null,
    });
  }

  // Validate how_to_measure
  const how_to_measure: SizeGuideStep[] = [];
  if (Array.isArray(r.how_to_measure)) {
    for (const step of r.how_to_measure) {
      if (step && typeof step === "object") {
        const s = step as Record<string, unknown>;
        how_to_measure.push({
          title_ar: typeof s.title_ar === "string" ? s.title_ar : "",
          title_en: typeof s.title_en === "string" ? s.title_en : "",
          body_ar:
            typeof s.body_ar === "string"
              ? s.body_ar
              : typeof s.description_ar === "string"
                ? s.description_ar
                : "",
          body_en:
            typeof s.body_en === "string"
              ? s.body_en
              : typeof s.description_en === "string"
                ? s.description_en
                : "",
        });
      }
    }
  }

  return {
    id,
    brand_id,
    name_ar,
    name_en,
    template_key: typeof r.template_key === "string" ? r.template_key : null,
    base_unit,
    columns,
    rows,
    how_to_measure,
    diagram_url: typeof r.diagram_url === "string" ? r.diagram_url : null,
    video_url: typeof r.video_url === "string" ? r.video_url : null,
    notes_ar: typeof r.notes_ar === "string" ? r.notes_ar : null,
    notes_en: typeof r.notes_en === "string" ? r.notes_en : null,
    placement,
    recommender_enabled: r.recommender_enabled !== false,
    is_default: Boolean(r.is_default),
    is_active: r.is_active !== false,
    sort_order: typeof r.sort_order === "number" ? r.sort_order : 0,
  };
}

/**
 * Converts a measurement number between units with 1-decimal rounding precision.
 * 1 in = 2.54 cm.
 */
export function convertMeasurement(
  value: number | { min: number; max: number },
  from: SizeGuideUnit,
  to: SizeGuideUnit,
): any {
  if (typeof value === "object" && value !== null && "min" in value && "max" in value) {
    return {
      min: convertMeasurement(value.min, from, to) as number,
      max: convertMeasurement(value.max, from, to) as number,
    };
  }
  if (typeof value !== "number" || isNaN(value)) {
    return value;
  }
  if (from === to || from === "none" || to === "none") {
    return value;
  }
  let converted: number;
  if (from === "in" && to === "cm") {
    converted = value * 2.54;
  } else if (from === "cm" && to === "in") {
    converted = value / 2.54;
  } else {
    return value;
  }
  // Round to 1 decimal place: e.g. 50.8, 2.5
  return Math.round(converted * 10) / 10;
}

/**
 * Formats a single cell for rendering in the storefront table.
 * Converts numbers/ranges if column kind is "measurement", otherwise returns string as-is.
 */
export function formatCell(
  cell: SizeGuideCell,
  columnOrFrom?: SizeGuideColumn | SizeGuideUnit,
  fromOrTo?: SizeGuideUnit,
  toMaybe?: SizeGuideUnit,
): string {
  if (cell === null || cell === undefined || cell === "") {
    return "—";
  }

  let from: SizeGuideUnit = "in";
  let to: SizeGuideUnit = "in";
  let isMeasurement = true;

  if (typeof columnOrFrom === "object" && columnOrFrom !== null) {
    isMeasurement = columnOrFrom.kind !== "text";
    from = fromOrTo || "in";
    to = toMaybe || from;
  } else if (typeof columnOrFrom === "string") {
    from = columnOrFrom;
    to = fromOrTo || from;
  }

  if (!isMeasurement) {
    return String(cell);
  }

  // If cell is a range object { min, max }
  if (typeof cell === "object" && cell !== null && "min" in cell && "max" in cell) {
    const min = convertMeasurement(cell.min, from, to);
    const max = convertMeasurement(cell.max, from, to);
    return `${min}–${max}`;
  }

  // If cell is a number
  if (typeof cell === "number") {
    const converted = convertMeasurement(cell, from, to);
    return String(converted);
  }

  // If cell is a string (could be range like "20-21" or "20–21")
  if (typeof cell === "string") {
    const rangeMatch = cell.trim().match(/^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)$/);
    if (rangeMatch) {
      const min = convertMeasurement(parseFloat(rangeMatch[1]), from, to);
      const max = convertMeasurement(parseFloat(rangeMatch[2]), from, to);
      return `${min}–${max}`;
    }
    const num = parseFloat(cell);
    if (!isNaN(num) && String(num) === cell.trim()) {
      return String(convertMeasurement(num, from, to));
    }
    return cell;
  }

  return String(cell);
}

/**
 * Resolves the appropriate size guide for a given product through a 3-tier hierarchy:
 * 1. Product explicit size_guide_id
 * 2. Category size_guide_id (ascends up parent_id hierarchy)
 * 3. Brand default size_guide
 * Returns null if size_guide_hidden is true or no active guide matches.
 */
export function resolveSizeGuideForProduct(args: {
  product: {
    size_guide_id?: string | null;
    size_guide_hidden?: boolean | null;
    category?: string | null;
  };
  categories?: Array<{
    id: string;
    slug?: string | null;
    name_en?: string;
    parent_id?: string | null;
    size_guide_id?: string | null;
  }>;
  guides?: SizeGuide[];
  sizeGuides?: SizeGuide[];
}): SizeGuide | null {
  const { product } = args;
  const categories = args.categories ?? [];
  const guides = args.guides ?? args.sizeGuides ?? [];

  if (product.size_guide_hidden) {
    return null;
  }

  // 1. Product explicit assignment
  if (product.size_guide_id) {
    const guide = guides.find((g) => g.id === product.size_guide_id && g.is_active !== false);
    if (guide) return guide;
  }

  // 2. Category assignment (with parent inheritance)
  if (product.category) {
    const norm = product.category.toLowerCase().trim();
    let currentCat = categories.find(
      (c) =>
        (c.slug && c.slug.toLowerCase().trim() === norm) ||
        (c.name_en && c.name_en.toLowerCase().trim() === norm) ||
        c.id === product.category,
    );

    const visited = new Set<string>();
    while (currentCat) {
      if (visited.has(currentCat.id)) break;
      visited.add(currentCat.id);

      if (currentCat.size_guide_id) {
        const guide = guides.find(
          (g) => g.id === currentCat!.size_guide_id && g.is_active !== false,
        );
        if (guide) return guide;
      }

      if (currentCat.parent_id) {
        currentCat = categories.find((c) => c.id === currentCat!.parent_id);
      } else {
        break;
      }
    }
  }

  // 3. Brand default guide
  const defaultGuide = guides.find((g) => g.is_default && g.is_active !== false);
  return defaultGuide ?? null;
}

/** Known measurement key synonyms for auto-detection */
const KNOWN_MEASUREMENT_KEYS: Record<string, string> = {
  bust: "bust",
  chest: "bust",
  صدر: "bust",
  الصدر: "bust",
  محيط_الصدر: "bust",
  waist: "waist",
  خصر: "waist",
  الخصر: "waist",
  hips: "hips",
  hip: "hips",
  ارداف: "hips",
  أرداف: "hips",
  الارداف: "hips",
  الأرداف: "hips",
  length: "length",
  height: "length",
  طول: "length",
  الطول: "length",
  sleeve: "sleeve",
  كم: "sleeve",
  الكم: "sleeve",
  shoulder: "shoulder",
  كتف: "shoulder",
  الكتف: "shoulder",
  inseam: "inseam",
  foot: "foot",
  قدم: "foot",
  finger: "finger",
  اصبع: "finger",
  wrist: "wrist",
  معصم: "wrist",
};

/**
 * Parses tab-delimited or comma-delimited size table text pasted from Excel or Google Sheets.
 */
export function parseSizeGuidePaste(
  rawText: string,
  _baseUnit: SizeGuideUnit = "in",
): { columns: SizeGuideColumn[]; rows: SizeGuideRow[] } | null {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return null;
  }

  let rawLines: string[][];
  if (trimmed.includes("\t")) {
    rawLines = trimmed
      .split(/\r?\n/)
      .map((line) => line.split("\t").map((cell) => cell.trim()))
      .filter((line) => line.some((c) => c.length > 0));
  } else {
    rawLines = parseCSV(trimmed).filter((line) => line.some((c) => c.length > 0));
  }

  if (rawLines.length < 2) {
    return null;
  }

  const headerRow = rawLines[0];
  const dataRows = rawLines.slice(1);

  // Column 0 is the size row label. Columns 1..N are the measurement/text columns.
  const col0Header = headerRow[0] || "Size";
  const columns: SizeGuideColumn[] = [
    {
      key: "size",
      label_ar: col0Header,
      label_en: col0Header,
      kind: "size_label",
    },
  ];

  for (let i = 1; i < headerRow.length; i++) {
    const rawHeader = headerRow[i] || `Col ${i}`;
    const cleanHeader = rawHeader.trim();
    const key =
      cleanHeader
        .toLowerCase()
        .replace(/[^a-z0-9\u0600-\u06FF]+/g, "_")
        .replace(/(^_|_$)/g, "") || `col_${i}`;

    let numericCount = 0;
    let totalCount = 0;
    for (const row of dataRows) {
      const val = row[i];
      if (val !== undefined && val !== "") {
        totalCount++;
        const isNum = !isNaN(parseFloat(val));
        const isRange = /^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)$/.test(val.trim());
        if (isNum || isRange) {
          numericCount++;
        }
      }
    }

    const isMeasurement = totalCount > 0 && numericCount / totalCount >= 0.5;
    const lookupKey = key.toLowerCase();
    const measurement_key = isMeasurement ? (KNOWN_MEASUREMENT_KEYS[lookupKey] ?? key) : null;

    columns.push({
      key,
      label_ar: cleanHeader,
      label_en: cleanHeader,
      kind: isMeasurement ? "measurement" : "text",
      measurement_key,
    });
  }

  const rows: SizeGuideRow[] = [];
  for (const r of dataRows) {
    const label = r[0]?.trim();
    if (!label) continue;

    const values: Record<string, SizeGuideCell> = {};
    for (let i = 1; i < headerRow.length; i++) {
      const col = columns[i];
      if (!col) continue;
      const rawVal = r[i]?.trim();
      if (!rawVal) {
        values[col.key] = null;
        continue;
      }

      if (col.kind === "text") {
        values[col.key] = rawVal;
        continue;
      }

      // Check if range "20-21"
      const rangeMatch = rawVal.match(/^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)$/);
      if (rangeMatch) {
        values[col.key] = {
          min: parseFloat(rangeMatch[1]),
          max: parseFloat(rangeMatch[2]),
        };
      } else {
        const num = parseFloat(rawVal);
        values[col.key] = isNaN(num) ? rawVal : num;
      }
    }

    rows.push({
      label,
      size_label: label,
      values,
    });
  }

  return { columns, rows };
}

/**
 * Transparent, deterministic size recommender.
 * Matches customer measurements against guide measurements within tolerance (1cm / 0.4in).
 */
export function recommendSize(args: {
  guide: SizeGuide;
  measurements?: Record<string, number>;
  userMeasurements?: Record<string, number>;
  unit?: SizeGuideUnit;
  inputUnit?: SizeGuideUnit;
}): SizeRecommendation | null {
  const { guide } = args;
  const rawMeasurements = args.userMeasurements ?? args.measurements ?? {};
  const unit = args.inputUnit ?? args.unit ?? guide.base_unit;

  // Filter valid numbers > 0
  const validMeasurements: Record<string, number> = {};
  for (const [k, v] of Object.entries(rawMeasurements)) {
    if (typeof v === "number" && !isNaN(v) && v > 0) {
      validMeasurements[k] = v;
    }
  }

  if (Object.keys(validMeasurements).length === 0) {
    return null;
  }

  // Convert customer measurements to guide base_unit
  const convertedCustomer: Record<string, number> = {};
  for (const [key, val] of Object.entries(validMeasurements)) {
    convertedCustomer[key] = convertMeasurement(val, unit, guide.base_unit) as number;
  }

  // Find columns that have an active measurement_key matching customer measurements
  const activeCols = guide.columns.filter(
    (col) =>
      col.kind === "measurement" &&
      col.measurement_key &&
      convertedCustomer[col.measurement_key] !== undefined,
  );

  if (activeCols.length === 0 || guide.rows.length === 0) {
    return null;
  }

  const tolerance = guide.base_unit === "in" ? 0.4 : 1.0;

  type CandidateRow = {
    row: SizeGuideRow;
    totalExcess: number;
    reasons: Array<{
      column: SizeGuideColumn;
      customer: number;
      row: SizeGuideCell;
    }>;
  };

  const fittingRows: CandidateRow[] = [];

  for (const row of guide.rows) {
    let fitsAll = true;
    let totalExcess = 0;
    const reasons: Array<{
      column: SizeGuideColumn;
      customer: number;
      row: SizeGuideCell;
    }> = [];

    for (const col of activeCols) {
      const custVal = convertedCustomer[col.measurement_key!];
      const cell = row.values[col.key];

      let maxVal: number | undefined;
      if (typeof cell === "number") {
        maxVal = cell;
      } else if (cell && typeof cell === "object" && "max" in cell) {
        maxVal = cell.max;
      } else if (typeof cell === "string") {
        const match = cell.match(/^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)$/);
        if (match) {
          maxVal = parseFloat(match[2]);
        } else {
          const num = parseFloat(cell);
          if (!isNaN(num)) maxVal = num;
        }
      }

      if (maxVal === undefined) {
        continue;
      }

      if (maxVal < custVal - tolerance) {
        fitsAll = false;
        break;
      }

      const excess = Math.max(0, maxVal - custVal);
      totalExcess += excess;
      reasons.push({
        column: col,
        customer: custVal,
        row: cell,
      });
    }

    if (fitsAll && reasons.length > 0) {
      fittingRows.push({
        row,
        totalExcess,
        reasons,
      });
    }
  }

  if (fittingRows.length === 0) {
    // Customer is larger than all available rows -> oversize
    const largestRow = guide.rows[guide.rows.length - 1];
    const reasons = activeCols.map((col) => ({
      column: col,
      customer: convertedCustomer[col.measurement_key!],
      row: largestRow.values[col.key] ?? null,
    }));

    return {
      size: largestRow.size_label || largestRow.label || null,
      confidence: "low",
      confidenceScore: 30,
      oversize: true,
      reasons,
    };
  }

  // Sort by smallest total excess (the best fitting smallest size)
  fittingRows.sort((a, b) => a.totalExcess - b.totalExcess);

  const best = fittingRows[0];
  const secondBest = fittingRows[1];

  let isBetween = false;
  let betweenPair: [string, string] | undefined;
  const bestLabel = best.row.size_label || best.row.label;
  let recommendedSize = bestLabel;

  if (secondBest && Math.abs(best.totalExcess - secondBest.totalExcess) < tolerance) {
    isBetween = true;
    const secondLabel = secondBest.row.size_label || secondBest.row.label;
    betweenPair = [bestLabel, secondLabel];
    recommendedSize = secondBest.totalExcess >= best.totalExcess ? secondLabel : bestLabel;
  }

  let confidence: "high" | "medium" | "low" = "high";
  let confidenceScore = 95;

  if (best.totalExcess > 0) {
    confidenceScore = Math.max(50, Math.round(95 - best.totalExcess * 5));
  }

  if (isBetween) {
    confidence = "medium";
    confidenceScore = Math.min(confidenceScore, 75);
  } else if (activeCols.length === 1) {
    confidence = "high";
    confidenceScore = 92;
  }

  return {
    size: recommendedSize,
    confidence,
    confidenceScore,
    between: betweenPair,
    reasons: best.reasons,
  };
}
