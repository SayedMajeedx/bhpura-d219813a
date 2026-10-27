import { momentLabel } from "@/lib/opening-hours";

/**
 * Taking a product or a category off sale for a while (migration 20261027120000): the choices a
 * member of staff is offered and the moment each ends. Whether a product is off sale is
 * `offSaleUntil` (src/lib/product-availability.ts), which every surface reads.
 */

export type OffSaleChoice = "1h" | "4h" | "tomorrow" | "until_back";

export const OFF_SALE_CHOICES: OffSaleChoice[] = ["1h", "4h", "tomorrow", "until_back"];

/** When a choice ends: an hour or four from now, the next midnight on this clock, or never. */
export function offSaleEnd(choice: OffSaleChoice, now: Date): string {
  if (choice === "until_back") return "infinity";
  if (choice === "tomorrow") {
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    return midnight.toISOString();
  }
  return new Date(now.getTime() + (choice === "1h" ? 1 : 4) * 3_600_000).toISOString();
}

export function offSaleChoiceLabel(choice: OffSaleChoice, isAr: boolean): string {
  switch (choice) {
    case "1h":
      return isAr ? "ساعة" : "1 hour";
    case "4h":
      return isAr ? "4 ساعات" : "4 hours";
    case "tomorrow":
      return isAr ? "حتى الغد" : "Until tomorrow";
    default:
      return isAr ? "حتى أعيده" : "Until I put it back";
  }
}

/** The reader's own clock, for staff screens. */
const localZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Bahrain";
  } catch {
    return "Asia/Bahrain";
  }
};

/** "Off sale until today at 18:00" / "Off sale until you put it back". */
export function offSaleStatus(until: string, isAr: boolean, now: Date): string {
  if (until === "infinity")
    return isAr ? "موقوف عن البيع حتى تعيده" : "Off sale until you put it back";
  const when = momentLabel(until, localZone(), now, isAr ? "ar" : "en");
  return isAr ? `موقوف عن البيع حتى ${when}` : `Off sale until ${when}`;
}
