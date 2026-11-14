import { useMemo } from "react";
import {
  readRemembered,
  rememberedKey,
  type Remembered,
} from "@/features/content-studio/lib/remembered";

/**
 * What this device last made in the studio for this store (the template and the size), so the
 * studio opens where the merchant left it. A convenience of this device only: a private window or
 * cleared storage simply opens on Classic as a story.
 */
export function useRemembered(brandId: string) {
  const key = rememberedKey(brandId);
  const initial = useMemo<Remembered>(() => {
    try {
      return readRemembered(localStorage.getItem(key));
    } catch {
      return {};
    }
  }, [key]);
  const save = (patch: Remembered) => {
    try {
      const now = readRemembered(localStorage.getItem(key));
      localStorage.setItem(key, JSON.stringify({ ...now, ...patch }));
    } catch {
      /* kept for this visit only */
    }
  };
  return { ...initial, save };
}
