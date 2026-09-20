import { useSyncExternalStore } from "react";

/**
 * Arbitrates the single bottom slot on phones. Floating chrome (the island dock)
 * hides itself while a page-level action bar (e.g. the settings save bar) is
 * claiming the slot, so the two never overlap.
 */
const claims = new Set<string>();
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function claimBottomBar(token: string) {
  if (!claims.has(token)) {
    claims.add(token);
    emit();
  }
}

export function releaseBottomBar(token: string) {
  if (claims.delete(token)) emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => claims.size > 0;
const getServerSnapshot = () => false;

/** True while any page-level bar is occupying the bottom slot. */
export function useBottomBarClaimed(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
