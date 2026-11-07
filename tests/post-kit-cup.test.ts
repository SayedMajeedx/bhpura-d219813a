import { describe, expect, it } from "vitest";
import {
  bracketPost,
  cupChampion,
  cupMatches,
  cupRounds,
  cupSize,
  emptyCup,
  matchPost,
  readCup,
  roundName,
  startCup,
  withWinner,
} from "../src/addons/post-kit/lib/cup";
import { DRAW } from "../src/addons/post-kit/lib/layouts";
import { STICKERS } from "../src/addons/post-kit/lib/stickers";

const pieces = Array.from({ length: 16 }, (_, i) => `p${i + 1}`);
const cup = startCup(pieces);

describe("who enters", () => {
  it("takes a power of two, sixteen at most and four at least", () => {
    expect(cupSize(16)).toBe(16);
    expect(cupSize(20)).toBe(16);
    expect(cupSize(15)).toBe(8);
    expect(cupSize(4)).toBe(4);
    expect(cupSize(3)).toBe(0);
    expect(startCup(pieces.slice(0, 9)).entrants).toHaveLength(8);
  });
});

describe("the matches", () => {
  it("are fifteen over eight days, two a day and the final on its own", () => {
    const matches = cupMatches(cup);
    expect(matches).toHaveLength(15);
    expect(matches.filter((m) => m.round === 0)).toHaveLength(8);
    expect(matches.at(-1)?.day).toBe(8);
    expect(matches.filter((m) => m.day === 8)).toHaveLength(1);
    for (let day = 1; day <= 7; day += 1) {
      expect(matches.filter((m) => m.day === day)).toHaveLength(2);
    }
  });

  it("wait for their sides until the matches before them are decided", () => {
    const second = cupMatches(cup).find((m) => m.id === "r1m0");
    expect(second).toMatchObject({ a: undefined, b: undefined });
    const played = withWinner(withWinner(cup, "r0m0", "p1"), "r0m1", "p4");
    expect(cupMatches(played).find((m) => m.id === "r1m0")).toMatchObject({ a: "p1", b: "p4" });
  });

  it("refuse a winner who is not in the match", () => {
    const next = withWinner(cup, "r0m0", "p9");
    expect(cupMatches(next)[0].winner).toBeUndefined();
    expect(next.winners).toEqual({});
  });

  it("drop the later results a changed winner no longer leads to", () => {
    let state = withWinner(withWinner(cup, "r0m0", "p1"), "r0m1", "p3");
    state = withWinner(state, "r1m0", "p1");
    expect(state.winners.r1m0).toBe("p1");
    state = withWinner(state, "r0m0", "p2");
    expect(state.winners.r1m0).toBeUndefined();
    expect(state.winners.r0m1).toBe("p3");
  });

  it("end on one champion, whichever way they are played", () => {
    let state = cup;
    for (let i = 0; i < 15; i += 1) {
      const match = cupMatches(state)[i];
      state = withWinner(state, match.id, match.b as string);
    }
    expect(cupChampion(state)).toBe("p16");
    expect(cupRounds(state).map((round) => round.length)).toEqual([16, 8, 4, 2, 1]);
  });

  it("name each round by what is left", () => {
    expect([0, 1, 2, 3].map((round) => roundName(round, 16))).toEqual([
      "دور الـ16",
      "ربع النهائي",
      "نصف النهائي",
      "النهائي",
    ]);
    expect(roundName(1, 4)).toBe("النهائي");
  });
});

describe("the frames", () => {
  const nameOf = (key: string) => `اسم ${key}`;

  it("a match is a Story of the kit's own poll, naming both pieces", () => {
    const post = matchPost(cupMatches(cup)[0], nameOf);
    expect(post).toMatchObject({
      tpl: "poll",
      size: "story",
      photo1: "p1",
      photo2: "p2",
      labelA: "اسم p1",
      labelB: "اسم p2",
    });
  });

  it("the bracket has a drawing and leaves undecided places empty", () => {
    const post = bracketPost(withWinner(cup, "r0m0", "p2"), nameOf);
    expect(DRAW[post.tpl]).toBeTruthy();
    expect(post.rounds?.[1][0]).toBe("اسم p2");
    expect(post.rounds?.[1][1]).toBe("");
    for (const sticker of post.stickers) expect(STICKERS[sticker.id]).toBeTruthy();
  });
});

describe("what is kept", () => {
  it("reads a bad record as a cup not started, and drops what it cannot read", () => {
    expect(readCup(null)).toEqual(emptyCup());
    expect(readCup({ entrants: "x" })).toEqual(emptyCup());
    expect(readCup({ entrants: [1, 2] })).toEqual(emptyCup());
    expect(readCup({ entrants: ["a", "b"], winners: { r0m0: "a", r0m1: 4 } }).winners).toEqual({
      r0m0: "a",
    });
  });
});
