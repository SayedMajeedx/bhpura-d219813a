import { useEffect, useRef, useState } from "react";
import { loadStudioFonts } from "@/features/content-studio/engine/fonts";
import type { SceneData, StudioTemplate } from "@/features/content-studio/engine/scene";

/** The thumbnail's drawing size: a 4:5 post, sharp on a two-times screen. */
const THUMB_W = 240;
const THUMB_H = 300;

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

/**
 * A template's miniature with the studio's own product, copy and brand: its
 * finished frame, playing from the start while `playing` (the card is hovered
 * or focused). Stays still with reduced motion.
 */
export function TemplateThumb({
  template,
  scene,
  playing,
}: {
  template: StudioTemplate;
  scene: (width: number, height: number) => SceneData;
  playing: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => {
    let alive = true;
    void loadStudioFonts().then(() => {
      if (alive) setFontsReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const data = scene(THUMB_W, THUMB_H);
    const animate = playing && !prefersReducedMotion();
    let start: number | undefined;
    let frame = requestAnimationFrame(function draw(now: number) {
      if (!animate) {
        template.render(ctx, template.duration - 1, data);
        return;
      }
      start ??= now;
      template.render(ctx, ((now - start) / 1000) % template.duration, data);
      frame = requestAnimationFrame(draw);
    });
    return () => cancelAnimationFrame(frame);
  }, [template, scene, playing, fontsReady]);

  return (
    <canvas
      ref={canvasRef}
      width={THUMB_W}
      height={THUMB_H}
      aria-hidden="true"
      className="block aspect-[4/5] h-auto w-full"
    />
  );
}
