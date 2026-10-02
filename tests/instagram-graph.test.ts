import { describe, expect, it } from "vitest";
import {
  chunk,
  GraphError,
  graphGet,
  graphUrl,
  parseCommentsPage,
  parseMediaPage,
  tokenNeedsRefresh,
} from "../supabase/functions/instagram-giveaway/graph";

const respond = (status: number, body: unknown) => async () => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

describe("Graph URLs", () => {
  it("builds a versioned URL and leaves out empty parameters", () => {
    const url = new URL(
      graphUrl("123/comments", { fields: "id,text", after: undefined, limit: 50 }),
    );
    expect(url.pathname).toMatch(/^\/v\d+\.\d+\/123\/comments$/);
    expect(url.searchParams.get("limit")).toBe("50");
    expect(url.searchParams.has("after")).toBe(false);
  });
});

describe("comments page", () => {
  it("maps comments, lowercases usernames and skips ones without an author", () => {
    const page = parseCommentsPage({
      data: [
        {
          id: "1",
          text: "hi @a",
          username: "Sara.K",
          timestamp: "2026-10-01T10:00:00+0000",
          like_count: 2,
        },
        { id: "2", text: "no author" },
        { id: "3", text: "from object", from: { username: "Noor" } },
      ],
      paging: { cursors: { after: "CUR" }, next: "https://graph.instagram.com/next" },
    });
    expect(page.comments.map((c) => [c.comment_id, c.username, c.like_count])).toEqual([
      ["1", "sara.k", 2],
      ["3", "noor", 0],
    ]);
    expect(page.next).toBe("CUR");
  });

  it("counts comments sent without an author instead of losing them silently", () => {
    const page = parseCommentsPage({
      data: [
        { id: "1", text: "a", timestamp: "2026-10-01T10:00:00+0000" },
        { id: "2", text: "b" },
        { id: "3", text: "c", username: "Noor" },
      ],
    });
    expect(page.received).toBe(3);
    expect(page.withoutAuthor).toBe(2);
    expect(page.comments.map((c) => c.username)).toEqual(["noor"]);
  });

  it("reports no next page when Graph sends no next link", () => {
    expect(parseCommentsPage({ data: [], paging: { cursors: { after: "CUR" } } }).next).toBeNull();
    expect(parseCommentsPage({}).comments).toEqual([]);
  });
});

describe("media page", () => {
  it("keeps the thumbnail for videos and the image for photos", () => {
    const { media, next } = parseMediaPage({
      data: [
        { id: "1", media_type: "VIDEO", thumbnail_url: "t", media_url: "v", comments_count: 4 },
        { id: "2", media_type: "IMAGE", media_url: "i" },
        { nope: true },
      ],
    });
    expect(media.map((m) => [m.id, m.thumbnail_url, m.comments_count])).toEqual([
      ["1", "t", 4],
      ["2", "i", 0],
    ]);
    expect(next).toBeNull();
  });
});

describe("errors", () => {
  it("throws Graph's own message and flags a bad token", async () => {
    const error = await graphGet(
      respond(400, { error: { message: "Invalid OAuth access token.", code: 190 } }),
      "u",
    ).catch((e) => e);
    expect(error).toBeInstanceOf(GraphError);
    expect(error.message).toBe("Invalid OAuth access token.");
    expect(error.isTokenProblem).toBe(true);
  });

  it("flags rate limits", async () => {
    const error = await graphGet(
      respond(400, { error: { message: "Too many calls", code: 4 } }),
      "u",
    ).catch((e) => e);
    expect(error.isRateLimit).toBe(true);
    expect(error.isTokenProblem).toBe(false);
  });

  it("returns the body on success", async () => {
    expect(await graphGet(respond(200, { data: [] }), "u")).toEqual({ data: [] });
  });
});

describe("token refresh", () => {
  const now = new Date("2026-10-03T00:00:00Z");
  const inDays = (days: number) => new Date(now.getTime() + days * 86_400_000);
  const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);

  it("leaves a healthy token alone", () => {
    expect(tokenNeedsRefresh(inDays(40), daysAgo(20), now)).toBe(false);
  });

  it("refreshes a token with 10 days or fewer left", () => {
    expect(tokenNeedsRefresh(inDays(10), daysAgo(50), now)).toBe(true);
    expect(tokenNeedsRefresh(inDays(3), null, now)).toBe(true);
  });

  it("does not refresh an expired token or one stored under a day ago", () => {
    expect(tokenNeedsRefresh(daysAgo(1), daysAgo(61), now)).toBe(false);
    expect(tokenNeedsRefresh(inDays(5), new Date(now.getTime() - 3_600_000), now)).toBe(false);
  });
});

describe("chunk", () => {
  it("splits into groups of a given size", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
  });
});
