import { useEffect, useRef, useState } from "react";
import { geometry } from "../lib/frame";
import {
  clampSize,
  clampTurn,
  handleAt,
  onSticker,
  pinched,
  sizedFrom,
  topStickerAt,
  turnedTo,
} from "../lib/photo-shape";
import { withSticker, withoutSticker } from "../lib/post-rules";
import type { PhotoBook, Post } from "../lib/types";

type Point = { x: number; y: number };
type Gesture =
  | { kind: "move"; dx: number; dy: number }
  | { kind: "size"; s0: number; start: Point }
  | { kind: "turn" }
  | { kind: "pinch"; s: number; r: number; a: Point; b: Point; ids: [number, number] };

/** A point of the post, 0..1 each way. */
function pointIn(canvas: HTMLCanvasElement | null, e: { clientX: number; clientY: number }): Point {
  const box = canvas?.getBoundingClientRect();
  if (!box || !box.width) return { x: 0, y: 0 };
  return { x: (e.clientX - box.left) / box.width, y: (e.clientY - box.top) / box.height };
}

/** How big a handle is on screen, in CSS pixels: a finger needs room, a mouse less. */
const HANDLE_CSS = 24;

/**
 * Everything a pointer does on the post: a tap selects, a drag moves, the corner handle sizes, the
 * handle above turns, two fingers size and turn together, the wheel sizes what is under the mouse,
 * and the keys move, size, turn and remove what is selected.
 */
export function useStageGestures({
  stage,
  post,
  setPost,
  selected,
  setSelected,
  photos,
}: {
  stage: React.RefObject<HTMLCanvasElement | null>;
  post: Post;
  setPost: React.Dispatch<React.SetStateAction<Post>>;
  selected: number;
  setSelected: (i: number) => void;
  photos: PhotoBook;
}) {
  const latest = useRef({ post, selected, photos });
  latest.current = { post, selected, photos };
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture | null>(null);
  const [cssWidth, setCssWidth] = useState(420);

  useEffect(() => {
    const canvas = stage.current;
    if (!canvas || typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver(() => setCssWidth(canvas.clientWidth || 420));
    watch.observe(canvas);
    return () => watch.disconnect();
  }, [stage]);

  /** A handle's reach in post pixels, so it is the same size on screen at any width. */
  const handleRadius = Math.max(30, (HANDLE_CSS * 1080) / Math.max(1, cssWidth));
  const radius = useRef(handleRadius);
  radius.current = handleRadius;

  const change = (i: number, next: Parameters<typeof withSticker>[2]) =>
    setPost((prev) => withSticker(prev, i, next));

  const pointOf = (e: { clientX: number; clientY: number }) => pointIn(stage.current, e);
  const inPixels = (p: Point): Point => {
    const g = geometry(latest.current.post);
    return { x: p.x * g.W, y: p.y * g.H };
  };

  // A finger on a sticker or a handle works the sticker; anywhere else it scrolls the page.
  // The wheel over the selected sticker sizes it, and scrolls the page anywhere else.
  useEffect(() => {
    const canvas = stage.current;
    if (!canvas) return;
    const onTouch = (e: TouchEvent) => {
      const { post: now, selected: sel, photos: book } = latest.current;
      const g = geometry(now);
      if (e.touches.length > 1 && sel >= 0) {
        e.preventDefault();
        return;
      }
      const touch = e.touches[0];
      if (!touch) return;
      const p = pointIn(canvas, touch);
      const st = now.stickers[sel];
      if (st && handleAt(st, p.x, p.y, g, radius.current, book)) e.preventDefault();
      else if (topStickerAt(now, p.x, p.y, g, book) >= 0) e.preventDefault();
    };
    const onWheel = (e: WheelEvent) => {
      const { post: now, selected: sel, photos: book } = latest.current;
      const st = now.stickers[sel];
      if (!st) return;
      const p = pointIn(canvas, e);
      if (!onSticker(st, p.x, p.y, geometry(now), book)) return;
      e.preventDefault();
      const s = clampSize(st.s * Math.exp(-e.deltaY * 0.0015));
      setPost((prev) => withSticker(prev, sel, { s }));
    };
    canvas.addEventListener("touchstart", onTouch, { passive: false });
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      canvas.removeEventListener("touchstart", onTouch);
      canvas.removeEventListener("wheel", onWheel);
    };
    // The handlers read the latest post through a ref, so they are set up once per canvas.
  }, [stage, setPost]);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = pointOf(e);
    pointers.current.set(e.pointerId, p);
    const g = geometry(post);
    const st = post.stickers[selected];
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (pointers.current.size === 2 && st) {
      const [[idA, a], [idB, b]] = [...pointers.current.entries()];
      gesture.current = {
        kind: "pinch",
        s: st.s,
        r: st.r ?? 0,
        a: inPixels(a),
        b: inPixels(b),
        ids: [idA, idB],
      };
      return;
    }
    const handle = st ? handleAt(st, p.x, p.y, g, handleRadius, photos) : null;
    if (st && handle === "size") {
      gesture.current = { kind: "size", s0: st.s, start: inPixels(p) };
      return;
    }
    if (st && handle === "turn") {
      gesture.current = { kind: "turn" };
      return;
    }
    const i = topStickerAt(post, p.x, p.y, g, photos);
    setSelected(i);
    gesture.current =
      i >= 0 ? { kind: "move", dx: post.stickers[i].x - p.x, dy: post.stickers[i].y - p.y } : null;
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    const p = pointOf(e);
    pointers.current.set(e.pointerId, p);
    const now = gesture.current;
    const st = post.stickers[selected];
    if (!now || !st) return;
    const center = inPixels({ x: st.x, y: st.y });
    if (now.kind === "pinch") {
      const a = pointers.current.get(now.ids[0]);
      const b = pointers.current.get(now.ids[1]);
      if (a && b) change(selected, pinched(now, inPixels(a), inPixels(b)));
    } else if (now.kind === "size") {
      change(selected, { s: sizedFrom(now.s0, center, now.start, inPixels(p)) });
    } else if (now.kind === "turn") {
      change(selected, { r: turnedTo(center, inPixels(p)) });
    } else {
      change(selected, {
        x: Math.min(1, Math.max(0, p.x + now.dx)),
        y: Math.min(1, Math.max(0, p.y + now.dy)),
      });
    }
  };

  const onPointerEnd = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(e.pointerId);
    // Lifting one of two fingers ends the pinch; the other finger does not start a drag.
    gesture.current = null;
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    const st = post.stickers[selected];
    if (!st) return;
    const step = 0.012;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[e.key];
    if (move) {
      e.preventDefault();
      change(selected, { x: st.x + move[0], y: st.y + move[1] });
    } else if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      change(selected, { s: clampSize(st.s * 1.08) });
    } else if (e.key === "-") {
      e.preventDefault();
      change(selected, { s: clampSize(st.s / 1.08) });
    } else if (e.key === "]" || e.key === "[") {
      e.preventDefault();
      change(selected, { r: clampTurn((st.r ?? 0) + (e.key === "]" ? 5 : -5)) });
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      setPost((prev) => withoutSticker(prev, selected));
      setSelected(-1);
    }
  };

  return {
    handleRadius,
    canvasProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
      onKeyDown,
    },
  };
}
