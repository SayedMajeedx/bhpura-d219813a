import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth, getEnvVariableAsync, getEnvDiagnostics } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({
  text: z.string().min(1).max(4000),
  from: z.enum(["ar", "en"]),
  to: z.enum(["ar", "en"]),
});

// Trigger build to reload environment variables on Cloudflare Pages
const MODEL = "gemini-1.5-flash";

/**
 * One-shot premium merchant text translation and copywriting localization via Google Gemini.
 * Auth-gated so anonymous visitors can't burn translation quota.
 */
export const translateProductText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => Input.parse(raw))
  .handler(async ({ data, context }) => {
    const { data: allowed, error: quotaError } = await (context.supabase.rpc as any)("consume_api_quota", {
      p_action: "translation", p_limit: 100, p_window_minutes: 60,
    });
    if (quotaError || !allowed) throw new Error("RATE_LIMITED");
    if (data.from === data.to) return { text: data.text };

    const apiKey = await getEnvVariableAsync("GEMINI_API_KEY");
    if (!apiKey) {
      const diag = await getEnvDiagnostics();
      throw new Error(`Missing GEMINI_API_KEY. Available keys: [${diag.keys.join(", ")}]. (Cloudflare: ${diag.hasCloudflare}, Node: ${diag.hasProcess})`);
    }

    const systemInstruction = [
      "You are a premium, luxury bilingual copywriter and translator specializing in high-end fashion, beauty, and retail boutique brands.",
      `Your task is to translate product details from ${data.from === "ar" ? "Arabic" : "English"} to ${data.to === "ar" ? "Arabic" : "English"}.`,
      "Guidelines:",
      "- Provide a beautifully localized, elegant, and natural translation that fits a premium luxury brand.",
      "- Avoid literal, mechanical, or robotic machine-translation phrasing.",
      "- Keep formatting, bullet points, line breaks, measurements (e.g. 50ml, cm, L), and brand names intact.",
      "- If translating to Arabic, use modern standard Arabic of high literary/retail quality suitable for boutique commerce (avoid casual slang, and avoid overly rigid Google-Translate-style literalisms).",
      "- Return ONLY the final translated text. Do not add any introduction, explanations, notes, quote marks, or extra comments.",
    ].join("\n");

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: "user", parts: [{ text: data.text }] }],
        generationConfig: { 
          temperature: 0.2, 
          maxOutputTokens: 2048,
        },
      }),
    });

    if (response.status === 429) throw new Error("RATE_LIMITED");
    if (response.status === 401 || response.status === 403) throw new Error("GEMINI_AUTH_FAILED");
    if (!response.ok) {
      const details = await response.text().catch(() => "");
      console.error(`[translateProductText] Gemini error ${response.status}: ${details.slice(0, 300)}`);
      if (response.status === 404) throw new Error("GEMINI_MODEL_UNAVAILABLE");
      throw new Error("GEMINI_PROVIDER_ERROR");
    }

    const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const out = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim() ?? "";
    if (!out) throw new Error("GEMINI_EMPTY_RESPONSE");

    return { text: out };
  });
