import type { SizeGuide, SizeGuideStep } from "./size-guide";

/**
 * A size guide drawn as a garment laid flat, with each measurement marked on it, in place of a
 * chart of sizes (the owner's decision of 2026-11-06). It is the guide's template, so a guide keeps
 * its rows in the database and a store that wants a chart keeps its chart: a chart is still right
 * for rings, shoes and any store that reads it the same way as its tailor.
 *
 * Every width here is measured flat, edge to edge, never around a body. Pura's chart said "bust
 * circumference" over numbers that were half of one, so a shopper with a 38 inch bust was told
 * she was larger than the largest size.
 */
export const FLAT_DIAGRAM_TEMPLATE_KEY = "abaya_flat_diagram";

export function drawsGarmentDiagram(guide: Pick<SizeGuide, "template_key">): boolean {
  return guide.template_key === FLAT_DIAGRAM_TEMPLATE_KEY;
}

/** Whether a guide has a chart of sizes to show. */
export function showsSizeChart(guide: Pick<SizeGuide, "template_key" | "rows">): boolean {
  return !drawsGarmentDiagram(guide) && guide.rows.length > 0;
}

export const FLAT_DIAGRAM_INTRO = {
  ar: "تُؤخذ القياسات على عباية مقاسها مناسب وهي مفرودة على سطح مستوٍ، من طرف إلى طرف وليس حول الجسم.",
  en: "Measure an abaya that fits you well, laid flat on a table, from edge to edge and not around the body.",
};

export const FLAT_DIAGRAM_NOTE = {
  ar: "رقم المقاس الجاهز هو طول القطعة بالإنش: مقاس 54 يعني أن طولها 54 إنش.",
  en: "A ready size is the piece's length in inches: size 54 is 54 inches long.",
};

/** The steps, in the diagram's order; each title is a label on the drawing. */
export const FLAT_DIAGRAM_STEPS: SizeGuideStep[] = [
  {
    title_ar: "الطول",
    title_en: "Full length",
    body_ar: "من أعلى الكتف عند الرقبة نزولاً حتى نهاية القطعة.",
    body_en: "From the top of the shoulder by the neck down to the hem.",
  },
  {
    title_ar: "عرض الصدر",
    title_en: "Chest width",
    body_ar: "عند مستوى الإبط، من طرف إلى طرف.",
    body_en: "At the armpits, from edge to edge.",
  },
  {
    title_ar: "طول الكم",
    title_en: "Sleeve length",
    body_ar: "من أعلى الكتف عند الرقبة حتى نهاية الكم.",
    body_en: "From the top of the shoulder by the neck to the end of the sleeve.",
  },
  {
    title_ar: "ارتفاع الإبط",
    title_en: "Armpit height",
    body_ar: "من أعلى الكتف نزولاً حتى الإبط.",
    body_en: "From the top of the shoulder down to the armpit.",
  },
  {
    title_ar: "عرض الوسط",
    title_en: "Waist width",
    body_ar: "عند الوسط، من طرف إلى طرف.",
    body_en: "At the waist, from edge to edge.",
  },
  {
    title_ar: "عرض الأسفل",
    title_en: "Hem width",
    body_ar: "عند نهاية القطعة من الأسفل، من طرف إلى طرف.",
    body_en: "Along the hem, from edge to edge.",
  },
  {
    title_ar: "فتحة الكم",
    title_en: "Sleeve opening",
    body_ar: "عرض طرف الكم من حافة إلى حافة.",
    body_en: "Across the end of the sleeve, from edge to edge.",
  },
];
