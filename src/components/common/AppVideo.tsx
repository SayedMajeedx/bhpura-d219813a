import React, { useRef, useState, useEffect, type VideoHTMLAttributes } from "react";
import { ResponsiveImage } from "@/components/responsive-media";

export type VideoVariant = "hero" | "content" | "modal";

export interface AppVideoProps extends Omit<VideoHTMLAttributes<HTMLVideoElement>, "src" | "poster"> {
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
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);

  // Only render WebM or MP4 sources when explicitly provided or matching file extension
  const resolvedWebm = webmSrc || (src && src.toLowerCase().endsWith(".webm") ? src : null);
  const resolvedMp4 = mp4Src || (src && !src.toLowerCase().endsWith(".webm") ? src : null);

  const handleFrameReady = () => {
    const video = videoRef.current;
    if (video && (video.currentTime > 0.01 || video.readyState >= 3)) {
      setIsVideoPlaying(true);
    }
  };

  // Re-trigger play when active changes in carousels
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (active) {
      video.play().catch(() => {
        // Autoplay policy fallback
      });
    } else {
      video.pause();
    }
  }, [active]);

  // Variant behavior configuration
  const isHero = variant === "hero";
  const shouldAutoPlay = isHero ? true : props.autoPlay;
  const shouldMute = isHero ? true : props.muted;
  const shouldLoop = isHero ? true : props.loop;
  const shouldShowControls = isHero ? false : (controls ?? true);
  const derivedPreload = preload ?? (active || prepare ? "metadata" : "none");

  // Inactive slides in carousels render poster thumbnail until prepared/activated
  if (!active && !prepare && poster) {
    return (
      <div className={wrapperClassName || "h-full w-full relative overflow-hidden"}>
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
    <div className={`relative overflow-hidden ${wrapperClassName || "h-full w-full"}`}>
      {poster && (
        <ResponsiveImage
          src={poster}
          preset="hero"
          sizes="100vw"
          alt=""
          loading={active ? "eager" : "lazy"}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ease-out z-0 ${
            isVideoPlaying ? "opacity-0 pointer-events-none" : "opacity-100"
          } ${className ?? ""}`}
        />
      )}

      <video
        ref={videoRef}
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
    </div>
  );
}
