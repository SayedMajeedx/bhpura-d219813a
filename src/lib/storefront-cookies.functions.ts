import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const CookieInput = z.object({
  slug: z.string().optional(),
});

export const getStorefrontInitialLang = createServerFn({ method: "GET" })
  .validator((raw: unknown) => CookieInput.parse(raw))
  .handler(async ({ data }): Promise<"ar" | "en" | null> => {
    const { readStorefrontLangCookie } = await import("./storefront-cookies.server");
    return readStorefrontLangCookie(data.slug);
  });
