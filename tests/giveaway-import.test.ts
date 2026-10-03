import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_IMPORT, parseImportedComments } from "../src/features/giveaways/lib/import-comments";

const invoke = vi.hoisted(() => vi.fn());
const client = { supabase: { functions: { invoke } } };
vi.mock("../src/integrations/supabase/client", () => client);
vi.mock("@/integrations/supabase/client", () => client);
const { importComments } = await import("../src/lib/data/giveaways");

describe("reading a table", () => {
  it("reads a CSV by its column names, in any order and case", () => {
    const { comments, skipped } = parseImportedComments(
      [
        "Date,Text,Username",
        '2026-10-01T10:00:00Z,"@a @b, done",Sara.K',
        "2026-10-02T09:30:00Z,nice,@Noor",
      ].join("\n"),
    );
    expect(skipped).toBe(0);
    expect(comments).toEqual([
      { username: "sara.k", body: "@a @b, done", commented_at: "2026-10-01T10:00:00.000Z" },
      { username: "noor", body: "nice", commented_at: "2026-10-02T09:30:00.000Z" },
    ]);
  });

  it("knows other tools' column names and semicolon or tab separators", () => {
    const semicolon = parseImportedComments("ownerUsername;text\nsara;hello");
    expect(semicolon.comments).toEqual([{ username: "sara", body: "hello", commented_at: null }]);
    const tab = parseImportedComments("author\tcomment\nnoor\tمشاركة #مسابقة");
    expect(tab.comments[0]).toEqual({
      username: "noor",
      body: "مشاركة #مسابقة",
      commented_at: null,
    });
  });

  it("keeps a quoted comment that spans lines and doubled quotes", () => {
    const { comments } = parseImportedComments('username,text\nsara,"line one\nline ""two"""');
    expect(comments[0].body).toBe('line one\nline "two"');
  });

  it("skips rows without a valid account, and an unreadable date becomes null", () => {
    const { comments, skipped } = parseImportedComments(
      "username,text,date\n,no name,2026-10-01\nbad name!,x,2026-10-01\nsara,ok,not a date",
    );
    expect(skipped).toBe(2);
    expect(comments).toEqual([{ username: "sara", body: "ok", commented_at: null }]);
  });

  it("ignores a byte-order mark from a spreadsheet export", () => {
    expect(parseImportedComments("﻿username,text\nsara,hi").comments).toHaveLength(1);
  });
});

describe("reading a plain list", () => {
  it("takes the account first and the comment after it", () => {
    const { comments, skipped } = parseImportedComments(
      ["@Sara.K @a @b done", "noor: مشاركة", "huda", "", "١٢٣ not an account"].join("\n"),
    );
    expect(comments).toEqual([
      { username: "sara.k", body: "@a @b done", commented_at: null },
      { username: "noor", body: "مشاركة", commented_at: null },
      { username: "huda", body: "", commented_at: null },
    ]);
    expect(skipped).toBe(1);
  });

  it("returns nothing for empty input and caps a huge list", () => {
    expect(parseImportedComments("  \n ")).toEqual({ comments: [], skipped: 0 });
    const huge = Array.from({ length: MAX_IMPORT + 5 }, (_, i) => `user${i} hi`).join("\n");
    expect(parseImportedComments(huge).comments).toHaveLength(MAX_IMPORT);
  });
});

describe("importing through the function", () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockImplementation(
      async (_name: string, { body }: { body: { comments: unknown[] } }) => ({
        data: { ok: true, fetched: body.comments.length },
        error: null,
      }),
    );
  });

  const rows = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ username: `u${i}`, body: "", commented_at: null }));

  it("sends 1,000 at a time, replacing on the first batch and finishing on the last", async () => {
    const progress: number[] = [];
    await importComments("b1", "g1", rows(2300), (done) => progress.push(done));

    const calls = invoke.mock.calls.map(([, { body }]) => ({
      offset: body.offset,
      size: body.comments.length,
      replace: body.replace,
      last: body.last,
    }));
    expect(calls).toEqual([
      { offset: 0, size: 1000, replace: true, last: false },
      { offset: 1000, size: 1000, replace: false, last: false },
      { offset: 2000, size: 300, replace: false, last: true },
    ]);
    expect(progress).toEqual([1000, 2000, 2300]);
  });

  it("sends a single batch for a small file", async () => {
    await importComments("b1", "g1", rows(3));
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0][1].body).toMatchObject({
      action: "import_comments",
      brand_id: "b1",
      giveaway_id: "g1",
      replace: true,
      last: true,
    });
  });
});
