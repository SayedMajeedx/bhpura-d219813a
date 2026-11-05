import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { POSTS } from "../src/addons/post-kit/content/posts";
import { VIDEO_REELS } from "../src/addons/post-kit/content/plan";
import {
  asReelFrame,
  reelDuration,
  reelFrameAt,
  reelTemplate,
  reelZoom,
  type ReelScene,
} from "../src/addons/post-kit/lib/reels";
import type { Post } from "../src/addons/post-kit/lib/types";

// A reel with no filming: which frame plays when, and the card that makes the video. Encoding
// itself is the studio's engine, which a test browser cannot run; the rest runs for real.

const engine = vi.hoisted(() => ({
  canExportMp4: vi.fn(async () => true),
  exportTemplateMp4: vi.fn(),
}));
vi.mock("@/features/content-studio/engine/export", () => engine);
vi.mock("../src/features/content-studio/engine/export", () => engine);

const delivery = vi.hoisted(() => ({
  deliverCreativeFile: vi.fn(async () => "downloaded" as string),
}));
vi.mock("../src/lib/creative-export", async (original) => ({
  ...(await original<typeof import("../src/lib/creative-export")>()),
  ...delivery,
}));

const notes = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), notes) }));
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ lang: "en" }) }));
vi.mock("../src/lib/i18n", () => ({ useI18n: () => ({ lang: "en" }) }));

const drawn = vi.hoisted(() => ({ renderPost: vi.fn() }));
vi.mock("../src/addons/post-kit/lib/render", () => drawn);
vi.mock("../src/addons/post-kit/components/PostKitPage", () => ({ copyWords: vi.fn() }));

const { VideoReelCard } = await import("../src/addons/post-kit/components/VideoReelCard");

const reel = VIDEO_REELS[0];
const kitWith = (edit: (post: Post) => Post = (post) => post) =>
  ({
    brand: { slug: "store", id: "b" },
    photos: {},
    edits: {},
    currentOf: (key: string) => edit(POSTS.find((post) => post.key === key) as Post),
  }) as never;

const setPointer = (coarse: boolean, canShare: boolean) => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: coarse })),
  );
  Object.defineProperty(navigator, "share", {
    configurable: true,
    value: canShare ? vi.fn() : undefined,
  });
};

beforeEach(() => {
  cleanup();
  engine.canExportMp4.mockReset();
  engine.canExportMp4.mockResolvedValue(true);
  engine.exportTemplateMp4.mockReset();
  engine.exportTemplateMp4.mockResolvedValue(new Blob(["mp4"], { type: "video/mp4" }));
  delivery.deliverCreativeFile.mockClear();
  drawn.renderPost.mockClear();
  notes.success.mockClear();
  notes.error.mockClear();
  setPointer(false, false);
});

describe("a reel's timing", () => {
  it("names only posts the kit has, each tall and held for a real time", () => {
    for (const { frames } of VIDEO_REELS) {
      for (const frame of frames) {
        expect(POSTS.some((post) => post.key === frame.post)).toBe(true);
        expect(frame.seconds).toBeGreaterThan(0);
      }
    }
  });

  it("plays each frame for its own time, and the last holds at the end", () => {
    expect(reelDuration(reel)).toBe(8);
    expect(reelFrameAt(reel, 0)?.index).toBe(0);
    expect(reelFrameAt(reel, 2.99)?.index).toBe(0);
    expect(reelFrameAt(reel, 3)?.index).toBe(1);
    expect(reelFrameAt(reel, 3.5)?.sinceCut).toBeCloseTo(0.5);
    expect(reelFrameAt(reel, 99)?.index).toBe(1);
  });

  it("opens whole, lands the cut with a punch, and never leaves an edge showing", () => {
    expect(reelZoom(reel, 0)).toBe(1);
    expect(reelZoom(reel, 3)).toBeGreaterThan(1.04);
    expect(reelZoom(reel, 3)).toBeGreaterThan(reelZoom(reel, 3.6));
    for (let t = 0; t <= 8; t += 0.1) {
      expect(reelZoom(reel, t)).toBeGreaterThanOrEqual(1);
    }
  });

  it("draws the frame due at that moment, covering the video, the same every time", () => {
    const template = reelTemplate(reel);
    expect(template.duration).toBe(8);
    const scene = {
      width: 1080,
      height: 1920,
      media: null,
      shots: ["first", "second"],
    } as unknown as ReelScene;
    const drawImage = vi.fn();
    const ctx = { drawImage } as unknown as CanvasRenderingContext2D;

    template.render(ctx, 1, scene);
    template.render(ctx, 5, scene);
    template.render(ctx, 5, scene);
    expect(drawImage.mock.calls.map((call) => call[0])).toEqual(["first", "second", "second"]);
    expect(drawImage.mock.calls[2]).toEqual(drawImage.mock.calls[1]);
    const [, x, y, w, h] = drawImage.mock.calls[1];
    expect(x).toBeLessThanOrEqual(0);
    expect(y).toBeLessThanOrEqual(0);
    expect(x + w).toBeGreaterThanOrEqual(1080);
    expect(y + h).toBeGreaterThanOrEqual(1920);
  });

  it("draws a frame tall even if its post was switched to another size in the maker", () => {
    const post = POSTS.find((item) => item.key === reel.frames[0].post) as Post;
    expect(asReelFrame({ ...post, size: "post" }).size).toBe("story");
  });
});

describe("the reel's card", () => {
  const press = () => fireEvent.click(screen.getByRole("button", { name: "Make the video" }));
  const enabled = () =>
    waitFor(() => expect(screen.getByRole("button", { name: "Make the video" })).toBeEnabled());

  it("makes the video from the posts as the store left them, and downloads it", async () => {
    const edited = (post: Post) => ({ ...post, head: `edited ${post.key}` });
    render(<VideoReelCard reel={reel} kit={kitWith(edited)} onEdit={vi.fn()} />);
    await enabled();
    drawn.renderPost.mockClear();
    press();
    await waitFor(() => expect(delivery.deliverCreativeFile).toHaveBeenCalledTimes(1));

    const heads = drawn.renderPost.mock.calls.slice(0, 2).map((call) => call[1].head);
    expect(heads).toEqual(["edited kind-1", "edited kind-2"]);
    const { template, scene } = engine.exportTemplateMp4.mock.calls[0][0];
    expect(template.duration).toBe(8);
    expect(scene).toMatchObject({ width: 1080, height: 1920 });
    expect(scene.shots).toHaveLength(2);
    expect(delivery.deliverCreativeFile).toHaveBeenCalledWith(
      expect.any(Blob),
      "store-bel-tayyeb.mp4",
      "video/mp4",
      reel.title,
    );
    expect(notes.success).toHaveBeenCalledWith("Video ready");
  });

  it("shows how far it has got, and can be stopped with nothing delivered", async () => {
    let signal: AbortSignal | undefined;
    let report: (fraction: number) => void = () => undefined;
    engine.exportTemplateMp4.mockImplementation(
      (args: { signal: AbortSignal; onProgress: (fraction: number) => void }) =>
        new Promise((_resolve, reject) => {
          signal = args.signal;
          report = args.onProgress;
          args.signal.addEventListener("abort", () =>
            reject(new DOMException("Export cancelled", "AbortError")),
          );
        }),
    );
    render(<VideoReelCard reel={reel} kit={kitWith()} onEdit={vi.fn()} />);
    await enabled();
    press();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("0%"));
    act(() => report(0.42));
    expect(screen.getByRole("status")).toHaveTextContent("42%");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await enabled();
    expect(signal?.aborted).toBe(true);
    expect(delivery.deliverCreativeFile).not.toHaveBeenCalled();
    expect(notes.error).not.toHaveBeenCalled();
  });

  it("says so when the video could not be made, and lets it be tried again", async () => {
    engine.exportTemplateMp4.mockRejectedValueOnce(new Error("encoder"));
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<VideoReelCard reel={reel} kit={kitWith()} onEdit={vi.fn()} />);
    await enabled();
    press();
    await waitFor(() => expect(notes.error).toHaveBeenCalledTimes(1));
    quiet.mockRestore();
    expect(delivery.deliverCreativeFile).not.toHaveBeenCalled();
    await enabled();
  });

  it("on a phone, waits for its own tap, because sharing a file needs a fresh one", async () => {
    setPointer(true, true);
    render(<VideoReelCard reel={reel} kit={kitWith()} onEdit={vi.fn()} />);
    await enabled();
    press();
    const share = await screen.findByRole("button", { name: "Share or save the video" });
    expect(delivery.deliverCreativeFile).not.toHaveBeenCalled();
    fireEvent.click(share);
    await waitFor(() => expect(delivery.deliverCreativeFile).toHaveBeenCalledTimes(1));
    await enabled();
  });

  it("keeps a finished video on a phone when the share sheet is closed", async () => {
    setPointer(true, true);
    delivery.deliverCreativeFile.mockResolvedValueOnce("cancelled");
    render(<VideoReelCard reel={reel} kit={kitWith()} onEdit={vi.fn()} />);
    await enabled();
    press();
    fireEvent.click(await screen.findByRole("button", { name: "Share or save the video" }));
    await waitFor(() => expect(delivery.deliverCreativeFile).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Share or save the video" })).toBeInTheDocument();
    expect(notes.success).not.toHaveBeenCalled();
  });

  it("drops a finished video once the posts change, so it never says the old words", async () => {
    setPointer(true, true);
    const kit = kitWith();
    const view = render(<VideoReelCard reel={reel} kit={kit} onEdit={vi.fn()} />);
    await enabled();
    press();
    await screen.findByRole("button", { name: "Share or save the video" });
    view.rerender(
      <VideoReelCard
        reel={reel}
        kit={{ ...(kit as object), edits: { "kind-1": {} } } as never}
        onEdit={vi.fn()}
      />,
    );
    await enabled();
  });

  it("explains itself in a browser that cannot encode, and offers nothing that would fail", async () => {
    engine.canExportMp4.mockResolvedValue(false);
    render(<VideoReelCard reel={reel} kit={kitWith()} onEdit={vi.fn()} />);
    expect(await screen.findByRole("note")).toHaveTextContent("cannot make a video");
    expect(screen.getByRole("button", { name: "Make the video" })).toBeDisabled();
  });

  it("opens a frame in the maker", async () => {
    const onEdit = vi.fn();
    render(<VideoReelCard reel={reel} kit={kitWith()} onEdit={onEdit} />);
    await enabled();
    const title = (POSTS.find((post) => post.key === "kind-2") as Post).title;
    fireEvent.click(screen.getByRole("button", { name: `Edit ${title}` }));
    expect(onEdit).toHaveBeenCalledWith("kind-2");
  });
});
