import { Fragment, useEffect, useState } from "react";
import { numberRuns } from "@/lib/motion/text-diff";

/** --digit-dur plus two staggers (src/styles/motion.css), and a beat. */
const POP_MS = 700;

/**
 * A number that pops its changed digits in when it updates (transitions.dev's number pop-in,
 * classes in src/styles/motion.css). `value` is the text as shown ("12", "23.000 د.ب").
 *
 * At rest it is plain text, as before (it reads, selects and copies as one). Only while it
 * animates is it split: its digits one by one in a left-to-right run, drawn by CSS from
 * `data-char` so the page's text is not doubled, its words plain, and the whole value read
 * once by assistive technology. The first render does not animate.
 */
export function AnimatedNumber({ value, className }: { value: string; className?: string }) {
  // The value before this one, kept as derived state (set during render, React's pattern for
  // a value that follows a prop), with a count that remounts the digits to replay them.
  const [shown, setShown] = useState<{ value: string; prev: string | null; key: number }>({
    value,
    prev: null,
    key: 0,
  });
  if (shown.value !== value) setShown({ value, prev: shown.value, key: shown.key + 1 });

  // The last change whose pop has played: until then the digits are split and animating.
  const [settled, setSettled] = useState(0);
  useEffect(() => {
    if (shown.key === 0) return;
    const timer = window.setTimeout(() => setSettled(shown.key), POP_MS);
    return () => window.clearTimeout(timer);
  }, [shown.key]);

  if (shown.prev === null || shown.key <= settled) {
    return <span className={className}>{shown.value}</span>;
  }

  const runs = numberRuns(shown.prev, shown.value);
  return (
    <span className={className}>
      <span className="sr-only">{shown.value}</span>
      <span aria-hidden="true">
        {runs.map((run, i) =>
          run.kind === "text" ? (
            <Fragment key={i}>{run.text}</Fragment>
          ) : (
            <span key={`${shown.key}-${i}`} dir="ltr" className="t-digit-group is-animating">
              {run.digits.map((digit, j) => (
                <span
                  key={j}
                  className="t-digit"
                  data-char={digit.char}
                  data-same={digit.same ? "" : undefined}
                  data-stagger={digit.stagger || undefined}
                />
              ))}
            </span>
          ),
        )}
      </span>
    </span>
  );
}
