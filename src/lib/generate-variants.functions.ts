import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth, getGeminiCredentials } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { expandSizeRange, COLOR_SKU_MAP } from "@/lib/variant-sku-utils";

const Input = z.object({
  prompt: z.string().trim().min(2).max(3000),
  language: z.enum(["ar", "en"]),
  product_title: z.string().optional(),
  base_sku: z.string().optional(),
  base_price: z.number().optional(),
  cost_price: z.number().optional(),
});

const ParsedVariantPlan = z.object({
  base_sku: z.string().max(60).default(""),
  sizes: z.array(z.string().max(50)).max(30).default([]),
  colors: z.array(z.string().max(80)).max(30).default([]),
  fabric: z.string().max(100).default(""),
  size_unit: z.enum(["", "cm", "mm", "m", "inch", "ft", "kg", "g", "ml", "l"]).default(""),
  cost_price: z.number().min(0).max(1_000_000).default(0),
  selling_price: z.number().min(0).max(1_000_000).default(0),
  stock_main: z.number().int().min(0).max(1_000_000).default(0),
  stock_incubator: z.number().int().min(0).max(1_000_000).default(0),
  size_stock_map: z.record(z.string(), z.number().int().min(0)).optional().default({}),
});

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    base_sku: { type: "string" },
    sizes: { type: "array", items: { type: "string" }, maxItems: 30 },
    colors: { type: "array", items: { type: "string" }, maxItems: 30 },
    fabric: { type: "string" },
    size_unit: { type: "string", enum: ["", "cm", "mm", "m", "inch", "ft", "kg", "g", "ml", "l"] },
    cost_price: { type: "number", minimum: 0 },
    selling_price: { type: "number", minimum: 0 },
    stock_main: { type: "integer", minimum: 0 },
    stock_incubator: { type: "integer", minimum: 0 },
    size_stock_map: {
      type: "object",
      additionalProperties: { type: "integer", minimum: 0 },
    },
  },
  required: [
    "base_sku",
    "sizes",
    "colors",
    "fabric",
    "size_unit",
    "cost_price",
    "selling_price",
    "stock_main",
    "stock_incubator",
  ],
} as const;

const PRIMARY_MODEL = "gemini-2.5-flash";
const FALLBACK_MODEL = "gemini-1.5-flash-latest";

export type VariantGenerationPlan = z.infer<typeof ParsedVariantPlan>;

/**
 * Intelligent Offline Heuristic & NLP Parser
 * Extracts variant properties from English and Gulf Arabic natural language prompts.
 * Functions with zero network latency and serves as a high-accuracy fallback.
 */
export function extractVariantsHeuristically(
  prompt: string,
  language: "ar" | "en",
  context?: {
    product_title?: string;
    base_sku?: string;
    base_price?: number;
    cost_price?: number;
  },
): VariantGenerationPlan {
  const cleanPrompt = prompt.trim();

  // 1. SKU Extraction
  let baseSku = context?.base_sku?.trim() || "";
  const skuMatch =
    cleanPrompt.match(/(?:كود|رمز|sku|code|ref|موديل)[\s:]*([A-Za-z0-9\-_]{2,20})/i) ||
    cleanPrompt.match(/\b([A-Z]{2,6}[-_]?[0-9]{2,6})\b/);
  if (skuMatch) {
    baseSku = skuMatch[1].toUpperCase();
  } else if (!baseSku && context?.product_title) {
    const titleMatch = context.product_title.match(/\b([A-Za-z0-9\-_]{2,10})\b/);
    if (titleMatch) baseSku = titleMatch[1].toUpperCase();
  }

  // 2. Sizes & Ranges Extraction
  let sizes: string[] = [];
  let sizeUnit: VariantGenerationPlan["size_unit"] = "";

  if (/(?:إنش|انش|inch|inches|")/i.test(cleanPrompt)) {
    sizeUnit = "inch";
  } else if (/(?:سم|سنتيمتر|cm)/i.test(cleanPrompt)) {
    sizeUnit = "cm";
  } else if (/(?:مل|ml)/i.test(cleanPrompt)) {
    sizeUnit = "ml";
  } else if (/(?:غرام|جرام|g\b|grams)/i.test(cleanPrompt)) {
    sizeUnit = "g";
  }

  // Check if Abaya even sizing mentioned
  if (
    /(?:عباي|abaya|زوجي|even)/i.test(cleanPrompt) ||
    /(?:50|52)\s*(?:إلى|الى|to|-)\s*(?:60|62)/i.test(cleanPrompt)
  ) {
    const abayaRange = expandSizeRange(cleanPrompt);
    if (abayaRange.length > 1) {
      sizes = abayaRange;
      if (!sizeUnit) sizeUnit = "inch";
    }
  }

  // Extract sizes from size keywords (e.g. قياسات 58 56 55 58, مقاسات 52، 54, المقاسات من 1 إلى 4, sizes S M L XL)
  const sizeKeywordMatches = Array.from(
    cleanPrompt.matchAll(
      /(?:المقاسات|مقاسات|مقاس|القياسات|قياسات|قياس|السايزات|سايزات|سايز|الأحجام|الاحجام|أحجام|احجام|حجم|sizes?|size)[\s:]*([^\n\r,;.،!]+?)(?=(?:قطعة|حبة|حبات|قطع|اللون|الألوان|الالوان|لون|ألوان|سعر|تكلفة|كود|مخزون|خامة|stock|price|color|fabric|و\s*\d+\s*(?:قطع|حبة|قطعة)|[،,;.!]|$))/gi,
    ),
  );

  for (const match of sizeKeywordMatches) {
    const rawChunk = match[1].trim();
    if (!rawChunk) continue;
    const tokens = expandSizeRange(rawChunk);
    tokens.forEach((t) => {
      const cleanT = t.trim().toUpperCase();
      if (
        /^\d{1,3}$/.test(cleanT) ||
        /^(?:XXS|XS|S|M|L|XL|XXL|2XL|3XL|4XL|5XL|OS)$/i.test(cleanT)
      ) {
        if (!sizes.includes(cleanT)) sizes.push(cleanT);
      }
    });
  }

  // Also extract single size mentions across the prompt (e.g. "لسايز 50", "لمقاس 52", "سايز 54", "size 56")
  const singleSizeMatches = Array.from(
    cleanPrompt.matchAll(
      /(?:لسايز|لمقاس|لقياس|لـ\s*سايز|لـ\s*مقاس|سايز|مقاس)\s*(\d{1,3}|[A-Za-z]{1,4})\b/gi,
    ),
  );
  for (const m of singleSizeMatches) {
    const val = m[1].toUpperCase();
    if (/^\d{1,3}$/.test(val) || /^(?:XXS|XS|S|M|L|XL|XXL|2XL|3XL|4XL|5XL)$/i.test(val)) {
      if (!sizes.includes(val)) sizes.push(val);
    }
  }

  // Free size detection
  if (
    sizes.length === 0 &&
    /(?:free\s*size|one\s*size|مقاس\s*موحد|فري\s*سايز)/i.test(cleanPrompt)
  ) {
    sizes = [language === "ar" ? "مقاس موحد" : "Free Size"];
  }

  // Sort numeric sizes if all sizes are numbers (e.g. ["50", "55", "56", "58"])
  const areAllNumeric = sizes.length > 0 && sizes.every((s) => /^\d+$/.test(s));
  if (areAllNumeric) {
    sizes.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  }

  // 3. Colors Extraction
  const detectedColors: string[] = [];
  const knownColors = Object.keys(COLOR_SKU_MAP);

  // Check for explicit colors clause
  const colorClause = cleanPrompt.match(
    /(?:الألوان|الالوان|لون|ألوان|colors?|colours?|colour)[\s:]*([^\n\r;.!]+)/i,
  );
  const searchCorpus = colorClause ? colorClause[1] : cleanPrompt;

  for (const color of knownColors) {
    // Avoid short 2-letter false positives in English
    if (color.length < 3 && language === "en") continue;
    const isArabic = /[\u0600-\u06FF]/.test(color);
    const escaped = color.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = isArabic
      ? `(?:^|[\\s,،_\\-/:])(?:وال|ال|و)?(${escaped})(?=[\\s,،_\\-/:.]|$)`
      : `(?:^|[\\s,،_\\-/:])(?:and\\s+)?(${escaped})(?=[\\s,،_\\-/:.]|$)`;
    const regex = new RegExp(pattern, "i");
    if (regex.test(searchCorpus)) {
      const displayColor =
        language === "ar" ? color : color.charAt(0).toUpperCase() + color.slice(1);
      if (!detectedColors.includes(displayColor)) {
        detectedColors.push(displayColor);
      }
    }
  }

  // 4. Fabrics Extraction
  let fabric = "";
  const fabrics = [
    { ar: "كريب ملكي", en: "Royal Crepe", match: /كريب\s*ملكي|royal\s*crepe/i },
    { ar: "كريب سعودي", en: "Saudi Crepe", match: /كريب\s*سعودي|saudi\s*crepe/i },
    { ar: "كريب كوري", en: "Korean Crepe", match: /كريب\s*كوري|korean\s*crepe/i },
    { ar: "حرير مغسول", en: "Washed Silk", match: /حرير\s*مغسول|washed\s*silk/i },
    { ar: "حرير طبيعي", en: "Natural Silk", match: /حرير\s*طبيعي|pure\s*silk/i },
    { ar: "حرير", en: "Silk", match: /حرير|silk/i },
    { ar: "كتان طبيعي", en: "Pure Linen", match: /كتان\s*طبيعي|pure\s*linen/i },
    { ar: "كتان ياباني", en: "Japanese Linen", match: /كتان\s*ياباني|japanese\s*linen/i },
    { ar: "كتان", en: "Linen", match: /كتان|linen/i },
    { ar: "شيفون", en: "Chiffon", match: /شيفون|chiffon/i },
    { ar: "قطن 100%", en: "100% Cotton", match: /قطن\s*100%|100%\s*cotton/i },
    { ar: "قطن بارد", en: "Cool Cotton", match: /قطن\s*بارد/i },
    { ar: "قطن", en: "Cotton", match: /قطن|cotton/i },
    { ar: "مخمل", en: "Velvet", match: /مخمل|velvet/i },
    { ar: "ساتان", en: "Satin", match: /ساتان|satin/i },
    { ar: "اورجانزا", en: "Organza", match: /اورجانزا|أورجانزا|organza/i },
    { ar: "تفتة", en: "Taffeta", match: /تفتة|تفتا|taffeta/i },
    { ar: "جاكار", en: "Jacquard", match: /جاكار|jacquard/i },
    { ar: "صوف", en: "Wool", match: /صوف|wool/i },
    { ar: "جلد", en: "Leather", match: /جلد|leather/i },
    { ar: "دانتيل", en: "Lace", match: /دانتيل|lace/i },
  ];

  for (const item of fabrics) {
    if (item.match.test(cleanPrompt)) {
      fabric = language === "ar" ? item.ar : item.en;
      break;
    }
  }

  // 5. Pricing Extraction
  let sellingPrice = Number(context?.base_price ?? 0);
  let costPrice = Number(context?.cost_price ?? 0);

  const priceMatch =
    cleanPrompt.match(/(?:السعر|سعر\s*البيع|سعر|price|priced\s*at)[\s:]*([0-9]+(?:\.[0-9]+)?)/i) ||
    cleanPrompt.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:د\.ب|بحريني|bd|bhd|sar|ر\.س|kwd|aed)/i);
  if (priceMatch) {
    const val = parseFloat(priceMatch[1]);
    if (!isNaN(val) && val > 0) sellingPrice = val;
  }

  const saleMatch = cleanPrompt.match(
    /(?:تخفيض|خصم|سعر\s*التخفيض|sale\s*price|discount|sale)[\s:]*([0-9]+(?:\.[0-9]+)?)/i,
  );
  if (saleMatch) {
    const val = parseFloat(saleMatch[1]);
    if (!isNaN(val) && val > 0 && val < sellingPrice) {
      sellingPrice = val;
    }
  }

  const costMatch = cleanPrompt.match(
    /(?:التكلفة|تكلفة|سعر\s*التكلفة|cost|cost\s*price)[\s:]*([0-9]+(?:\.[0-9]+)?)/i,
  );
  if (costMatch) {
    const val = parseFloat(costMatch[1]);
    if (!isNaN(val) && val >= 0) costPrice = val;
  }

  // 6. Stock Extraction & Per-Size Breakdown
  let stockMain = 0;
  let stockIncubator = 0;
  const sizeStockMap: Record<string, number> = {};

  // Check specific per-size stock overrides (e.g. "4 قطع لسايز 50", "4 حبات لمقاس 50", "2 for size 52", "10 pcs for size L")
  const specificSizeStockMatches = Array.from(
    cleanPrompt.matchAll(
      /(?:^|[\s,،_/\-:])(\d+)\s*(?:حبات|حبة|قطع|قطعة|pcs|pieces)?\s*(?:لسايز|لمقاس|لقياس|لـ\s*سايز|لـ\s*مقاس|for\s*size|for)\s*(\d{1,3}|[A-Za-z]{1,4})\b/gi,
    ),
  );
  for (const m of specificSizeStockMatches) {
    const qty = parseInt(m[1], 10);
    const sz = m[2].toUpperCase();
    if (!isNaN(qty) && qty >= 0) {
      sizeStockMap[sz] = qty;
      if (!sizes.includes(sz)) sizes.push(sz);
    }
  }

  // Reverse pattern (e.g. "سايز 50 عدد 4" or "مقاس 50 4 قطع")
  const reverseSizeStockMatches = Array.from(
    cleanPrompt.matchAll(
      /(?:^|[\s,،_/\-:])(?:سايز|مقاس|size)\s*(\d{1,3}|[A-Za-z]{1,4})\s*(?:عدد|كمية|stock|qty|:)?\s*(\d+)\s*(?:حبات|حبة|قطع|قطعة|pcs|pieces)/gi,
    ),
  );
  for (const m of reverseSizeStockMatches) {
    const sz = m[1].toUpperCase();
    const qty = parseInt(m[2], 10);
    if (!isNaN(qty) && qty >= 0) {
      sizeStockMap[sz] = qty;
      if (!sizes.includes(sz)) sizes.push(sz);
    }
  }

  // Universal / default stock per size (e.g. "قطعة وحدة لكل قياس", "قطعة واحدة لكل مقاس", "1 pc each", "1 لكل", "5 حبات من كل مقاس")
  const universalStockMatch =
    cleanPrompt.match(
      /(?:قطعة\s*(?:وحدة|واحدة)|حبة\s*(?:وحدة|واحدة)|(\d+)\s*(?:حبات|حبة|قطع|قطعة|pcs|pieces)?)\s*(?:لكل\s*(?:قياس|مقاس|سايز|لون|قطعة)|من\s*كل\s*(?:قياس|مقاس|سايز|لون)|each|per\s*(?:size|variant|piece))/i,
    ) || cleanPrompt.match(/(\d+)\s*(?:من\s*كل|لكل\s*مقاس|لكل\s*لون|per\s*variant|each)/i);

  if (universalStockMatch) {
    if (/قطعة\s*(?:وحدة|واحدة)|حبة\s*(?:وحدة|واحدة)/i.test(universalStockMatch[0])) {
      stockMain = 1;
    } else if (universalStockMatch[1]) {
      const val = parseInt(universalStockMatch[1], 10);
      if (!isNaN(val) && val >= 0) stockMain = val;
    }
  } else {
    const mainMatch = cleanPrompt.match(/(?:رئيسي|الرئيسي|main)[\s:]*([0-9]+)/i);
    if (mainMatch) stockMain = parseInt(mainMatch[1], 10) || 0;

    const incMatch = cleanPrompt.match(/(?:حاضنة|الحاضنة|incubator)[\s:]*([0-9]+)/i);
    if (incMatch) stockIncubator = parseInt(incMatch[1], 10) || 0;

    if (!mainMatch && !incMatch) {
      const genericStock = cleanPrompt.match(/(?:المخزون|مخزون|stock|qty)[\s:]*([0-9]+)/i);
      if (genericStock) stockMain = parseInt(genericStock[1], 10) || 0;
    }
  }

  return {
    base_sku: baseSku,
    sizes: [...new Set(sizes)],
    colors: [...new Set(detectedColors)],
    fabric: fabric,
    size_unit: sizeUnit,
    cost_price: costPrice,
    selling_price: sellingPrice,
    stock_main: stockMain,
    stock_incubator: stockIncubator,
    size_stock_map: sizeStockMap,
  };
}

export const parseVariantPrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => Input.parse(raw))
  .handler(async ({ data, context }): Promise<VariantGenerationPlan> => {
    // 1. Check API Quota
    const { data: allowed, error: quotaError } = await (context.supabase.rpc as any)(
      "consume_api_quota",
      {
        p_action: "variant_generation",
        p_limit: 60,
        p_window_minutes: 60,
      },
    );

    if (quotaError) {
      console.warn(
        `[parseVariantPrompt] Quota RPC warning: ${quotaError.message}. Using offline engine.`,
      );
    }

    // 2. Fetch Gemini Credentials
    let creds: { apiKey?: string; model?: string } = {};
    try {
      creds = await getGeminiCredentials(context.supabase, context.userId);
    } catch (err: any) {
      console.warn(`[parseVariantPrompt] Gemini credential retrieval failed: ${err.message}`);
    }

    const apiKey = creds.apiKey;
    const requestedModel = creds.model?.trim();
    const primaryModel = requestedModel || PRIMARY_MODEL;

    // 3. Offline Heuristic Fallback if credentials are unavailable or rate limited
    if (!apiKey || allowed === false) {
      console.info("[parseVariantPrompt] Using intelligent offline heuristic parser");
      return extractVariantsHeuristically(data.prompt, data.language, {
        product_title: data.product_title,
        base_sku: data.base_sku,
        base_price: data.base_price,
        cost_price: data.cost_price,
      });
    }

    // 4. Domain-Rich System Instruction
    const systemPrompt = [
      "You are a world-class e-commerce and fashion inventory variant generator specialized in GCC (Gulf) boutiques, luxury fashion, abayas, kaftans, fragrances, and apparel.",
      "Extract structured variant plans with 100% precision from merchant descriptions in Arabic or English.",
      "CRITICAL SIZING & QUANTITY RULES:",
      "- If discrete sizes are listed (e.g. 'قياسات 58 56 55 58', 'مقاسات 50 52 54', 'sizes S M L'), extract all unique size tokens: ['50', '52', '54'] or ['55', '56', '58'].",
      "- If Abaya sizes are described as a range (e.g. '50 to 60', 'من 50 إلى 60 زوجي', '52-60'), expand into inclusive even numbers: ['50', '52', '54', '56', '58', '60']. Default size_unit for abayas is 'inch'.",
      "- If apparel letter sizes are described as ranges (e.g. 'XS to 2XL', 'S إلى XL'), expand into standard apparel letter sequences: ['XS', 'S', 'M', 'L', 'XL', '2XL'].",
      "- If numbered sizes (e.g. '1 to 5', 'من 1 إلى 4'), expand into inclusive list ['1', '2', '3', '4', '5'].",
      "- If shoe sizes (e.g. '36 to 41', '36-41'), expand into ['36', '37', '38', '39', '40', '41'].",
      "- If 'Free size' or 'مقاس موحد', return ['Free Size'] or ['مقاس موحد'].",
      "- Extract default stock: 'قطعة وحدة لكل قياس' / '1 pc each' -> stock_main = 1.",
      "- If specific sizes have custom quantities (e.g. 'و 4 قطع لسايز 50', '2 pcs for size L'), add to size_stock_map: {'50': 4} or {'L': 2} and ensure that size is in sizes list.",
      "COLORS & FABRICS:",
      "- Extract Arabic colors in Arabic (كحلي, عنابي, زيتي, بيج, سكري, أسود, رمادي, خردلي, موف, تيفاني, etc.) and English in English (Navy, Burgundy, Olive, Beige, Off-White, Black, Grey, Mustard, Mauve, Tiffany).",
      "- Extract luxury fabrics (كريب ملكي, حرير مغسول, كتان طبيعي, شيفون, قطن, مخمل, ساتان, صوف, Silk, Linen, Crepe, Cotton, Velvet).",
      "PRICES & CODES:",
      "- Extract base_sku (alphanumeric code or SKU prefix like NP24, AB-10, S79, DRS-01).",
      "- Extract selling_price and cost_price numbers accurately ignoring currency strings (BHD, SAR, KWD, AED, د.ب, ر.س).",
      "Return ONLY valid JSON matching the schema.",
    ].join("\n");

    const userPromptContent = [
      `Interface language: ${data.language}`,
      data.product_title ? `Product Title: ${data.product_title}` : "",
      data.base_sku ? `Existing Base SKU: ${data.base_sku}` : "",
      data.base_price !== undefined ? `Product Regular Price: ${data.base_price}` : "",
      data.cost_price !== undefined ? `Product Cost Price: ${data.cost_price}` : "",
      `Merchant Request:\n${data.prompt}`,
    ]
      .filter(Boolean)
      .join("\n");

    // 5. Execute Gemini API Call with Auto-Fallback
    const callGemini = async (modelName: string) => {
      return fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [
              {
                role: "user",
                parts: [{ text: userPromptContent }],
              },
            ],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: "application/json",
              responseJsonSchema: RESPONSE_SCHEMA,
            },
          }),
        },
      );
    };

    try {
      let response = await callGemini(primaryModel);

      // If primary model failed with 404 or 400 (e.g. invalid model name), retry with stable fallback model
      if (!response.ok && primaryModel !== FALLBACK_MODEL) {
        console.warn(
          `[parseVariantPrompt] Primary Gemini model (${primaryModel}) failed with status ${response.status}. Retrying with ${FALLBACK_MODEL}...`,
        );
        response = await callGemini(FALLBACK_MODEL);
      }

      if (!response.ok) {
        console.warn(
          `[parseVariantPrompt] Gemini HTTP ${response.status}. Falling back to heuristic parser.`,
        );
        return extractVariantsHeuristically(data.prompt, data.language, {
          product_title: data.product_title,
          base_sku: data.base_sku,
          base_price: data.base_price,
          cost_price: data.cost_price,
        });
      }

      const payload = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const raw = payload.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? "")
        .join("")
        .trim();

      if (!raw) {
        return extractVariantsHeuristically(data.prompt, data.language, {
          product_title: data.product_title,
          base_sku: data.base_sku,
          base_price: data.base_price,
          cost_price: data.cost_price,
        });
      }

      const parsed = ParsedVariantPlan.parse(JSON.parse(raw));

      return {
        ...parsed,
        base_sku: (parsed.base_sku || data.base_sku || "").trim(),
        sizes: [...new Set(parsed.sizes.map((v) => v.trim()).filter(Boolean))],
        colors: [...new Set(parsed.colors.map((v) => v.trim()).filter(Boolean))],
        fabric: parsed.fabric.trim(),
        selling_price:
          parsed.selling_price > 0 ? parsed.selling_price : Number(data.base_price ?? 0),
        cost_price: parsed.cost_price > 0 ? parsed.cost_price : Number(data.cost_price ?? 0),
        size_stock_map: parsed.size_stock_map || {},
      };
    } catch (err: any) {
      console.warn(
        `[parseVariantPrompt] Gemini execution exception (${err.message}). Using offline heuristic.`,
      );
      return extractVariantsHeuristically(data.prompt, data.language, {
        product_title: data.product_title,
        base_sku: data.base_sku,
        base_price: data.base_price,
        cost_price: data.cost_price,
      });
    }
  });
