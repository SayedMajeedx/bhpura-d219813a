import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBrand } from "@/lib/brand-context";
import { useRevealPlayer } from "../hooks/use-reveal-player";
import {
  buildPlan,
  DEFAULT_REVEAL_CONFIG,
  parseRevealConfig,
  type RevealConfig,
  type RevealWinner,
} from "../lib/reveal";
import { createRevealAudio, type RevealAudio } from "../lib/reveal-audio";
import { RevealSetup } from "./RevealSetup";
import { RevealStage } from "./RevealStage";
import { RevealStyles } from "./RevealStyles";

const CONFIG_KEY = "giveaway-reveal-config";

function loadConfig(): RevealConfig {
  try {
    return parseRevealConfig(window.localStorage.getItem(CONFIG_KEY));
  } catch {
    return DEFAULT_REVEAL_CONFIG;
  }
}

function saveConfig(config: RevealConfig) {
  try {
    window.localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch {
    // the settings are a convenience
  }
}

const prefersLessMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;

/**
 * A full-screen reveal of the winners, made to be screen-recorded and posted: a
 * setup screen (press Start after the recorder is running), then a countdown, a
 * shuffle of names that slows down, the winner with confetti, and a summary.
 */
export function WinnerReveal({
  open,
  onClose,
  isAr,
  title,
  winners,
  pool,
  seed,
}: {
  open: boolean;
  onClose: () => void;
  isAr: boolean;
  title: string;
  winners: RevealWinner[];
  /** The people in the draw: their names flash by during the shuffle. */
  pool: string[];
  seed: string;
}) {
  const brand = useBrand();
  const rootRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<RevealAudio | null>(null);
  const [config, setConfig] = useState<RevealConfig>(loadConfig);
  const [burst, setBurst] = useState(0);
  const reducedMotion = useMemo(prefersLessMotion, []);

  const plan = useMemo(
    () => buildPlan({ winners, pool, seed, config, reducedMotion }),
    [winners, pool, seed, config, reducedMotion],
  );
  const { state, start, skip, reset } = useRevealPlayer(plan);

  const patchConfig = useCallback((patch: Partial<RevealConfig>) => {
    setConfig((current) => {
      const next = { ...current, ...patch };
      saveConfig(next);
      return next;
    });
  }, []);

  const play = useCallback(() => {
    audioRef.current?.close();
    audioRef.current = createRevealAudio(config.sound);
    setBurst(0);
    start();
  }, [config.sound, start]);

  const close = useCallback(() => {
    audioRef.current?.close();
    audioRef.current = null;
    if (typeof document !== "undefined" && document.fullscreenElement) {
      void document.exitFullscreen?.().catch(() => undefined);
    }
    reset();
    onClose();
  }, [onClose, reset]);

  const fullscreen = useCallback(() => {
    void rootRef.current?.requestFullscreen?.().catch(() => undefined);
  }, []);

  // Sound and confetti follow the state.
  useEffect(() => {
    if (!open) return;
    const audio = audioRef.current;
    if (state.phase === "countdown") audio?.beep(false);
    else if (state.phase === "shuffle") {
      const frames = plan.shuffles[state.winner]?.names.length ?? 1;
      if (state.tick === 0) audio?.beep(true);
      else audio?.tick(state.tick / Math.max(1, frames - 1));
    } else if (state.phase === "reveal") {
      audio?.fanfare();
      setBurst((n) => n + 1);
    } else if (state.phase === "summary") {
      setBurst((n) => n + 1);
    }
  }, [open, state.phase, state.winner, state.tick, plan]);

  // Keyboard: Esc closes, Space and the arrows skip ahead, R plays again.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      } else if (state.phase === "ready") {
        if (event.key === "Enter" && winners.length > 0) {
          event.preventDefault();
          play();
        }
      } else if (event.key === " " || event.key === "ArrowRight" || event.key === "Enter") {
        event.preventDefault();
        skip();
      } else if (event.key === "r" || event.key === "R") {
        event.preventDefault();
        play();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, state.phase, winners.length, close, play, skip]);

  useEffect(() => {
    if (open) rootRef.current?.focus();
  }, [open]);

  useEffect(
    () => () => {
      audioRef.current?.close();
    },
    [],
  );

  if (!open) return null;

  const brandName = (isAr && brand.name_ar) || brand.name_en;
  const current = plan.winners[state.winner];

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={isAr ? "عرض إعلان الفائز" : "Winner reveal"}
      tabIndex={-1}
      dir={isAr ? "rtl" : "ltr"}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[color-mix(in_oklch,var(--primary),black_72%)] outline-none"
    >
      <RevealStyles />

      {state.phase === "ready" ? (
        <RevealSetup
          config={config}
          onChange={patchConfig}
          onStart={play}
          onClose={close}
          onFullscreen={fullscreen}
          isAr={isAr}
          winnerCount={winners.length}
        />
      ) : (
        <>
          <RevealStage
            state={state}
            plan={plan}
            config={config}
            isAr={isAr}
            title={title}
            brandName={brandName}
            logoUrl={brand.logo_url}
            burst={burst}
            seed={seed}
            reducedMotion={reducedMotion}
          />
          {/* Out of the picture until the mouse is near, so a recording stays clean. */}
          <div className="absolute end-3 top-3 z-10 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 hover:opacity-100">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-primary-foreground hover:bg-primary-foreground/10"
              onClick={play}
              aria-label={isAr ? "إعادة العرض" : "Play again"}
            >
              <RotateCcw className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-primary-foreground hover:bg-primary-foreground/10"
              onClick={close}
              aria-label={isAr ? "إغلاق" : "Close"}
            >
              <X className="size-4" />
            </Button>
          </div>
          <p className="sr-only" aria-live="polite">
            {state.phase === "reveal" && current
              ? `${isAr ? "الفائز" : "Winner"} ${current.position}: @${current.username}`
              : ""}
          </p>
        </>
      )}
    </div>
  );
}
