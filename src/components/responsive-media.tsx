import React, {
  useEffect,
  useRef,
  useState,
  type ImgHTMLAttributes,
  type VideoHTMLAttributes,
} from "react";
import {
  cloudflareImageSrcSet,
  cloudflareImageUrl,
  isLikelyImageUrl,
  type ResponsiveImagePreset,
} from "@/lib/media-delivery";
import { AppVideo } from "@/components/common/AppVideo";

type ResponsiveImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "srcSet"> & {
  src: string;
  preset?: ResponsiveImagePreset;
  quality?: number;
};

export function ResponsiveImage({
  src,
  preset = "card",
  quality,
  sizes,
  onError,
  ...props
}: ResponsiveImageProps) {
  const [fallback, setFallback] = useState(false);
  useEffect(() => setFallback(false), [src]);
  const largest =
    preset === "hero"
      ? 960
      : preset === "product"
        ? 640
        : preset === "content"
          ? 640
          : preset === "card"
            ? 480
            : 240;
  const intrinsicSize =
    preset === "thumb"
      ? { width: 240, height: 240 }
      : preset === "card" || preset === "product"
        ? { width: largest, height: Math.round((largest * 4) / 3) }
        : { width: largest, height: Math.round((largest * 9) / 16) };
  const computedSrcSet = fallback ? undefined : cloudflareImageSrcSet(src, preset, quality);
  return (
    <img
      {...props}
      width={props.width ?? intrinsicSize.width}
      height={props.height ?? intrinsicSize.height}
      src={fallback ? src : cloudflareImageUrl(src, largest, quality)}
      srcSet={computedSrcSet || undefined}
      sizes={computedSrcSet ? sizes : undefined}
      onError={(event) => {
        if (!fallback) setFallback(true);
        onError?.(event);
      }}
    />
  );
}

type OptimizedVideoProps = Omit<VideoHTMLAttributes<HTMLVideoElement>, "src" | "poster"> & {
  src?: string | null;
  poster?: string | null;
  streamIframeUrl?: string | null;
  active?: boolean;
  prepare?: boolean;
  wrapperClassName?: string;
};

export function OptimizedVideo({
  src,
  poster,
  streamIframeUrl,
  active = true,
  prepare = false,
  className,
  wrapperClassName,
  preload,
  ...props
}: OptimizedVideoProps) {
  const resolvedPoster = isLikelyImageUrl(poster) ? poster : null;

  if (streamIframeUrl) {
    const separator = streamIframeUrl.includes("?") ? "&" : "?";
    const iframeSrc = `${streamIframeUrl}${separator}autoplay=${active ? "true" : "false"}&muted=true&loop=true&controls=false&preload=metadata`;
    return (
      <div className={wrapperClassName || "h-full w-full"}>
        {!active && resolvedPoster ? (
          <ResponsiveImage
            src={resolvedPoster}
            preset="hero"
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <iframe
            key={iframeSrc}
            src={iframeSrc}
            title="Storefront video"
            allow="autoplay; encrypted-media"
            className="pointer-events-none h-full w-full border-0"
            loading={active ? "eager" : "lazy"}
          />
        )}
      </div>
    );
  }

  return (
    <AppVideo
      src={src}
      poster={resolvedPoster}
      variant="hero"
      active={active}
      prepare={prepare}
      className={className}
      wrapperClassName={wrapperClassName}
      preload={preload}
      {...props}
    />
  );
}
