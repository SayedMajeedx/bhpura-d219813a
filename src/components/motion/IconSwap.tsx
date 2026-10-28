import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Two icons in one place, cross-faded with a blur and a scale (transitions.dev's icon swap,
 * src/styles/motion.css): `showSecond` turns `first` into `second` ("add" into "added").
 */
export function IconSwap({
  first,
  second,
  showSecond,
  className,
}: {
  first: ReactNode;
  second: ReactNode;
  showSecond: boolean;
  className?: string;
}) {
  return (
    <span className={cn("t-icon-swap", className)} data-state={showSecond ? "b" : "a"}>
      <span className="t-icon inline-flex" data-icon="a" aria-hidden="true">
        {first}
      </span>
      <span className="t-icon inline-flex" data-icon="b" aria-hidden="true">
        {second}
      </span>
    </span>
  );
}
