import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { morphParts } from "@/lib/motion/text-diff";

const MORPH_MS = 280; // the longer of --text-morph-dur and --text-morph-resize-dur, and a beat

/**
 * A label that changes in place and shares letters with the old one ("Add to cart" to
 * "Added", "Copy link" to "Copied") keeps what both share and cross-blurs only the rest,
 * easing its width (transitions.dev's text morph; Arabic changes by whole words,
 * `morphParts`).
 */
export function MorphText({ text, className }: { text: string; className?: string }) {
  const [shown, setShown] = useState<{ text: string; prev: string | null; key: number }>({
    text,
    prev: null,
    key: 0,
  });
  if (shown.text !== text) setShown({ text, prev: shown.text, key: shown.key + 1 });

  const swap = useRef<HTMLSpanElement>(null);
  const oldRef = useRef<HTMLSpanElement>(null);
  const newRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = swap.current;
    if (!el || !oldRef.current || !newRef.current) return;
    el.style.width = `${oldRef.current.getBoundingClientRect().width}px`;
    void el.offsetWidth;
    el.classList.add("is-morphing");
    el.style.width = `${newRef.current.getBoundingClientRect().width}px`;
  }, [shown.key]);

  useEffect(() => {
    if (shown.prev === null) return;
    const timer = window.setTimeout(() => {
      setShown((s) => (s.key === shown.key ? { ...s, prev: null } : s));
    }, MORPH_MS);
    return () => window.clearTimeout(timer);
  }, [shown.key, shown.prev]);

  if (shown.prev === null) return <span className={cn("t-morph", className)}>{shown.text}</span>;

  const parts = morphParts(shown.prev, shown.text);
  return (
    <span className={cn("t-morph", className)}>
      <span className="sr-only">{shown.text}</span>
      <span aria-hidden="true">
        {parts.head}
        <span key={shown.key} ref={swap} className="t-morph-swap">
          <span ref={oldRef} className="t-morph-old">
            {parts.from}
          </span>
          <span ref={newRef} className="t-morph-new">
            {parts.to}
          </span>
        </span>
        {parts.tail}
      </span>
    </span>
  );
}
