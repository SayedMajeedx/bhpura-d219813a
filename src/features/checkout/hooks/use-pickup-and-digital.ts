import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchPublicBranches, type PublicBranch } from "@/lib/data/branches";
import { checkoutQueries, NO_PICKUP_PARTNERS } from "@/lib/data/checkout";
import { pickupBranchesOffered, pickupCartItems } from "@/features/checkout/lib/pickup-places";
import type { CartItem } from "@/lib/storefront-context";
import type { Storefront } from "@/features/checkout/types";

/**
 * Pickup branches (first one preselected), the partners' shops that hold the whole cart, and the
 * digital delivery channel and contact. A pickup is at one place: a branch or a partner.
 */
export function usePickupAndDigital({
  brand,
  settings,
  lang,
  cart = [],
  madeToOrderIds = new Set<string>(),
}: {
  brand: Pick<Storefront["brand"], "id">;
  settings: Storefront["settings"];
  lang: Storefront["lang"];
  cart?: readonly CartItem[];
  madeToOrderIds?: ReadonlySet<string>;
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
  // The partners that hold every piece of the cart and take pickups (the database decides).
  const pickupItems = useMemo(() => pickupCartItems(cart, madeToOrderIds), [cart, madeToOrderIds]);
  const { data: pickupPartners = NO_PICKUP_PARTNERS } = useQuery({
    ...checkoutQueries.pickupPartners(brand.id, pickupItems),
    enabled: Boolean(settings.pickup_enabled) && pickupItems.length > 0,
  });
  const [partnerId, setPartnerIdState] = useState("");
  const setPartnerId = (id: string) => {
    setPartnerIdState(id);
    if (id) setBranchId("");
  };
  const chooseBranch = (id: string) => {
    setBranchId(id);
    if (id) setPartnerIdState("");
  };
  // The branches this cart can be collected at: none when its pieces are at a partner's shop.
  const offeredBranches = useMemo(
    () => pickupBranchesOffered(branches, pickupPartners),
    [branches, pickupPartners],
  );
  const firstPartner = pickupPartners.partners[0]?.id ?? "";
  useEffect(() => {
    // A partner chosen for a cart it no longer holds whole is not a place to collect from.
    if (partnerId && !pickupPartners.partners.some((p) => p.id === partnerId)) {
      setPartnerIdState("");
      setBranchId((cur) => cur || (offeredBranches[0]?.id ?? ""));
      return;
    }
    // With no branch to offer, the place is the partner's shop: chosen for the shopper.
    if (!partnerId && offeredBranches.length === 0 && firstPartner) {
      setPartnerIdState(firstPartner);
      setBranchId("");
    }
  }, [partnerId, pickupPartners.partners, offeredBranches, firstPartner]);

  const branchLabel = (b: (typeof branches)[number]) =>
    lang === "ar" ? b.name_ar || b.name_en || "" : b.name_en || b.name_ar || "";
  const branchLoc = (b: (typeof branches)[number]) =>
    lang === "ar" ? b.location_ar || b.location_en || "" : b.location_en || b.location_ar || "";

  return {
    branches: offeredBranches,
    branchId,
    setBranchId: chooseBranch,
    pickupPartners,
    partnerId,
    setPartnerId,
    digitalChannel,
    setDigitalChannel,
    digitalContact,
    setDigitalContact,
    branchLabel,
    branchLoc,
  };
}
