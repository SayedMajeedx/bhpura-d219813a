import { describe, expect, it } from "vitest";
import {
  SESSION_MAX_AGE_MS,
  clearSession,
  loadSession,
  saveSession,
} from "../src/features/instagram-import/lib/session-store";
import type { MergeableDraft } from "../src/features/instagram-import/lib/merge-drafts";

// An import in review is kept in the browser so closing the window does not lose the work.

class MemoryStorage {
  data = new Map<string, string>();
  fullAfter = Infinity;
  getItem = (key: string) => this.data.get(key) ?? null;
  setItem = (key: string, value: string) => {
    if (this.data.size >= this.fullAfter && !this.data.has(key))
      throw new Error("QuotaExceededError");
    this.data.set(key, value);
  };
  removeItem = (key: string) => void this.data.delete(key);
}
const memory = () => new MemoryStorage();
const asStorage = (m: MemoryStorage) => m as unknown as Storage;

const draft = (id: string, over: Partial<MergeableDraft> = {}): MergeableDraft => ({
  id,
  url: `https://instagram.com/p/${id}/`,
  isSoldOut: false,
  postType: "image",
  images: [
    {
      url: `${id}.jpg`,
      r2Url: `https://r2.test/${id}.jpg`,
      isCover: true,
      selected: true,
      status: "success",
    },
  ],
  coverImageUrl: `https://r2.test/${id}.jpg`,
  imageUploadStatus: "all_success",
  title: `عباية ${id}`,
  price: 28,
  description: "",
  sizes: ["52"],
  colors: [],
  category: "عبايات",
  fieldConfidence: { name: 1, price: 1, description: 0, sizes: 0 },
  fieldSources: { name: "ai", price: "manual", description: "ai", sizes: "ai", category: "ai" },
  issues: [],
  ...over,
});

const NOW = 1_800_000_000_000;
const BRAND = "brand-1";

describe("the kept import", () => {
  it("is read back as it was saved, merged products and all", () => {
    const store = memory();
    const merged = draft("a", {
      mergedPostIds: ["b", "c"],
      mergedFrom: [draft("a"), draft("b"), draft("c")],
    });
    expect(
      saveSession(
        BRAND,
        { username: "abaya.zh", drafts: [merged, draft("d")] },
        NOW,
        asStorage(store),
      ),
    ).toBe(true);
    const loaded = loadSession(BRAND, NOW + 1000, asStorage(store));
    expect(loaded?.username).toBe("abaya.zh");
    expect(loaded?.savedAt).toBe(NOW);
    expect(loaded?.drafts.map((d) => d.id)).toEqual(["a", "d"]);
    expect(loaded?.drafts[0].mergedPostIds).toEqual(["b", "c"]);
    expect(loaded?.drafts[0].mergedFrom?.map((d) => d.id)).toEqual(["a", "b", "c"]);
    expect(loaded?.drafts[0].title).toBe("عباية a");
  });

  it("keeps one import per brand", () => {
    const store = memory();
    saveSession("brand-1", { username: "one", drafts: [draft("a")] }, NOW, asStorage(store));
    saveSession("brand-2", { username: "two", drafts: [draft("b")] }, NOW, asStorage(store));
    expect(loadSession("brand-1", NOW, asStorage(store))?.username).toBe("one");
    expect(loadSession("brand-2", NOW, asStorage(store))?.username).toBe("two");
    clearSession("brand-1", asStorage(store));
    expect(loadSession("brand-1", NOW, asStorage(store))).toBeNull();
    expect(loadSession("brand-2", NOW, asStorage(store))).not.toBeNull();
  });

  it("is forgotten after two weeks, and when it has no drafts", () => {
    const store = memory();
    saveSession(BRAND, { username: "x", drafts: [draft("a")] }, NOW, asStorage(store));
    expect(loadSession(BRAND, NOW + SESSION_MAX_AGE_MS - 1, asStorage(store))).not.toBeNull();
    expect(loadSession(BRAND, NOW + SESSION_MAX_AGE_MS + 1, asStorage(store))).toBeNull();
    expect(store.data.size).toBe(0);
    saveSession(BRAND, { username: "x", drafts: [] }, NOW, asStorage(store));
    expect(loadSession(BRAND, NOW, asStorage(store))).toBeNull();
  });

  it("drops damaged data instead of failing", () => {
    const store = memory();
    store.setItem("boutq.instagram-import.session.brand-1", "{not json");
    expect(loadSession(BRAND, NOW, asStorage(store))).toBeNull();
    expect(store.data.size).toBe(0);
    store.setItem(
      "boutq.instagram-import.session.brand-1",
      JSON.stringify({ version: 1, savedAt: NOW, username: "x", drafts: [{ id: 5 }] }),
    );
    expect(loadSession(BRAND, NOW, asStorage(store))).toBeNull();
    store.setItem(
      "boutq.instagram-import.session.brand-1",
      JSON.stringify({ version: 99, savedAt: NOW, username: "x", drafts: [] }),
    );
    expect(loadSession(BRAND, NOW, asStorage(store))).toBeNull();
  });

  it("says so, and does not throw, when it cannot be kept", () => {
    const full = memory();
    full.fullAfter = 0;
    expect(saveSession(BRAND, { username: "x", drafts: [draft("a")] }, NOW, asStorage(full))).toBe(
      false,
    );
    expect(saveSession(BRAND, { username: "x", drafts: [draft("a")] }, NOW, null)).toBe(false);
    expect(loadSession(BRAND, NOW, null)).toBeNull();
    const huge = [draft("a", { description: "x".repeat(4_000_000) })];
    expect(saveSession(BRAND, { username: "x", drafts: huge }, NOW, asStorage(memory()))).toBe(
      false,
    );
    expect(() => clearSession(BRAND, null)).not.toThrow();
  });
});
