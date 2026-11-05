import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { canExportMp4, exportTemplateMp4 } from "@/features/content-studio/engine/export";
import { deliverCreativeFile } from "@/lib/creative-export";
import { useI18n } from "@/lib/i18n";
import { renderPost } from "../lib/render";
import { asReelFrame, reelTemplate, type VideoReel } from "../lib/reels";
import type { PostKit } from "./use-post-kit";

const WIDTH = 1080;
const HEIGHT = 1920;

/**
 * A phone shares a file only from a tap, and rendering takes long enough to lose the one that
 * started it. So there a finished video waits for a second tap; a computer downloads it at once.
 */
const needsItsOwnTap = () =>
  typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches;

/** Renders a reel from its posts as they stand now, and hands the merchant the file. */
export function useReelExport(reel: VideoReel, kit: PostKit) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const [supported, setSupported] = useState<boolean | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [ready, setReady] = useState<Blob | null>(null);
  const abort = useRef<AbortController | null>(null);
  const { edits, photos, currentOf, brand } = kit;

  useEffect(() => {
    let alive = true;
    void canExportMp4(WIDTH, HEIGHT).then((can) => {
      if (alive) setSupported(can);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => () => abort.current?.abort(), []);

  // A finished video no longer says what the posts say once they change.
  useEffect(() => setReady(null), [edits, photos]);

  const deliver = useCallback(
    async (blob: Blob) => {
      const name = `${brand.slug}-${reel.key}.mp4`;
      const delivered = await deliverCreativeFile(blob, name, "video/mp4", reel.title);
      if (delivered === "cancelled") return;
      setReady(null);
      toast.success(isAr ? "الفيديو جاهز" : "Video ready");
    },
    [brand.slug, isAr, reel.key, reel.title],
  );

  const start = useCallback(async () => {
    const controller = new AbortController();
    abort.current = controller;
    setReady(null);
    setProgress(0);
    try {
      const shots = reel.frames.map((frame) => {
        const canvas = document.createElement("canvas");
        renderPost(canvas, asReelFrame(currentOf(frame.post)), photos, 1);
        return canvas;
      });
      const blob = await exportTemplateMp4({
        template: reelTemplate(reel),
        scene: { width: WIDTH, height: HEIGHT, media: null, shots },
        onProgress: (fraction) => setProgress(Math.round(fraction * 100)),
        signal: controller.signal,
      });
      if (needsItsOwnTap()) setReady(blob);
      else await deliver(blob);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("Reel export failed", error);
      toast.error(
        isAr ? "ما قدرنا نجهز الفيديو. جرّب مرة ثانية." : "Could not make the video. Try again.",
      );
    } finally {
      abort.current = null;
      setProgress(null);
    }
  }, [currentOf, deliver, isAr, photos, reel]);

  return {
    supported,
    progress,
    ready,
    start,
    cancel: () => abort.current?.abort(),
    share: () => {
      if (ready) void deliver(ready);
    },
  };
}
