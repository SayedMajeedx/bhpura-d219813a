import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { POSTS } from "../src/addons/post-kit/content/posts";
import { livePost, type Catalogue } from "../src/addons/post-kit/lib/photos";
import {
  fromStored,
  settleOutbox,
  toStored,
  withRenamedPhotos,
} from "../src/addons/post-kit/lib/stored";
import type { Post } from "../src/addons/post-kit/lib/types";

// The post kit's shared record: what is kept of a post, and the hook that keeps it, run with the
// real data layer against a small in-memory stand-in for the database, shared by two "devices".

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({
  tables: { post_kit_edits: [] as Row[], post_kit_photos: [] as Row[] } as Record<string, Row[]>,
  /** Makes the next writes to a table fail, or a delete quietly touch nothing (a refused one). */
  failWrites: false,
  refuseDeletes: false,
  failReads: false,
  writes: 0,
  seq: 0,
}));

const fakeClient = vi.hoisted(() => {
  const from = (table: string) => {
    const filters: [string, unknown][] = [];
    let op: "select" | "upsert" | "insert" | "delete" = "select";
    let payload: Row[] = [];
    const matches = (row: Row) =>
      filters.every(([column, value]) =>
        Array.isArray(value) ? value.includes(row[column]) : row[column] === value,
      );
    const run = () => {
      const rows = db.tables[table];
      if (op !== "select" && db.failWrites) return { data: null, error: { message: "offline" } };
      if (op === "select") {
        if (db.failReads) return { data: null, error: { message: "offline" } };
        const data = rows.filter(matches);
        return { data, error: null, count: data.length };
      }
      if (op === "delete") {
        if (db.refuseDeletes) return { data: [], error: null };
        const gone = rows.filter(matches);
        db.tables[table] = rows.filter((row) => !matches(row));
        return { data: gone, error: null };
      }
      db.writes += 1;
      const written = payload.map((row) => {
        db.seq += 1;
        const stamped = {
          id: `00000000-0000-4000-8000-${String(db.seq).padStart(12, "0")}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...row,
        };
        if (op === "upsert") {
          db.tables[table] = db.tables[table].filter(
            (old) => !(old.brand_id === row.brand_id && old.post_key === row.post_key),
          );
        }
        db.tables[table].push(stamped);
        return stamped;
      });
      return { data: written, error: null };
    };
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (column: string, value: unknown) => (filters.push([column, value]), chain),
      in: (column: string, value: unknown) => (filters.push([column, value]), chain),
      order: () => chain,
      range: () => chain,
      upsert: (rows: Row[]) => ((op = "upsert"), (payload = rows), chain),
      insert: (row: Row) => ((op = "insert"), (payload = [row]), chain),
      delete: () => ((op = "delete"), chain),
      single: () => {
        const reply = run();
        return Promise.resolve({ ...reply, data: reply.data?.[0] ?? null });
      },
      then: (done: (reply: unknown) => unknown) => Promise.resolve(run()).then(done),
    };
    return chain;
  };
  return { supabase: { from } };
});
vi.mock("@/integrations/supabase/client", () => fakeClient);
vi.mock("../src/integrations/supabase/client", () => fakeClient);

const r2 = vi.hoisted(() => ({
  uploadPublicMedia: vi.fn(),
  deletePublicMediaUrl: vi.fn(async () => undefined),
}));
vi.mock("@/lib/r2-upload", () => r2);
vi.mock("../src/lib/r2-upload", () => r2);

const device = vi.hoisted(() => ({
  oldPhotos: vi.fn(async (): Promise<{ id: string; name: string; blob: Blob }[]> => []),
  forgetOldPhoto: vi.fn(async () => undefined),
}));
vi.mock("../src/addons/post-kit/lib/saved", async (original) => ({
  ...(await original<typeof import("../src/addons/post-kit/lib/saved")>()),
  loadImage: vi.fn(async (src: string) => ({ src })),
  shrinkPhoto: vi.fn(async (file: Blob) => file),
  oldPhotos: device.oldPhotos,
  forgetOldPhoto: device.forgetOldPhoto,
}));

const notes = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), plain: vi.fn() }));
vi.mock("sonner", () => ({
  toast: Object.assign(notes.plain, { success: notes.success, error: notes.error }),
}));
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ lang: "en" }) }));
vi.mock("../src/lib/i18n", () => ({ useI18n: () => ({ lang: "en" }) }));

const { useKitStore } = await import("../src/addons/post-kit/hooks/use-kit-store");

const BRAND = "00000000-0000-4000-8000-0000000000a1";
const priced = POSTS.find((post) => /\{(price|full|from)/.test(post.caption)) as Post;
const plain = POSTS.find((post) => !post.stickers.some((st) => st.photo)) as Post;
const catalogue = (price = "25 د.ب"): Catalogue => ({
  photos: { tie: { label: "ربطة", url: "https://media/x.jpg", full: `عباية ربطة · ${price}` } },
  prices: Object.fromEntries(
    [...priced.caption.matchAll(/\{price:([\w-]+)\}/g)].map((match) => [match[1], price]),
  ),
  from: price,
});

/** One device: its own memory of what it read, the shared database behind it. */
function openDevice(prices: Catalogue = catalogue()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useKitStore(BRAND, prices), { wrapper });
}

const opened = async (device_: ReturnType<typeof openDevice>) => {
  await waitFor(() => expect(device_.result.current.loaded).toBe(true));
  return device_;
};

const editRows = () => db.tables.post_kit_edits as { post_key: string; post: Post }[];

beforeEach(() => {
  cleanup();
  localStorage.clear();
  db.tables.post_kit_edits = [];
  db.tables.post_kit_photos = [];
  db.failWrites = false;
  db.refuseDeletes = false;
  db.failReads = false;
  device.oldPhotos.mockReset();
  device.oldPhotos.mockResolvedValue([]);
  device.forgetOldPhoto.mockClear();
  r2.uploadPublicMedia.mockReset();
  r2.uploadPublicMedia.mockResolvedValue(
    `https://media.boutq.store/brands/${BRAND}/post/abc-1.jpg`,
  );
  r2.deletePublicMediaUrl.mockClear();
  notes.success.mockClear();
  notes.error.mockClear();
  notes.plain.mockClear();
});

describe("what is kept of a post", () => {
  it("keeps today's price out of a post whose words were not touched", () => {
    const edited = {
      ...livePost(priced, catalogue()),
      stickers: [{ id: "eyes", x: 0.5, y: 0.5, s: 100 }],
    };
    const stored = toStored(edited, priced, catalogue());
    expect(stored.caption).toBe(priced.caption);
    // The piece went up: the same edit reads the new price, and the sticker is still there.
    const later = fromStored(stored, priced, catalogue("30 د.ب")) as Post;
    expect(later.caption).toBe(livePost(priced, catalogue("30 د.ب")).caption);
    expect(later.stickers).toHaveLength(1);
  });

  it("keeps what the merchant typed as they typed it", () => {
    const edited = { ...livePost(priced, catalogue()), caption: "كلامي بسعر 20" };
    const later = fromStored(toStored(edited, priced, catalogue()), priced, catalogue("30 د.ب"));
    expect(later?.caption).toBe("كلامي بسعر 20");
  });

  it("lets a chosen piece's label follow that piece's price", () => {
    const template = POSTS.find((post) => post.tpl === "photo") as Post;
    const edited = { ...template, photo1: "tie", label: catalogue().photos.tie.full };
    const stored = toStored(edited, template, catalogue());
    expect(stored.label).toBe("{full:tie}");
    expect(fromStored(stored, template, catalogue("30 د.ب"))?.label).toBe("عباية ربطة · 30 د.ب");
  });

  it("will not draw a row it cannot trust, and drops only the part it does not know", () => {
    expect(fromStored(null, plain, catalogue())).toBeNull();
    expect(fromStored({ ...plain, key: "other" }, plain, catalogue())).toBeNull();
    expect(fromStored({ ...plain, tpl: "gone" }, plain, catalogue())).toBeNull();
    expect(fromStored({ ...plain, tone: "gone" }, plain, catalogue())).toBeNull();
    const kept = fromStored(
      {
        ...plain,
        stickers: [
          { id: "gone", x: 0, y: 0, s: 1 },
          { id: "eyes", x: "a" },
        ],
      },
      plain,
      catalogue(),
    );
    expect(kept?.stickers).toEqual([]);
  });

  it("follows a photo that got a new key, wherever the post uses it", () => {
    const post = withRenamedPhotos(
      {
        ...plain,
        photo1: "upload-1",
        stickers: [{ id: "photo", x: 0, y: 0, s: 1, photo: "upload-1" }],
      },
      { "upload-1": "upload-9" },
    );
    expect(post.photo1).toBe("upload-9");
    expect(post.stickers[0].photo).toBe("upload-9");
  });

  it("lets a waiting change go up only if the post has not moved on since", () => {
    const entry = (at: number) => ({ post: plain, at });
    const rows = [{ post_key: "a", updated_at: "2026-11-05T10:00:00Z" }];
    const noon = new Date("2026-11-05T12:00:00Z").getTime();
    const dawn = new Date("2026-11-05T06:00:00Z").getTime();
    expect(Object.keys(settleOutbox({ a: entry(noon) }, rows).kept)).toEqual(["a"]);
    expect(settleOutbox({ a: entry(dawn) }, rows)).toEqual({ kept: {}, dropped: 1 });
    expect(settleOutbox({ a: entry(0) }, rows).dropped).toBe(1);
    expect(Object.keys(settleOutbox({ b: entry(0) }, rows).kept)).toEqual(["b"]);
  });
});

describe("saving an edit", () => {
  it("reaches another device, and says saved only once it has", async () => {
    const phone = await opened(openDevice());
    expect(phone.result.current.saveState).toBe("idle");
    act(() =>
      phone.result.current.saveEdit({ ...livePost(plain, catalogue()), caption: "من التلفون" }),
    );
    expect(phone.result.current.saveState).toBe("saving");
    expect(phone.result.current.edits[plain.key].caption).toBe("من التلفون");
    expect(editRows()).toEqual([]);

    await waitFor(() => expect(phone.result.current.saveState).toBe("saved"), { timeout: 3000 });
    expect(editRows().map((row) => row.post_key)).toEqual([plain.key]);
    expect(localStorage.getItem(`post-kit-outbox-${BRAND}`)).toBeNull();

    const laptop = await opened(openDevice());
    await waitFor(() => expect(laptop.result.current.edits[plain.key]?.caption).toBe("من التلفون"));
  });

  it("writes a burst of changes as one save", async () => {
    const hook = await opened(openDevice());
    db.writes = 0;
    for (const caption of ["أ", "أب", "أبت"]) {
      act(() => hook.result.current.saveEdit({ ...livePost(plain, catalogue()), caption }));
    }
    await waitFor(() => expect(hook.result.current.saveState).toBe("saved"), { timeout: 3000 });
    expect(db.writes).toBe(1);
    expect(editRows()).toHaveLength(1);
    expect(editRows()[0].post.caption).toBe("أبت");
  });

  it("keeps a change on the device when the save fails, and sends it on the next try", async () => {
    const hook = await opened(openDevice());
    db.failWrites = true;
    act(() =>
      hook.result.current.saveEdit({ ...livePost(plain, catalogue()), caption: "بدون نت" }),
    );
    await waitFor(() => expect(hook.result.current.saveState).toBe("failed"), { timeout: 3000 });
    expect(editRows()).toEqual([]);
    expect(hook.result.current.edits[plain.key].caption).toBe("بدون نت");
    expect(localStorage.getItem(`post-kit-outbox-${BRAND}`)).toContain("بدون نت");

    db.failWrites = false;
    await act(() => hook.result.current.retrySave());
    expect(hook.result.current.saveState).toBe("saved");
    expect(editRows()[0].post.caption).toBe("بدون نت");
  });

  it("keeps the page open when the connection drops after it loaded", async () => {
    const hook = await opened(openDevice());
    db.failWrites = true;
    db.failReads = true;
    act(() => hook.result.current.saveEdit({ ...livePost(plain, catalogue()), caption: "انقطع" }));
    await waitFor(() => expect(hook.result.current.saveState).toBe("failed"), { timeout: 3000 });
    // The read that follows a failed save has failed too by the time this settles.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(hook.result.current.failed).toBe(false);
    expect(hook.result.current.edits[plain.key].caption).toBe("انقطع");
  });

  it("says so when the store's posts could not be read at all", async () => {
    db.failReads = true;
    const hook = openDevice();
    await waitFor(() => expect(hook.result.current.failed).toBe(true));
    expect(hook.result.current.loaded).toBe(false);
  });

  it("sends a change an earlier visit could not, when the page opens again", async () => {
    const first = await opened(openDevice());
    db.failWrites = true;
    act(() =>
      first.result.current.saveEdit({ ...livePost(plain, catalogue()), caption: "من أمس" }),
    );
    await waitFor(() => expect(first.result.current.saveState).toBe("failed"), { timeout: 3000 });
    first.unmount();
    db.failWrites = false;

    const again = await opened(openDevice());
    await waitFor(() => expect(editRows()[0]?.post.caption).toBe("من أمس"));
    expect(again.result.current.edits[plain.key].caption).toBe("من أمس");
  });

  it("does not let a change left on an old phone overwrite what the team did since", async () => {
    localStorage.setItem(
      `post-kit-outbox-${BRAND}`,
      JSON.stringify({ [plain.key]: { post: { ...plain, caption: "قديم" }, at: 1000 } }),
    );
    db.tables.post_kit_edits.push({
      brand_id: BRAND,
      post_key: plain.key,
      post: { ...plain, caption: "جديد" },
      updated_at: "2026-11-05T10:00:00Z",
    });
    const hook = await opened(openDevice());
    await waitFor(() => expect(notes.plain).toHaveBeenCalled());
    expect(hook.result.current.edits[plain.key].caption).toBe("جديد");
    expect(editRows()[0].post.caption).toBe("جديد");
    expect(localStorage.getItem(`post-kit-outbox-${BRAND}`)).toBeNull();
  });

  it("takes a post back to how it came, and removes its row", async () => {
    db.tables.post_kit_edits.push({
      brand_id: BRAND,
      post_key: plain.key,
      post: { ...plain, caption: "معدّل" },
      updated_at: "2026-11-05T10:00:00Z",
    });
    const hook = await opened(openDevice());
    await waitFor(() => expect(hook.result.current.edits[plain.key]).toBeDefined());
    act(() => hook.result.current.resetEdit(plain.key));
    expect(hook.result.current.edits[plain.key]).toBeUndefined();
    await waitFor(() => expect(hook.result.current.saveState).toBe("saved"), { timeout: 3000 });
    expect(editRows()).toEqual([]);
  });

  it("does not call a refused delete saved", async () => {
    db.tables.post_kit_edits.push({
      brand_id: BRAND,
      post_key: plain.key,
      post: { ...plain, caption: "معدّل" },
      updated_at: "2026-11-05T10:00:00Z",
    });
    db.refuseDeletes = true;
    const hook = await opened(openDevice());
    await waitFor(() => expect(hook.result.current.edits[plain.key]).toBeDefined());
    act(() => hook.result.current.resetEdit(plain.key));
    await waitFor(() => expect(hook.result.current.saveState).toBe("failed"), { timeout: 3000 });
  });

  it("removes the row when an edit is undone by hand back to the original", async () => {
    const hook = await opened(openDevice());
    act(() => hook.result.current.saveEdit(livePost(plain, catalogue())));
    await waitFor(() => expect(hook.result.current.saveState).toBe("saved"), { timeout: 3000 });
    expect(editRows()).toEqual([]);
    expect(hook.result.current.edits[plain.key]).toBeUndefined();
  });

  it("opens with no edit for a stored post it cannot draw", async () => {
    db.tables.post_kit_edits.push(
      {
        brand_id: BRAND,
        post_key: plain.key,
        post: { key: plain.key, tpl: "gone" },
        updated_at: "2026-11-05T10:00:00Z",
      },
      {
        brand_id: BRAND,
        post_key: "post-that-left",
        post: { key: "post-that-left" },
        updated_at: "2026-11-05T10:00:00Z",
      },
    );
    const hook = await opened(openDevice());
    expect(hook.result.current.edits).toEqual({});
    expect(hook.result.current.failed).toBe(false);
  });
});

describe("what this device kept before the shared record", () => {
  const oldEdit = (photo: string) => ({
    [plain.key]: { ...livePost(plain, catalogue()), photo1: photo, caption: "من الجهاز" },
  });

  it("moves up once: photos first, its edits renamed to follow, then cleared", async () => {
    const blob = new Blob(["x"], { type: "image/jpeg" });
    localStorage.setItem(`post-kit-edits-${BRAND}`, JSON.stringify(oldEdit("upload-old")));
    device.oldPhotos.mockResolvedValue([{ id: "old", name: "صورتي", blob }]);

    await opened(openDevice());
    await waitFor(() => expect(editRows()).toHaveLength(1), { timeout: 3000 });
    const [row] = db.tables.post_kit_photos as { id: string; name: string }[];
    expect(row.name).toBe("صورتي");
    expect(editRows()[0].post.photo1).toBe(`upload-${row.id}`);
    expect(device.forgetOldPhoto).toHaveBeenCalledWith(BRAND, "old");
    expect(localStorage.getItem(`post-kit-edits-${BRAND}`)).toBeNull();
    expect(notes.success).toHaveBeenCalledTimes(1);
  });

  it("holds the edits back while a photo they may name could not go, and says so", async () => {
    const blob = new Blob(["x"], { type: "image/jpeg" });
    localStorage.setItem(`post-kit-edits-${BRAND}`, JSON.stringify(oldEdit("upload-old")));
    device.oldPhotos.mockResolvedValue([{ id: "old", name: "صورتي", blob }]);
    r2.uploadPublicMedia.mockRejectedValue(new Error("offline"));

    await opened(openDevice());
    await waitFor(() => expect(notes.error).toHaveBeenCalled());
    expect(editRows()).toEqual([]);
    expect(device.forgetOldPhoto).not.toHaveBeenCalled();
    expect(localStorage.getItem(`post-kit-edits-${BRAND}`)).toContain("من الجهاز");
  });

  it("leaves a post the team already edited as the team left it", async () => {
    localStorage.setItem(`post-kit-edits-${BRAND}`, JSON.stringify(oldEdit("tie")));
    db.tables.post_kit_edits.push({
      brand_id: BRAND,
      post_key: plain.key,
      post: { ...plain, caption: "من الفريق" },
      updated_at: "2026-11-05T10:00:00Z",
    });
    await opened(openDevice());
    await waitFor(() => expect(notes.plain).toHaveBeenCalled());
    expect(editRows()[0].post.caption).toBe("من الفريق");
    expect(localStorage.getItem(`post-kit-edits-${BRAND}`)).toBeNull();
  });

  it("asks nothing of a store with nothing kept on the device", async () => {
    await opened(openDevice());
    expect(notes.success).not.toHaveBeenCalled();
    expect(notes.error).not.toHaveBeenCalled();
    expect(r2.uploadPublicMedia).not.toHaveBeenCalled();
  });
});

describe("the merchant's own photos", () => {
  const file = new File(["x"], "صورة العيد.jpeg", { type: "image/jpeg" });

  it("go to the store's post folder and show on every device", async () => {
    const hook = await opened(openDevice());
    let answer = { added: [] as string[], failed: 0 };
    await act(async () => {
      answer = await hook.result.current.addUploads([file]);
    });
    expect(r2.uploadPublicMedia).toHaveBeenCalledWith(BRAND, file, "post");
    expect(answer.failed).toBe(0);
    await waitFor(() =>
      expect(hook.result.current.ownPhotos[answer.added[0]]?.label).toBe("صورة العيد"),
    );

    const other = await opened(openDevice());
    expect(other.result.current.ownPhotos[answer.added[0]]?.upload).toBe(true);
  });

  it("say which did not go, and leave no file behind a row that was refused", async () => {
    const hook = await opened(openDevice());
    db.failWrites = true;
    let answer = { added: [] as string[], failed: 0 };
    await act(async () => {
      answer = await hook.result.current.addUploads([file]);
    });
    expect(answer).toEqual({ added: [], failed: 1 });
    expect(r2.deletePublicMediaUrl).toHaveBeenCalledTimes(1);
  });

  it("leave a post using them with the fallback once deleted, and the file goes", async () => {
    const hook = await opened(openDevice());
    let key = "";
    await act(async () => {
      key = (await hook.result.current.addUploads([file])).added[0];
    });
    act(() => hook.result.current.saveEdit({ ...livePost(plain, catalogue()), photo1: key }));
    await waitFor(() => expect(hook.result.current.saveState).toBe("saved"), { timeout: 3000 });

    await act(async () => {
      expect(await hook.result.current.removeUpload(key, "tie")).toEqual({ fallback: "tie" });
    });
    expect(db.tables.post_kit_photos).toEqual([]);
    expect(r2.deletePublicMediaUrl).toHaveBeenCalledTimes(1);
    expect(hook.result.current.edits[plain.key].photo1).toBe("tie");
    await waitFor(() => expect(editRows()[0].post.photo1).toBe("tie"), { timeout: 3000 });
  });

  it("stay, file and all, when the delete was refused", async () => {
    const hook = await opened(openDevice());
    let key = "";
    await act(async () => {
      key = (await hook.result.current.addUploads([file])).added[0];
    });
    db.refuseDeletes = true;
    await act(async () => {
      expect(await hook.result.current.removeUpload(key, "tie")).toBeNull();
    });
    expect(db.tables.post_kit_photos).toHaveLength(1);
    expect(r2.deletePublicMediaUrl).not.toHaveBeenCalled();
  });
});
