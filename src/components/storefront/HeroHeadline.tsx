import * as React from "react";
import { headlinePieces, headlineStep, type HeroTextAnimation } from "@/lib/hero-headline";

/**
 * The hero's headline, live over the slide: its phrases one after another with the chosen
 * entrance (blur-in, rising words, a mask reveal, or none), going round a few times and then
 * resting on the first one. Every phrase sits in the same grid cell, so the block is as tall as
 * the longest and nothing under it moves when the phrase changes. The first phrase is in the page
 * as rendered (search engines, no script needed); a screen reader reads it once, from the heading.
 * Paused while the pointer is on it, and still for anyone who asks for less motion.
 */
export function HeroHeadline({
  phrases,
  animation,
  seconds,
  loops,
  active,
  dir,
  className,
  style,
}: {
  phrases: readonly string[];
  animation: HeroTextAnimation;
  seconds: number;
  loops: number;
  /** The slide is the one showing: the phrases go round only then, from the first. */
  active: boolean;
  dir: "rtl" | "ltr";
  className?: string;
  style?: React.CSSProperties;
}) {
  const [step, setStep] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  const [still, setStill] = React.useState(false);
  const { index, done } = headlineStep(step, phrases.length, loops);

  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setStill(query.matches);
    sync();
    query.addEventListener?.("change", sync);
    return () => query.removeEventListener?.("change", sync);
  }, []);

  // A slide shown again starts from its first phrase.
  React.useEffect(() => {
    if (!active) setStep(0);
  }, [active]);

  React.useEffect(() => {
    if (!active || paused || still || done) return;
    const timer = window.setTimeout(() => setStep((current) => current + 1), seconds * 1000);
    return () => window.clearTimeout(timer);
  }, [active, paused, still, done, step, seconds]);

  if (phrases.length === 0) return null;
  const motion = still ? "none" : animation;

  return (
    <>
      <HeroHeadlineStyles />
      <h1
        dir={dir}
        className={className}
        style={style}
        onPointerEnter={() => setPaused(true)}
        onPointerLeave={() => setPaused(false)}
      >
        <span className="sr-only">{phrases[0]}</span>
        <span aria-hidden="true" className="grid">
          {phrases.map((phrase, i) => {
            const shown = i === index;
            return (
              <span
                // A new key on each showing replays the entrance.
                key={shown ? `${i}-${step}` : i}
                className={`[grid-area:1/1] ${shown ? "" : "invisible"}`}
                data-hero-phrase={shown ? "shown" : undefined}
              >
                {shown && motion === "rising_words" ? (
                  <RisingWords phrase={phrase} dir={dir} />
                ) : (
                  <span className={shown ? phraseClass(motion, dir) : undefined}>{phrase}</span>
                )}
              </span>
            );
          })}
        </span>
      </h1>
    </>
  );
}

function phraseClass(motion: HeroTextAnimation, dir: "rtl" | "ltr") {
  if (motion === "blur_in") return "hero-phrase-blur";
  if (motion === "mask_reveal")
    return dir === "rtl" ? "hero-phrase-mask-rtl" : "hero-phrase-mask-ltr";
  return "";
}

/** Word after word from below; a run written the other way rises as one piece. */
function RisingWords({ phrase, dir }: { phrase: string; dir: "rtl" | "ltr" }) {
  return (
    <span>
      {headlinePieces(phrase, dir).map((piece, i, all) => (
        <React.Fragment key={i}>
          <span
            dir={piece.dir}
            className="hero-phrase-rise inline-block"
            style={{ animationDelay: `${i * 90}ms` }}
          >
            {piece.text}
          </span>
          {i < all.length - 1 ? " " : null}
        </React.Fragment>
      ))}
    </span>
  );
}

/** The entrances, kept with the component (styles.css is frozen). */
function HeroHeadlineStyles() {
  return (
    <style>{`
      @keyframes hero-phrase-blur {
        from { opacity: 0; filter: blur(14px); transform: translateY(0.12em) scale(1.02); }
        to { opacity: 1; filter: blur(0); transform: none; }
      }
      @keyframes hero-phrase-rise {
        from { opacity: 0; transform: translateY(0.55em); filter: blur(4px); }
        to { opacity: 1; transform: none; filter: blur(0); }
      }
      @keyframes hero-phrase-mask-ltr {
        from { clip-path: inset(0 100% 0 0); opacity: 0.4; }
        to { clip-path: inset(0 0 0 0); opacity: 1; }
      }
      @keyframes hero-phrase-mask-rtl {
        from { clip-path: inset(0 0 0 100%); opacity: 0.4; }
        to { clip-path: inset(0 0 0 0); opacity: 1; }
      }
      .hero-phrase-blur { display: inline-block; animation: hero-phrase-blur 1100ms cubic-bezier(0.22, 1, 0.36, 1) both; }
      .hero-phrase-rise { animation: hero-phrase-rise 700ms cubic-bezier(0.22, 1, 0.36, 1) both; }
      .hero-phrase-mask-ltr { display: inline-block; animation: hero-phrase-mask-ltr 1000ms cubic-bezier(0.65, 0, 0.35, 1) both; }
      .hero-phrase-mask-rtl { display: inline-block; animation: hero-phrase-mask-rtl 1000ms cubic-bezier(0.65, 0, 0.35, 1) both; }
      @media (prefers-reduced-motion: reduce) {
        .hero-phrase-blur, .hero-phrase-rise, .hero-phrase-mask-ltr, .hero-phrase-mask-rtl { animation: none; }
      }
    `}</style>
  );
}
