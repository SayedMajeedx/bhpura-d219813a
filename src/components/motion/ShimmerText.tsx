import { cn } from "@/lib/utils";

/**
 * Words that say work is going on ("Reading the receipt…", "Exporting…") with a highlight
 * sweeping across them (transitions.dev's shimmer text, pure CSS, src/styles/motion.css), in
 * the text's own colour. Someone who asked for less motion reads the words still.
 */
export function ShimmerText({ text, className }: { text: string; className?: string }) {
  return (
    <span className={cn("t-shimmer", className)}>
      <span className="t-shimmer-base">{text}</span>
      <span className="t-shimmer-band" aria-hidden="true">
        {text}
      </span>
    </span>
  );
}
