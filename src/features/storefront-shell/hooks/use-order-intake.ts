import { useEffect, useState } from "react";
import { orderIntake, type OrderIntake } from "@/lib/opening-hours";
import { useStorefront } from "@/lib/storefront-context";

/**
 * Whether the store takes an order now (its busy pause and its hours, `orderIntake`), kept
 * current: it is read again every half minute, so a pause that ends or a store that opens shows
 * without a reload. Null until the page runs in the browser (the server cannot know the moment the
 * shopper reads it), and for a catalog store, which takes no orders here.
 */
export function useOrderIntake(): { intake: OrderIntake; now: Date } | null {
  const { settings } = useStorefront();
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  if (!now) return null;
  return { intake: orderIntake(settings, now), now };
}
