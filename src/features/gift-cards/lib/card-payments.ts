/**
 * What gift cards still hold on orders, for undoing a card's payment (migration 20261223100000,
 * `undo_gift_card_payment`). A card holds on an order what it paid there less what was given back
 * (its `redeemed` and `returned` moves naming the order): the database's own reading, so a screen
 * offers an undo exactly where the database will take one.
 */

type Move = { kind: string; amount: number | string };

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** What moves still hold: what was paid less what was given back, never below zero. */
function heldBy(moves: readonly Move[]): number {
  const net = moves
    .filter((m) => m.kind === "redeemed" || m.kind === "returned")
    .reduce((sum, m) => sum - Number(m.amount), 0);
  return Math.max(0, round3(net));
}

export type OrderCardMove = Move & {
  gift_card_id: string;
  code: string | null;
  status: string | null;
};

export type CardOnOrder = { cardId: string; code: string; voided: boolean; held: number };

/** Each card that still holds something on one order, in the order it first paid. */
export function cardsOnOrder(moves: readonly OrderCardMove[]): CardOnOrder[] {
  const byCard = new Map<string, OrderCardMove[]>();
  for (const move of moves) {
    byCard.set(move.gift_card_id, [...(byCard.get(move.gift_card_id) ?? []), move]);
  }
  return [...byCard.entries()]
    .map(([cardId, own]) => ({
      cardId,
      code: own[0].code ?? "",
      voided: own[0].status === "voided",
      held: heldBy(own),
    }))
    .filter((card) => card.held > 0);
}

/**
 * From one card's moves: for each order it still holds money on, the move to offer the undo on
 * (its latest payment there) and what it holds.
 */
export function undoableOrders(
  moves: readonly (Move & { id: string; order_id: string | null })[],
): Map<string, { moveId: string; held: number }> {
  const byOrder = new Map<string, (Move & { id: string })[]>();
  for (const move of moves) {
    if (!move.order_id) continue;
    byOrder.set(move.order_id, [...(byOrder.get(move.order_id) ?? []), move]);
  }
  const out = new Map<string, { moveId: string; held: number }>();
  for (const [orderId, own] of byOrder) {
    const held = heldBy(own);
    const last = own.filter((m) => m.kind === "redeemed").at(-1);
    if (held > 0 && last) out.set(orderId, { moveId: last.id, held });
  }
  return out;
}

/** What an order owes once a card's payment on it is undone (its other payments stay). */
export function owedAfterUndo(
  order: { total?: number | null; advance_paid?: number | null },
  held: number,
): number {
  const paid = Math.max(0, round3(Number(order.advance_paid ?? 0) - held));
  return Math.max(0, round3(Number(order.total ?? 0) - paid));
}

/** A card named by its last four characters, as the order's activity names it. */
export function cardTail(code: string): string {
  return `…${code.slice(-4)}`;
}
