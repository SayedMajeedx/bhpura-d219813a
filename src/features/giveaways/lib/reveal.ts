import { seededRandom } from "./draw";

/**
 * The winner reveal: a countdown, a shuffle of names that slows down, and the
 * winner. Everything that decides what is on screen and when lives here, as pure
 * functions, so it can be tested without a browser or a clock. The screen only
 * draws the state these functions return.
 */

export type RevealFormat = "story" | "wide";

export type RevealConfig = {
  /** "story" is a 9:16 frame for Reels and Stories; "wide" fills the screen. */
  format: RevealFormat;
  countdownFrom: 3 | 5 | 10;
  shuffleSeconds: 4 | 6 | 8;
  sound: boolean;
};

export const DEFAULT_REVEAL_CONFIG: RevealConfig = {
  format: "story",
  countdownFrom: 3,
  shuffleSeconds: 6,
  sound: true,
};

const pick = <T extends number>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

/** The saved settings, checked field by field; anything unreadable falls back to the default. */
export function parseRevealConfig(raw: string | null | undefined): RevealConfig {
  let value: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === "object") value = parsed as Record<string, unknown>;
  } catch {
    // keep the defaults
  }
  return {
    format: value.format === "wide" ? "wide" : "story",
    countdownFrom: pick(
      value.countdownFrom,
      [3, 5, 10] as const,
      DEFAULT_REVEAL_CONFIG.countdownFrom,
    ),
    shuffleSeconds: pick(
      value.shuffleSeconds,
      [4, 6, 8] as const,
      DEFAULT_REVEAL_CONFIG.shuffleSeconds,
    ),
    sound: typeof value.sound === "boolean" ? value.sound : DEFAULT_REVEAL_CONFIG.sound,
  };
}

// ── The shuffle ─────────────────────────────────────────────────────────────

export type ShuffleFrames = {
  /** The names shown one after another; the last one is the winner. */
  names: string[];
  /** How long each name stays on screen (ms): short at first, longer as it slows down. */
  delays: number[];
};

/**
 * The names that flash by before the winner. They come from the people in the
 * draw, never repeat back to back, never include the winner until the last frame,
 * and slow down smoothly so the last few feel like a drum roll. The same seed
 * always gives the same sequence, so a replay looks identical.
 */
export function buildShuffle(input: {
  pool: string[];
  winner: string;
  seed: string;
  durationMs: number;
  minDelay?: number;
  maxDelay?: number;
}): ShuffleFrames {
  const minDelay = input.minDelay ?? 55;
  const maxDelay = input.maxDelay ?? 420;
  const others = [...new Set(input.pool)].filter((name) => name !== input.winner);
  // Nobody else to show: the winner alone, held for the drum roll.
  if (others.length === 0) return { names: [input.winner], delays: [maxDelay] };

  const delaysFor = (frames: number) =>
    Array.from({ length: frames }, (_, i) =>
      Math.round(minDelay * Math.pow(maxDelay / minDelay, frames === 1 ? 1 : i / (frames - 1))),
    );
  let frames = 6;
  while (frames < 400 && delaysFor(frames).reduce((a, b) => a + b, 0) < input.durationMs)
    frames += 1;
  const delays = delaysFor(frames);

  const random = seededRandom(`${input.seed}:${input.winner}`);
  const names: string[] = [];
  for (let i = 0; i < frames - 1; i++) {
    let name = others[Math.floor(random() * others.length)];
    // Not the same name twice in a row, when there is a choice.
    if (others.length > 1 && name === names[i - 1]) {
      name = others[(others.indexOf(name) + 1) % others.length];
    }
    names.push(name);
  }
  names.push(input.winner);
  return { names, delays };
}

/**
 * How big a username can be drawn, in container-width percent (cqw): short names
 * are huge, long ones shrink so a 30-character handle still fits on one line.
 */
export function nameFontSize(length: number): number {
  return Math.min(12, Math.max(4.5, 12 - Math.max(0, length - 8) * 0.45));
}

// ── The plan and the state machine ──────────────────────────────────────────

export type RevealWinner = {
  id: string;
  position: number;
  username: string;
  /** What they wrote; may be empty. */
  comment: string;
};

export type RevealPlan = {
  winners: RevealWinner[];
  countdownFrom: number;
  /** One shuffle per winner, in order. */
  shuffles: ShuffleFrames[];
  introMs: number;
  /** How long a winner stays on screen before the next shuffle starts. */
  holdMs: number;
  betweenMs: number;
};

export function buildPlan(input: {
  winners: RevealWinner[];
  pool: string[];
  seed: string;
  config: RevealConfig;
  /** Skips the shuffle for people who asked their system for less motion. */
  reducedMotion?: boolean;
}): RevealPlan {
  const { config } = input;
  return {
    winners: input.winners,
    countdownFrom: config.countdownFrom,
    shuffles: input.winners.map((winner) =>
      input.reducedMotion
        ? { names: [winner.username], delays: [600] }
        : buildShuffle({
            pool: input.pool,
            winner: winner.username,
            seed: input.seed,
            durationMs: config.shuffleSeconds * 1000,
          }),
    ),
    introMs: 2400,
    holdMs: 6500,
    betweenMs: 2200,
  };
}

export type RevealPhase =
  "ready" | "intro" | "countdown" | "shuffle" | "reveal" | "between" | "summary";

export type RevealState = {
  phase: RevealPhase;
  /** Which winner (0-based) the shuffle, reveal or between card is about. */
  winner: number;
  /** The countdown number, or the shuffle frame. */
  tick: number;
};

export const READY: RevealState = { phase: "ready", winner: 0, tick: 0 };

export function begin(): RevealState {
  return { phase: "intro", winner: 0, tick: 0 };
}

/** How long to stay in this state before moving on, or null when it waits for a person. */
export function delayFor(state: RevealState, plan: RevealPlan): number | null {
  switch (state.phase) {
    case "intro":
      return plan.introMs;
    case "countdown":
      return 1000;
    case "shuffle":
      return plan.shuffles[state.winner]?.delays[state.tick] ?? 0;
    case "reveal":
      return plan.holdMs;
    case "between":
      return plan.betweenMs;
    default:
      return null;
  }
}

/** The next state. After the last winner comes the summary. */
export function advance(state: RevealState, plan: RevealPlan): RevealState {
  switch (state.phase) {
    case "intro":
      return { phase: "countdown", winner: 0, tick: plan.countdownFrom };
    case "countdown":
      return state.tick > 1
        ? { ...state, tick: state.tick - 1 }
        : { phase: "shuffle", winner: 0, tick: 0 };
    case "shuffle": {
      const last = (plan.shuffles[state.winner]?.names.length ?? 1) - 1;
      return state.tick < last
        ? { ...state, tick: state.tick + 1 }
        : { phase: "reveal", winner: state.winner, tick: 0 };
    }
    case "reveal":
      return state.winner + 1 < plan.winners.length
        ? { phase: "between", winner: state.winner + 1, tick: 0 }
        : { phase: "summary", winner: state.winner, tick: 0 };
    case "between":
      return { phase: "shuffle", winner: state.winner, tick: 0 };
    default:
      return state;
  }
}

/** A person pressing Space or an arrow: jump to the next thing worth seeing. */
export function skip(state: RevealState, plan: RevealPlan): RevealState {
  switch (state.phase) {
    case "intro":
    case "countdown":
      return { phase: "shuffle", winner: 0, tick: 0 };
    case "shuffle":
      return { phase: "reveal", winner: state.winner, tick: 0 };
    case "reveal":
    case "between":
      return advance(state, plan);
    default:
      return state;
  }
}
