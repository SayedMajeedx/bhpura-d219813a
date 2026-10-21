import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * "More tools" under a workspace in the menu: the pages used now and then, folded, never hidden.
 * It opens on a tap, and is open already while one of its pages is the one open.
 */
export function OsNavMore({
  count,
  containsActive,
  lang,
  children,
  className,
}: {
  count: number;
  containsActive: boolean;
  lang: "en" | "ar";
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = React.useState(containsActive);
  React.useEffect(() => {
    if (containsActive) setOpen(true);
  }, [containsActive]);
  const id = React.useId();
  const label = lang === "ar" ? "أدوات أخرى" : "More tools";

  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        className="w-full flex items-center justify-between gap-2 px-3 py-1.5 min-h-[32px] pointer-coarse:min-h-11 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors outline-none os-focus-ring"
      >
        <span className="truncate">{label}</span>
        <span className="flex items-center gap-1 shrink-0">
          <span className="tabular-nums opacity-70">{count}</span>
          <ChevronDown
            className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")}
            aria-hidden="true"
          />
        </span>
      </button>
      {open && (
        <div id={id} className="flex flex-col gap-1 mt-1">
          {children}
        </div>
      )}
    </div>
  );
}
