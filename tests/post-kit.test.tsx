import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { POSTS } from "../src/addons/post-kit/content/posts";
import { PLAN, REELS } from "../src/addons/post-kit/content/plan";
import {
  catalogueFrom,
  livePost,
  postPrice,
  productKey,
  type KitProduct,
  type KitVariant,
} from "../src/addons/post-kit/lib/photos";
import {
  cropOf,
  newSticker,
  photoNotes,
  stickerAt,
  withCrop,
  withoutPhoto,
  withPhoto,
} from "../src/addons/post-kit/lib/post-rules";
import { parseMarks, wrap } from "../src/addons/post-kit/lib/text";
import { STICKERS } from "../src/addons/post-kit/lib/stickers";
import { TEMPLATES } from "../src/addons/post-kit/lib/layouts";
import { TONES } from "../src/addons/post-kit/lib/tones";
import type { Post } from "../src/addons/post-kit/lib/types";
import { postKitManifest } from "../src/addons/post-kit/manifest";

const product = (id: string, ar: string, en: string, price: number, extra = {}): KitProduct =>
  ({
    id,
    name_ar: ar,
    name_en: en,
    name: en,
    image_url: `https://media.boutq.store/${id}.jpg`,
    base_price: price,
    is_active: true,
    ...extra,
  }) as KitProduct;
const variant = (id: string, productId: string, price: number): KitVariant =>
  ({ id, product_id: productId, selling_price: price, stock_main: 4 }) as unknown as KitVariant;

const blazer = product("p1", "عباية | بليزر جديد", "Abaya | New Blazer", 25);
const tie = product("p2", "عباية | ربطة", "Abaya | Tie", 22);
const catalogue = catalogueFrom(
  [blazer, tie],
  [variant("v1", "p1", 25), variant("v2", "p2", 22)],
  "BHD",
);

const postOf = (over: Partial<Post> = {}): Post => ({
  key: "k",
  series: "s",
  title: "t",
  tpl: "photo",
  tone: "wine",
  size: "post",
  caption: "",
  stickers: [],
  ...over,
});

describe("the ready posts are sound", () => {
  it("name only layouts, colours and stickers that exist, with unique keys", () => {
    expect(new Set(POSTS.map((post) => post.key)).size).toBe(POSTS.length);
    for (const post of POSTS) {
      expect(TEMPLATES[post.tpl], post.key).toBeTruthy();
      expect(TONES[post.tone], post.key).toBeTruthy();
      for (const sticker of post.stickers) expect(STICKERS[sticker.id], sticker.id).toBeTruthy();
    }
  });

  it("never write a price by hand: it is read from the store", () => {
    const words = JSON.stringify(POSTS);
    expect(words).not.toMatch(/\d\s*د\.ب/);
    expect(words).toContain("{price:new-blazer}");
    expect(words).toContain("{full:half-bisht}");
  });

  it("address a woman with the store's own ending", () => {
    const words = JSON.stringify([POSTS, REELS, PLAN]);
    for (const old of ["عندج", "عبايتج", "صديقتج", "بالج", "طلبج", "زوجج", "راسج", "نتحداج"]) {
      expect(words, old).not.toContain(old);
    }
    // The word for a husband and a neighbourhood end in the same letter and stay.
    expect(words).toContain("الزوج");
    expect(words).toContain("فريج");
  });

  it("every plan row and reel has its words", () => {
    expect(REELS.length).toBeGreaterThan(0);
    for (const row of PLAN.flatMap((week) => week.rows)) expect(row).toHaveLength(3);
  });
});

describe("the catalogue the posts read", () => {
  it("keys a piece by its English name, not its price", () => {
    expect(productKey(blazer)).toBe("new-blazer");
    expect(productKey({ id: "x", name_en: null })).toBe("x");
  });

  it("writes a price the way a post does, with no empty decimals", () => {
    expect(postPrice(25, "BHD")).toBe("25 د.ب");
    expect(postPrice(24.5, "BHD")).toBe("24.5 د.ب");
  });

  it("fills a post with today's price, so a changed price is never stale", () => {
    const cheaper = catalogueFrom([blazer], [variant("v1", "p1", 19)], "BHD");
    const post = postOf({ label: "{full:new-blazer}", caption: "بليزر ({price:new-blazer})" });
    expect(livePost(post, cheaper).label).toBe("عباية بليزر جديد · 19 د.ب");
    expect(livePost(post, cheaper).caption).toBe("بليزر (19 د.ب)");
  });

  it("says the lowest price for 'from' and leaves out hidden and pictureless pieces", () => {
    expect(catalogue.from).toBe("22 د.ب");
    const book = catalogueFrom(
      [
        blazer,
        product("p3", "عباية | مخفية", "Abaya | Hidden", 5, { is_active: false }),
        product("p4", "عباية | بدون", "Abaya | None", 5, { image_url: null, media: [] }),
      ],
      [variant("v1", "p1", 25)],
      "BHD",
    );
    expect(Object.keys(book.photos)).toEqual(["new-blazer"]);
  });

  it("a word for a piece that left the store leaves nothing behind", () => {
    const post = postOf({ caption: "بسعر {price:gone} فقط" });
    expect(livePost(post, catalogue).caption).toBe("بسعر فقط");
  });
});

describe("putting a photo on a post", () => {
  const blazerPhoto = catalogue.photos["new-blazer"];

  it("changes the piece and its label together", () => {
    const next = withPhoto(postOf({ label: "old" }), "new-blazer", blazerPhoto, { slot: "photo1" });
    expect(next.photo1).toBe("new-blazer");
    expect(next.label).toBe("عباية بليزر جديد · 25 د.ب");
  });

  it("leaves the label empty for the merchant's own photo: no one can say what it shows", () => {
    const next = withPhoto(
      postOf({ label: "عباية ربطة · 22 د.ب" }),
      "upload-1",
      { label: "mine", upload: true },
      { slot: "photo1" },
    );
    expect(next.label).toBe("");
  });

  it("changes one side of a poll", () => {
    const poll = postOf({ tpl: "poll", photo1: "a", photo2: "b", labelA: "A", labelB: "B" });
    const next = withPhoto(poll, "new-blazer", blazerPhoto, { slot: "photo2" });
    expect([next.photo1, next.photo2, next.labelA, next.labelB]).toEqual([
      "a",
      "new-blazer",
      "A",
      "بليزر جديد",
    ]);
  });

  it("lays it on top of a layout with no photo, and replaces a selected print", () => {
    const joke = postOf({ tpl: "joke" });
    const added = withPhoto(joke, "new-blazer", blazerPhoto, { slot: "photo1" });
    expect(added.stickers[0]).toMatchObject({ id: "photo", photo: "new-blazer" });
    const swapped = withPhoto(added, "tie", catalogue.photos.tie, { slot: "photo1", selected: 0 });
    expect(swapped.stickers).toHaveLength(1);
    expect(swapped.stickers[0].photo).toBe("tie");
  });

  it("says what to check after a swap, and forgets the crop of the old photo", () => {
    const post = postOf({
      photo1: "tie",
      caption: "عباية ربطة حلوة",
      crop: { photo1: { z: 2 } },
      stickers: [{ id: "eyes", x: 0.5, y: 0.5, s: 100 }],
    });
    expect(photoNotes(post, "photo1", catalogue.photos)).toEqual(["caption", "eyes"]);
    expect(withPhoto(post, "new-blazer", blazerPhoto, { slot: "photo1" }).crop?.photo1).toBe(
      undefined,
    );
  });

  it("keeps a slot filled and drops a print when a photo is deleted", () => {
    const post = postOf({
      photo1: "upload-1",
      stickers: [{ id: "photo", photo: "upload-1", x: 0, y: 0, s: 1 }],
    });
    const next = withoutPhoto(post, "upload-1", "tie");
    expect(next.photo1).toBe("tie");
    expect(next.stickers).toEqual([]);
  });

  it("crops a slot and a print apart", () => {
    const post = postOf({
      photo1: "tie",
      focus: 0.3,
      stickers: [{ id: "photo", photo: "tie", x: 0, y: 0, s: 1 }],
    });
    expect(cropOf(post, "photo1")).toEqual({ z: 1, fx: 0.5, fy: 0.3 });
    const zoomed = withCrop(post, "photo1", { z: 2 });
    expect(cropOf(zoomed, "photo1").z).toBe(2);
    const print = withCrop(post, "photo1", { z: 3 }, 0);
    expect(print.stickers[0].crop?.z).toBe(3);
    expect(print.crop).toBe(undefined);
  });
});

describe("stickers on a post", () => {
  it("adds a stitched scene large and a sticker small", () => {
    expect(newSticker("scene-owl").s).toBeGreaterThan(newSticker("eyes").s);
  });

  it("finds the topmost sticker under a point", () => {
    const post = postOf({
      stickers: [
        { id: "eyes", x: 0.5, y: 0.5, s: 400 },
        { id: "bag", x: 0.5, y: 0.5, s: 200 },
      ],
    });
    expect(stickerAt(post, 0.5, 0.5, 1080, 1350)).toBe(1);
    expect(stickerAt(post, 0.5, 0.62, 1080, 1350)).toBe(0);
    expect(stickerAt(post, 0.05, 0.05, 1080, 1350)).toBe(-1);
  });
});

describe("reading Arabic with English inside it", () => {
  const ctx = { measureText: (t: string) => ({ width: t.length * 10 }), font: "700 40px x" };

  it("keeps an English run together and in its own order", () => {
    expect(parseMarks("عندها Small business كبير")[0].map((token) => token.t)).toEqual([
      "عندها",
      "Small business",
      "كبير",
    ]);
  });

  it("marks what sits between asterisks", () => {
    const tokens = parseMarks("كل *شي حلو* هني")[0];
    expect(tokens.map((token) => token.mark)).toEqual([false, true, true, false]);
  });

  it("keeps a marked phrase on one line while it fits", () => {
    const { lines } = wrap(ctx as unknown as CanvasRenderingContext2D, "ااااا *بببب تتتت*", 110);
    expect(lines.map((line) => line.tokens.map((token) => token.t).join(" "))).toEqual([
      "ااااا",
      "بببب تتتت",
    ]);
  });
});

describe("the add-on is private", () => {
  it("asks to be private and adds no menu item of its own", () => {
    expect(postKitManifest.private).toBe(true);
    expect(postKitManifest.contributions.navItems).toBe(undefined);
    expect(postKitManifest.activities).toEqual([]);
  });
});

/* ---------- the page, with its data mocked ---------- */
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  Link: ({ children }: { children: React.ReactNode }) => <a href="#studio">{children}</a>,
  Navigate: ({ to }: { to: string }) => <p>redirected to {to}</p>,
}));
const addonsState = vi.hoisted(() => ({ rows: [] as { addon_id: string; status: string }[] }));
vi.mock("@/components/addons/AddonsProvider", () => ({
  useAddons: () => ({ addons: addonsState.rows, isLoading: false }),
}));
vi.mock("../src/components/addons/AddonsProvider", () => ({
  useAddons: () => ({ addons: addonsState.rows, isLoading: false }),
}));
const kitState = vi.hoisted(() => ({ edit: vi.fn(), reset: vi.fn() }));
vi.mock("../src/addons/post-kit/hooks/use-post-kit", () => ({
  usePostKit: () => ({
    brand: { slug: "store", id: "b" },
    ready: true,
    failed: false,
    photos: {},
    edits: {},
    currentOf: (key: string) => POSTS.find((post) => post.key === key),
    saveEdit: kitState.edit,
    resetEdit: kitState.reset,
    addUploads: vi.fn(),
    removeUpload: vi.fn(),
  }),
}));
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ lang: "ar" }) }));
vi.mock("../src/lib/i18n", () => ({ useI18n: () => ({ lang: "ar" }) }));
vi.mock("../src/addons/post-kit/lib/render", () => ({ renderPost: vi.fn() }));

describe("the page", () => {
  it("sends a store without the add-on back to the studio, however it got there", async () => {
    addonsState.rows = [];
    const { default: PostKitPage } = await import("../src/addons/post-kit/components/PostKitPage");
    render(<PostKitPage slug="store" />);
    expect(screen.getByText(/redirected to/)).toBeInTheDocument();
    expect(screen.queryByText("عدّة البوستات")).toBeNull();
  });

  it("lists the posts for a store that has it, and opens one to edit", async () => {
    addonsState.rows = [{ addon_id: "post-kit", status: "installed" }];
    const { default: PostKitPage } = await import("../src/addons/post-kit/components/PostKitPage");
    render(<PostKitPage slug="store" />);
    expect(screen.getByRole("img", { name: POSTS[0].title })).toBeInTheDocument();
    const edits = screen.getAllByRole("button", { name: /عدّل/ });
    expect(edits).toHaveLength(POSTS.length);
    fireEvent.click(edits[0]);
    expect(screen.getByRole("button", { name: /رجوع للبوستات/ })).toBeInTheDocument();
    expect(screen.getByLabelText("العنوان")).toHaveValue(POSTS[0].head);
  });
});
