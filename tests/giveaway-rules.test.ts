import { describe, expect, it } from "vitest";
import {
  buildEntries,
  cleanUsername,
  DEFAULT_RULES,
  extractMentions,
  normalizeText,
  parseRequiredText,
  parseRules,
  parseUsernames,
  type CommentEntry,
  type GiveawayRules,
} from "../src/features/giveaways/lib/entry-rules";
import { drawWinners, newSeed, seededRandom } from "../src/features/giveaways/lib/draw";
import {
  checksComplete,
  resolveWinners,
  type WinnerRow,
} from "../src/features/giveaways/lib/winners";

let counter = 0;
function comment(username: string, body: string, at = "2026-10-01T10:00:00Z"): CommentEntry {
  counter += 1;
  return { comment_id: `c${counter}`, username, body, commented_at: at, like_count: 0 };
}
const rules = (patch: Partial<GiveawayRules> = {}): GiveawayRules => ({
  ...DEFAULT_RULES,
  ...patch,
});

describe("handles and text", () => {
  it("cleans a handle typed any way", () => {
    expect(cleanUsername("@Pura.Line ")).toBe("pura.line");
    expect(cleanUsername("https://www.instagram.com/pura.line/?hl=en")).toBe("pura.line");
  });

  it("splits a list on spaces, commas and new lines without repeats", () => {
    expect(parseUsernames("@a, b\n@A  c")).toEqual(["a", "b", "c"]);
    expect(parseRequiredText("#مسابقة\n#giveaway, #مسابقة")).toEqual(["#مسابقة", "#giveaway"]);
  });

  it("matches Arabic regardless of diacritics and alef forms", () => {
    expect(normalizeText("#مُسَابَقَة")).toBe(normalizeText("#مسابقة"));
    expect(normalizeText("أحمد")).toBe(normalizeText("احمد"));
  });
});

describe("mentions", () => {
  it("finds mentions and ignores the commenter and the store itself", () => {
    expect(extractMentions("@a @b. @me @pura.line @A", "me", "pura.line")).toEqual(["a", "b", "a"]);
  });

  it("reads a handle with dots and underscores and drops a trailing full stop", () => {
    expect(extractMentions("hi @x_y.z!", "me")).toEqual(["x_y.z"]);
  });
});

describe("buildEntries", () => {
  it("keeps one entry per account by default, the earliest qualifying comment", () => {
    const first = comment("sara", "me", "2026-10-01T09:00:00Z");
    const second = comment("sara", "again", "2026-10-01T11:00:00Z");
    const other = comment("noor", "me");
    const result = buildEntries([second, other, first], rules());
    expect(result.entries.map((e) => e.comment_id).sort()).toEqual(
      [first.comment_id, other.comment_id].sort(),
    );
    expect(result.rejected.duplicate).toBe(1);
    expect(result.uniqueAccounts).toBe(2);
    expect(result.totalComments).toBe(3);
  });

  it("counts every qualifying comment when one per person is off", () => {
    const list = [comment("sara", "a"), comment("sara", "b"), comment("noor", "c")];
    const result = buildEntries(list, rules({ onePerPerson: false }));
    expect(result.entries).toHaveLength(3);
    expect(result.eligibleAccounts).toBe(2);
  });

  it("requires the mentioned friends to be different when asked", () => {
    const same = comment("sara", "@a @a");
    const different = comment("noor", "@a @b");
    const strict = buildEntries([same, different], rules({ minMentions: 2 }));
    expect(strict.entries.map((e) => e.username)).toEqual(["noor"]);
    expect(strict.rejected.few_mentions).toBe(1);

    const loose = buildEntries([same, different], rules({ minMentions: 2, uniqueMentions: false }));
    expect(loose.entries).toHaveLength(2);
  });

  it("does not count mentioning yourself or the store as a friend", () => {
    const list = [comment("sara", "@sara @pura.line @a")];
    const result = buildEntries(list, rules({ minMentions: 2 }), "pura.line");
    expect(result.entries).toHaveLength(0);
  });

  it("needs one of the required words or hashtags", () => {
    const list = [comment("sara", "تم المشاركة #مُسابقة"), comment("noor", "nice")];
    const result = buildEntries(list, rules({ requiredText: ["#مسابقة"] }));
    expect(result.entries.map((e) => e.username)).toEqual(["sara"]);
    expect(result.rejected.missing_text).toBe(1);
  });

  it("applies the time window, and drops a comment with no time", () => {
    const early = comment("a", "x", "2026-09-30T10:00:00Z");
    const inside = comment("b", "x", "2026-10-01T10:00:00Z");
    const late = comment("c", "x", "2026-10-03T10:00:00Z");
    const unknown = { ...comment("d", "x"), commented_at: null };
    const result = buildEntries(
      [early, inside, late, unknown],
      rules({ startsAt: "2026-10-01T00:00:00Z", endsAt: "2026-10-02T00:00:00Z" }),
    );
    expect(result.entries.map((e) => e.username)).toEqual(["b"]);
    expect(result.rejected.outside_window).toBe(3);
  });

  it("excludes listed accounts and the store's own account", () => {
    const list = [comment("staff", "x"), comment("pura.line", "x"), comment("sara", "x")];
    const result = buildEntries(list, rules({ excludeUsernames: ["@Staff"] }), "pura.line");
    expect(result.entries.map((e) => e.username)).toEqual(["sara"]);
    expect(result.rejected.excluded).toBe(2);
  });
});

describe("parseRules", () => {
  it("falls back to defaults and clamps what the database holds", () => {
    expect(parseRules(null)).toEqual(DEFAULT_RULES);
    const parsed = parseRules({
      winners: 999,
      backups: -4,
      minMentions: "3",
      startsAt: "not a date",
      excludeUsernames: ["@X", 5],
      requireLike: true,
    });
    expect(parsed.winners).toBe(50);
    expect(parsed.backups).toBe(0);
    expect(parsed.minMentions).toBe(3);
    expect(parsed.startsAt).toBeNull();
    expect(parsed.excludeUsernames).toEqual(["x"]);
    expect(parsed.requireLike).toBe(true);
  });
});

describe("the draw", () => {
  const entries = Array.from({ length: 200 }, (_, i) => ({
    comment_id: `id${String(i).padStart(3, "0")}`,
    username: `user${i}`,
    body: "",
    commented_at: null,
    like_count: 0,
  }));

  it("is repeatable: the same seed picks the same people in any input order", () => {
    const a = drawWinners(entries, "seed-1", 3, 2);
    const b = drawWinners([...entries].reverse(), "seed-1", 3, 2);
    expect(a.map((p) => p.entry.username)).toEqual(b.map((p) => p.entry.username));
    expect(a).toHaveLength(5);
    expect(a.map((p) => p.kind)).toEqual(["winner", "winner", "winner", "backup", "backup"]);
    expect(a.map((p) => p.position)).toEqual([1, 2, 3, 4, 5]);
  });

  it("picks different people for a different seed", () => {
    const a = drawWinners(entries, "seed-1", 3, 0).map((p) => p.entry.username);
    const b = drawWinners(entries, "seed-2", 3, 0).map((p) => p.entry.username);
    expect(a).not.toEqual(b);
  });

  it("never picks an account twice, even with several entries", () => {
    const many = [
      ...entries.slice(0, 3),
      ...Array.from({ length: 30 }, (_, i) => ({
        comment_id: `dup${i}`,
        username: "user0",
        body: "",
        commented_at: null,
        like_count: 0,
      })),
    ];
    const picks = drawWinners(many, "s", 3, 0);
    expect(new Set(picks.map((p) => p.entry.username)).size).toBe(picks.length);
  });

  it("returns fewer picks when there are fewer accounts than places", () => {
    expect(drawWinners(entries.slice(0, 2), "s", 3, 2)).toHaveLength(2);
    expect(drawWinners([], "s", 1, 1)).toEqual([]);
  });

  it("spreads picks across the pool (no obvious bias to the front)", () => {
    const counts = new Array(4).fill(0);
    for (let i = 0; i < 2000; i++) {
      const [pick] = drawWinners(entries, `s${i}`, 1, 0);
      counts[Math.floor(Number(pick.entry.username.slice(4)) / 50)] += 1;
    }
    for (const count of counts) expect(count).toBeGreaterThan(400);
  });

  it("makes a seed of 32 hex characters, and seededRandom stays in [0, 1)", () => {
    expect(newSeed()).toMatch(/^[0-9a-f]{32}$/);
    const random = seededRandom("x");
    for (let i = 0; i < 1000; i++) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("winners after checking", () => {
  const row = (position: number, patch: Partial<WinnerRow> = {}): WinnerRow => ({
    id: `w${position}`,
    position,
    kind: position <= 2 ? "winner" : "backup",
    username: `u${position}`,
    status: "pending",
    follow_checked: false,
    like_checked: false,
    ...patch,
  });

  it("promotes the next backup when a winner is disqualified", () => {
    const rows = [row(1), row(2, { status: "disqualified" }), row(3), row(4)];
    const resolved = resolveWinners(rows, 2);
    expect(resolved.active.map((r) => r.position)).toEqual([1, 3]);
    expect(resolved.standby.map((r) => r.position)).toEqual([4]);
    expect(resolved.disqualified.map((r) => r.position)).toEqual([2]);
    expect(resolved.vacancies).toBe(0);
  });

  it("reports a vacancy when no backup is left", () => {
    const rows = [row(1, { status: "disqualified" }), row(2)];
    expect(resolveWinners(rows, 2).vacancies).toBe(1);
  });

  it("asks only for the checks the giveaway requires", () => {
    const person = row(1, { follow_checked: true });
    expect(checksComplete(person, { requireFollow: true, requireLike: false })).toBe(true);
    expect(checksComplete(person, { requireFollow: true, requireLike: true })).toBe(false);
    expect(checksComplete(row(2), { requireFollow: false, requireLike: false })).toBe(true);
  });
});
