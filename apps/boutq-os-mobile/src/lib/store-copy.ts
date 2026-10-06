import type { MobileStoreModules } from "@/lib/store-modules";

/**
 * Wording the merchant app chooses by what the store does, not by its vertical's name: a store that
 * ships talks about couriers and delivery, a store that takes bookings talks about appointments.
 * Mirrors the web audit (docs/vertical-fit-audit.md).
 */

export type CampaignTemplateId = "confirm" | "dispatch" | "pickup" | "reminder" | "promo";

/** The WhatsApp message presets a store is offered, in order. */
export function campaignTemplateIds(
  modules: Pick<MobileStoreModules, "bookings" | "shipping" | "stock">,
): CampaignTemplateId[] {
  const ids: CampaignTemplateId[] = ["confirm"];
  if (modules.shipping) ids.push("dispatch");
  // Collecting a parcel from the branch only makes sense for a store that keeps goods.
  if (modules.stock || modules.shipping) ids.push("pickup");
  if (modules.bookings) ids.push("reminder");
  ids.push("promo");
  return ids;
}

/** The empty-state line and the category example on the expenses screen. */
export function expenseHints(
  modules: Pick<MobileStoreModules, "shipping" | "stock">,
  isAr: boolean,
) {
  const goods = modules.stock || modules.shipping;
  if (goods) {
    return {
      empty: isAr
        ? "سجّل تكاليف الخياطة والأقمشة والشحن لحساب صافي الأرباح بدقة."
        : "Track operational costs like fabric, tailoring, and delivery to calculate net profit.",
      example: isAr ? "مثال: أقمشة، خياطة، تسويق، شحن" : "e.g. Fabric, Tailoring, Marketing",
    };
  }
  return {
    empty: isAr
      ? "سجّل الإيجار والرواتب والتسويق وأدوات العمل لحساب صافي الأرباح بدقة."
      : "Track costs like rent, salaries, marketing and equipment to calculate net profit.",
    example: isAr
      ? "مثال: إيجار، رواتب، تسويق، معدات"
      : "e.g. Rent, Salaries, Marketing, Equipment",
  };
}
