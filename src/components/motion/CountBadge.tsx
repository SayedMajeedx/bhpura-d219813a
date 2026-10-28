import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { AnimatedNumber } from "@/components/motion/AnimatedNumber";

/**
 * A count on an icon (the bag, the wishlist, a page's new orders): it slides on and pops
 * when the first one arrives, pops again when it grows, and its number pops in
 * (transitions.dev's notification badge and number pop-in, src/styles/motion.css). It stays
 * mounted at zero, closed, so it can pop away.
 *
 * `placement` places it on its icon (`absolute top-1 end-1`); `className` and `style` draw
 * the dot.
 */
export function CountBadge({
  count,
  placement,
  className,
  style,
}: {
  count: number;
  placement: string;
  className?: string;
  style?: CSSProperties;
}) {
  // `shown` is the number drawn: the count, or at zero the last one while the dot pops away,
  // then nothing, so a closed badge holds no text (a page's search for a price found "1").
  const [last, setLast] = useState({ count, grew: 0, shown: count });
  if (last.count !== count) {
    setLast({
      count,
      grew: count > last.count ? last.grew + 1 : last.grew,
      shown: count > 0 ? count : last.shown,
    });
  }

  // One more pops the dot again: the class comes off, a reflow, and back on.
  const dot = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = dot.current;
    if (!el || last.grew === 0) return;
    el.classList.remove("is-bumping");
    void el.offsetWidth;
    el.classList.add("is-bumping");
  }, [last.grew]);

  const open = count > 0;
  useEffect(() => {
    if (open || last.shown === 0) return;
    const timer = window.setTimeout(
      () => setLast((l) => (l.count === 0 ? { ...l, shown: 0 } : l)),
      250,
    );
    return () => window.clearTimeout(timer);
  }, [open, last.shown]);

  return (
    <span
      className={cn("t-badge pointer-events-none", placement)}
      data-open={open ? "true" : "false"}
      aria-hidden={open ? undefined : true}
    >
      <span ref={dot} className={cn("t-badge-dot", className)} style={style}>
        {last.shown > 0 && <AnimatedNumber value={String(last.shown)} />}
      </span>
    </span>
  );
}
