import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_SENSITIVITY,
  ERASED,
  KEPT,
  applyMask,
  brushStroke,
  combineMask,
  edgeSamples,
  firstMask,
  keptShare,
  readBackdrop,
  type Backdrop,
  type Pixels,
} from "../lib/cutout";
import { readPixels } from "../lib/cutout-canvas";

export type BrushTool = "erase" | "restore";

/** The squares a cut-out is shown over, so what is see-through reads as see-through. */
function drawChecker(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const cell = Math.max(8, Math.round(Math.max(w, h) / 40));
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#e4e4e7";
  for (let y = 0; y < h; y += cell) {
    for (let x = (y / cell) % 2 ? cell : 0; x < w; x += cell * 2) ctx.fillRect(x, y, cell, cell);
  }
}

/**
 * One picture being cut out: its pixels, the fill from its edge at the chosen sensitivity, the
 * brush strokes over it, and the preview canvas they are drawn on.
 */
export function useCutout(img: HTMLImageElement | undefined) {
  const px = useMemo<Pixels | null>(() => (img ? readPixels(img) : null), [img]);
  const backdrop = useMemo<Backdrop | null>(
    () => (px ? readBackdrop(edgeSamples(px)) : null),
    [px],
  );
  const [sensitivity, setSensitivity] = useState(DEFAULT_SENSITIVITY);
  const [tool, setTool] = useState<BrushTool>("erase");
  const [brush, setBrush] = useState(24);
  const [strokes, setStrokes] = useState(0);
  // What the brush did, one byte a pixel, made with the picture: strokes write into it.
  const paint = useMemo(() => (px ? new Uint8Array(px.width * px.height) : null), [px]);

  // A new picture starts clean, its brush sized to it.
  useEffect(() => {
    setStrokes(0);
    setSensitivity(DEFAULT_SENSITIVITY);
    if (px) setBrush(Math.max(6, Math.round(Math.max(px.width, px.height) / 45)));
  }, [px]);

  const fill = useMemo(
    () => (px && backdrop ? firstMask(px, backdrop, sensitivity) : null),
    [px, backdrop, sensitivity],
  );

  const maskNow = useCallback(
    () => (fill && paint ? combineMask(fill, paint) : null),
    [fill, paint],
  );

  const canvas = useRef<HTMLCanvasElement | null>(null);
  const draw = useCallback(() => {
    const el = canvas.current;
    const mask = maskNow();
    if (!el || !px || !mask) return;
    el.width = px.width;
    el.height = px.height;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    drawChecker(ctx, px.width, px.height);
    const layer = document.createElement("canvas");
    layer.width = px.width;
    layer.height = px.height;
    layer
      .getContext("2d")
      ?.putImageData(new ImageData(applyMask(px, mask), px.width, px.height), 0, 0);
    ctx.drawImage(layer, 0, 0);
  }, [maskNow, px]);

  // Drawn again on each change, one frame at a time however fast the brush moves.
  const frame = useRef(0);
  const redraw = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(draw);
  }, [draw]);
  useEffect(() => {
    redraw();
    return () => cancelAnimationFrame(frame.current);
  }, [redraw, strokes]);

  // ── The brush ──
  const last = useRef<{ x: number; y: number } | null>(null);
  const pointIn = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (!px || !rect.width || !rect.height) return null;
    return {
      x: ((e.clientX - rect.left) / rect.width) * px.width,
      y: ((e.clientY - rect.top) / rect.height) * px.height,
    };
  };
  const paintTo = (point: { x: number; y: number }) => {
    if (!px || !paint) return;
    brushStroke(
      paint,
      px.width,
      px.height,
      last.current ?? point,
      point,
      brush,
      tool === "erase" ? ERASED : KEPT,
    );
    last.current = point;
    redraw();
  };
  const canvasProps = {
    ref: canvas,
    onPointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => {
      const point = pointIn(e);
      if (!point) return;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      last.current = null;
      paintTo(point);
    },
    onPointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!last.current) return;
      const point = pointIn(e);
      if (point) paintTo(point);
    },
    onPointerUp: () => {
      if (!last.current) return;
      last.current = null;
      setStrokes((n) => n + 1);
    },
    onPointerCancel: () => {
      last.current = null;
    },
  };

  const reset = () => {
    paint?.fill(0);
    setSensitivity(DEFAULT_SENSITIVITY);
    setStrokes(0);
    redraw();
  };

  // Read again when the brush last finished (`strokes`), not on every move of it.
  const share = useMemo(() => {
    const mask = strokes >= 0 ? maskNow() : null;
    return mask ? keptShare(mask) : 0;
  }, [maskNow, strokes]);

  return {
    px,
    backdrop,
    sensitivity,
    setSensitivity,
    tool,
    setTool,
    brush,
    setBrush,
    strokes,
    share,
    reset,
    maskNow,
    canvasProps,
  };
}
