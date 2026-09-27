import { useEffect, useRef, useState } from "react";
import { Pause, Play, Sliders } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FORMATS } from "@/features/content-studio/lib/studio-content";
import { loadStudioFonts } from "@/features/content-studio/engine/fonts";
import type { Drawable } from "@/features/content-studio/engine/scene";
import type { ContentStudio } from "@/features/content-studio/hooks/use-content-studio";

/** Preview canvas width in pixels; the export renders the same frame at full size. */
const PREVIEW_WIDTH = 540;

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

/**
 * The live preview of an animated template: the same renderer as the export,
 * drawn every frame at preview size, with play / pause and a timeline to
 * scrub. With reduced motion it opens paused on the finished frame.
 */
export function TemplatePreview({ studio }: { studio: ContentStudio }) {
  const { isAr, format, activeTemplate, buildScene, photo, isCurrentVideo } = studio;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(() => !prefersReducedMotion());
  const [time, setTime] = useState(() =>
    prefersReducedMotion() && activeTemplate ? activeTemplate.duration - 1 : 0,
  );
  const [fontsReady, setFontsReady] = useState(false);
  // Bumped on each scrub, so a paused preview redraws at the new time.
  const [scrubs, setScrubs] = useState(0);
  const timeRef = useRef(time);
  const sceneRef = useRef(buildScene);
  sceneRef.current = buildScene;

  const { width: outW, height: outH } = FORMATS[format];
  const previewH = Math.round((PREVIEW_WIDTH * outH) / outW);
  const duration = activeTemplate?.duration ?? 1;

  useEffect(() => {
    void loadStudioFonts().then(() => setFontsReady(true));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !activeTemplate) return;
    let frame = 0;
    let last = performance.now();
    let shown = timeRef.current;
    const draw = (now: number) => {
      if (playing) timeRef.current = (timeRef.current + (now - last) / 1000) % duration;
      last = now;
      const video = videoRef.current;
      const media: Drawable | null | undefined =
        isCurrentVideo && video && video.readyState >= 2
          ? video
          : isCurrentVideo
            ? null
            : undefined;
      activeTemplate.render(ctx, timeRef.current, sceneRef.current(PREVIEW_WIDTH, previewH, media));
      // The timeline label only needs a tenth of a second.
      if (Math.abs(timeRef.current - shown) >= 0.1 || !playing) {
        shown = timeRef.current;
        setTime(shown);
      }
      if (playing) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [activeTemplate, playing, duration, previewH, isCurrentVideo, fontsReady, buildScene, scrubs]);

  const scrub = (value: number) => {
    setPlaying(false);
    timeRef.current = value;
    setTime(value);
    setScrubs((count) => count + 1);
  };

  return (
    <div
      id="studio-preview"
      className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl sm:rounded-[28px] border border-border-strong bg-muted/30 p-3 sm:p-7 xl:sticky xl:top-4 self-start shadow-xs"
    >
      <div className="mb-3 sm:mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p
            className={cn(
              "text-xs font-bold text-muted-foreground",
              !isAr && "uppercase tracking-[.15em]",
            )}
          >
            {isAr ? "معاينة متحركة" : "Animated preview"}
          </p>
          <p className="mt-0.5 sm:mt-1 text-xs sm:text-sm font-semibold text-foreground">
            <span dir="ltr" className="font-mono tabular-nums">
              {outW} × {outH} px · {duration} s
            </span>
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            document.getElementById("studio-controls")?.scrollIntoView({ behavior: "smooth" })
          }
          className="xl:hidden h-8 px-2.5 gap-1.5 text-xs font-semibold rounded-xl"
        >
          <Sliders className="size-3.5" />
          <span>{isAr ? "التعديل" : "Edit"}</span>
        </Button>
      </div>

      <div className="mx-auto w-full max-w-[570px] overflow-hidden rounded-[22px] shadow-2xl">
        <canvas
          ref={canvasRef}
          width={PREVIEW_WIDTH}
          height={previewH}
          role="img"
          aria-label={
            activeTemplate
              ? `${isAr ? activeTemplate.name.ar : activeTemplate.name.en} — ${isAr ? "معاينة" : "preview"}`
              : ""
          }
          className="block h-auto w-full"
        />
      </div>
      {isCurrentVideo && photo && (
        <video
          ref={videoRef}
          src={photo}
          crossOrigin="anonymous"
          muted
          loop
          playsInline
          autoPlay
          className="hidden"
        />
      )}

      <div dir="ltr" className="mx-auto mt-4 flex w-full max-w-[570px] items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => setPlaying((value) => !value)}
          aria-label={playing ? (isAr ? "إيقاف مؤقت" : "Pause") : isAr ? "تشغيل" : "Play"}
          className="shrink-0 rounded-full"
        >
          {playing ? <Pause /> : <Play />}
        </Button>
        <input
          type="range"
          min={0}
          max={duration}
          step={0.01}
          value={time}
          onChange={(event) => scrub(Number(event.target.value))}
          aria-label={isAr ? "الخط الزمني" : "Timeline"}
          className="h-2 w-full cursor-pointer accent-primary"
        />
        <span className="w-16 shrink-0 text-end font-mono text-xs tabular-nums text-muted-foreground">
          {time.toFixed(1)} s
        </span>
      </div>
    </div>
  );
}
