import type { MobileStoreModules } from "./store-modules";

/**
 * The operational cards on the merchant app's dashboard, for what the store does. A shop has
 * orders to prepare, parcels ready for a courier and stock to watch; a services store has
 * appointments (not prepared or shipped) and no stock, so it gets its bookings instead. Gated by
 * module, never by the vertical's name, so a store that overrides a module is still right.
 */
export type DashboardCardId = "pending" | "ready" | "lowStock" | "upcomingBookings";

export function dashboardCards(modules: MobileStoreModules): DashboardCardId[] {
  const services = modules.bookings && !modules.stock && !modules.shipping;
  const cards: DashboardCardId[] = [];
  // Orders to prepare: an appointment is not prepared, so a services store has none.
  if (!services) cards.push("pending");
  if (modules.shipping) cards.push("ready");
  if (modules.stock) cards.push("lowStock");
  if (modules.bookings) cards.push("upcomingBookings");
  return cards;
}

/** Order statuses that are still to be done; an appointment order is not counted among them. */
export const PENDING_ORDER_STATUSES = [
  "draft",
  "confirmed",
  "processing",
  "in_tailoring",
  "pending",
] as const;
