import { useEffect, useRef } from "react";
import type { PostKit } from "../hooks/use-post-kit";
import { renderPost } from "../lib/render";
import type { Post } from "../lib/types";

/** The canvas a card's post is drawn on, at a size a page of them can hold. */
export function PostPicture({ post, kit, label }: { post: Post; kit: PostKit; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) renderPost(ref.current, post, kit.photos, 0.5);
  }, [post, kit.photos]);
  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={label}
      className="block h-auto w-full rounded-lg bg-muted"
    />
  );
}
