import { useRef, useState, useEffect, type VideoHTMLAttributes } from "react";
import { ResponsiveImage } from "@/components/responsive-media";

export type VideoVariant = "hero" | "content" | "modal";

/**
 * Hero videos are decoration, not content. On data-saver, slow connections, or
 * reduced-motion preferences we keep the poster and never fetch the video.
 */
export function preferPosterOnly(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const nav = navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    };
    if (nav.connection?.saveData) return true;
    const type = nav.connection?.effectiveType;
    if (type === "slow-2g" || type === "2g" || type === "3g") return true;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return true;
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * Resolves after the page's load event and the next idle slice, so a hero
 * video never competes with CSS, fonts, JS and the LCP poster for bandwidth.
 */
function scheduleAfterLoad(callback: () => void): () => void {
  let cancelled = false;
  let idleId: number | null = null;
  const run = () => {
    if (cancelled) return;
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof w.requestIdleCallback === "function") {
      idleId = w.requestIdleCallback(() => !cancelled && callback(), { timeout: 2500 });
    } else {
      idleId = window.setTimeout(() => !cancelled && callback(), 300);
    }
  };
  if (document.readyState === "complete") run();
  else window.addEventListener("load", run, { once: true });
  return () => {
    cancelled = true;
    window.removeEventListener("load", run);
    if (idleId != null) {
      const w = window as Window & { cancelIdleCallback?: (id: number) => void };
      if (typeof w.cancelIdleCallback === "function") w.cancelIdleCallback(idleId);
      else window.clearTimeout(idleId);
    }
  };
}

export interface AppVideoProps extends Omit<
  VideoHTMLAttributes<HTMLVideoElement>,
  "src" | "poster"
> {
  src?: string | null;
  webmSrc?: string | null;
  mp4Src?: string | null;
  poster?: string | null;
  variant?: VideoVariant;
  active?: boolean;
  prepare?: boolean;
  wrapperClassName?: string;
}

/**
 * Native, high-performance HTML5 Video component with dual WebM + MP4 fallback support.
 * Purged of any ImageKit transformations to rely on direct pre-compressed assets or R2/Supabase URLs.
 */
export function AppVideo({
  src,
  webmSrc,
  mp4Src,
  poster,
  variant = "content",
  active = true,
  prepare = false,
  className,
  wrapperClassName,
  preload,
  controls,
  ...props
}: AppVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);

  // Variant behavior configuration
  const isHero = variant === "hero";
  const shouldAutoPlay = isHero ? true : props.autoPlay;
  const shouldMute = isHero ? true : props.muted;
  const shouldLoop = isHero ? true : props.loop;
  const shouldShowControls = isHero ? false : (controls ?? true);
  const derivedPreload = preload ?? (active || prepare ? "metadata" : "none");

  // Lazy mounting when below the fold (for non-hero videos)
  const [isIntersecting, setIsIntersecting] = useState(isHero);

  // Hero videos mount only after load + idle (poster is the LCP until then).
  // Without a poster there is nothing else to paint, so mount immediately.
  // Non-hero videos are gated by the IntersectionObserver alone.
  const deferHero = isHero && Boolean(poster);
  const [videoAllowed, setVideoAllowed] = useState(!deferHero);

  useEffect(() => {
    if (!deferHero || videoAllowed) return;
    if (preferPosterOnly()) return;
    return scheduleAfterLoad(() => setVideoAllowed(true));
  }, [deferHero, videoAllowed]);

  const canMountVideo = isIntersecting && videoAllowed;

  useEffect(() => {
    if (isIntersecting || isHero) return;
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setIsIntersecting(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setIsIntersecting(true);
          observer.disconnect();
        }
      },
      { rootMargin: "250px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [isIntersecting, isHero]);

  // Only render WebM or MP4 sources when explicitly provided or matching file extension
  const resolvedWebm = webmSrc || (src && src.toLowerCase().endsWith(".webm") ? src : null);
  const resolvedMp4 = mp4Src || (src && !src.toLowerCase().endsWith(".webm") ? src : null);
  const hasSources = Boolean(resolvedWebm || (resolvedMp4 && resolvedMp4 !== resolvedWebm));

  const handleFrameReady = () => {
    const video = videoRef.current;
    if (video && (video.currentTime > 0.01 || video.readyState >= 3)) {
      setIsVideoPlaying(true);
    }
  };

  // Reload and reset playback when src changes
  useEffect(() => {
    if (!canMountVideo) return;
    const video = videoRef.current;
    if (!video) return;
    setIsVideoPlaying(false);
    video.load();
    if (active) {
      video.play().catch(() => {});
    }
    // Intentionally omitted `active`: video element should only reload its source when media URLs change; play/pause toggling on active transitions is handled by the dedicated effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, resolvedMp4, resolvedWebm, canMountVideo]);

  // Re-trigger play when active changes in carousels
  useEffect(() => {
    if (!canMountVideo) return;
    const video = videoRef.current;
    if (!video) return;
    if (active) {
      video.play().catch(() => {
        // Autoplay policy fallback
      });
    } else {
      video.pause();
    }
  }, [active, canMountVideo]);

  // Inactive slides in carousels render poster thumbnail until prepared/activated
  if (!active && !prepare && poster) {
    return (
      <div
        ref={containerRef}
        className={wrapperClassName || "h-full w-full relative overflow-hidden"}
      >
        <ResponsiveImage
          src={poster}
          preset="hero"
          sizes="100vw"
          alt=""
          loading="lazy"
          className={className ?? "h-full w-full object-cover"}
        />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden ${wrapperClassName || "h-full w-full"}`}
    >
      {poster && (
        <ResponsiveImage
          src={poster}
          preset="hero"
          sizes="100vw"
          alt=""
          loading={active ? "eager" : "lazy"}
          fetchPriority={active && isHero ? "high" : "auto"}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ease-out z-0 ${
            isVideoPlaying ? "opacity-0 pointer-events-none" : "opacity-100"
          } ${className ?? ""}`}
        />
      )}

      {canMountVideo ? (
        <video
          key={src || "app-video"}
          ref={videoRef}
          {...(!hasSources && src ? { src } : {})}
          poster={poster ?? undefined}
          autoPlay={shouldAutoPlay}
          muted={shouldMute}
          loop={shouldLoop}
          controls={shouldShowControls}
          playsInline
          aria-hidden={isHero ? "true" : undefined}
          tabIndex={isHero ? -1 : undefined}
          preload={derivedPreload}
          disablePictureInPicture={isHero}
          disableRemotePlayback={isHero}
          onPlaying={handleFrameReady}
          onTimeUpdate={handleFrameReady}
          onCanPlay={handleFrameReady}
          className={`relative z-10 ${className ?? "h-full w-full object-cover"}`}
          {...props}
        >
          {resolvedWebm && <source src={resolvedWebm} type="video/webm" />}
          {resolvedMp4 && resolvedMp4 !== resolvedWebm && (
            <source src={resolvedMp4} type="video/mp4" />
          )}
          Your browser does not support the video tag.
        </video>
      ) : null}
    </div>
  );
}
