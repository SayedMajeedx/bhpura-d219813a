import { describe, expect, it } from "vitest";
import {
  advance,
  begin,
  buildPlan,
  buildShuffle,
  DEFAULT_REVEAL_CONFIG,
  delayFor,
  nameFontSize,
  parseRevealConfig,
  READY,
  skip,
  type RevealPlan,
  type RevealState,
  type RevealWinner,
} from "../src/features/giveaways/lib/reveal";
import { spawnBurst, stepParticles } from "../src/features/giveaways/lib/confetti";
import { seededRandom } from "../src/features/giveaways/lib/draw";

const pool = Array.from({ length: 200 }, (_, i) => `user${i}`);

describe("the shuffle", () => {
  const frames = buildShuffle({ pool, winner: "user7", seed: "abc", durationMs: 6000 });

  it("ends on the winner and shows them nowhere else", () => {
    expect(frames.names.at(-1)).toBe("user7");
    expect(frames.names.slice(0, -1)).not.toContain("user7");
    expect(frames.names).toHaveLength(frames.delays.length);
  });

  it("slows down smoothly and lasts about as long as asked", () => {
    const { delays } = frames;
    expect(delays[0]).toBe(55);
    expect(delays.at(-1)).toBe(420);
    for (let i = 1; i < delays.length; i++) expect(delays[i]).toBeGreaterThanOrEqual(delays[i - 1]);
    const total = delays.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThanOrEqual(6000);
    expect(total).toBeLessThan(6000 + 420);
  });

  it("never repeats a name back to back", () => {
    for (let i = 1; i < frames.names.length; i++) {
      expect(frames.names[i]).not.toBe(frames.names[i - 1]);
    }
  });

  it("is the same for the same seed and different for another", () => {
    const again = buildShuffle({ pool, winner: "user7", seed: "abc", durationMs: 6000 });
    expect(again).toEqual(frames);
    const other = buildShuffle({ pool, winner: "user7", seed: "xyz", durationMs: 6000 });
    expect(other.names).not.toEqual(frames.names);
  });

  it("takes longer for a longer drum roll", () => {
    const long = buildShuffle({ pool, winner: "user7", seed: "abc", durationMs: 8000 });
    expect(long.names.length).toBeGreaterThan(frames.names.length);
  });

  it("copes with nobody else, one other person and duplicates in the pool", () => {
    expect(buildShuffle({ pool: ["only"], winner: "only", seed: "s", durationMs: 4000 })).toEqual({
      names: ["only"],
      delays: [420],
    });
    const two = buildShuffle({
      pool: ["a", "b", "b", "b"],
      winner: "a",
      seed: "s",
      durationMs: 4000,
    });
    expect(two.names.at(-1)).toBe("a");
    expect(two.names.slice(0, -1).every((name) => name === "b")).toBe(true);
  });
});

describe("name size", () => {
  it("is biggest for short names, shrinks for long ones and never goes below a floor", () => {
    expect(nameFontSize(5)).toBe(12);
    expect(nameFontSize(8)).toBe(12);
    expect(nameFontSize(20)).toBeLessThan(nameFontSize(12));
    expect(nameFontSize(30)).toBeGreaterThanOrEqual(4.5);
    expect(nameFontSize(200)).toBe(4.5);
  });
});

describe("the saved settings", () => {
  it("falls back to the defaults for anything unreadable", () => {
    expect(parseRevealConfig(null)).toEqual(DEFAULT_REVEAL_CONFIG);
    expect(parseRevealConfig("not json")).toEqual(DEFAULT_REVEAL_CONFIG);
    expect(parseRevealConfig("[1,2]")).toEqual(DEFAULT_REVEAL_CONFIG);
    expect(parseRevealConfig('{"countdownFrom":7,"shuffleSeconds":"x","format":"tall"}')).toEqual(
      DEFAULT_REVEAL_CONFIG,
    );
  });

  it("keeps valid choices", () => {
    expect(
      parseRevealConfig('{"format":"wide","countdownFrom":10,"shuffleSeconds":4,"sound":false}'),
    ).toEqual({ format: "wide", countdownFrom: 10, shuffleSeconds: 4, sound: false });
  });
});

describe("the sequence", () => {
  const winners: RevealWinner[] = [
    { id: "w1", position: 1, username: "user7", comment: "first" },
    { id: "w2", position: 2, username: "user9", comment: "second" },
  ];
  const plan: RevealPlan = buildPlan({
    winners,
    pool,
    seed: "abc",
    config: { ...DEFAULT_REVEAL_CONFIG, countdownFrom: 3, shuffleSeconds: 4 },
  });

  /** Runs the whole thing, noting the order of phases and the time each state lasts. */
  function runThrough() {
    let state: RevealState = begin();
    const phases: string[] = [];
    let elapsed = 0;
    for (let guard = 0; guard < 5000; guard++) {
      const delay = delayFor(state, plan);
      if (delay === null) break;
      if (phases.at(-1) !== state.phase) phases.push(state.phase);
      elapsed += delay;
      state = advance(state, plan);
    }
    return { state, phases, elapsed };
  }

  it("goes intro, countdown, shuffle, reveal, between, shuffle, reveal, summary", () => {
    const { state, phases } = runThrough();
    expect(phases).toEqual([
      "intro",
      "countdown",
      "shuffle",
      "reveal",
      "between",
      "shuffle",
      "reveal",
    ]);
    expect(state.phase).toBe("summary");
    expect(state.winner).toBe(1);
  });

  it("counts down from the chosen number to 1, then starts the shuffle", () => {
    let state = advance(begin(), plan);
    const numbers = [state.tick];
    while (state.phase === "countdown") {
      state = advance(state, plan);
      if (state.phase === "countdown") numbers.push(state.tick);
    }
    expect(numbers).toEqual([3, 2, 1]);
    expect(state).toEqual({ phase: "shuffle", winner: 0, tick: 0 });
  });

  it("shows the winner on the last shuffle frame and holds them", () => {
    let state: RevealState = { phase: "shuffle", winner: 0, tick: 0 };
    const last = plan.shuffles[0].names.length - 1;
    for (let i = 0; i < last; i++) state = advance(state, plan);
    expect(plan.shuffles[0].names[state.tick]).toBe("user7");
    expect(advance(state, plan)).toEqual({ phase: "reveal", winner: 0, tick: 0 });
    expect(delayFor({ phase: "reveal", winner: 0, tick: 0 }, plan)).toBe(plan.holdMs);
  });

  it("is about 40 seconds long for two winners with a 4-second drum roll", () => {
    const { elapsed } = runThrough();
    expect(elapsed).toBeGreaterThan(25_000);
    expect(elapsed).toBeLessThan(40_000);
  });

  it("waits for a person on the ready and summary screens", () => {
    expect(delayFor(READY, plan)).toBeNull();
    expect(delayFor({ phase: "summary", winner: 1, tick: 0 }, plan)).toBeNull();
    expect(advance(READY, plan)).toEqual(READY);
  });

  it("lets a person skip ahead", () => {
    expect(skip(begin(), plan).phase).toBe("shuffle");
    expect(skip({ phase: "countdown", winner: 0, tick: 2 }, plan).phase).toBe("shuffle");
    expect(skip({ phase: "shuffle", winner: 0, tick: 3 }, plan)).toEqual({
      phase: "reveal",
      winner: 0,
      tick: 0,
    });
    expect(skip({ phase: "reveal", winner: 0, tick: 0 }, plan).phase).toBe("between");
    expect(skip({ phase: "reveal", winner: 1, tick: 0 }, plan).phase).toBe("summary");
    expect(skip({ phase: "between", winner: 1, tick: 0 }, plan).phase).toBe("shuffle");
    expect(skip({ phase: "summary", winner: 1, tick: 0 }, plan).phase).toBe("summary");
  });

  it("skips the shuffle for someone who asked for less motion", () => {
    const calm = buildPlan({
      winners,
      pool,
      seed: "abc",
      config: DEFAULT_REVEAL_CONFIG,
      reducedMotion: true,
    });
    expect(calm.shuffles[0].names).toEqual(["user7"]);
    expect(advance({ phase: "shuffle", winner: 0, tick: 0 }, calm).phase).toBe("reveal");
  });
});

describe("confetti", () => {
  it("throws a burst upward from the origin, in the colours given", () => {
    const burst = spawnBurst(120, { x: 300, y: 800 }, ["red", "gold"], seededRandom("c"));
    expect(burst).toHaveLength(120);
    expect(burst.every((p) => p.x === 300 && p.y === 800)).toBe(true);
    expect(burst.filter((p) => p.vy < 0).length).toBeGreaterThan(110);
    expect(new Set(burst.map((p) => p.color))).toEqual(new Set(["red", "gold"]));
    expect(spawnBurst(5, { x: 0, y: 0 }, [], seededRandom("c"))[0].color).toBe("white");
  });

  it("is the same for the same random source", () => {
    const a = spawnBurst(10, { x: 0, y: 0 }, ["a", "b"], seededRandom("same"));
    const b = spawnBurst(10, { x: 0, y: 0 }, ["a", "b"], seededRandom("same"));
    expect(a).toEqual(b);
  });

  it("pulls particles down and removes the ones that fall off the bottom", () => {
    const burst = spawnBurst(50, { x: 100, y: 500 }, ["a"], seededRandom("c"));
    const later = stepParticles(burst, 0.5, 900);
    expect(later.length).toBeLessThanOrEqual(50);
    const fallen = stepParticles([{ ...burst[0], y: 2000, vy: 100, age: 0 }], 0.016, 900);
    expect(fallen).toHaveLength(0);
    // Gravity wins over time.
    let particles = burst;
    for (let i = 0; i < 400; i++) particles = stepParticles(particles, 0.016, 900);
    expect(particles).toHaveLength(0);
  });

  it("drops old particles even if they have not landed", () => {
    const stuck = [
      { ...spawnBurst(1, { x: 0, y: 0 }, ["a"], seededRandom("c"))[0], vy: -9000, age: 5.99 },
    ];
    expect(stepParticles(stuck, 0.1, 900)).toHaveLength(0);
  });
});
