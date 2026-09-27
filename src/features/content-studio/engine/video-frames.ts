import type { Drawable } from "@/features/content-studio/engine/scene";

export type VideoFrames = {
  /** The video's length in seconds. */
  duration: number;
  /** The frame showing at `t` seconds (looping past the end), sized to cover the output. */
  frameAt: (t: number) => Promise<Drawable | null>;
  dispose: () => void;
};

/**
 * Opens a product video for frame-accurate reading while exporting: frames
 * are decoded at the exact times the template draws, instead of recording a
 * playing video in real time.
 */
export async function openVideoFrames(
  url: string,
  size: { width: number; height: number },
): Promise<VideoFrames> {
  const { Input, UrlSource, ALL_FORMATS, CanvasSink } = await import("mediabunny");
  const input = new Input({ source: new UrlSource(url), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error("The file has no video track.");
    const duration = await input.computeDuration();
    const sink = new CanvasSink(track, { ...size, fit: "cover", poolSize: 2 });
    return {
      duration,
      frameAt: async (t) => {
        const at = duration > 0 ? t % duration : t;
        const wrapped = await sink.getCanvas(at);
        return wrapped?.canvas ?? null;
      },
      dispose: () => input.dispose(),
    };
  } catch (error) {
    input.dispose();
    throw error;
  }
}
