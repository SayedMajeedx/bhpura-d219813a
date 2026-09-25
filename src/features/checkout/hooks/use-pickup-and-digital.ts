import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Storefront } from "@/features/checkout/types";

/** Pickup branches (first one preselected) and the digital delivery channel and contact. */
export function usePickupAndDigital({
  brand,
  settings,
  lang,
}: {
  brand: Pick<Storefront["brand"], "id">;
  settings: Storefront["settings"];
  lang: Storefront["lang"];
}) {
  const [branches, setBranches] = useState<
    Array<{
      id: string;
      name_ar: string | null;
      name_en: string | null;
      location_ar: string | null;
      location_en: string | null;
      notes_ar: string | null;
      notes_en: string | null;
    }>
  >([]);
  const [branchId, setBranchId] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem("checkout_branchId");
      if (saved) return saved;
    }
    return "";
  });
  const [digitalChannel, setDigitalChannel] = useState<"email" | "whatsapp">(() => {
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem("checkout_digitalChannel");
      if (saved) return saved as any;
    }
    return "email";
  });
  const [digitalContact, setDigitalContact] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem("checkout_digitalContact");
      if (saved) return saved;
    }
    return "";
  });
  useEffect(() => {
    if (!settings.pickup_enabled) return;
    (async () => {
      const { data } = await supabase.rpc("get_public_branches" as any, {
        p_brand_id: brand.id,
      });
      const list = (data ?? []) as any[];
      setBranches(list);
      setBranchId((cur) => cur || (list[0]?.id ?? ""));
    })();
  }, [brand.id, settings.pickup_enabled]);
  const branchLabel = (b: (typeof branches)[number]) =>
    lang === "ar" ? b.name_ar || b.name_en || "" : b.name_en || b.name_ar || "";
  const branchLoc = (b: (typeof branches)[number]) =>
    lang === "ar" ? b.location_ar || b.location_en || "" : b.location_en || b.location_ar || "";

  return {
    branches,
    branchId,
    setBranchId,
    digitalChannel,
    setDigitalChannel,
    digitalContact,
    setDigitalContact,
    branchLabel,
    branchLoc,
  };
}
