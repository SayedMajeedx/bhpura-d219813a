import { useEffect, useRef, useState, type ImgHTMLAttributes, type VideoHTMLAttributes } from "react";
import { cloudflareImageSrcSet, cloudflareImageUrl, imageKitVideoPosterUrl, imageKitVideoUrl, isLikelyImageUrl, type ResponsiveImagePreset } from "@/lib/media-delivery";

type ResponsiveImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "srcSet"> & {
  src: string;
  preset?: ResponsiveImagePreset;
  quality?: number;
};

export function ResponsiveImage({ src, preset = "card", quality = 82, sizes = "100vw", onError, ...props }: ResponsiveImageProps) {
  const [fallback, setFallback] = useState(false);
  useEffect(() => setFallback(false), [src]);
  const largest = preset === "hero" ? 1920 : preset === "product" ? 1200 : preset === "content" ? 1600 : preset === "card" ? 960 : 320;
  const intrinsicSize = preset === "thumb"
    ? { width: 320, height: 320 }
    : preset === "card" || preset === "product"
      ? { width: largest, height: Math.round(largest * 4 / 3) }
      : { width: largest, height: Math.round(largest * 9 / 16) };
  return <img
    {...props}
    width={props.width ?? intrinsicSize.width}
    height={props.height ?? intrinsicSize.height}
    src={fallback ? src : cloudflareImageUrl(src, largest, quality)}
    srcSet={fallback ? undefined : cloudflareImageSrcSet(src, preset, quality)}
    sizes={sizes}
    onError={(event) => {
      if (!fallback) setFallback(true);
      onError?.(event);
    }}
  />;
}

type OptimizedVideoProps = Omit<VideoHTMLAttributes<HTMLVideoElement>, "src" | "poster"> & {
  src?: string | null;
  poster?: string | null;
  streamIframeUrl?: string | null;
  active?: boolean;
  wrapperClassName?: string;
};

export function OptimizedVideo({ src, poster, streamIframeUrl, active = true, className, wrapperClassName, preload, ...props }: OptimizedVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const optimizedDesktopSrc = src ? imageKitVideoUrl(src, "desktop") : null;
  const optimizedMobileSrc = src ? imageKitVideoUrl(src, "mobile") : null;
  const generatedPoster = src ? imageKitVideoPosterUrl(src) : null;
  const resolvedPoster = isLikelyImageUrl(poster) ? poster : generatedPoster;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (active) void video.play().catch(() => undefined);
    else video.pause();
  }, [active, src, optimizedDesktopSrc, optimizedMobileSrc]);

  if (streamIframeUrl) {
    const separator = streamIframeUrl.includes("?") ? "&" : "?";
    const iframeSrc = `${streamIframeUrl}${separator}autoplay=${active ? "true" : "false"}&muted=true&loop=true&controls=false&preload=metadata`;
    return <div className={wrapperClassName ?? className}>
      {!active && resolvedPoster ? <ResponsiveImage src={resolvedPoster} preset="hero" alt="" className="h-full w-full object-cover" /> : <iframe
        key={iframeSrc}
        src={iframeSrc}
        title="Storefront video"
        allow="autoplay; encrypted-media"
        className="pointer-events-none h-full w-full border-0"
        loading={active ? "eager" : "lazy"}
      />}
    </div>;
  }

  // Inactive carousel slides should not mount a video element. Even with
  // preload="none", browsers may fetch source metadata and posters for every
  // mounted video, delaying the active slide and the rest of the first screen.
  if (!active && resolvedPoster) {
    return <div className={wrapperClassName ?? className}>
      <ResponsiveImage
        src={resolvedPoster}
        preset="hero"
        sizes="(min-width: 640px) 576px, 88vw"
        alt=""
        className={className ?? "h-full w-full object-cover"}
        loading="lazy"
        decoding="async"
      />
    </div>;
  }

  // When ImageKit can represent this asset, keep the browser on ImageKit. A
  // media element may emit a transient error while responsive sources are
  // being selected or a carousel slide is paused. Falling back to the R2 URL
  // in that situation downloads the original MP4 in addition to the optimized
  // rendition and defeats the delivery optimization.
  const sourceKey = optimizedDesktopSrc ? `${optimizedMobileSrc}|${optimizedDesktopSrc}` : src ?? "";
  return <video
    ref={videoRef}
    key={sourceKey}
    poster={resolvedPoster ?? undefined}
    muted
    loop
    playsInline
    preload={preload ?? (active ? "metadata" : "none")}
    disablePictureInPicture
    className={className}
    {...props}
    onError={(event) => {
      props.onError?.(event);
    }}
  >
    {optimizedDesktopSrc ? <>
      {optimizedMobileSrc ? <source src={optimizedMobileSrc} media="(max-width: 767px)" /> : null}
      <source src={optimizedDesktopSrc} />
    </> : src ? <source src={src} /> : null}
  </video>;
}
