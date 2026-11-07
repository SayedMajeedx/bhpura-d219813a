import { describe, expect, it } from "vitest";
import { SERIES_POSTS } from "../src/addons/post-kit/content/series";
import { PLAN } from "../src/addons/post-kit/content/plan";
import { POSTS } from "../src/addons/post-kit/content/posts";
import {
  calendarDays,
  calendarSummary,
  CALENDAR_KEY,
  dateOfIndex,
  emptyCalendar,
  localDate,
  planDays,
  readCalendar,
  swapDays,
  withNextDay,
  withPost,
  withPosted,
} from "../src/addons/post-kit/lib/calendar";
import { gridShape, readCell } from "../src/addons/post-kit/lib/layout-series";
import { withPhoto } from "../src/addons/post-kit/lib/post-rules";
import type { Post } from "../src/addons/post-kit/lib/types";

const rows = PLAN.flatMap((week) => week.rows);
const plan = planDays(rows, POSTS);

describe("the plan as days", () => {
  it("dates each row from 8 November and finds its post", () => {
    expect(plan[0].date).toBe("2026-11-08");
    expect(plan[41].date).toBe("2026-12-19");
    expect(plan[0].post).toBe("shamoua");
    const friday = plan.find((day) => day.date === dateOfIndex(19));
    expect(friday?.what).toContain("الجمعة البيضاء");
    expect(friday?.post).toBeUndefined();
  });

  it("opens a Piece card, and a carousel on its first slide", () => {
    expect(plan.find((day) => day.what.includes("كرت القطعة: عباية كلاود"))?.post).toBe(
      "piece-cloud",
    );
    expect(plan.find((day) => day.what.startsWith("السكليف"))?.post).toBe("sick-1");
  });

  it("has a post for every day the plan calls ready, apart from the two with their own note", () => {
    const unlinked = plan.filter((day) => day.from === "جاهز في العدة" && !day.post);
    expect(unlinked.map((day) => day.what)).toEqual([
      "بالطيب ما ينفع (ريل بدون تصوير)",
      "تحدي الموقع (3 شرايح)",
    ]);
  });
});

describe("what the store does to the calendar", () => {
  const state = emptyCalendar();

  it("is the plan until something changes", () => {
    expect(calendarDays(plan, state)).toEqual(plan);
  });

  it("choosing a post makes the day ready", () => {
    const next = withPost(state, plan[29].date, { key: "own-x", title: "بوستي" });
    const day = calendarDays(plan, next)[29];
    expect(day).toMatchObject({ post: "own-x", what: "بوستي", from: "جاهز في العدة" });
    expect(calendarDays(plan, next)[28]).toEqual(plan[28]);
  });

  it("moving swaps two days' posts and keeps each day's date", () => {
    const next = swapDays(state, plan[0], plan[1]);
    const days = calendarDays(plan, next);
    expect(days[0]).toMatchObject({ date: plan[0].date, what: plan[1].what });
    expect(days[1]).toMatchObject({ date: plan[1].date, what: plan[0].what, post: plan[0].post });
  });

  it("never moves a post that already went out", () => {
    const posted = withPosted(state, plan[0].date, true);
    const days = calendarDays(plan, posted);
    expect(swapDays(posted, days[0], days[1])).toBe(posted);
    expect(swapDays(posted, days[1], days[0])).toBe(posted);
  });

  it("adds an empty day after the last, and says it is the first with nothing", () => {
    const next = withNextDay(state, plan);
    const days = calendarDays(plan, next);
    expect(days).toHaveLength(43);
    expect(days[42].date).toBe("2026-12-20");
    expect(calendarSummary(days, "2026-11-08").nothingReady).toBe("2026-12-20");
    const filled = withPost(next, "2026-12-20", { key: "k", title: "t" });
    expect(calendarSummary(calendarDays(plan, filled), "2026-11-08").nothingReady).toBeNull();
  });

  it("counts what went out and what passed unmarked", () => {
    const days = calendarDays(plan, withPosted(state, plan[0].date, true));
    expect(calendarSummary(days, plan[3].date)).toMatchObject({ posted: 1, total: 42, missed: 2 });
  });

  it("reads a bad record as an empty calendar, and drops a day it cannot read", () => {
    expect(readCalendar(null)).toEqual(emptyCalendar());
    expect(readCalendar({ days: [] })).toEqual(emptyCalendar());
    expect(
      readCalendar({ days: { "2026-11-08": { posted: true }, nope: {}, "2026-11-09": 3 } }),
    ).toEqual({ key: CALENDAR_KEY, days: { "2026-11-08": { posted: true } } });
  });

  it("takes today from the reader's own calendar", () => {
    expect(localDate(new Date(2026, 10, 7, 23, 30))).toBe("2026-11-07");
  });
});

describe("the series' layouts", () => {
  it("fills a cell between asterisks and shapes the grid by its count", () => {
    expect(readCell("*شمّوعة تعرفش*")).toEqual({ marked: true, text: "شمّوعة تعرفش" });
    expect(readCell("«بس شوي أطول»").marked).toBe(false);
    expect(gridShape(4)).toEqual({ cols: 2, rows: 2 });
    expect(gridShape(9)).toEqual({ cols: 3, rows: 3 });
    expect(gridShape(0).rows).toBe(1);
  });

  it("the bingo card has nine squares and one free one", () => {
    const bingo = SERIES_POSTS.find((post) => post.key === "bingo-girls") as Post;
    const cells = (bingo.items ?? "").split("\n").map(readCell);
    expect(cells).toHaveLength(9);
    expect(cells.filter((cell) => cell.marked)).toHaveLength(1);
    expect(cells[4].marked).toBe(true);
  });

  it("a post with a customer's or follower's words says it needs their permission or a real one", () => {
    expect(SERIES_POSTS.find((post) => post.tpl === "proof")?.note).toContain("إذن");
    expect(SERIES_POSTS.find((post) => post.tpl === "reply")?.note).toContain("حقيقي");
  });

  it("a customer's photo leaves the piece's name alone; a piece from the store sets it", () => {
    const proof = SERIES_POSTS.find((post) => post.tpl === "proof") as Post;
    const own = withPhoto(proof, "upload-1", { label: "صورة", upload: true }, { slot: "photo1" });
    expect(own.label).toBe(proof.label);
    const piece = withPhoto(
      proof,
      "cloud",
      { label: "كلاود", name: "عباية كلاود" },
      { slot: "photo1" },
    );
    expect(piece.label).toBe("عباية كلاود");
  });
});
