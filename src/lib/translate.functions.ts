import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({
  text: z.string().min(1).max(4000),
  from: z.enum(["ar", "en"]),
  to: z.enum(["ar", "en"]),
});

/**
 * One-shot merchant text translation via Lovable AI Gateway.
 * Auth-gated so anonymous visitors can't burn credits.
 */
export const translateProductText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => Input.parse(raw))
  .handler(async ({ data }) => {
    if (data.from === data.to) return { text: data.text };

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const target = data.to === "ar" ? "Arabic" : "English";
    const source = data.from === "ar" ? "Arabic" : "English";

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              `You are a professional bilingual e-commerce copywriter. Translate the user's product text from ${source} to ${target}. ` +
              `Keep the tone natural, concise, and marketing-friendly. Preserve line breaks. ` +
              `Do NOT add quotes, prefixes like "Translation:", explanations, or emojis unless present in the source. ` +
              `Return ONLY the translated text.`,
          },
          { role: "user", content: data.text },
        ],
        temperature: 0.2,
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
    const out = json.choices?.[0]?.message?.content?.trim() ?? "";
    return { text: out };
  });
