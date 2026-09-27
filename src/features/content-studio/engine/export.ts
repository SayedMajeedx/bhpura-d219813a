import { frameCount } from "@/features/content-studio/engine/timeline";
import type { Drawable, SceneData, StudioTemplate } from "@/features/content-studio/engine/scene";

/** Frame rate and bitrate of exported videos: smooth on Instagram, crisp text. */
export const EXPORT_FPS = 30;
export const EXPORT_BITRATE = 8_000_000;

type CanvasFactory = (width: number, height: number) => HTMLCanvasElement;

const makeCanvas: CanvasFactory = (width, height) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

function context2d(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canvas 2D is not available in this browser.");
  return ctx;
}

/**
 * Whether this browser can encode H.264 at `width`×`height` (WebCodecs). When
 * it cannot, the studio offers the still image only.
 */
export async function canExportMp4(width: number, height: number): Promise<boolean> {
  try {
    const { canEncodeVideo } = await import("mediabunny");
    return await canEncodeVideo("avc", { width, height });
  } catch {
    return false;
  }
}

/**
 * Renders a template to an MP4 (H.264, fast start) one frame at a time: each
 * frame is drawn at its exact time and encoded, so the file has the exact
 * length and never drops a frame, whatever the device's speed. `frameAt`
 * supplies a video frame per time when the product media is a video.
 */
export async function exportTemplateMp4({
  template,
  scene,
  fps = EXPORT_FPS,
  bitrate = EXPORT_BITRATE,
  frameAt,
  onProgress,
  signal,
  createCanvas = makeCanvas,
}: {
  template: StudioTemplate;
  scene: SceneData;
  fps?: number;
  bitrate?: number;
  frameAt?: (t: number) => Promise<Drawable | null>;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  createCanvas?: CanvasFactory;
}): Promise<Blob> {
  const { Output, Mp4OutputFormat, BufferTarget, CanvasSource } = await import("mediabunny");
  const canvas = createCanvas(scene.width, scene.height);
  const ctx = context2d(canvas);
  const target = new BufferTarget();
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: "in-memory" }),
    target,
  });
  const source = new CanvasSource(canvas, { codec: "avc", bitrate, keyFrameInterval: 2 });
  output.addVideoTrack(source, { frameRate: fps });
  await output.start();

  const frames = frameCount(template.duration, fps);
  try {
    for (let index = 0; index < frames; index++) {
      if (signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
      const t = index / fps;
      const media = frameAt ? ((await frameAt(t)) ?? scene.media) : scene.media;
      template.render(ctx, t, { ...scene, media });
      await source.add(t, 1 / fps);
      onProgress?.((index + 1) / frames);
    }
    await output.finalize();
  } catch (error) {
    await output.cancel().catch(() => undefined);
    throw error;
  }
  if (!target.buffer) throw new Error("The video encoder returned no data.");
  return new Blob([target.buffer], { type: "video/mp4" });
}

/** Renders one frame of a template (by default the last, fully built one) to a PNG. */
export async function exportTemplatePng({
  template,
  scene,
  t = Math.max(0, template.duration - 1),
  createCanvas = makeCanvas,
}: {
  template: StudioTemplate;
  scene: SceneData;
  t?: number;
  createCanvas?: CanvasFactory;
}): Promise<Blob> {
  const canvas = createCanvas(scene.width, scene.height);
  template.render(context2d(canvas), t, scene);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("PNG export failed"))),
      "image/png",
    ),
  );
}
