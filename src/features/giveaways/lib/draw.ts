import type { CommentEntry } from "./entry-rules";

/**
 * The draw. Seeded, so the same seed over the same entries always picks the same
 * people, whoever re-runs it. The seed is stored with the giveaway.
 */

/** A fresh random seed (32 hex characters), from the browser's secure generator. */
export function newSeed(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** xmur3: turns a string into four 32-bit numbers to start the generator. */
function seedWords(seed: string): [number, number, number, number] {
  let h = 1779033703 ^ seed.length;
  const words: number[] = [];
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  for (let i = 0; i < 4; i++) {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    words.push((h ^= h >>> 16) >>> 0);
  }
  return [words[0], words[1], words[2], words[3]];
}

/** sfc32: a small, well-behaved generator; returns numbers in [0, 1). */
export function seededRandom(seed: string): () => number {
  let [a, b, c, d] = seedWords(seed);
  return () => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

export type DrawPick = {
  /** 1 is the first winner; backups carry on from the last winner. */
  position: number;
  kind: "winner" | "backup";
  entry: CommentEntry;
};

/**
 * Draws `winners` winners and `backups` backups. An account wins once even when
 * it has several entries (each entry is one more chance). The result does not
 * depend on the order the entries arrive in.
 */
export function drawWinners(
  entries: CommentEntry[],
  seed: string,
  winners: number,
  backups: number,
): DrawPick[] {
  const pool = [...entries].sort((a, b) =>
    a.comment_id < b.comment_id ? -1 : a.comment_id > b.comment_id ? 1 : 0,
  );
  const random = seededRandom(seed);
  // Fisher-Yates shuffle.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const wanted = Math.max(0, winners) + Math.max(0, backups);
  const taken = new Set<string>();
  const picks: DrawPick[] = [];
  for (const entry of pool) {
    if (picks.length >= wanted) break;
    if (taken.has(entry.username)) continue;
    taken.add(entry.username);
    const position = picks.length + 1;
    picks.push({ position, kind: position <= winners ? "winner" : "backup", entry });
  }
  return picks;
}
