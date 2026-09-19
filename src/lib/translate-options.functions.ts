import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getEnvVariableAsync } from "@/integrations/supabase/auth-middleware";
import { translateOptionValue, hasKnownTranslation } from "./variant-i18n";

const Input = z.object({
  terms: z.array(z.string()).min(1).max(50),
  from: z.enum(["ar", "en"]).default("ar"),
  to: z.enum(["ar", "en"]).default("en"),
});

const DEFAULT_MODEL = "gemini-3.1-flash-lite";

/**
 * Autonomous, high-speed variant option translation function.
 * Uses persistent DB cache (translation_cache) and falls back to Gemini AI
 * only for genuinely unseen terms. Stores newly translated terms permanently.
 */
export const translateOptionTerms = createServerFn({ method: "POST" })
  .validator((raw: unknown) => Input.parse(raw))
  .handler(async ({ data }) => {
    const rawTerms = Array.from(
      new Set(
        data.terms
          .map((t) => (typeof t === "string" ? t.trim() : ""))
          .filter(Boolean),
      ),
    );

    if (rawTerms.length === 0 || data.from === data.to) {
      const identity: Record<string, string> = {};
      rawTerms.forEach((t) => {
        identity[t] = t;
      });
      return { translations: identity };
    }

    const translations: Record<string, string> = {};
    const unmapped: string[] = [];

    // Step 1: Query persistent translation_cache in Supabase
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: cached, error } = await (supabaseAdmin as any)
        .from("translation_cache")
        .select("source_text, translated_text")
        .eq("source_lang", data.from)
        .eq("target_lang", data.to)
        .in("source_text", rawTerms);

      if (!error && Array.isArray(cached)) {
        for (const row of cached) {
          if (row.source_text && row.translated_text) {
            translations[row.source_text] = row.translated_text;
          }
        }
      }
    } catch (err) {
      console.warn("[translateOptionTerms] DB cache query skipped:", err);
    }

    // Step 2: Check local Tier 1 & Tier 2 lexicon for terms not yet in DB cache
    const toSaveInCache: Array<{ source: string; translated: string }> = [];

    for (const term of rawTerms) {
      if (translations[term]) continue;

      const localTranslation = translateOptionValue(term, data.to);
      if (hasKnownTranslation(term, data.to)) {
        translations[term] = localTranslation;
        toSaveInCache.push({ source: term, translated: localTranslation });
      } else {
        unmapped.push(term);
      }
    }

    // Step 3: For genuinely new / unknown terms, translate with Gemini AI in 1 compact batch
    if (unmapped.length > 0) {
      try {
        const apiKey = await getEnvVariableAsync("GEMINI_API_KEY");
        if (apiKey) {
          const prompt = [
            `You are a bilingual luxury e-commerce retail translator specializing in Arabic and English.`,
            `Translate the following variant options, materials, flavors, or product attributes from ${data.from === "ar" ? "Arabic" : "English"} to ${data.to === "ar" ? "Arabic" : "English"}.`,
            `Rules:`,
            `- Return ONLY a valid JSON object mapping each input term to its translation.`,
            `- Example: {"حرير": "Silk", "فستق كرانشي": "Crunchy Pistachio"}`,
            `- Keep brand names, numbers, and units intact.`,
            `- Do NOT include markdown code fences or any other commentary.`,
            `Input terms to translate:`,
            JSON.stringify(unmapped),
          ].join("\n");

          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_MODEL}:generateContent`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
              body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                generationConfig: {
                  temperature: 0.1,
                  responseMimeType: "application/json",
                  maxOutputTokens: 1024,
                },
              }),
            },
          );

          if (response.ok) {
            const payload = (await response.json()) as {
              candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
            };
            const jsonText =
              payload.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "{}";

            try {
              const aiMap = JSON.parse(jsonText);
              if (aiMap && typeof aiMap === "object") {
                for (const [k, v] of Object.entries(aiMap)) {
                  if (typeof v === "string" && v.trim()) {
                    translations[k] = v.trim();
                    toSaveInCache.push({ source: k, translated: v.trim() });
                  }
                }
              }
            } catch (pErr) {
              console.warn("[translateOptionTerms] Failed to parse AI JSON:", pErr, jsonText);
            }
          }
        }
      } catch (aiErr) {
        console.warn("[translateOptionTerms] Gemini batch translation failed:", aiErr);
      }
    }

    // Step 4: Persist newly resolved translations to translation_cache in background
    if (toSaveInCache.length > 0) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const rows = toSaveInCache.map((item) => ({
          source_lang: data.from,
          target_lang: data.to,
          source_text: item.source,
          translated_text: item.translated,
          context: "variant_option",
        }));

        await (supabaseAdmin as any)
          .from("translation_cache")
          .upsert(rows, { onConflict: "source_lang,target_lang,source_text,context" });
      } catch (saveErr) {
        console.warn("[translateOptionTerms] Failed to persist to translation_cache:", saveErr);
      }
    }

    // Step 5: Fill any still-missing terms with original value
    for (const term of rawTerms) {
      if (!translations[term]) {
        translations[term] = term;
      }
    }

    return { translations };
  });
