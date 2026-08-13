import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

type SecondaryBannerParallaxProps = {
  enabled: boolean;
  mobileEnabled?: boolean;
  desktopBreakpoint?: number;
  className?: string;
  style?: CSSProperties;
  backgroundClassName?: string;
  backgroundStyle?: CSSProperties;
  background?: ReactNode;
  overlayClassName?: string;
  children: ReactNode;
};

export function SecondaryBannerParallax({ enabled, ...props }: SecondaryBannerParallaxProps) {
  if (!enabled) return <StaticLuxuryBanner {...props} />;
  return <ActiveLuxuryBanner {...props} />;
}

function BannerLayers({
  backgroundClassName = "",
  backgroundStyle,
  background,
  overlayClassName = "bg-primary/25",
  children,
}: Pick<
  SecondaryBannerParallaxProps,
  "backgroundClassName" | "backgroundStyle" | "background" | "overlayClassName" | "children"
>) {
  return (
    <>
      <div
        aria-hidden="true"
        className={`luxury-parallax-bg ${backgroundClassName}`}
        style={backgroundStyle}
      >
        {background}
      </div>
      <div aria-hidden="true" className={`luxury-parallax-overlay ${overlayClassName}`} />
      <div className="luxury-parallax-content">{children}</div>
    </>
  );
}

function StaticLuxuryBanner({
  className = "",
  style,
  ...props
}: Omit<SecondaryBannerParallaxProps, "enabled" | "mobileEnabled" | "desktopBreakpoint">) {
  return (
    <section className={`luxury-parallax-container ${className}`} style={style}>
      <BannerLayers {...props} />
    </section>
  );
}

function ActiveLuxuryBanner({
  mobileEnabled = true,
  desktopBreakpoint = 768,
  className = "",
  style,
  ...props
}: Omit<SecondaryBannerParallaxProps, "enabled">) {
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const root = rootRef.current;
    const background = root?.querySelector<HTMLElement>(".luxury-parallax-bg");
    if (!root || !background) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const coarsePointer = window.matchMedia("(pointer: coarse)");
    const mobileViewport = window.matchMedia(`(max-width: ${desktopBreakpoint}px)`);
    let frame = 0;
    let visible = false;

    const reset = () => {
      background.style.transform = "translate3d(0, 0, 0)";
    };
    const render = () => {
      frame = 0;
      if (!visible || reducedMotion.matches) return reset();
      if (!mobileEnabled && mobileViewport.matches) return reset();

      const rect = root.getBoundingClientRect();
      const viewportCenter = window.innerHeight / 2;
      const bannerCenter = rect.top + rect.height / 2;
      const normalizedDistance = (viewportCenter - bannerCenter) / window.innerHeight;
      const mobile = mobileViewport.matches || coarsePointer.matches;
      const intensity = mobile ? 0.06 : 0.15;
      const offset = Math.max(
        -rect.height * 0.1,
        Math.min(rect.height * 0.1, normalizedDistance * rect.height * intensity),
      );
      background.style.transform = `translate3d(0, ${offset.toFixed(2)}px, 0)`;
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(render);
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible) schedule();
        else reset();
      },
      { rootMargin: "20% 0px" },
    );

    observer.observe(root);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    reducedMotion.addEventListener("change", schedule);
    coarsePointer.addEventListener("change", schedule);
    mobileViewport.addEventListener("change", schedule);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      reducedMotion.removeEventListener("change", schedule);
      coarsePointer.removeEventListener("change", schedule);
      mobileViewport.removeEventListener("change", schedule);
      if (frame) window.cancelAnimationFrame(frame);
      reset();
    };
  }, [desktopBreakpoint, mobileEnabled]);

  return (
    <section ref={rootRef} className={`luxury-parallax-container ${className}`} style={style}>
      <BannerLayers {...props} />
    </section>
  );
}
