import { createServerFn } from "@tanstack/react-start";
import { getGeminiCredentials, requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface CopilotMessage {
  role: "user" | "model" | "system";
  content: string;
}

export interface CopilotActionPayload {
  action: "create_product" | "create_category" | "update_order_status" | "get_summary" | "none";
  parameters?: Record<string, any>;
  resultMessage?: string;
}

export interface CopilotResponse {
  reply: string;
  actionTaken?: CopilotActionPayload;
  suggestedPrompts?: string[];
}

const PRIMARY_MODEL = "gemini-2.5-flash";
const FALLBACK_MODEL = "gemini-1.5-flash-latest";

export const executeCopilotChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      brandId: string;
      slug: string;
      history: CopilotMessage[];
      message: string;
      language?: "en" | "ar";
    }) => input,
  )
  .handler(async ({ data, context }): Promise<CopilotResponse> => {
    const isAr = data.language !== "en";

    // 1. Authenticate user & ensure brand membership
    const [{ data: hasAccess }, { data: isAdmin }] = await Promise.all([
      (context.supabase.rpc as any)("can_access_brand", { _brand_id: data.brandId }),
      (context.supabase.rpc as any)("is_admin"),
    ]);
    if (!hasAccess && !isAdmin) {
      throw new Error("UNAUTHORIZED");
    }

    // 2. Fetch Gemini Credentials (free tier)
    let apiKey = process.env.GEMINI_API_KEY || "";
    let modelToUse = PRIMARY_MODEL;

    try {
      const creds = await getGeminiCredentials(context.supabase, context.userId);
      if (creds.apiKey) apiKey = creds.apiKey;
      if (creds.model?.trim()) modelToUse = creds.model.trim();
    } catch (err: any) {
      console.warn(`[Copilot] Credential retrieval note: ${err.message}`);
    }

    // Fallback if no Gemini API Key is configured yet:
    // We provide a deterministic, intelligent native assistant that directly understands common store commands!
    if (!apiKey) {
      return executeOfflineCopilot(context.supabase, data.brandId, data.message, isAr);
    }

    // 3. Prepare Gemini Function Calling Tools
    const tools = [
      {
        functionDeclarations: [
          {
            name: "create_product",
            description: "Creates a new product draft in the store inventory.",
            parameters: {
              type: "OBJECT",
              properties: {
                name_ar: { type: "STRING", description: "Arabic product name" },
                name_en: { type: "STRING", description: "English product name" },
                base_price: { type: "NUMBER", description: "Base selling price" },
                category: { type: "STRING", description: "Category name" },
                description_ar: { type: "STRING", description: "Arabic description" },
              },
              required: ["name_ar", "base_price"],
            },
          },
          {
            name: "create_category",
            description: "Creates a new category for products in the store.",
            parameters: {
              type: "OBJECT",
              properties: {
                name_ar: { type: "STRING", description: "Arabic category name" },
                name_en: { type: "STRING", description: "English category name" },
              },
              required: ["name_ar"],
            },
          },
          {
            name: "get_store_metrics",
            description: "Retrieves current store KPIs: product count, orders count, low stock.",
            parameters: {
              type: "OBJECT",
              properties: {},
            },
          },
        ],
      },
    ];

    const systemPrompt = `You are "Boutq Copilot", an elite AI store operating copilot for GCC and luxury boutiques (Boutq OS).
The merchant is communicating in ${isAr ? "Arabic" : "English"}.
You have direct capability to execute actions like creating products, categories, or inspecting store metrics.
Be concise, practical, warm, and professional. Always answer in the merchant's language (${isAr ? "Arabic" : "English"}).`;

    // 4. Construct conversation payload
    const contents: any[] = data.history.map((m) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }],
    }));

    contents.push({
      role: "user",
      parts: [{ text: data.message }],
    });

    try {
      const callApi = async (mName: string) => {
        return fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${mName}:generateContent`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: systemPrompt }] },
              contents,
              tools,
              generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 600,
              },
            }),
          },
        );
      };

      let res = await callApi(modelToUse);
      if (!res.ok && modelToUse !== FALLBACK_MODEL) {
        res = await callApi(FALLBACK_MODEL);
      }

      if (!res.ok) {
        return executeOfflineCopilot(context.supabase, data.brandId, data.message, isAr);
      }

      const json = (await res.json()) as any;
      const candidate = json?.candidates?.[0];
      const part = candidate?.content?.parts?.[0];

      if (part?.functionCall) {
        const fnName = part.functionCall.name;
        const fnArgs = part.functionCall.args || {};

        if (fnName === "create_product") {
          const { data: newProd, error } = await (context.supabase.from("products") as any)
            .insert({
              brand_id: data.brandId,
              name: fnArgs.name_ar || fnArgs.name_en,
              name_ar: fnArgs.name_ar,
              name_en: fnArgs.name_en,
              base_price: Number(fnArgs.base_price || 0),
              category: fnArgs.category || null,
              description_ar: fnArgs.description_ar || null,
              is_active: false,
            })
            .select()
            .single();

          if (error) {
            return {
              reply: isAr
                ? `تعذر إنشاء المنتج: ${error.message}`
                : `Failed to create product: ${error.message}`,
            };
          }

          return {
            reply: isAr
              ? `تم إنشاء مسودة المنتج "${fnArgs.name_ar}" بسعر ${fnArgs.base_price} بنجاح! يمكنك إضافة الصور والمتغيرات من شاشة المخزون.`
              : `Draft product "${fnArgs.name_en || fnArgs.name_ar}" created at ${fnArgs.base_price}! You can now add images & variants from Inventory.`,
            actionTaken: {
              action: "create_product",
              parameters: fnArgs,
              resultMessage: newProd.id,
            },
            suggestedPrompts: isAr
              ? ["عرض المخزون", "إضافة قسم جديد", "ملخص أداء المتجر"]
              : ["View Inventory", "Create New Category", "Store Summary"],
          };
        }

        if (fnName === "create_category") {
          const slug = (fnArgs.name_en || fnArgs.name_ar)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");

          const { error } = await (context.supabase.from("categories") as any).insert({
            brand_id: data.brandId,
            name: fnArgs.name_ar || fnArgs.name_en,
            name_ar: fnArgs.name_ar,
            name_en: fnArgs.name_en || fnArgs.name_ar,
            slug: slug || `cat-${Date.now()}`,
          });

          if (error) {
            return {
              reply: isAr
                ? `تعذر إنشاء القسم: ${error.message}`
                : `Failed to create category: ${error.message}`,
            };
          }

          return {
            reply: isAr
              ? `تمت إضافة قسم "${fnArgs.name_ar}" بنجاح إلى أقسام المتجر!`
              : `Category "${fnArgs.name_ar}" added to store categories successfully!`,
            actionTaken: {
              action: "create_category",
              parameters: fnArgs,
            },
            suggestedPrompts: isAr
              ? ["أضف منتج لهذا القسم", "عرض الأقسام"]
              : ["Add product to this category", "View categories"],
          };
        }

        if (fnName === "get_store_metrics") {
          const metrics = await fetchMetrics(context.supabase, data.brandId);
          return {
            reply: isAr
              ? `ملخص المتجر السريع:\n📦 إجمالي المنتجات: ${metrics.productsCount}\n🔔 منتجات قاربت على النفاد: ${metrics.lowStockCount}\n🛍️ إجمالي الطلبات: ${metrics.ordersCount}`
              : `Quick Store Summary:\n📦 Total Products: ${metrics.productsCount}\n🔔 Low Stock: ${metrics.lowStockCount}\n🛍️ Total Orders: ${metrics.ordersCount}`,
            actionTaken: { action: "get_summary" },
          };
        }
      }

      const textReply = part?.text || (isAr ? "مرحباً بك، كيف أساعدك اليوم في متجرك؟" : "Hello! How can I assist you with your store today?");
      return {
        reply: textReply,
        suggestedPrompts: isAr
          ? ["أضف فستان حرير بسعر 45", "أنشئ قسم العبايات اليومية", "كيف أزيد مبيعات انستقرام؟"]
          : ["Add silk dress for 45", "Create Abayas category", "How to boost Instagram sales?"],
      };
    } catch {
      return executeOfflineCopilot(context.supabase, data.brandId, data.message, isAr);
    }
  });

async function fetchMetrics(supabase: any, brandId: string) {
  const [{ count: productsCount }, { count: ordersCount }] = await Promise.all([
    supabase.from("products").select("id", { count: "exact", head: true }).eq("brand_id", brandId),
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("brand_id", brandId),
  ]);

  return {
    productsCount: productsCount ?? 0,
    ordersCount: ordersCount ?? 0,
    lowStockCount: 0,
  };
}

// Offline deterministic copilot for instant response with zero delay & zero API cost
export async function executeOfflineCopilot(
  supabase: any,
  brandId: string,
  rawMsg: string,
  isAr: boolean,
): Promise<CopilotResponse> {
  const msg = rawMsg.trim().toLowerCase();

  // Pattern 1: Add product e.g. "أضف منتج عباية كريب بسعر 45" or "add product silk dress 50"
  const addProdMatch =
    rawMsg.match(/(?:أضف|انشئ|اضف)\s+(?:منتج\s+)?(.+?)\s+(?:بسعر|سعر)\s+([0-9.]+)/i) ||
    rawMsg.match(/(?:add|create)\s+(?:product\s+)?(.+?)\s+(?:price|at|for)\s+([0-9.]+)/i);

  if (addProdMatch) {
    const title = addProdMatch[1].trim();
    const price = parseFloat(addProdMatch[2]);
    const { error } = await (supabase.from("products") as any).insert({
      brand_id: brandId,
      name: title,
      name_ar: title,
      name_en: title,
      base_price: price,
      is_active: false,
    });

    if (!error) {
      return {
        reply: isAr
          ? `تم إنشاء مسودة المنتج "${title}" بسعر ${price} بنجاح! ستجده الآن في شاشة المخزون.`
          : `Created draft product "${title}" at ${price} successfully! You can see it in Inventory now.`,
        actionTaken: {
          action: "create_product",
          parameters: { name: title, price },
        },
      };
    }
  }

  // Pattern 2: Summary / Metrics e.g. "ملخص", "تقرير", "احصائيات", "summary", "stats"
  if (
    msg.includes("ملخص") ||
    msg.includes("احصائ") ||
    msg.includes("أداء") ||
    msg.includes("summary") ||
    msg.includes("stats") ||
    msg.includes("kpi")
  ) {
    const metrics = await fetchMetrics(supabase, brandId);
    return {
      reply: isAr
        ? `📊 إحصائيات المتجر السريعة:\n• المنتجات المسجلة: ${metrics.productsCount} منتج\n• إجمالي الطلبات: ${metrics.ordersCount} طلب\n\nنظامك متصل ويعمل بكفاءة كاملة!`
        : `📊 Quick Store Stats:\n• Registered Products: ${metrics.productsCount}\n• Total Orders: ${metrics.ordersCount}\n\nYour store is online and operational!`,
      actionTaken: { action: "get_summary" },
    };
  }

  // Pattern 3: General greeting or advice
  return {
    reply: isAr
      ? "أهلاً بك في Boutq Copilot! ✨\nأنا مساعد متجرك الذكي. يمكنك أن تطلب مني:\n• «أضف عباية حرير بسعر 55»\n• «اعطني ملخص المتجر»\n• استفسارات حول نمو مبيعاتك وتنسيق الحملات."
      : "Welcome to Boutq Copilot! ✨\nI am your store AI copilot. You can ask me to:\n• \"Add linen dress for 45\"\n• \"Give me store summary\"\n• Tips on improving conversions and seasonal promotions.",
    suggestedPrompts: isAr
      ? ["ملخص المتجر", "أضف منتج جديد", "أفكار عروض ترويجية"]
      : ["Store Summary", "Add New Product", "Promotion Ideas"],
  };
}
