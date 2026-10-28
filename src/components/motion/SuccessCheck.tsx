import { type CSSProperties, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * A completed action's check (transitions.dev's success check, classes in
 * src/styles/motion.css): it fades in, turns upright, settles, and its tick draws itself,
 * once, when it mounts. Size and colour come from `className` (`h-14 w-14 text-primary`).
 */
export function SuccessCheck({
  className,
  style,
  ring = true,
}: {
  className?: string;
  style?: CSSProperties;
  ring?: boolean;
}) {
  const wrapper = useRef<HTMLSpanElement>(null);
  const tick = useRef<SVGPathElement>(null);
  const [state, setState] = useState<"out" | "in">("out");

  useLayoutEffect(() => {
    // The tick's real length, so the stroke neither shows early nor over-draws.
    const length = tick.current?.getTotalLength?.();
    if (length && wrapper.current) {
      wrapper.current.style.setProperty("--check-path-len", String(Math.ceil(length) + 1));
    }
    setState("in");
  }, []);

  return (
    <span
      ref={wrapper}
      className={cn("t-success-check", className)}
      style={style}
      data-state={state}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-full w-full"
      >
        {ring && <circle cx="12" cy="12" r="10" />}
        <path ref={tick} d="m7.5 12.5 3 3 6-6.5" />
      </svg>
    </span>
  );
}
