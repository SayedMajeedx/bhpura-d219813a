import { cutPunch } from "@/features/content-studio/engine/motion";
import { ease, progress } from "@/features/content-studio/engine/timeline";
import type { BaseScene, Drawable, StudioTemplate } from "@/features/content-studio/engine/scene";
import type { Post } from "./types";

/** A reel the store needs no camera for: its posts, each held for a time, cut one to the next. */
export type VideoReel = {
  key: string;
  title: string;
  frames: { post: string; seconds: number }[];
};

export const reelDuration = (reel: Pick<VideoReel, "frames">) =>
  reel.frames.reduce((sum, frame) => sum + frame.seconds, 0);

/** The frame playing at `t`, how far through it and how long since its cut. The last one holds. */
export function reelFrameAt(reel: Pick<VideoReel, "frames">, t: number) {
  let start = 0;
  for (let index = 0; index < reel.frames.length; index++) {
    const { seconds } = reel.frames[index];
    if (t < start + seconds || index === reel.frames.length - 1) {
      const sinceCut = Math.max(0, t - start);
      return { index, sinceCut, through: Math.min(1, sinceCut / seconds) };
    }
    start += seconds;
  }
  return null;
}

/**
 * How far in a frame is drawn at `t`: a slow push, and a short punch after a cut so the cut lands.
 * The first frame has no cut to land, and it is the reel's cover, so it opens whole. Never below 1,
 * so a frame always covers the video and no edge shows.
 */
export function reelZoom(reel: Pick<VideoReel, "frames">, t: number): number {
  const at = reelFrameAt(reel, t);
  if (!at) return 1;
  const push = 1 + 0.03 * progress(at.through, 0, 1, ease.outCubic);
  return at.index === 0 ? push : push * cutPunch(at.sinceCut, 0.05);
}

export type ReelScene = BaseScene & { shots: Drawable[] };

/** The reel as the studio's engine reads a template: it holds no state, so any frame draws alike. */
export function reelTemplate(reel: VideoReel): StudioTemplate<ReelScene> {
  return {
    id: `post-kit-${reel.key}`,
    name: { en: reel.title, ar: reel.title },
    goal: { en: reel.title, ar: reel.title },
    duration: reelDuration(reel),
    posterTime: 0,
    render(ctx, t, scene) {
      const at = reelFrameAt(reel, t);
      const shot = at && scene.shots[at.index];
      if (!shot) return;
      const zoom = reelZoom(reel, t);
      const w = scene.width * zoom;
      const h = scene.height * zoom;
      ctx.drawImage(shot, (scene.width - w) / 2, (scene.height - h) / 2, w, h);
    },
  };
}

/** A frame is always drawn tall, even if its post was switched to a square-ish size in the maker. */
export const asReelFrame = (post: Post): Post => ({ ...post, size: "story" });
