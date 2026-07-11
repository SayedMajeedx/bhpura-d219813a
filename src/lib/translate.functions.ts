import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({
  text: z.string().min(1).max(4000),
  from: z.enum(["ar", "en"]),
  to: z.enum(["ar", "en"]),
});

/**
 * One-shot merchant text translation via Azure AI Translator.
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

    const key = process.env.AZURE_TRANSLATOR_KEY;
    const region = process.env.AZURE_TRANSLATOR_REGION;

    if (!key) throw new Error("Missing AZURE_TRANSLATOR_KEY");
    if (!region) throw new Error("Missing AZURE_TRANSLATOR_REGION");

    const endpoint =
      process.env.AZURE_TRANSLATOR_ENDPOINT ||
      "https://api.cognitive.microsofttranslator.com";

    const url = new URL("/translate", endpoint);
    url.searchParams.set("api-version", "3.0");
    url.searchParams.set("from", data.from);
    url.searchParams.set("to", data.to);

    const res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Ocp-Apim-Subscription-Key": key,
        "Ocp-Apim-Subscription-Region": region,
      },
      body: JSON.stringify([{ text: data.text }]),
    });

    if (res.status === 401) throw new Error("AZURE_TRANSLATOR_AUTH_FAILED");
    if (res.status === 403) throw new Error("AZURE_TRANSLATOR_FORBIDDEN_OR_REGION_MISMATCH");
    if (res.status === 429) throw new Error("AZURE_TRANSLATOR_RATE_LIMITED");
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.error(`[translateProductText] Azure error ${res.status}: ${t.slice(0, 200)}`);
      throw new Error("AZURE_TRANSLATOR_PROVIDER_ERROR");
    }

    const json = (await res.json()) as Array<{
      translations?: Array<{ text?: string }>;
    }>;

    const out = json[0]?.translations?.[0]?.text?.trim() ?? "";
    return { text: out };
  });
