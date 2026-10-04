import { useState, type CSSProperties } from "react";
import { Trophy } from "lucide-react";
import { nameFontSize, type RevealConfig, type RevealPlan, type RevealState } from "../lib/reveal";
import type { StageColors } from "../lib/reveal-colors";
import { ConfettiCanvas } from "./ConfettiCanvas";

/** A username, big and on one line; its size shrinks with its length (see nameFontSize). */
function BigName({ name, shrink = 1 }: { name: string; shrink?: number }) {
  const size = nameFontSize(name.length + 1) * shrink;
  return (
    <p
      dir="ltr"
      className="max-w-full truncate px-[4cqw] text-center font-display font-bold leading-tight"
      style={{ fontSize: `min(${size}cqw, ${size * 1.7}cqh)` }}
    >
      @{name}
    </p>
  );
}

const Label = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <p
    className={`text-center font-semibold uppercase tracking-[0.28em] opacity-80 ${className}`}
    style={{ fontSize: "min(3.4cqw, 5.6cqh)" }}
  >
    {children}
  </p>
);

/**
 * What the stage shows for one state of the reveal. It draws; it decides nothing:
 * the state comes from the sequence in lib/reveal.ts.
 */
function Scene({
  state,
  plan,
  isAr,
  title,
}: {
  state: RevealState;
  plan: RevealPlan;
  isAr: boolean;
  title: string;
}) {
  const total = plan.winners.length;
  const winner = plan.winners[state.winner];
  const places = isAr
    ? total > 1
      ? `${total} فائزين`
      : "فائز واحد"
    : total > 1
      ? `${total} winners`
      : "1 winner";

  switch (state.phase) {
    case "intro":
      return (
        <div className="ga-rise flex flex-col items-center gap-[3cqw] px-[6cqw] text-center">
          <Label>{isAr ? "سحب المسابقة" : "Giveaway draw"}</Label>
          <h2
            className="font-display font-bold leading-tight"
            style={{ fontSize: "min(8.5cqw, 14cqh)" }}
          >
            {title}
          </h2>
          <Label>{places}</Label>
        </div>
      );
    case "countdown":
      return (
        <div className="relative flex flex-col items-center gap-[7cqw]">
          <Label>{isAr ? "الفائز خلال" : "Winner in"}</Label>
          {/* The ring and the number share one square, so the ring is always centred on the number. */}
          <div
            className="relative grid place-items-center"
            style={{ width: "min(64cqw, 40cqh)", height: "min(64cqw, 40cqh)" }}
          >
            <span
              key={`ring-${state.tick}`}
              className="ga-ring absolute inset-0 rounded-full border-[0.8cqw] border-primary-foreground"
            />
            <span
              key={state.tick}
              className="ga-pop font-display font-bold leading-none lining-nums"
              style={{ fontSize: "min(40cqw, 25cqh)" }}
            >
              {state.tick}
            </span>
          </div>
        </div>
      );
    case "shuffle": {
      const frames = plan.shuffles[state.winner];
      const name = frames.names[state.tick] ?? "";
      const delay = frames.delays[state.tick] ?? 100;
      return (
        <div className="flex w-full flex-col items-center gap-[3cqw]">
          <Label>
            {isAr
              ? `يتم اختيار الفائز ${winner.position}`
              : total > 1
                ? `Drawing winner ${winner.position} of ${total}`
                : "Drawing the winner"}
          </Label>
          <div
            className="w-full overflow-hidden rounded-[3cqw] bg-primary-foreground/10 py-[3.5cqw]"
            style={{
              boxShadow:
                "inset 0 0 0 0.35cqw color-mix(in oklch, var(--primary-foreground) 25%, transparent)",
            }}
          >
            <div
              key={state.tick}
              className="ga-slot"
              style={{ animationDuration: `${Math.max(50, Math.min(150, delay * 0.8))}ms` }}
            >
              <BigName name={name} shrink={0.85} />
            </div>
          </div>
        </div>
      );
    }
    case "reveal":
      return (
        <div className="flex w-full flex-col items-center gap-[2.6cqw] px-[3cqw]">
          <div
            className="ga-float grid size-[16cqw] place-items-center rounded-full bg-primary-foreground text-primary"
            style={{ maxHeight: "20cqh", maxWidth: "20cqh" }}
          >
            <Trophy
              className="size-[8cqw]"
              style={{ width: "min(8cqw, 10cqh)", height: "min(8cqw, 10cqh)" }}
              aria-hidden="true"
            />
          </div>
          <Label>
            {isAr
              ? total > 1
                ? `الفائز ${winner.position} من ${total}`
                : "الفائز"
              : total > 1
                ? `Winner ${winner.position} of ${total}`
                : "The winner is"}
          </Label>
          <div className="ga-pop ga-glow w-full rounded-[3cqw] bg-primary-foreground/10 py-[3cqw]">
            <BigName name={winner.username} />
          </div>
          {winner.comment ? (
            <p
              dir="auto"
              className="ga-rise line-clamp-4 max-w-[88cqw] rounded-[2.4cqw] bg-primary-foreground/10 px-[4cqw] py-[2.4cqw] text-center leading-snug"
              style={{ fontSize: "min(3.6cqw, 5.6cqh)", animationDelay: "0.5s" }}
            >
              “{winner.comment}”
            </p>
          ) : null}
        </div>
      );
    case "between":
      return (
        <div className="ga-rise flex flex-col items-center gap-[2cqw]">
          <Label>{isAr ? "الفائز التالي" : "Next winner"}</Label>
          <p
            className="font-display font-bold lining-nums"
            style={{ fontSize: "min(12cqw, 20cqh)" }}
          >
            {winner.position}
          </p>
        </div>
      );
    case "summary":
      return (
        <div className="ga-rise flex w-full flex-col items-center gap-[3cqw] px-[6cqw]">
          <Label>{isAr ? "مبروك للفائزين" : "Congratulations to"}</Label>
          <ul className="w-full space-y-[1.6cqw]">
            {plan.winners.map((w) => (
              <li
                key={w.id}
                dir="ltr"
                className="flex items-center gap-[2.4cqw] rounded-[2.4cqw] bg-primary-foreground/10 px-[3cqw] py-[1.8cqw]"
                style={{ fontSize: "min(5cqw, 7cqh)" }}
              >
                <span
                  className="grid size-[1.7em] shrink-0 place-items-center rounded-full bg-primary-foreground text-primary lining-nums"
                  style={{ fontSize: "0.7em" }}
                >
                  {w.position}
                </span>
                <span className="min-w-0 flex-1 truncate font-semibold">@{w.username}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    default:
      return null;
  }
}

/**
 * The picture itself: the brand on top, the scene in the middle and confetti over
 * everything. In "story" format it is a 9:16 frame, so a recording of it fits
 * Reels and Stories; in "wide" format it fills the screen.
 */
/** How tall the logo is on the stage: big, but never taller than the frame can spare. */
const LOGO_HEIGHT = "min(24cqw, 15cqh)";

/**
 * The store's mark at the top. A logo is shown by itself and large (a wordmark
 * already says the name, so the name is not repeated); without one, or if it fails
 * to load, the store's name stands in.
 */
function BrandMark({ logoUrl, name }: { logoUrl: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  if (logoUrl && !failed) {
    return (
      <img
        src={logoUrl}
        alt={name}
        onError={() => setFailed(true)}
        className="w-auto max-w-[72cqw] object-contain"
        style={{ height: LOGO_HEIGHT }}
      />
    );
  }
  return (
    <span
      className="truncate font-display font-semibold tracking-wide"
      style={{ fontSize: "min(5.5cqw, 7cqh)" }}
    >
      {name}
    </span>
  );
}

export function RevealStage({
  state,
  plan,
  config,
  isAr,
  title,
  brandName,
  logoUrl,
  colors,
  burst,
  seed,
  reducedMotion,
}: {
  state: RevealState;
  plan: RevealPlan;
  config: RevealConfig;
  isAr: boolean;
  title: string;
  brandName: string;
  logoUrl: string | null;
  /** The store's colours; without them the theme's own are used. */
  colors?: StageColors | null;
  burst: number;
  seed: string;
  reducedMotion: boolean;
}) {
  // The stage re-points the theme's primary colours at the store's, so everything
  // drawn with them (text, rings, glows, confetti) follows.
  const palette = colors
    ? ({
        "--primary": colors.background,
        "--primary-foreground": colors.foreground,
      } as CSSProperties)
    : undefined;
  return (
    <div
      data-format={config.format}
      data-phase={state.phase}
      style={palette}
      className={`relative h-full overflow-hidden bg-primary text-primary-foreground [container-type:size] ${
        config.format === "story" ? "aspect-[9/16] max-w-full" : "w-full"
      }`}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,color-mix(in_oklch,var(--primary-foreground)_16%,transparent),transparent_62%)]"
      />
      <header className="absolute inset-x-0 top-0 flex items-center justify-center px-[4cqw] pt-[5cqh]">
        <BrandMark logoUrl={logoUrl} name={brandName} />
      </header>

      <div
        className="absolute inset-0 flex items-center justify-center px-[4cqw] pb-[3cqh]"
        style={{ paddingTop: `calc(${logoUrl ? LOGO_HEIGHT : "7cqh"} + 9cqh)` }}
      >
        {/*
          The scene is laid out in a story-shaped column: as wide as the frame in a
          story, and no wider than the frame can hold tall in a wide format. Its
          own width is the unit (cqw) everything inside is sized in, so the same
          layout fits both and nothing runs into the logo or off the bottom.
        */}
        <div
          className="flex items-center justify-center [container-type:inline-size]"
          style={{ width: "min(100cqw, 96cqh)" }}
        >
          <Scene state={state} plan={plan} isAr={isAr} title={title} />
        </div>
      </div>

      <ConfettiCanvas
        burst={burst}
        seed={seed}
        disabled={reducedMotion}
        base={colors?.foreground}
      />
    </div>
  );
}
