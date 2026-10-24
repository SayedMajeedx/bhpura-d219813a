import { pieceName } from "@/features/incubators/lib/partner-stock";
import type { Movement } from "@/features/incubators/types";

/**
 * A partner's history, as staff read it: every time pieces went to the partner, came back,
 * were sold there, or were taken by one of the store's own orders.
 */

type Lang = "ar" | "en";

const LABELS: Record<string, { en: string; ar: string }> = {
  transfer_in: { en: "Sent to the partner", ar: "تحويل إلى المحل الشريك" },
  return: { en: "Returned to the store", ar: "إرجاع إلى المحل" },
  sale: { en: "Sold by the partner", ar: "بيع عند المحل الشريك" },
  sale_reversal: { en: "Sale reversed", ar: "إلغاء بيعة" },
  adjustment: { en: "Adjustment", ar: "تسوية" },
  order_reserve: { en: "Taken by a store order", ar: "حجز لطلب من المتجر" },
  order_release: { en: "Given back by a store order", ar: "إعادة من طلب أُلغي" },
};

export function movementLabel(type: string, lang: Lang): string {
  return LABELS[type]?.[lang] ?? type;
}

export type MovementLine = {
  id: string;
  label: string;
  piece: string;
  /** Pieces added to the partner's shelf (positive) or taken from it (negative). */
  delta: number;
  /** "+3" or "−2": a real minus sign, so it reads the same in both directions. */
  deltaText: string;
  note: string | null;
  /** The store order behind it, when there is one. */
  orderId: string | null;
  at: string;
};

export function movementLines(movements: readonly Movement[], lang: Lang): MovementLine[] {
  return movements.map((movement) => {
    const delta = Number(movement.quantity_delta);
    // The database's own notes on an order's movement are in English; the label says it already.
    const byOrder = movement.reference_type === "order";
    return {
      id: movement.id,
      label: movementLabel(movement.movement_type, lang),
      piece: pieceName(movement.product_variants, lang),
      delta,
      deltaText: delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`,
      note: byOrder ? null : String(movement.notes ?? "").trim() || null,
      orderId: byOrder ? movement.reference_id : null,
      at: movement.occurred_at,
    };
  });
}
