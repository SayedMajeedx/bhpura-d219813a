import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

type SecondaryBannerParallaxProps = {
  enabled: boolean;
  mobileEnabled?: boolean;
  desktopBreakpoint?: number;
  className?: string;
  style?: CSSProperties;
  backgroundClassName?: string;
  backgroundStyle?: CSSProperties;
  children: ReactNode;
};

export function SecondaryBannerParallax({ enabled, ...props }: SecondaryBannerParallaxProps) {
  // Keep the disabled path completely inert: no effect hooks, observer, listener, or timeline node.
  if (!enabled) {
    return (
      <div className={props.className} style={{ ...props.backgroundStyle, ...props.style }}>
        {props.children}
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
    if (window.CSS?.supports?.("animation-timeline: scroll()")) return;

    const root = rootRef.current;
    const background = backgroundRef.current;
    const foreground = foregroundRef.current;
    if (!root || !background || !foreground) return;

    let frame = 0;
    const render = () => {
      frame = 0;
      const rect = root.getBoundingClientRect();
      const travel = window.innerHeight + rect.height;
      const progress = Math.max(0, Math.min(1, (window.innerHeight - rect.top) / travel));
      const centered = progress - 0.5;
      background.style.transform = `translate3d(0, ${centered * 64}px, 0)`;
      foreground.style.transform = `translate3d(0, ${centered * -16}px, 0)`;
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
        className={`secondary-banner-parallax__background absolute inset-[-2rem] ${backgroundClassName}`}
        style={backgroundStyle}
      />
      <div ref={foregroundRef} className="secondary-banner-parallax__foreground relative z-10">
        {children}
      </div>
    </div>
  );
}
