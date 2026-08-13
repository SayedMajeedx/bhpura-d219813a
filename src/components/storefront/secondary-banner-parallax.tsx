import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

type SecondaryBannerParallaxProps = {
  enabled: boolean;
  mobileEnabled?: boolean;
  desktopBreakpoint?: number;
  className?: string;
  style?: CSSProperties;
  backgroundClassName?: string;
  backgroundStyle?: CSSProperties;
  background?: ReactNode;
  children: ReactNode;
};

export function SecondaryBannerParallax({ enabled, ...props }: SecondaryBannerParallaxProps) {
  // Keep the disabled path completely inert: no effect hooks, observer, listener, or timeline node.
  if (!enabled) {
    return (
      <div className={`relative overflow-hidden ${props.className ?? ""}`} style={props.style}>
        <div
          aria-hidden="true"
          className={`absolute inset-0 ${props.backgroundClassName ?? ""}`}
          style={props.backgroundStyle}
        >
          {props.background}
        </div>
        <div className="relative z-10">{props.children}</div>
      </div>
    );
  }
  return <ActiveSecondaryBannerParallax {...props} />;
}

function ActiveSecondaryBannerParallax({
  mobileEnabled = true,
  desktopBreakpoint = 768,
  className = "",
  style,
  backgroundClassName = "",
  backgroundStyle,
  background,
  children,
}: Omit<SecondaryBannerParallaxProps, "enabled">) {
  const rootRef = useRef<HTMLDivElement>(null);
  const backgroundRef = useRef<HTMLDivElement>(null);
  const foregroundRef = useRef<HTMLDivElement>(null);
  const [nearViewport, setNearViewport] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const viewportAllowed = mobileEnabled
      ? null
      : window.matchMedia(`(min-width: ${desktopBreakpoint}px)`);
    if (reducedMotion.matches || viewportAllowed?.matches === false) return;

    const root = rootRef.current;
    if (!root) return;

    const observer = new IntersectionObserver(([entry]) => setNearViewport(entry.isIntersecting), {
      rootMargin: "25% 0px",
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, [desktopBreakpoint, mobileEnabled]);

  useEffect(() => {
    if (!nearViewport || typeof window === "undefined") return;

    const root = rootRef.current;
    const background = backgroundRef.current;
    const foreground = foregroundRef.current;
    if (!root || !background || !foreground) return;

    // Some engines expose scroll-timeline support but pin nested view animations to one frame.
    // Drive the already-lazy active banner with the deterministic RAF path in that case.
    background.style.animation = "none";
    foreground.style.animation = "none";

    let frame = 0;
    const render = () => {
      frame = 0;
      const rect = root.getBoundingClientRect();
      const travel = window.innerHeight + rect.height;
      const progress = Math.max(0, Math.min(1, (window.innerHeight - rect.top) / travel));
      const centered = progress - 0.5;
      background.style.transform = `translate3d(0, ${centered * travel * 0.15}px, 0)`;
      foreground.style.transform = `translate3d(0, ${centered * travel * -0.03}px, 0)`;
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(render);
    };

    render();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) window.cancelAnimationFrame(frame);
      background.style.animation = "";
      foreground.style.animation = "";
      background.style.transform = "";
      foreground.style.transform = "";
    };
  }, [nearViewport]);

  return (
    <div
      ref={rootRef}
      className={`secondary-banner-parallax relative overflow-hidden ${className}`}
      data-parallax-active={nearViewport ? "true" : undefined}
      style={style}
    >
      <div
        ref={backgroundRef}
        aria-hidden="true"
        className={`secondary-banner-parallax__background absolute inset-[-6rem] ${backgroundClassName}`}
        style={backgroundStyle}
      >
        {background}
      </div>
      <div ref={foregroundRef} className="secondary-banner-parallax__foreground relative z-10">
        {children}
      </div>
    </div>
  );
}
