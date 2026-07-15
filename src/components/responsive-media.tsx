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
  return <img
    {...props}
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
  const [useOptimizedSource, setUseOptimizedSource] = useState(Boolean(optimizedDesktopSrc));

  useEffect(() => setUseOptimizedSource(Boolean(optimizedDesktopSrc)), [optimizedDesktopSrc, src]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (active) void video.play().catch(() => undefined);
    else video.pause();
  }, [active, src, useOptimizedSource]);

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

  const sourceKey = useOptimizedSource ? `${optimizedMobileSrc}|${optimizedDesktopSrc}` : src ?? "";
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
      if (useOptimizedSource && src) setUseOptimizedSource(false);
      props.onError?.(event);
    }}
  >
    {useOptimizedSource && optimizedDesktopSrc ? <>
      {optimizedMobileSrc ? <source src={optimizedMobileSrc} media="(max-width: 767px)" /> : null}
      <source src={optimizedDesktopSrc} />
    </> : src ? <source src={src} /> : null}
  </video>;
}
