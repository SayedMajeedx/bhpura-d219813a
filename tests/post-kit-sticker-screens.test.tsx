import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { PostKit } from "../src/addons/post-kit/hooks/use-post-kit";
import type { Post } from "../src/addons/post-kit/lib/types";

vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ lang: "ar" }) }));
vi.mock("../src/lib/i18n", () => ({ useI18n: () => ({ lang: "ar" }) }));
vi.mock("../src/addons/post-kit/lib/render", () => ({ renderPost: vi.fn() }));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), dismiss: vi.fn() }),
}));

const memePost: Post = {
  key: "own-meme",
  series: "s",
  title: "ميم",
  tpl: "joke",
  tone: "wine",
  size: "post",
  head: "شلون كنت أفكر",
  caption: "",
  stickers: [{ id: "photo", photo: "upload-1", x: 0.5, y: 0.5, s: 600, r: 0, frame: "none" }],
};

const img = { width: 1000, height: 1000, src: "" } as HTMLImageElement;
const kitOf = (photos: PostKit["photos"]): PostKit =>
  ({
    photos,
    edits: {},
    currentOf: () => memePost,
    saveEdit: vi.fn(),
    resetEdit: vi.fn(),
    copyPost: vi.fn(),
    addUploads: vi.fn(async () => ({ added: [], failed: 0, plainEdge: [] })),
    addSticker: vi.fn(async () => "upload-3"),
    removeUpload: vi.fn(async () => null),
    saveState: "idle",
    retrySave: vi.fn(),
  }) as unknown as PostKit;

async function openMaker(photos: PostKit["photos"]) {
  const { PostMaker } = await import("../src/addons/post-kit/components/PostMaker");
  render(
    <PostMaker postKey="own-meme" kit={kitOf(photos)} onClose={vi.fn()} onOpenCopy={vi.fn()} />,
  );
  const stage = screen.getByLabelText(/معاينة البوست/);
  stage.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 108, height: 135, right: 108, bottom: 135 }) as DOMRect;
  return stage;
}

const withSticker = {
  "upload-1": { label: "ميم", upload: true, img },
  "upload-2": { label: "ستيكري", upload: true, sticker: true, source: "upload-1", img },
};

describe("my stickers", () => {
  it("lists the store's stickers apart from its photos", async () => {
    await openMaker(withSticker);
    expect(screen.getByRole("button", { name: "أضف ستيكر ستيكري" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "اختر صورة ستيكري" })).toBeNull();
    expect(screen.getByRole("button", { name: "اختر صورة ميم" })).toBeInTheDocument();
  }, 20_000);

  it("says where they come from while there are none", async () => {
    await openMaker({ "upload-1": withSticker["upload-1"] });
    expect(screen.getByText(/ما عندكم ستيكرات للحين/)).toBeInTheDocument();
  }, 20_000);

  it("lays one on the post with a thin white edge, its edge then a choice", async () => {
    await openMaker(withSticker);
    fireEvent.click(screen.getByRole("button", { name: "أضف ستيكر ستيكري" }));
    const tools = screen.getByRole("region", { name: /تعديل الصورة/ });
    expect(within(tools).getByRole("button", { name: "ستيكر مقصوص" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(tools).getByRole("button", { name: "رفيعة" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(within(tools).getByRole("button", { name: "كريمي" }));
    expect(within(tools).getByRole("button", { name: "كريمي" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  }, 20_000);
});

describe("taking a background off", () => {
  it("opens from a photo on the post, and from the photo library", async () => {
    const stage = await openMaker(withSticker);
    fireEvent.pointerDown(stage, { pointerId: 1, clientX: 54, clientY: 67 });
    fireEvent.click(screen.getByRole("button", { name: "شيل الخلفية" }));
    const dialog = screen.getByRole("dialog", { name: "شيل الخلفية" });
    // This test's browser cannot read pixels: the dialog says so instead of failing quietly.
    expect(within(dialog).getByRole("alert")).toHaveTextContent(/ما قدرنا نقرا هالصورة/);
    expect(within(dialog).getByRole("button", { name: /احفظه ستيكر/ })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "إلغاء" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "شيل الخلفية من صورة ميم" }));
    expect(screen.getByRole("dialog", { name: "شيل الخلفية" })).toBeInTheDocument();
  }, 20_000);
});
