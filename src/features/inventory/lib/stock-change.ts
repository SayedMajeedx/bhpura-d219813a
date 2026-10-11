/**
 * A change to a variant's stock in the store, made by a person: why it changed, and by how much.
 *
 * The list used to send a request on every press of + or −, each recorded as "manual adjust" with
 * no reason, so receiving twelve pieces wrote twelve lines that said nothing. Now a change is
 * made once, with its reason:
 *   - received: pieces that arrived are added to whatever is there now;
 *   - damaged:  pieces lost or spoiled are taken off whatever is there now;
 *   - count:    the shelf was counted, and the count is the truth.
 * Adding and taking off are sent as a difference, so an order placed while the dialog was open is
 * not undone; only a count replaces the number.
 */
export type StockChangeKind = "received" | "damaged" | "count";

export const STOCK_CHANGE_KINDS: StockChangeKind[] = ["received", "count", "damaged"];

/** The most pieces one change may move: a slip of the finger should not add a million. */
export const MAX_STOCK_CHANGE = 100_000;

export function stockChangeLabels(kind: StockChangeKind, isAr: boolean) {
  const labels = {
    received: {
      title: isAr ? "استلام مخزون جديد" : "New stock received",
      amount: isAr ? "كم قطعة وصلت؟" : "How many arrived?",
    },
    count: {
      title: isAr ? "تصحيح بعد الجرد" : "Count correction",
      amount: isAr ? "كم قطعة على الرف الآن؟" : "How many are on the shelf now?",
    },
    damaged: {
      title: isAr ? "تالف أو مفقود" : "Damaged or lost",
      amount: isAr ? "كم قطعة تُخصم؟" : "How many to take off?",
    },
  };
  return labels[kind];
}

export type StockChangeRequest = {
  mode: "set" | "delta";
  value: number;
  /** The ledger's reason: an arrival is an adjustment, a count or a loss is a correction. */
  reason: "manual_adjust" | "correction";
  note: string;
};

export type StockChangePlan =
  | { ok: true; next: number; request: StockChangeRequest }
  | { ok: false; next: number; problem: "amount" | "nothing" | "more_than_stock" | "too_many" };

const NOTE_PREFIX: Record<StockChangeKind, string> = {
  received: "Stock received",
  count: "Count correction",
  damaged: "Damaged or lost",
};

/**
 * What a change does to the stock and the request that makes it. `amount` is what was typed:
 * pieces arrived, pieces lost, or the count. A change that changes nothing is not sent.
 */
export function planStockChange({
  current,
  kind,
  amount,
  note = "",
}: {
  current: number;
  kind: StockChangeKind;
  amount: number | string;
  note?: string;
}): StockChangePlan {
  const now = Math.max(0, Math.trunc(Number(current) || 0));
  const typed = typeof amount === "string" ? amount.trim() : amount;
  const pieces = Number(typed);
  if (typed === "" || !Number.isInteger(pieces) || pieces < 0) {
    return { ok: false, next: now, problem: "amount" };
  }
  if (pieces > MAX_STOCK_CHANGE) return { ok: false, next: now, problem: "too_many" };

  const next = kind === "received" ? now + pieces : kind === "damaged" ? now - pieces : pieces;
  if (next < 0) return { ok: false, next: now, problem: "more_than_stock" };
  if (next === now) return { ok: false, next: now, problem: "nothing" };

  const said = note.trim();
  const fullNote = said ? `${NOTE_PREFIX[kind]}: ${said}` : NOTE_PREFIX[kind];
  return {
    ok: true,
    next,
    request:
      kind === "count"
        ? { mode: "set", value: next, reason: "correction", note: fullNote }
        : {
            mode: "delta",
            value: next - now,
            reason: kind === "received" ? "manual_adjust" : "correction",
            note: fullNote,
          },
  };
}

export function stockChangeProblem(
  problem: Extract<StockChangePlan, { ok: false }>["problem"],
  isAr: boolean,
): string {
  if (problem === "more_than_stock") {
    return isAr ? "العدد أكبر من الموجود في المحل." : "That is more than the store holds.";
  }
  if (problem === "too_many") {
    return isAr ? "العدد كبير جداً لتغيير واحد." : "That is too many for one change.";
  }
  if (problem === "nothing") {
    return isAr ? "لا يوجد تغيير للحفظ." : "There is nothing to change.";
  }
  return isAr ? "اكتب عدداً صحيحاً." : "Enter a whole number.";
}
