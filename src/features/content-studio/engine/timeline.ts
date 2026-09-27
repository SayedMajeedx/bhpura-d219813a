/**
 * Time in the content studio's animated templates: easing curves, the shared
 * motion tokens, and helpers that turn a time in seconds into progress.
 * Everything here is pure, so a frame at time t always draws the same.
 */

export type Ease = (x: number) => number;

export const ease = {
  linear: (x: number) => x,
  outCubic: (x: number) => 1 - Math.pow(1 - x, 3),
  inCubic: (x: number) => x * x * x,
  inOutCubic: (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  outExpo: (x: number) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
  /** Overshoots a little before settling: for stamps and badges. */
  outBack: (x: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  },
} satisfies Record<string, Ease>;

/**
 * The motion tokens every template shares (seconds): quick to arrive, soft to
 * settle, a short stagger between lines, and a gentle exit before the loop.
 */
export const MOTION = {
  enter: 0.8,
  stagger: 0.1,
  exit: 0.45,
} as const;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Eased progress (0 to 1) of a move that starts at `start` and lasts `duration`. */
export function progress(t: number, start: number, duration: number, curve: Ease = ease.linear) {
  if (duration <= 0) return t >= start ? 1 : 0;
  return curve(clamp01((t - start) / duration));
}

/** The value between `from` and `to` at progress `p`. */
export function mix(from: number, to: number, p: number) {
  return from + (to - from) * p;
}

/**
 * How present a layer is (0 to 1): it arrives from `start` over `enter`
 * seconds and leaves `exit` seconds before `end`. Multiply alpha or offsets by
 * it, so every element enters and leaves the same way.
 */
export function presence(
  t: number,
  {
    start,
    end,
    enter = MOTION.enter,
    exit = MOTION.exit,
  }: { start: number; end: number; enter?: number; exit?: number },
) {
  const arrive = progress(t, start, enter, ease.outExpo);
  const leave = progress(t, end - exit, exit, ease.inCubic);
  return Math.min(arrive, 1 - leave);
}

/** The start time of the `index`th item in a staggered group. */
export function stagger(start: number, index: number, step: number = MOTION.stagger) {
  return start + index * step;
}

/** How many frames a template of `duration` seconds has at `fps`. */
export function frameCount(duration: number, fps: number) {
  return Math.max(1, Math.round(duration * fps));
}
