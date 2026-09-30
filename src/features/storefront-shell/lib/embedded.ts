import { useSyncExternalStore } from "react";

/** The parts of a window isEmbeddedWindow looks at. */
export type EmbeddableWindow = {
  readonly self: unknown;
  readonly top: unknown;
  readonly location: { readonly search: string };
};

/**
 * Whether the storefront is shown inside another page: an iframe (the
 * onboarding page's live preview, the settings preview) or a `?preview=1`
 * address.
 */
export function isEmbeddedWindow(win: EmbeddableWindow | undefined): boolean {
  if (!win) return false;
  let framed = false;
  try {
    framed = win.self !== win.top;
  } catch {
    framed = true; // a cross-origin parent: reading top can throw
  }
  return framed || win.location.search.includes("preview=1");
}

const noSubscribe = () => () => undefined;

/**
 * isEmbeddedWindow for rendering: false on the server and while hydrating,
 * so the first client render matches the server's HTML, then the real value
 * (React re-renders once). Reading `window` during render instead makes an
 * embedded storefront's hydration fail.
 */
export function useIsEmbedded(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => isEmbeddedWindow(window),
    () => false,
  );
}
