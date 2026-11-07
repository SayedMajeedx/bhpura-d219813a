import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { POSTS } from "../src/addons/post-kit/content/posts";
import { PIECE_CARDS } from "../src/addons/post-kit/content/piece-cards";
import { PAPER_POSTS } from "../src/addons/post-kit/content/papers";
import { PLAN, REELS } from "../src/addons/post-kit/content/plan";
import { STARTERS, postFromStarter } from "../src/addons/post-kit/content/starters";
import { CALENDAR_KEY, withPosted } from "../src/addons/post-kit/lib/calendar";
import { parseRows } from "../src/addons/post-kit/lib/layout-piece";
import { paperLook } from "../src/addons/post-kit/lib/layout-paper";
import { TEMPLATES } from "../src/addons/post-kit/lib/layouts";
import {
  copyOf,
  isOwnPost,
  newestFirst,
  ownPostKey,
  pieceOnSale,
} from "../src/addons/post-kit/lib/own-posts";
import { catalogueFrom, livePost, type Catalogue } from "../src/addons/post-kit/lib/photos";
import { withPhoto } from "../src/addons/post-kit/lib/post-rules";
import { STICKERS } from "../src/addons/post-kit/lib/stickers";
import { TONES } from "../src/addons/post-kit/lib/tones";
import type { Post } from "../src/addons/post-kit/lib/types";

// The posts a store makes itself, the Piece cards and Shammoua's papers. The hook runs with the real
// data layer on a small stand-in for the two tables, as tests/post-kit-store.test.tsx does.

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({
  tables: { post_kit_edits: [] as Row[], post_kit_photos: [] as Row[] } as Record<string, Row[]>,
}));
const fakeClient = vi.hoisted(() => {
  const from = (table: string) => {
    const filters: [string, unknown][] = [];
    let op: "select" | "upsert" | "delete" = "select";
    let payload: Row[] = [];
    const matches = (row: Row) =>
      filters.every(([column, value]) =>
        Array.isArray(value) ? value.includes(row[column]) : row[column] === value,
      );
    const run = () => {
      const rows = db.tables[table];
      if (op === "select") {
        const data = rows.filter(matches);
        return { data, error: null, count: data.length };
      }
      if (op === "delete") {
        const gone = rows.filter(matches);
        db.tables[table] = rows.filter((row) => !matches(row));
        return { data: gone, error: null };
      }
      const written = payload.map((row) => ({ updated_at: new Date().toISOString(), ...row }));
      db.tables[table] = [
        ...rows.filter((old) => !payload.some((row) => row.post_key === old.post_key)),
        ...written,
      ];
      return { data: written, error: null };
    };
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (column: string, value: unknown) => (filters.push([column, value]), chain),
      in: (column: string, value: unknown) => (filters.push([column, value]), chain),
      order: () => chain,
      range: () => chain,
      upsert: (rows: Row[]) => ((op = "upsert"), (payload = rows), chain),
      delete: () => ((op = "delete"), chain),
      then: (done: (reply: unknown) => unknown) => Promise.resolve(run()).then(done),
    };
    return chain;
  };
  return { supabase: { from } };
});
vi.mock("@/integrations/supabase/client", () => fakeClient);
vi.mock("../src/integrations/supabase/client", () => fakeClient);
const r2 = vi.hoisted(() => ({ uploadPublicMedia: vi.fn(), deletePublicMediaUrl: vi.fn() }));
vi.mock("@/lib/r2-upload", () => r2);
vi.mock("../src/lib/r2-upload", () => r2);
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ lang: "en" }) }));
vi.mock("../src/lib/i18n", () => ({ useI18n: () => ({ lang: "en" }) }));

const { useKitStore } = await import("../src/addons/post-kit/hooks/use-kit-store");

const BRAND = "00000000-0000-4000-8000-0000000000a1";
const prices = (price: string): Catalogue => ({
  photos: {
    cloud: { label: "كلاود", name: "عباية كلاود", url: "u", full: `عباية كلاود · ${price}` },
  },
  prices: { cloud: price },
  from: price,
  making: "خلال 7 أيام",
});
const piece = POSTS.find((post) => post.key === "piece-cloud") as Post;

function openDevice(catalogue: Catalogue) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useKitStore(BRAND, catalogue), { wrapper });
}
const opened = async (device: ReturnType<typeof openDevice>) => {
  await waitFor(() => expect(device.result.current.loaded).toBe(true));
  return device;
};
const storedRow = (key: string) =>
  (db.tables.post_kit_edits as { post_key: string; post: Post }[]).find(
    (row) => row.post_key === key,
  );
const stored = (key: string) =>
  waitFor(() => {
    const row = storedRow(key);
    expect(row).toBeTruthy();
    return row as { post: Post };
  });

beforeEach(() => {
  cleanup();
  localStorage.clear();
  db.tables.post_kit_edits = [];
  db.tables.post_kit_photos = [];
});

describe("a store's own post", () => {
  it("has a key the shared record accepts, and the newest sorts first", () => {
    const key = ownPostKey(Date.UTC(2026, 10, 7), 0.5);
    expect(key).toMatch(/^[a-z0-9-]{1,60}$/);
    expect(isOwnPost(key)).toBe(true);
    expect(isOwnPost("piece-cloud")).toBe(false);
    const later = ownPostKey(Date.UTC(2026, 10, 8), 0.1);
    expect(newestFirst([key, later])).toEqual([later, key]);
  });

  it("a copy keeps its price tokens and leaves the original's advice behind", () => {
    const copy = copyOf({ ...piece, note: "انشريه قبل يوم 14" }, "own-x");
    expect(copy.key).toBe("own-x");
    expect(copy.caption).toContain("{price:cloud}");
    expect(copy.label).toBe("{full:cloud}");
    expect(copy.note).toBeUndefined();
    expect(copy.title).toContain("نسخة");
  });

  it("is saved, and its untouched price stays live when it is edited", async () => {
    const device = await opened(openDevice(prices("25 د.ب")));
    let key = "";
    act(() => {
      key = device.result.current.createPost(copyOf(piece, "own-abc")) as string;
    });
    expect(device.result.current.ownKeys).toEqual([key]);
    expect(device.result.current.edits[key].label).toBe("عباية كلاود · 25 د.ب");

    act(() => {
      device.result.current.saveEdit({ ...device.result.current.edits[key], head: "اسم جديد" });
    });
    await waitFor(() => expect(storedRow(key)?.post.head).toBe("اسم جديد"));
    expect(storedRow(key)?.post.label).toBe("{full:cloud}");
    expect(storedRow(key)?.post.caption).toContain("{price:cloud}");

    // The price changed in the store: the post follows, on any device.
    const later = await opened(openDevice(prices("19 د.ب")));
    expect(later.result.current.edits[key].head).toBe("اسم جديد");
    expect(later.result.current.edits[key].label).toBe("عباية كلاود · 19 د.ب");
  });

  it("copying a ready post leaves the ready post as it was", async () => {
    const device = await opened(openDevice(prices("25 د.ب")));
    let key: string | null = null;
    act(() => {
      key = device.result.current.copyPost(livePost(piece, prices("25 د.ب")));
    });
    const row = await stored(key as unknown as string);
    expect(row.post.label).toBe("{full:cloud}");
    expect(storedRow(piece.key)).toBeUndefined();
    expect(device.result.current.ownKeys).toEqual([key]);
  });

  it("is gone when deleted, here and in the record, never back to a blank", async () => {
    const device = await opened(openDevice(prices("25 د.ب")));
    act(() => {
      device.result.current.createPost(copyOf(piece, "own-gone"));
    });
    await stored("own-gone");
    act(() => device.result.current.resetEdit("own-gone"));
    expect(device.result.current.ownKeys).toEqual([]);
    await waitFor(() => expect(storedRow("own-gone")).toBeUndefined());
  });
});

describe("the calendar's record", () => {
  it("is saved beside the posts, read back on another device, and is never taken for a post", async () => {
    const device = await opened(openDevice(prices("25 د.ب")));
    expect(device.result.current.calendar.days).toEqual({});
    act(() => {
      device.result.current.saveCalendar(
        withPosted(device.result.current.calendar, "2026-11-08", true),
      );
    });
    expect(device.result.current.calendar.days["2026-11-08"].posted).toBe(true);
    const row = await stored(CALENDAR_KEY);
    expect((row.post as unknown as { key: string }).key).toBe(CALENDAR_KEY);
    const other = await opened(openDevice(prices("25 د.ب")));
    expect(other.result.current.calendar.days["2026-11-08"].posted).toBe(true);
    expect(other.result.current.edits[CALENDAR_KEY]).toBeUndefined();
    expect(other.result.current.ownKeys).toEqual([]);
  });
});

describe("the starting points", () => {
  it("name only layouts, colours and stickers that exist, and cover every layout", () => {
    const layouts = new Set(STARTERS.map((starter) => starter.post.tpl));
    expect([...layouts].sort()).toEqual(Object.keys(TEMPLATES).sort());
    for (const starter of STARTERS) {
      const post = postFromStarter(starter, "own-x", "cloud");
      expect(TONES[post.tone], starter.id).toBeTruthy();
      for (const sticker of post.stickers) expect(STICKERS[sticker.id]).toBeTruthy();
    }
    expect(new Set(STARTERS.map((s) => s.post.paper).filter(Boolean)).size).toBe(3);
  });

  it("a photo post starts on the store's piece with its live name and price", () => {
    const starter = STARTERS.find((s) => s.id === "piece");
    const post = postFromStarter(starter as (typeof STARTERS)[number], "own-x", "cloud");
    expect(post.photo1).toBe("cloud");
    expect(livePost(post, prices("25 د.ب")).label).toBe("عباية كلاود · 25 د.ب");
  });
});

describe("the Piece card", () => {
  it("has one card per piece on sale, none with a price of its own", () => {
    expect(PIECE_CARDS).toHaveLength(16);
    expect(new Set(PIECE_CARDS.map((card) => card.photo1)).size).toBe(16);
    expect(JSON.stringify(PIECE_CARDS)).not.toMatch(/\d\s*د\.ب/);
    for (const card of PIECE_CARDS) {
      expect(parseRows(card.items).map((row) => row.name)).toEqual([
        "شخصيتها",
        "تناسب",
        "ما تناسب",
      ]);
      expect(card.label).toBe(`{full:${card.photo1}}`);
    }
  });

  it("says the store's own making time, and none when none is written", () => {
    const made = livePost(piece, prices("25 د.ب")).caption;
    expect(made).toContain("خلال 7 أيام");
    expect(made).not.toContain("{");
    const silent = livePost(piece, { ...prices("25 د.ب"), making: "" }).caption;
    expect(silent).not.toContain("{");
    expect(silent).not.toMatch(/\n\n/);
    const ready = PIECE_CARDS.find((card) => card.photo1 === "tayf") as Post;
    expect(ready.caption).not.toContain("{making}");
  });

  it("reads the store's written time through the catalogue", () => {
    expect(catalogueFrom([], [], "BHD", " خلال 7 أيام ").making).toBe("خلال 7 أيام");
    expect(catalogueFrom([], [], "BHD", null).making).toBe("");
  });

  it("choosing another piece changes the name and price together, not the words", () => {
    const photo = { label: "ياقوت", name: "عباية ياقوت", full: "عباية ياقوت · 30 د.ب" };
    const next = withPhoto(piece, "yaqoot", photo, { slot: "photo1" });
    expect(next.head).toBe("عباية ياقوت");
    expect(next.label).toBe("عباية ياقوت · 30 د.ب");
    expect(next.items).toBe(piece.items);
    // The merchant's own photo cannot say what it shows, so the typed name stays.
    const own = withPhoto(piece, "upload-1", { label: "صورتي", upload: true }, { slot: "photo1" });
    expect(own.head).toBe(piece.head);
  });

  it("is not listed once its piece has left the store", () => {
    expect(pieceOnSale(piece, { cloud: {} })).toBe(true);
    expect(pieceOnSale(piece, {})).toBe(false);
    expect(pieceOnSale(POSTS[0], {})).toBe(true);
  });
});

describe("the papers", () => {
  it("are all three looks, in the store's own ending", () => {
    expect(new Set(PAPER_POSTS.map(paperLook))).toEqual(
      new Set(["receipt", "circular", "licence"]),
    );
    expect(JSON.stringify(PAPER_POSTS)).not.toMatch(/(عندج|صديقتج|رخصتج)/);
    expect(paperLook({})).toBe("receipt");
  });

  it("read a row as a name and a value, a line with no colon as words alone", () => {
    expect(parseRows("الفئة: دوام\n\nبدون نقطتين")).toEqual([
      { name: "الفئة", value: "دوام" },
      { name: "", value: "بدون نقطتين" },
    ]);
    expect(parseRows(undefined)).toEqual([]);
  });
});

describe("the plan", () => {
  const rows = PLAN.flatMap((week) => week.rows);

  it("runs every day from 8 November to 19 December on the right weekday", () => {
    expect(rows).toHaveLength(42);
    const day = new Date(Date.UTC(2026, 10, 8));
    const names = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
    for (const row of rows) {
      expect(row[0].startsWith(names[day.getUTCDay()]), row[0]).toBe(true);
      day.setUTCDate(day.getUTCDate() + 1);
    }
  });

  it("every post it calls ready is in the kit, and every reel to film has its brief", () => {
    const titles = POSTS.map((post) => post.title);
    const named = (what: string) =>
      titles.some((title) => what.includes(title)) ||
      POSTS.some((post) => what.includes(post.series.split(":")[0].replace("كاروسيل ", "")));
    for (const [, , what, from] of rows) {
      if (from === "جاهز في العدة" && !what.includes("بالطيب") && !what.includes("تحدي الموقع")) {
        expect(named(what), what).toBe(true);
      }
      if (from === "تصورونه بنفسكم") {
        expect(
          REELS.some((reel) => what.includes(reel.title)),
          what,
        ).toBe(true);
      }
    }
  });

  it("keeps White Friday on its day, and promises no launch that is not decided", () => {
    const friday = rows.find((row) => row[0].startsWith("الجمعة 27"));
    expect(friday?.[2]).toContain("الجمعة البيضاء");
    const sunday = rows.find((row) => row[0].startsWith("الأحد 22"));
    expect(sunday?.[2]).toContain("كرت القطعة: عباية ياقوت");
    expect(sunday?.[2]).toContain("لو قررتوا");
  });
});
