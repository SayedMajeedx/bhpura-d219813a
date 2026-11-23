import type { QueryKey } from "@tanstack/react-query";

/** How long a burst of live changes is gathered before the screens read again. */
export const BURST_WAIT_MS = 400;

/** The server-side filter for a store's rows, or none when no store is given. */
export function realtimeFilter(brandId?: string): { filter?: string } {
  return brandId ? { filter: `brand_id=eq.${brandId}` } : {};
}

/**
 * Gathers the query keys live changes ask to refresh and hands each over once, `wait` after the
 * first change of a burst: one order placed is several changes (the order, its lines, the
 * stage), and each used to refetch the whole list.
 */
export class RealtimeBurst {
  private keys = new Map<string, QueryKey>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly flush: (keys: QueryKey[]) => void,
    private readonly wait = BURST_WAIT_MS,
  ) {}

  add(key: QueryKey) {
    this.keys.set(JSON.stringify(key), key);
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      const keys = [...this.keys.values()];
      this.keys.clear();
      this.flush(keys);
    }, this.wait);
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.keys.clear();
  }
}
