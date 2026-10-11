import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { isCutShort, revealPosition, type Edges } from "@/lib/truncation";

/**
 * Text that is cut short anywhere in the app can always be read in full.
 *
 * Mounted once at the root. It watches the page: when the pointer rests on text that is really
 * cut (an ellipsis, or a line clamp with more text than fits), or a finger taps it, or the
 * keyboard focuses it, the full text is shown in a small bubble beside it. Nothing is added to
 * the 240-odd places that cut text, and nothing in their layout changes.
 *
 * - Mouse: after a short rest on the text.
 * - Touch: a tap on plain text; a long press on text inside a link or a button (a tap there still
 *   follows the link). The press that showed the bubble does not also follow the link.
 * - Keyboard: when focus lands on the cut text or on a control that holds it.
 *
 * `data-no-reveal` on an element (or one that holds it) opts it out.
 */

const REST_MS = 350;
const LONG_PRESS_MS = 500;
const TOUCH_SHOWN_MS = 4000;
const INTERACTIVE =
  'a, button, label, summary, [role="button"], [role="tab"], [role="option"], [role="menuitem"]';

type Shown = { text: string; anchor: Edges };

/** The nearest element at or above `target` whose text is cut, with its full text. */
function cutTextAt(target: EventTarget | null): { element: HTMLElement; text: string } | null {
  if (!(target instanceof Element)) return null;
  if (target.closest("[data-no-reveal], [data-truncation-reveal]")) return null;
  let element: Element | null = target;
  for (let depth = 0; element && depth < 4; depth += 1, element = element.parentElement) {
    if (!(element instanceof HTMLElement)) continue;
    const style = getComputedStyle(element);
    const cut = isCutShort(element, {
      textOverflow: style.textOverflow,
      overflowX: style.overflowX,
      lineClamp: style.getPropertyValue("-webkit-line-clamp"),
    });
    if (!cut) continue;
    const text = (element.innerText ?? element.textContent ?? "").replace(/\s+/g, " ").trim();
    return text ? { element, text } : null;
  }
  return null;
}

/** Inside a control, the first piece of text that is cut (for keyboard focus). */
function cutTextWithin(control: Element): { element: HTMLElement; text: string } | null {
  const own = cutTextAt(control);
  if (own) return own;
  for (const child of Array.from(control.querySelectorAll<HTMLElement>("*")).slice(0, 40)) {
    const found = cutTextAt(child);
    if (found && control.contains(found.element)) return found;
  }
  return null;
}

const edgesOf = (element: Element): Edges => {
  const r = element.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
};

export function TruncationReveal() {
  const [shown, setShown] = useState<Shown | null>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);
  const bubble = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let rest: ReturnType<typeof setTimeout> | undefined;
    let press: ReturnType<typeof setTimeout> | undefined;
    let expire: ReturnType<typeof setTimeout> | undefined;
    let pressAt: { x: number; y: number } | null = null;
    let swallowClick = false;

    const clearTimers = () => {
      clearTimeout(rest);
      clearTimeout(press);
      pressAt = null;
    };
    const hide = () => {
      clearTimers();
      clearTimeout(expire);
      setShown(null);
    };
    const show = (found: { element: HTMLElement; text: string }, forTouch: boolean) => {
      setShown({ text: found.text, anchor: edgesOf(found.element) });
      clearTimeout(expire);
      if (forTouch) expire = setTimeout(() => setShown(null), TOUCH_SHOWN_MS);
    };
    const isTouch = (event: PointerEvent) =>
      event.pointerType === "touch" || event.pointerType === "pen";

    const onPointerOver = (event: PointerEvent) => {
      if (isTouch(event)) return;
      const found = cutTextAt(event.target);
      clearTimeout(rest);
      if (!found) return;
      rest = setTimeout(() => show(found, false), REST_MS);
    };
    const onPointerOut = (event: PointerEvent) => {
      if (isTouch(event)) return;
      hide();
    };

    const onPointerDown = (event: PointerEvent) => {
      hide();
      if (!isTouch(event)) return;
      const found = cutTextAt(event.target);
      if (!found) return;
      pressAt = { x: event.clientX, y: event.clientY };
      const insideControl = Boolean((event.target as Element).closest(INTERACTIVE));
      if (!insideControl) return;
      press = setTimeout(() => {
        swallowClick = true;
        show(found, true);
      }, LONG_PRESS_MS);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!pressAt) return;
      if (Math.hypot(event.clientX - pressAt.x, event.clientY - pressAt.y) > 10) clearTimers();
    };
    const onPointerUp = (event: PointerEvent) => {
      const tapped = pressAt !== null;
      clearTimeout(press);
      pressAt = null;
      if (!isTouch(event) || !tapped) return;
      // A tap on plain text shows it at once; inside a control the tap belongs to the control.
      if ((event.target as Element).closest?.(INTERACTIVE)) return;
      const found = cutTextAt(event.target);
      if (found) show(found, true);
    };
    const onClick = (event: MouseEvent) => {
      if (!swallowClick) return;
      swallowClick = false;
      event.preventDefault();
      event.stopPropagation();
    };

    const onFocusIn = (event: FocusEvent) => {
      if (!(event.target instanceof Element)) return;
      // Only for focus that came from the keyboard: a click already has the pointer's own way.
      let fromKeyboard = false;
      try {
        fromKeyboard = event.target.matches(":focus-visible");
      } catch {
        /* a browser without :focus-visible */
      }
      if (!fromKeyboard) return;
      const found = cutTextWithin(event.target);
      if (found) show(found, false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") hide();
    };

    document.addEventListener("pointerover", onPointerOver);
    document.addEventListener("pointerout", onPointerOut);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointercancel", clearTimers);
    document.addEventListener("click", onClick, true);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", hide);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    window.addEventListener("blur", hide);
    return () => {
      hide();
      document.removeEventListener("pointerover", onPointerOver);
      document.removeEventListener("pointerout", onPointerOut);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointercancel", clearTimers);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
      window.removeEventListener("blur", hide);
    };
  }, []);

  // Placed once its own size is known, so it never sits off the screen.
  useLayoutEffect(() => {
    if (!shown || !bubble.current) {
      setPlace(null);
      return;
    }
    const box = bubble.current.getBoundingClientRect();
    setPlace(
      revealPosition(
        shown.anchor,
        { width: box.width, height: box.height },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
  }, [shown]);

  if (!shown || typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={bubble}
      role="tooltip"
      dir="auto"
      data-truncation-reveal
      className="pointer-events-none fixed z-50 max-w-xs break-words rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs font-medium leading-relaxed text-popover-foreground shadow-md"
      style={{
        left: place?.left ?? 0,
        top: place?.top ?? 0,
        maxWidth: "min(20rem, calc(100vw - 16px))",
        visibility: place ? "visible" : "hidden",
      }}
    >
      {shown.text}
    </div>,
    document.body,
  );
}
