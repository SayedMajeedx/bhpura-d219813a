import type { Post } from "./types";

/**
 * Shammoua's Cup: the store's pieces in a knockout, voted on in Stories, two matches a day and the
 * final on its own. What the store did is one row of the shared record: who entered and who won,
 * so the bracket is always worked out from those and cannot disagree with them.
 */
export const CUP_KEY = "shammoua-cup";
const MOST_ENTRANTS = 16;

export type CupState = {
  key: typeof CUP_KEY;
  entrants: string[];
  winners: Record<string, string>;
};

export type CupMatch = {
  id: string;
  round: number;
  a?: string;
  b?: string;
  winner?: string;
  day: number;
};

export const emptyCup = (): CupState => ({ key: CUP_KEY, entrants: [], winners: {} });

/** A knockout needs a power of two: as many of the pieces as make one, 16 at most, 4 at least. */
export function cupSize(pieces: number): number {
  let size = 0;
  for (let next = 4; next <= Math.min(pieces, MOST_ENTRANTS); next *= 2) size = next;
  return size;
}

export const startCup = (pieces: string[]): CupState => ({
  ...emptyCup(),
  entrants: pieces.slice(0, cupSize(pieces.length)),
});

export function readCup(value: unknown): CupState {
  const { entrants, winners } = (value ?? {}) as { entrants?: unknown; winners?: unknown };
  if (!Array.isArray(entrants) || !entrants.every((key) => typeof key === "string")) {
    return emptyCup();
  }
  const kept: Record<string, string> = {};
  if (typeof winners === "object" && winners !== null) {
    for (const [id, key] of Object.entries(winners)) {
      if (typeof key === "string") kept[id] = key;
    }
  }
  return { key: CUP_KEY, entrants: entrants as string[], winners: kept };
}

/** Every match in the order it is played, each side filled once the match before it is decided. */
export function cupMatches(state: CupState): CupMatch[] {
  const matches: CupMatch[] = [];
  let sides: (string | undefined)[] = state.entrants;
  for (let round = 0; sides.length > 1; round += 1) {
    const next: (string | undefined)[] = [];
    for (let i = 0; i < sides.length; i += 2) {
      const id = `r${round}m${i / 2}`;
      const [a, b] = [sides[i], sides[i + 1]];
      const chosen = state.winners[id];
      const winner = a && b && (chosen === a || chosen === b) ? chosen : undefined;
      matches.push({ id, round, a, b, winner, day: Math.floor(matches.length / 2) + 1 });
      next.push(winner);
    }
    sides = next;
  }
  return matches;
}

/** Each round's names as the bracket draws them, the first round's entrants first. */
export function cupRounds(state: CupState): (string | undefined)[][] {
  if (state.entrants.length === 0) return [];
  const rounds: (string | undefined)[][] = [state.entrants];
  const matches = cupMatches(state);
  const total = Math.log2(state.entrants.length);
  for (let round = 0; round < total; round += 1) {
    rounds.push(matches.filter((match) => match.round === round).map((match) => match.winner));
  }
  return rounds;
}

/** A winner chosen. Changing one drops the later results it no longer leads to. */
export function withWinner(state: CupState, id: string, key: string): CupState {
  const next: CupState = { ...state, winners: { ...state.winners, [id]: key } };
  const standing: Record<string, string> = {};
  for (const match of cupMatches(next)) {
    if (match.winner) standing[match.id] = match.winner;
  }
  return { ...next, winners: standing };
}

export function cupChampion(state: CupState): string | undefined {
  const matches = cupMatches(state);
  return matches[matches.length - 1]?.winner;
}

export function roundName(round: number, entrants: number): string {
  const left = entrants / 2 ** round;
  if (left === 2) return "النهائي";
  if (left === 4) return "نصف النهائي";
  if (left === 8) return "ربع النهائي";
  return `دور الـ${left}`;
}

/** A match's Story frame: the kit's own poll, with room below it for Instagram's vote sticker. */
export function matchPost(match: CupMatch, nameOf: (key: string) => string): Post {
  const [a, b] = [nameOf(match.a ?? ""), nameOf(match.b ?? "")];
  return {
    key: `cup-${match.id}`,
    series: "كأس شمّوعة",
    title: `${a} ولا ${b}؟`,
    tpl: "poll",
    tone: match.round % 2 ? "sand" : "wine",
    size: "story",
    head: `${a} ولا *${b}؟*`,
    labelA: a,
    labelB: b,
    photo1: match.a,
    photo2: match.b,
    stickers: [],
    caption: "",
  };
}

/** The bracket as a Story, to post at the start and after each day's results. */
export function bracketPost(state: CupState, nameOf: (key: string) => string): Post {
  return {
    key: "cup-bracket",
    series: "كأس شمّوعة",
    title: "كأس شمّوعة",
    tpl: "bracket",
    tone: "wine",
    size: "story",
    head: "كأس *شمّوعة*",
    rounds: cupRounds(state).map((round) => round.map((key) => (key ? nameOf(key) : ""))),
    stickers: [{ id: "hanger-cool", x: 0.2, y: 0.235, s: 250, r: -6 }],
    caption: "",
  };
}
