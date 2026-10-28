import { useState } from "react";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A wishlist heart that pops when it is filled (transitions.dev's like button, the pop
 * without its particle burst, src/styles/motion.css). The pop is on a wrapper, never the
 * SVG, so the icon stays sharp. `className` sizes the heart, `likedClassName` fills it.
 */
export function LikeHeart({
  liked,
  className,
  likedClassName = "fill-destructive text-destructive",
}: {
  liked: boolean;
  className?: string;
  likedClassName?: string;
}) {
  // Each time it becomes liked, a new key replays the pop; a heart drawn liked does not pop.
  const [state, setState] = useState({ liked, pops: 0 });
  if (state.liked !== liked) setState({ liked, pops: liked ? state.pops + 1 : state.pops });

  return (
    <span className="t-like inline-flex" data-liked={liked ? "true" : "false"}>
      <span key={state.pops} className={cn("t-like-icon", state.pops > 0 && "is-popping")}>
        <Heart className={cn(className, liked && likedClassName)} aria-hidden="true" />
      </span>
    </span>
  );
}
