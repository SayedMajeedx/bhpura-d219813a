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

const kitOf = (): PostKit =>
  ({
    photos: {
      "upload-1": {
        label: "ميم",
        upload: true,
        img: { width: 1000, height: 1000, src: "" } as HTMLImageElement,
      },
    },
    edits: {},
    currentOf: () => memePost,
    saveEdit: vi.fn(),
    resetEdit: vi.fn(),
    copyPost: vi.fn(),
    addUploads: vi.fn(async () => ({ added: [], failed: 0 })),
    removeUpload: vi.fn(async () => null),
    saveState: "idle",
    retrySave: vi.fn(),
  }) as unknown as PostKit;

async function openMaker() {
  const { PostMaker } = await import("../src/addons/post-kit/components/PostMaker");
  render(<PostMaker postKey="own-meme" kit={kitOf()} onClose={vi.fn()} onOpenCopy={vi.fn()} />);
  const stage = screen.getByLabelText(/معاينة البوست/);
  stage.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 108, height: 135, right: 108, bottom: 135 }) as DOMRect;
  return stage;
}

describe("a photo's tools sit under the post", () => {
  it("shows its size, frame and layer as soon as it is tapped", async () => {
    const stage = await openMaker();
    expect(screen.queryByRole("region", { name: /تعديل الصورة/ })).toBeNull();

    fireEvent.pointerDown(stage, { pointerId: 1, clientX: 54, clientY: 67 });
    const tools = screen.getByRole("region", { name: /تعديل الصورة/ });
    expect(within(tools).getByLabelText("الحجم")).toBeInTheDocument();
    expect(within(tools).getByRole("button", { name: "بدون إطار" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.click(within(tools).getByRole("button", { name: "شريط لاصق" }));
    expect(within(tools).getByRole("button", { name: "شريط لاصق" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  }, 20_000);

  it("removes it, and brings it back with undo", async () => {
    const stage = await openMaker();
    fireEvent.pointerDown(stage, { pointerId: 1, clientX: 54, clientY: 67 });
    fireEvent.click(screen.getByRole("button", { name: "احذف" }));
    expect(screen.queryByRole("region", { name: /تعديل الصورة/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "تراجع" }));
    fireEvent.pointerDown(stage, { pointerId: 2, clientX: 54, clientY: 67 });
    expect(screen.getByRole("region", { name: /تعديل الصورة/ })).toBeInTheDocument();
  }, 20_000);

  it("misses the photo outside its own shape", async () => {
    const stage = await openMaker();
    // The photo is 600 of 1080 wide: a tap near the post's edge is not on it.
    fireEvent.pointerDown(stage, { pointerId: 1, clientX: 5, clientY: 67 });
    expect(screen.queryByRole("region", { name: /تعديل الصورة/ })).toBeNull();
  }, 20_000);
});
