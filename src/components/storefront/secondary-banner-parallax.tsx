import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

const DESKTOP_MAX_OFFSET_PX = 84;
const MOBILE_MAX_OFFSET_PX = 42;
const PARALLAX_SCALE = 1.08;
const MOTION_SMOOTHING = 0.18;
const MIN_COVERAGE_GUARD_PX = 32;

type ParallaxEntry = {
  root: HTMLDivElement;
  background: HTMLDivElement;
  foreground: HTMLDivElement;
  documentTop: number;
  height: number;
  currentOffset: number;
};

const activeEntries = new Set<ParallaxEntry>();
let parallaxFrame = 0;
let controllerListening = false;

function measureEntry(entry: ParallaxEntry) {
  const rect = entry.root.getBoundingClientRect();
  entry.documentTop = rect.top + window.scrollY;
  entry.height = rect.height;

  const mobile = window.matchMedia("(max-width: 768px)").matches;
  const maximumOffset = mobile ? MOBILE_MAX_OFFSET_PX : DESKTOP_MAX_OFFSET_PX;
  entry.root.style.setProperty(
    "--secondary-banner-parallax-overscan",
    `${Math.ceil(maximumOffset + MIN_COVERAGE_GUARD_PX)}px`,
  );
}

function renderActiveEntries() {
  parallaxFrame = 0;
  const viewportHeight = window.innerHeight;
  const scrollY = window.scrollY;
  const mobile = window.matchMedia("(max-width: 768px)").matches;
  const maximumOffset = mobile ? MOBILE_MAX_OFFSET_PX : DESKTOP_MAX_OFFSET_PX;
  let needsAnotherFrame = false;

  activeEntries.forEach((entry) => {
    const bannerCenter = entry.documentTop - scrollY + entry.height / 2;
    const viewportCenter = viewportHeight / 2;
    const centerDistance = viewportCenter - bannerCenter;
    const normalizedDistance = Math.max(-1, Math.min(1, centerDistance / (viewportHeight * 0.58)));
    const targetOffset = normalizedDistance * maximumOffset;
    const delta = targetOffset - entry.currentOffset;
    entry.currentOffset += delta * MOTION_SMOOTHING;

    if (Math.abs(delta) < 0.1) {
      entry.currentOffset = targetOffset;
    } else {
      needsAnotherFrame = true;
    }

    entry.background.style.transform = `translate3d(0, ${entry.currentOffset}px, 0) scale(${PARALLAX_SCALE})`;
    entry.foreground.style.transform = "none";
  });

  if (needsAnotherFrame) scheduleParallaxFrame();
}

function scheduleParallaxFrame() {
  if (!parallaxFrame) parallaxFrame = window.requestAnimationFrame(renderActiveEntries);
}

function refreshActiveEntries() {
  activeEntries.forEach(measureEntry);
  scheduleParallaxFrame();
}

function startController() {
  if (controllerListening) return;
  controllerListening = true;
  window.addEventListener("scroll", scheduleParallaxFrame, { passive: true });
  window.addEventListener("resize", refreshActiveEntries, { passive: true });
}

function stopControllerIfIdle() {
  if (activeEntries.size || !controllerListening) return;
  controllerListening = false;
  window.removeEventListener("scroll", scheduleParallaxFrame);
  window.removeEventListener("resize", refreshActiveEntries);
  if (parallaxFrame) window.cancelAnimationFrame(parallaxFrame);
  parallaxFrame = 0;
}

function registerParallaxEntry(entry: ParallaxEntry) {
  measureEntry(entry);
  activeEntries.add(entry);
  startController();
  scheduleParallaxFrame();

  return () => {
    activeEntries.delete(entry);
    entry.root.style.removeProperty("--secondary-banner-parallax-overscan");
    entry.background.style.transform = "";
    entry.foreground.style.transform = "";
    stopControllerIfIdle();
  };
}

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
  const [motionAllowed, setMotionAllowed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const viewportAllowed = mobileEnabled
      ? null
      : window.matchMedia(`(min-width: ${desktopBreakpoint}px)`);

    const syncMotionPreference = () => {
      const allowed = !reducedMotion.matches && viewportAllowed?.matches !== false;
      setMotionAllowed(allowed);
      if (!allowed) setNearViewport(false);
    };

    syncMotionPreference();
    reducedMotion.addEventListener("change", syncMotionPreference);
    viewportAllowed?.addEventListener("change", syncMotionPreference);
    return () => {
      reducedMotion.removeEventListener("change", syncMotionPreference);
      viewportAllowed?.removeEventListener("change", syncMotionPreference);
    };
  }, [desktopBreakpoint, mobileEnabled]);

  useEffect(() => {
    if (!motionAllowed) return;

    const root = rootRef.current;
    if (!root) return;

    const observer = new IntersectionObserver(([entry]) => setNearViewport(entry.isIntersecting), {
      rootMargin: "25% 0px",
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, [motionAllowed]);

  useEffect(() => {
    if (!nearViewport || typeof window === "undefined") return;

    const root = rootRef.current;
    const background = backgroundRef.current;
    const foreground = foregroundRef.current;
    if (!root || !background || !foreground) return;

    // Production Chromium can report view-timeline support while pinning nested animations to
    // one frame. The shared RAF controller is the verified deterministic driver for this path.
    background.style.animation = "none";
    foreground.style.animation = "none";

    const entry: ParallaxEntry = {
      root,
      background,
      foreground,
      documentTop: 0,
      height: 0,
      currentOffset: 0,
    };
    const unregister = registerParallaxEntry(entry);
    const resizeObserver = new ResizeObserver(() => {
      measureEntry(entry);
      scheduleParallaxFrame();
    });
    resizeObserver.observe(root);

    return () => {
      resizeObserver.disconnect();
      unregister();
      background.style.animation = "";
      foreground.style.animation = "";
    };
  }, [nearViewport]);

  return (
    <div
      ref={rootRef}
      className={`secondary-banner-parallax relative overflow-hidden ${className}`}
      data-parallax-active={nearViewport ? "true" : undefined}
      data-parallax-driver="raf"
      style={style}
    >
      <div
        ref={backgroundRef}
        aria-hidden="true"
        className={`secondary-banner-parallax__background absolute inset-x-0 ${backgroundClassName}`}
        style={{
          insetBlock: "calc(-1 * var(--secondary-banner-parallax-overscan, 6rem))",
          ...backgroundStyle,
        }}
      >
        {background}
      </div>
      <div ref={foregroundRef} className="secondary-banner-parallax__foreground relative z-10">
        {children}
      </div>
    </div>
  );
}
