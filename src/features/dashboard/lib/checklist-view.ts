/**
 * How much room the launch checklist takes on the dashboard. A new store needs
 * it whole; a store that has done two steps of three sees one line that opens
 * it, so its sales come first: Pura, with seven orders and two steps done, had a
 * whole phone screen of checklist above its figures. A store that has done all
 * three is launched, and the checklist steps aside (the admin audit of
 * 2026-11-12: a store with 15 orders still read "Start here").
 */
export type ChecklistView = "full" | "line" | "hidden";

export function checklistView({
  completed,
  dismissed,
}: {
  completed: number;
  dismissed: boolean;
}): ChecklistView {
  if (dismissed || completed >= 3) return "hidden";
  return completed >= 2 ? "line" : "full";
}

/** The products on the store: shown and not archived, never the hidden ones (the checklist said 24 for 19). */
export function productsOnStore(
  products: ReadonlyArray<{ is_active?: boolean | null; archived_at?: string | null }> | undefined,
): number {
  return (products ?? []).filter((p) => p.is_active === true && !p.archived_at).length;
}

/**
 * "Preview and share the store" is done once the merchant says so, or once the store has real
 * sales: shoppers found it, so it was shared. It once waited for a tap on a store with 15 orders.
 */
export function shareStepDone({
  marked,
  hasRealSales,
}: {
  marked: boolean;
  hasRealSales: boolean;
}) {
  return marked || hasRealSales;
}
