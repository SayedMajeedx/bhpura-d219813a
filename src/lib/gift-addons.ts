/**
 * Gift add-ons (migration 20261203100000): what a shopper may add to a gift order (a flower
 * bouquet, chocolates), each with the store's own price and words. The database prices each one
 * (`apply_order_gift`); these say the same for the checkout's total and the screens.
 */

export type GiftAddon = {
  id: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string | null;
  descriptionEn: string | null;
  imageUrl: string | null;
  price: number;
};

/** A store's add-on as staff edit it: what the shopper sees, and whether it is offered now. */
export type GiftAddonRow = GiftAddon & { isAvailable: boolean; sortOrder: number };

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

/** One add-on as the database answers it, or null for anything that is not one. */
function readAddon(raw: unknown): GiftAddon | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const id = text(value.id);
  const nameAr = text(value.name_ar);
  const nameEn = text(value.name_en);
  const price = Number(value.price);
  if (!id || !(nameAr || nameEn) || !Number.isFinite(price) || price <= 0) return null;
  return {
    id,
    nameAr: nameAr ?? nameEn ?? "",
    nameEn: nameEn ?? nameAr ?? "",
    descriptionAr: text(value.description_ar),
    descriptionEn: text(value.description_en),
    imageUrl: text(value.image_url),
    price,
  };
}

/** The add-ons a store's checkout offers (`storefront_gift_addons`). */
export function readGiftAddons(raw: unknown): GiftAddon[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(readAddon).filter((addon): addon is GiftAddon => addon !== null);
}

/** A store's own row, for its staff. */
export function readGiftAddonRow(raw: Record<string, unknown>): GiftAddonRow | null {
  const addon = readAddon(raw);
  if (!addon) return null;
  return {
    ...addon,
    isAvailable: raw.is_available !== false,
    sortOrder: Number(raw.sort_order) || 0,
  };
}

/** An add-on's name in the reader's language. */
export const addonName = (addon: Pick<GiftAddon, "nameAr" | "nameEn">, lang: "ar" | "en") =>
  lang === "ar" ? addon.nameAr || addon.nameEn : addon.nameEn || addon.nameAr;

/** What the shopper chose: an add-on's id and how many (1 when it is ticked). */
export type ChosenAddons = Readonly<Record<string, number>>;

/** The chosen add-ons the store still offers, with how many of each (at most 10). */
export function chosenAddonLines(
  chosen: ChosenAddons,
  offered: readonly GiftAddon[],
): Array<{ addon: GiftAddon; quantity: number }> {
  return offered
    .filter((addon) => (chosen[addon.id] ?? 0) > 0)
    .map((addon) => ({ addon, quantity: Math.min(10, Math.floor(chosen[addon.id] ?? 0)) }));
}

/** What the chosen add-ons add to the order (before tax; a code and the offers never reach it). */
export function addonsTotal(chosen: ChosenAddons, offered: readonly GiftAddon[]): number {
  const total = chosenAddonLines(chosen, offered).reduce(
    (sum, line) => sum + line.addon.price * line.quantity,
    0,
  );
  return Math.round(total * 1000) / 1000;
}

/** What checkout sends for them: ids and quantities, never a price. */
export function addonsPayload(
  chosen: ChosenAddons,
  offered: readonly GiftAddon[],
): Array<{ id: string; quantity: number }> {
  return chosenAddonLines(chosen, offered).map((line) => ({
    id: line.addon.id,
    quantity: line.quantity,
  }));
}

/** The add-on's price as typed in the settings: above 0 and at most 10,000, or null. */
export function addonPriceFromText(value: string): number | null {
  const cleaned = value
    .trim()
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace("٫", ".");
  if (cleaned === "") return null;
  const amount = Number(cleaned);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10000) return null;
  return Math.round(amount * 1000) / 1000;
}

/** A cost as typed (finance staff): a number from 0 to 10,000, empty for none, or "invalid". */
export function giftCostFromText(value: string): number | null | "invalid" {
  const cleaned = value
    .trim()
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace("٫", ".");
  if (cleaned === "") return null;
  const amount = Number(cleaned);
  if (!Number.isFinite(amount) || amount < 0 || amount > 10000) return "invalid";
  return Math.round(amount * 1000) / 1000;
}

/** An add-on as an order's gift details name it (`orders.gift.addons`). */
export type OrderGiftAddon = { nameAr: string; nameEn: string; quantity: number };

export function readOrderGiftAddons(raw: unknown): OrderGiftAddon[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const value = item as Record<string, unknown>;
    const nameAr = text(value.name_ar);
    const nameEn = text(value.name_en);
    if (!nameAr && !nameEn) return [];
    const quantity = Number(value.quantity);
    return [
      {
        nameAr: nameAr ?? nameEn ?? "",
        nameEn: nameEn ?? nameAr ?? "",
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
      },
    ];
  });
}
