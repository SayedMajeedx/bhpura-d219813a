import { useRef } from "react";

/**
 * Where focus goes when a dialog or a drawer closes: back to what the person was on when it opened
 * (the "Add to bag" they pressed, the button that opened it), without moving the page.
 *
 * Radix gives a modal its trigger back with a plain `focus()`, which scrolls the page to the
 * trigger. The cart drawer's trigger is in the store's header, which leaves the screen on a scroll
 * down, so closing a drawer that "Add to cart" had opened scrolled the page back up to the header
 * and pinned the header on screen (Pura's shop, 2026-11-01: from 700px to 160px). Every dialog and
 * drawer now remembers what had focus as it opens (`onOpenAutoFocus` runs before focus moves in)
 * and returns to it with `preventScroll`; when it is gone (a menu item that closed), Radix does as it
 * always did.
 */
export function returnFocus(element: Element | null | undefined): boolean {
  if (!(element instanceof HTMLElement) || !element.isConnected) return false;
  if (element === element.ownerDocument.body) return false;
  element.focus({ preventScroll: true });
  return true;
}

type AutoFocusHandler = ((event: Event) => void) | undefined;

/** `onOpenAutoFocus` / `onCloseAutoFocus` for a Radix dialog's content, keeping its own handlers. */
export function useReturnFocus(
  onOpenAutoFocus: AutoFocusHandler,
  onCloseAutoFocus: AutoFocusHandler,
) {
  const opener = useRef<Element | null>(null);
  return {
    onOpenAutoFocus(event: Event) {
      opener.current = typeof document === "undefined" ? null : document.activeElement;
      onOpenAutoFocus?.(event);
    },
    onCloseAutoFocus(event: Event) {
      onCloseAutoFocus?.(event);
      if (event.defaultPrevented) return;
      // Radix would focus the trigger and scroll to it: go back to the opener, in place. An opener
      // that is gone (a menu item that closed) leaves Radix its own way.
      if (returnFocus(opener.current)) event.preventDefault();
      opener.current = null;
    },
  };
}
