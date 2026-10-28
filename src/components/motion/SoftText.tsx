import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const SWAP_MS = 280; // the longer of --text-soft-dur and --text-soft-resize-dur, and a beat

/**
 * A value that changed because the data behind it changed (a price for the chosen size, a
 * total, a period's figure) blurs into the new one in place (transitions.dev's text swap
 * soft, classes in src/styles/motion.css), and its width eases so what sits beside it glides.
 * `align="end"` for amounts set against the end edge.
 */
export function SoftText({
  value,
  className,
  align,
}: {
  value: string;
  className?: string;
  align?: "start" | "end";
}) {
  const [shown, setShown] = useState<{ value: string; prev: string | null; key: number }>({
    value,
    prev: null,
    key: 0,
  });
  if (shown.value !== value) setShown({ value, prev: shown.value, key: shown.key + 1 });

  const box = useRef<HTMLSpanElement>(null);
  const oldRef = useRef<HTMLSpanElement>(null);
  const newRef = useRef<HTMLSpanElement>(null);

  // Start the swap: the box keeps the old width, then eases to the new one as both texts
  // cross-blur.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || shown.prev === null || !oldRef.current || !newRef.current) return;
    const from = oldRef.current.getBoundingClientRect().width;
    const to = newRef.current.getBoundingClientRect().width;
    el.classList.remove("is-swapping");
    el.style.width = `${from}px`;
    void el.offsetWidth;
    el.classList.add("is-swapping");
    el.style.width = `${to}px`;
  }, [shown.key, shown.prev]);

  // Settle: plain text again, and the width let go.
  useEffect(() => {
    if (shown.prev === null) return;
    const timer = window.setTimeout(() => {
      box.current?.style.removeProperty("width");
      setShown((s) => (s.key === shown.key ? { ...s, prev: null } : s));
    }, SWAP_MS);
    return () => window.clearTimeout(timer);
  }, [shown.key, shown.prev]);

  return (
    <span
      ref={box}
      className={cn("t-text-soft", className)}
      style={align === "end" ? ({ "--text-soft-align": "end" } as CSSProperties) : undefined}
    >
      {shown.prev !== null && (
        <span ref={oldRef} className="t-text-soft-old" aria-hidden="true">
          {shown.prev}
        </span>
      )}
      <span ref={newRef} className={shown.prev !== null ? "t-text-soft-new" : undefined}>
        {shown.value}
      </span>
    </span>
  );
}
