import { useEffect, useState } from "react";
import { fetchPublicBranches, type PublicBranch } from "@/lib/data/branches";
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
  const [branches, setBranches] = useState<PublicBranch[]>([]);
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
      const list = await fetchPublicBranches(brand.id);
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
