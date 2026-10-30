import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { businessSettingsQueries, type BusinessSettingsRow } from "@/lib/data/business-settings";
import { adminAccent } from "@/lib/admin-accent";
import { useTheme } from "@/lib/theme-context";

/** The store's colour as its storefront wears it (the palette's accent, else the brand's). */
const storeColorOf = (row: BusinessSettingsRow | null) => row?.storefront_accent_color ?? null;

/**
 * Puts the open store's colour on the admin's --primary and --ring, on the page's root so that
 * dialogs and sheets wear it too (`adminAccent` decides when it can be read; otherwise, and on
 * the platform's own pages, the admin keeps Boutq's ink).
 */
export function useAdminAccent(brandId: string | null | undefined, enabled: boolean) {
  const { resolvedTheme } = useTheme();
  const { data: color } = useQuery({
    ...businessSettingsQueries.detail(brandId ?? ""),
    select: storeColorOf,
    enabled: Boolean(brandId) && enabled,
    staleTime: 5 * 60_000,
  });
  const accent = enabled ? adminAccent(color, resolvedTheme) : null;
  const primary = accent?.primary ?? null;
  const foreground = accent?.foreground ?? null;

  useEffect(() => {
    if (!primary || !foreground) return;
    const root = document.documentElement;
    root.style.setProperty("--primary", primary);
    root.style.setProperty("--primary-foreground", foreground);
    root.style.setProperty("--ring", primary);
    return () => {
      root.style.removeProperty("--primary");
      root.style.removeProperty("--primary-foreground");
      root.style.removeProperty("--ring");
    };
  }, [primary, foreground]);
}
