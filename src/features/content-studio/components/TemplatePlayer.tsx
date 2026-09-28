import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { loadStudioFonts } from "@/features/content-studio/engine/fonts";
import type { BaseScene, Drawable, StudioTemplate } from "@/features/content-studio/engine/scene";

/** Preview width before the canvas has been measured (then: on-screen width × pixel density). */
const INITIAL_PREVIEW_WIDTH = 540;

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

/**
 * Plays an animated template: the same renderer as the export, drawn every
 * frame at the screen's resolution, with play / pause and a timeline to scrub.
 * With reduced motion it opens paused on the finished frame. `videoUrl` is the
 * product video to draw its playing frames from, when the media is a video.
 */
export function TemplatePlayer<S extends BaseScene>({
  template,
  buildScene,
  outW,
  outH,
  videoUrl,
  isAr,
  label,
  className,
  frameClassName,
  onPausedAt,
}: {
  template: StudioTemplate<S>;
  buildScene: (width: number, height: number, media?: Drawable | null) => S;
  outW: number;
  outH: number;
  videoUrl: string | null;
  isAr: boolean;
  label: string;
  /** Width limits for the frame and the controls, e.g. "max-w-[570px]". */
  className?: string;
  /** Extra classes for the frame around the canvas (corners, shadow). */
  frameClassName?: string;
  /** Told the time the preview is paused at (null while it plays): the frame a still exports. */
  onPausedAt?: (t: number | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(() => !prefersReducedMotion());
  const [time, setTime] = useState(() => (prefersReducedMotion() ? template.duration - 1 : 0));
  const [fontsReady, setFontsReady] = useState(false);
  // Bumped on each scrub, so a paused preview redraws at the new time.
  const [scrubs, setScrubs] = useState(0);
  const timeRef = useRef(time);
  const sceneRef = useRef(buildScene);
  sceneRef.current = buildScene;

  // Draw at the screen's real resolution (its CSS width × pixel density, never
  // more than the export), so the preview is as sharp as the exported file.
  const [previewW, setPreviewW] = useState(INITIAL_PREVIEW_WIDTH);
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const cssWidth = frame.getBoundingClientRect().width;
      if (cssWidth > 0) {
        setPreviewW(Math.min(outW, Math.round(cssWidth * (window.devicePixelRatio || 1))));
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [outW]);
  const previewH = Math.round((previewW * outH) / outW);
  const duration = template.duration;

  useEffect(() => {
    void loadStudioFonts().then(() => setFontsReady(true));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let frame = 0;
    let last = performance.now();
    let shown = timeRef.current;
    const draw = (now: number) => {
      if (playing) timeRef.current = (timeRef.current + (now - last) / 1000) % duration;
      last = now;
      const video = videoRef.current;
      const media: Drawable | null | undefined =
        videoUrl && video && video.readyState >= 2 ? video : videoUrl ? null : undefined;
      template.render(ctx, timeRef.current, sceneRef.current(previewW, previewH, media));
      // The timeline label only needs a tenth of a second.
      if (Math.abs(timeRef.current - shown) >= 0.1 || !playing) {
        shown = timeRef.current;
        setTime(shown);
      }
      if (playing) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [template, playing, duration, previewW, previewH, videoUrl, fontsReady, buildScene, scrubs]);

  const pausedRef = useRef(onPausedAt);
  pausedRef.current = onPausedAt;
  useEffect(() => {
    pausedRef.current?.(playing ? null : timeRef.current);
  }, [playing, scrubs]);

  const scrub = (value: number) => {
    setPlaying(false);
    timeRef.current = value;
    setTime(value);
    setScrubs((count) => count + 1);
  };

  return (
    <>
      <div
        ref={frameRef}
        className={cn("mx-auto w-full overflow-hidden", className, frameClassName)}
      >
        <canvas
          ref={canvasRef}
          width={previewW}
          height={previewH}
          role="img"
          aria-label={label}
          className="block h-auto w-full"
        />
      </div>
      {videoUrl && (
        <video
          ref={videoRef}
          src={videoUrl}
          crossOrigin="anonymous"
          muted
          loop
          playsInline
          autoPlay
          className="hidden"
        />
      )}

      <div dir="ltr" className={cn("mx-auto mt-4 flex w-full items-center gap-3", className)}>
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
    </>
  );
}
