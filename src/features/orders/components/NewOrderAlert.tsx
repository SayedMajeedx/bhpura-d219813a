import { useEffect } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { newArrivals } from "@/lib/new-arrivals";
import { toast } from "sonner";
import { subscribeToArrivals } from "@/lib/data/orders";
import { useI18n } from "@/lib/i18n";
import { useProfileOptional } from "@/lib/profile-context";
import {
  isShopperArrival,
  newOrderSoundOn,
  playNewOrderChime,
  unlockSound,
} from "@/lib/new-order-sound";
import { useOrderNumber } from "@/hooks/use-order-number";

/**
 * While any admin page of a store is open: a chime and a note for each new order or booking a
 * shopper places, for a member who switched the sound on in this browser (`NewOrderSoundToggle`).
 * Nothing for a courier, who sees only the deliveries given to them, and nothing while the sound
 * is off. Orders and bookings reach the page through the database's live changes (bookings since
 * migration 20261027140000), filtered to this store.
 */
export function NewOrderAlert({ brandId, slug }: { brandId: string; slug: string }) {
  const { lang } = useI18n();
  const navigate = useNavigate();
  const profile = useProfileOptional();
  const courier = Boolean(profile?.isCourier);
  const orderNo = useOrderNumber(brandId);
  // The Orders menu's count of new orders clears once the orders page is open.
  const onOrders = useRouterState({
    select: (state) => /\/orders(\/|$)/.test(state.location.pathname),
  });
  useEffect(() => {
    if (onOrders) newArrivals.clear();
  }, [onOrders]);

  useEffect(() => {
    if (courier || !brandId) return;
    // A page reopened with the sound on may play it after its first tap.
    const unlock = () => {
      if (newOrderSoundOn()) void unlockSound();
    };
    window.addEventListener("pointerdown", unlock, { once: true });

    const announce = (table: "orders" | "bookings", row: Record<string, unknown>) => {
      if (!isShopperArrival(table, row)) return;
      if (table === "orders" && !onOrders) newArrivals.add();
      if (!newOrderSoundOn()) return;
      playNewOrderChime();
      const isAr = lang === "ar";
      if (table === "orders") {
        const number = row.invoice_number ? orderNo(row.invoice_number as number) : "";
        toast.success(isAr ? `طلب جديد ${number}` : `New order ${number}`, {
          action: {
            label: isAr ? "افتح" : "Open",
            onClick: () =>
              navigate({
                to: "/admin/b/$slug/orders/$id",
                params: { slug, id: String(row.id) },
              }),
          },
        });
      } else {
        toast.success(isAr ? "طلب حجز جديد" : "New booking request", {
          action: {
            label: isAr ? "افتح" : "Open",
            onClick: () => navigate({ to: "/admin/b/$slug/bookings", params: { slug } }),
          },
        });
      }
    };

    const stop = subscribeToArrivals(brandId, announce);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      stop();
    };
  }, [brandId, slug, lang, courier, navigate, orderNo, onOrders]);

  return null;
}
