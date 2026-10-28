import { useSyncExternalStore } from "react";

/**
 * Shoppers' orders that arrived while this tab was open and the orders page was not: the
 * count on the Orders menu item and dock tab. Kept in this tab only; it is a nudge, not a
 * record (the orders list is the record). `NewOrderAlert` adds to it and clears it.
 */
let count = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

export const newArrivals = {
  add() {
    count += 1;
    emit();
  },
  clear() {
    if (count === 0) return;
    count = 0;
    emit();
  },
  get: () => count,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export function useNewArrivals(): number {
  return useSyncExternalStore(newArrivals.subscribe, newArrivals.get, () => 0);
}
