import { countOf } from "@/lib/arabic-count";
import { holdIsOpen, type PartnerHold } from "@/features/incubators/lib/partner-stock";

/**
 * Ending a partnership with a partner shop (step 4 of the partner transfers plan, 2026-11-17):
 * what is still left with them, and whether the partner can be marked inactive now.
 *
 * - Pieces still at the partner stop it: a store order can take a piece from any partner, active
 *   or not, so pieces left at an ended partner would still be sold from there. Move them to
 *   another partner or return them to the store first.
 * - Pieces held there for store orders not handed over yet stop it too: the customer or the
 *   courier still collects them there.
 * - Money the partner still owes does not: ending keeps their page, sales and statement, and a
 *   payment can be recorded afterwards.
 *
 * Ending marks the partner inactive and stops pickups there; it can be undone in its settings.
 */

type Lang = "ar" | "en";

export type EndItem = {
  key: "pieces" | "orders" | "money";
  /** Stops the ending until it is cleared. */
  blocks: boolean;
  /** Nothing left of it. */
  clear: boolean;
  text: string;
};

export function endPartnershipChecklist(input: {
  /** Pieces the partner holds free (`incubator_inventory.quantity`). */
  pieces: number;
  /** Pieces store orders took from this partner (open or not; only open ones count). */
  holds: readonly PartnerHold[];
  incubatorId: string;
  /** What the partner still owes the store. */
  due: number;
  money: (amount: number) => string;
  lang: Lang;
}): { items: EndItem[]; canEnd: boolean } {
  const { lang, money } = input;
  const ar = lang === "ar";
  const open = input.holds.filter(
    (hold) => hold.incubator_id === input.incubatorId && holdIsOpen(hold),
  );
  const orders = new Set(open.map((hold) => hold.order_id)).size;
  const due = Math.max(0, Number(input.due) || 0);

  const items: EndItem[] = [
    {
      key: "pieces",
      blocks: input.pieces > 0,
      clear: input.pieces <= 0,
      text:
        input.pieces > 0
          ? ar
            ? `عندهم ${countOf(input.pieces, "piece", "ar")}: انقلها لمحل شريك آخر أو أرجعها إلى المحل أولاً`
            : `They hold ${countOf(input.pieces, "piece", "en")}: move them to another partner or return them to the store first`
          : ar
            ? "لا توجد قطع عندهم"
            : "They hold no pieces",
    },
    {
      key: "orders",
      blocks: orders > 0,
      clear: orders === 0,
      text:
        orders > 0
          ? ar
            ? `قطع محجوزة عندهم لطلبات لم تُسلَّم بعد (${countOf(orders, "order", "ar")}): انتظر حتى تُسلَّم`
            : `Pieces held there for ${countOf(orders, "order", "en")} not handed over yet: wait until they are`
          : ar
            ? "لا توجد طلبات تُستلم من عندهم"
            : "No orders to collect from them",
    },
    {
      key: "money",
      blocks: false,
      clear: due < 0.0005,
      text:
        due >= 0.0005
          ? ar
            ? `عليهم ${money(due)}: يبقى في حسابهم، وتقدر تسجّل الدفعة بعد إنهاء الشراكة`
            : `They owe ${money(due)}: it stays on their account, and the payment can be recorded after ending`
          : ar
            ? "لا مبالغ مستحقة عليهم"
            : "They owe nothing",
    },
  ];
  return { items, canEnd: items.every((item) => !item.blocks) };
}
