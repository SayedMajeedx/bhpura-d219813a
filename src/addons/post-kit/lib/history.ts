import type { Post } from "./types";

/*
 * Undo and redo in the maker. A drag or a slider changes the post many times a second, so a step
 * is what the post was when the merchant paused: `commit` keeps it, and undo goes back a step.
 */

export const HISTORY_STEPS = 50;

export type History = {
  /** The steps before `base`, the oldest first. */
  past: Post[];
  /** The steps undone, the next to redo first. */
  future: Post[];
  /** The last step kept: the post as it was when the merchant last paused. */
  base: Post;
};

const same = (a: Post, b: Post) => a === b || JSON.stringify(a) === JSON.stringify(b);

export const startHistory = (post: Post): History => ({ past: [], future: [], base: post });

/** Keeps the post as a step once it differs from the last one; a new step drops what was undone. */
export function commit(h: History, current: Post): History {
  if (same(current, h.base)) return h;
  return { past: [...h.past, h.base].slice(-HISTORY_STEPS), future: [], base: current };
}

/** One step back. Null when there is nothing before. */
export function undo(h: History, current: Post): { history: History; post: Post } | null {
  const kept = commit(h, current);
  const prev = kept.past[kept.past.length - 1];
  if (!prev) return null;
  return {
    post: prev,
    history: { past: kept.past.slice(0, -1), future: [current, ...kept.future], base: prev },
  };
}

/** One step forward again. Null when nothing was undone, or something changed since. */
export function redo(h: History, current: Post): { history: History; post: Post } | null {
  const kept = commit(h, current);
  const [next, ...rest] = kept.future;
  if (!next) return null;
  return { post: next, history: { past: [...kept.past, current], future: rest, base: next } };
}

export const canUndo = (h: History, current: Post) => h.past.length > 0 || !same(current, h.base);
export const canRedo = (h: History, current: Post) => h.future.length > 0 && same(current, h.base);
