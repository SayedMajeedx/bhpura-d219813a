import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({
  // data URL: data:<mime>;base64,<...>
  dataUrl: z.string().min(32).max(15_000_000),
  mimeType: z.string().min(3).max(100),
  targetLang: z.enum(["ar", "en"]).default("ar"),
});

export type ScannedExpense = {
  category: string;
  description: string;
  supplier: string;
  amount: number;
  currency: string;
  expense_date: string; // YYYY-MM-DD
  notes: string;
};

export const scanReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => Input.parse(raw))
  .handler(async ({ data }): Promise<ScannedExpense> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const langName = data.targetLang === "ar" ? "Arabic" : "English";
    const today = new Date().toISOString().slice(0, 10);

    const isPdf = data.mimeType === "application/pdf";
    const userContent: unknown[] = [
      {
        type: "text",
        text:
          `You are an expert bookkeeping assistant. Extract the expense from this receipt/invoice image and return STRICT JSON ONLY.\n` +
          `All text values MUST be written in ${langName}. If the source is in another language, translate values (supplier/category/description) into ${langName} while keeping proper nouns readable.\n` +
          `Schema: {"category": string, "description": string, "supplier": string, "amount": number, "currency": string (ISO 4217, e.g. BHD, USD, SAR), "expense_date": "YYYY-MM-DD", "notes": string}.\n` +
          `Rules:\n` +
          `- category: pick the best short label (e.g. Shipping, Packaging, Marketing, Utilities, Software, Meals, Travel, Office, Inventory, Other) translated to ${langName}.\n` +
          `- amount: the grand total (number only, no currency symbol). Use 0 if unreadable.\n` +
          `- currency: 3-letter ISO code; if unclear default "BHD".\n` +
          `- expense_date: from the invoice; if missing use "${today}".\n` +
          `- description: 1 short line summarizing what was purchased.\n` +
          `- notes: any extra useful context (invoice #, VAT, etc.), else empty string.\n` +
          `Return ONLY the JSON object, no markdown fences, no commentary.`,
      },
      isPdf
        ? { type: "file", file: { filename: "receipt.pdf", file_data: data.dataUrl } }
        : { type: "image_url", image_url: { url: data.dataUrl } },
    ];

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You extract structured expense data from receipts. Return strict JSON only." },
          { role: "user", content: userContent },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      }),
    });

    if (res.status === 429) throw new Error("RATE_LIMITED");
    if (res.status === 402) throw new Error("CREDITS_EXHAUSTED");
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`AI gateway error ${res.status}: ${t.slice(0, 200)}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    let raw = json.choices?.[0]?.message?.content?.trim() ?? "{}";
    // strip accidental code fences
    raw = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();

    let parsed: Partial<ScannedExpense> = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      // best-effort: try to find a JSON object in the text
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) {
        try { parsed = JSON.parse(m[0]); } catch { /* noop */ }
      }
    }

    const amountNum = Number(parsed.amount);
    return {
      category: String(parsed.category ?? "").trim() || (data.targetLang === "ar" ? "أخرى" : "Other"),
      description: String(parsed.description ?? "").trim(),
      supplier: String(parsed.supplier ?? "").trim(),
      amount: Number.isFinite(amountNum) ? amountNum : 0,
      currency: String(parsed.currency ?? "BHD").trim().toUpperCase().slice(0, 3) || "BHD",
      expense_date: /^\d{4}-\d{2}-\d{2}$/.test(String(parsed.expense_date))
        ? String(parsed.expense_date)
        : today,
      notes: String(parsed.notes ?? "").trim(),
    };
  });
