import { useMemo, useCallback } from "react";
import { useAddons } from "@/components/addons/AddonsProvider";
import { vocabularyFrom } from "@/lib/addons/addon-registry";
import {
  DEFAULT_VOCABULARY,
  resolveVocabulary,
  type StoreVocabulary,
} from "@/lib/store-vocabulary";

export function useVocabulary() {
  const { addons } = useAddons();

  const vocabulary = useMemo(() => {
    return resolveVocabulary(DEFAULT_VOCABULARY, vocabularyFrom(addons));
  }, [addons]);

  const t = useCallback(
    (key: keyof StoreVocabulary, lang: "ar" | "en" = "ar"): string => {
      const entry = vocabulary[key] ?? DEFAULT_VOCABULARY[key];
      return entry?.[lang] ?? "";
    },
    [vocabulary],
  );

  return { vocabulary, t };
}
