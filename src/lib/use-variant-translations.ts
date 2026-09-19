import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getUntranslatedTerms,
  registerDynamicTranslations,
  translateOptionValue,
} from "./variant-i18n";
import { translateOptionTerms } from "./translate-options.functions";

/**
 * React hook that guarantees all variant options are translated on the storefront.
 * Instant 0ms render for all known terms (lexicon + local cache).
 * Automatically detects any unseen or custom terms, queries the server cache & AI gateway in the background,
 * and updates UI smoothly without blocking page navigation.
 */
export function useVariantTranslations(
  terms: Array<string | null | undefined>,
  targetLang: "ar" | "en",
) {
  const translateFn = useServerFn(translateOptionTerms);
  const [version, setVersion] = useState(0);

  // Compute clean deduplicated list of non-empty strings
  const stringTerms = Array.from(
    new Set(
      terms
        .map((t) => (typeof t === "string" ? t.trim() : ""))
        .filter(Boolean),
    ),
  );

  const missing = getUntranslatedTerms(stringTerms, targetLang);

  useEffect(() => {
    if (missing.length === 0) return;

    let isMounted = true;
    const sourceLang = targetLang === "en" ? "ar" : "en";

    translateFn({
      data: {
        terms: missing,
        from: sourceLang,
        to: targetLang,
      },
    })
      .then((res) => {
        if (!isMounted || !res?.translations) return;
        registerDynamicTranslations(res.translations, targetLang);
        setVersion((v) => v + 1);
      })
      .catch((err) => {
        console.warn("[useVariantTranslations] Background translation failed:", err);
      });

    return () => {
      isMounted = false;
    };
  }, [missing.join(","), targetLang]);

  /**
   * Helper that returns the translated string reactively
   */
  const tOption = (val: string | null | undefined): string => {
    // version dependency ensures re-render when dynamic translations are registered
    void version;
    return translateOptionValue(val, targetLang);
  };

  return { tOption, version };
}
