import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({
  dataUrl: z.string().min(32).max(15_000_000),
  mimeType: z.string().min(3).max(100),
  targetLang: z.enum(["ar", "en"]).default("ar"),
});

export type ScannedLineItem = {
  name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

export type ScannedExpense = {
  // Header
  store_name: string;
  category: string;
  supplier: string;   // same as store_name; retained for back-compat
  description: string;
  expense_date: string; // YYYY-MM-DD
  receipt_time: string; // HH:mm (24h) or ""
  currency: string;
  // Money
  subtotal: number;
  tax_amount: number;
  tax_rate: number;    // percent (e.g. 10 for 10%)
  amount: number;      // grand total
  // Details
  items: ScannedLineItem[];
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

    const prompt =
      `You are an expert bookkeeping OCR for retail/commercial receipts and invoices. ` +
      `Extract EVERYTHING from the receipt/invoice image and return STRICT JSON ONLY matching:\n` +
      `{\n` +
      `  "store_name": string,           // vendor/store name at the top of the receipt\n` +
      `  "category": string,             // one short ${langName} label (Shipping, Packaging, Marketing, Utilities, Software, Meals, Travel, Office, Inventory, Rent, Salaries, Fees, Other)\n` +
      `  "description": string,          // ONE concise ${langName} summary of what was purchased\n` +
      `  "expense_date": "YYYY-MM-DD",   // parse any format\n` +
      `  "receipt_time": "HH:mm",        // 24h. empty string if not on receipt\n` +
      `  "currency": "BHD"|"USD"|"SAR"|"AED"|"KWD"|"QAR"|"OMR",\n` +
      `  "subtotal": number,             // sum before tax; 0 if not listed\n` +
      `  "tax_amount": number,           // VAT/tax value; 0 if none\n` +
      `  "tax_rate": number,             // percent, e.g. 10 for 10%; 0 if none\n` +
      `  "amount": number,               // FINAL GRAND TOTAL PAID (after tax)\n` +
      `  "items": [                      // every line item on the receipt\n` +
      `    { "name": string, "quantity": number, "unit_price": number, "line_total": number }\n` +
      `  ],\n` +
      `  "notes": string                 // invoice # / VAT # / payment method in ${langName}; else ""\n` +
      `}\n\n` +
      `STRICT RULES:\n` +
      `- Item "name" MUST be translated into ${langName}.\n` +
      `- All numbers are plain numbers (no currency symbols, no thousands separators).\n` +
      `- amount = FINAL total after tax. If unclear, pick the largest bottom-most monetary value.\n` +
      `- If quantity is missing on a line, default to 1.\n` +
      `- If unit_price is missing, compute line_total/quantity.\n` +
      `- Never invent items. If no items are readable, return "items": [].\n` +
      `- expense_date defaults to "${today}" if missing.\n` +
      `- currency defaults to "BHD" if unclear.\n` +
      `- Return ONLY the JSON object. No markdown fences, no commentary.`;

    const userContent: unknown[] = [
      { type: "text", text: prompt },
      isPdf
        ? { type: "file", file: { filename: "receipt.pdf", file_data: data.dataUrl } }
        : { type: "image_url", image_url: { url: data.dataUrl } },
    ];

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
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

    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    let raw = json.choices?.[0]?.message?.content?.trim() ?? "{}";
    raw = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();

    let p: any = {};
    try { p = JSON.parse(raw); }
    catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) { try { p = JSON.parse(m[0]); } catch { /* noop */ } }
    }

    const num = (v: unknown) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };

    const items: ScannedLineItem[] = Array.isArray(p.items)
      ? p.items.map((i: any) => {
          const qty = Math.max(1, Math.round(num(i?.quantity) || 1));
          const unit = num(i?.unit_price);
          const lt = num(i?.line_total) || unit * qty;
          return {
            name: String(i?.name ?? "").trim(),
            quantity: qty,
            unit_price: unit,
            line_total: lt,
          };
        }).filter((i) => i.name)
      : [];

    const store = String(p.store_name ?? p.supplier ?? "").trim();
    const amount = num(p.amount);
    const subtotal = num(p.subtotal) || (amount ? amount - num(p.tax_amount) : items.reduce((s, i) => s + i.line_total, 0));

    return {
      store_name: store,
      category: String(p.category ?? "").trim() || (data.targetLang === "ar" ? "أخرى" : "Other"),
      supplier: store,
      description: String(p.description ?? "").trim(),
      expense_date: /^\d{4}-\d{2}-\d{2}$/.test(String(p.expense_date)) ? String(p.expense_date) : today,
      receipt_time: /^\d{2}:\d{2}$/.test(String(p.receipt_time)) ? String(p.receipt_time) : "",
      currency: String(p.currency ?? "BHD").trim().toUpperCase().slice(0, 3) || "BHD",
      subtotal: Math.max(0, subtotal),
      tax_amount: num(p.tax_amount),
      tax_rate: num(p.tax_rate),
      amount,
      items,
      notes: String(p.notes ?? "").trim(),
    };
  });
