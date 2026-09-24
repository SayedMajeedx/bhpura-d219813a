import { useEffect, useState, type ImgHTMLAttributes, type VideoHTMLAttributes } from "react";
import {
  cloudflareImageSrcSet,
  cloudflareImageUrl,
  isLikelyImageUrl,
  type ResponsiveImagePreset,
} from "@/lib/media-delivery";
import { HERO_MOBILE_QUERY } from "@/lib/hero-media";
import { AppVideo } from "@/components/common/AppVideo";

type ResponsiveImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "srcSet"> & {
  src: string;
  preset?: ResponsiveImagePreset;
  quality?: number;
  /** Phone-specific cut, chosen by the browser via <picture> below 640px. */
  mobileSrc?: string | null;
};

export function ResponsiveImage({
  src,
  preset = "card",
  quality,
  sizes,
  onError,
  mobileSrc,
  ...props
}: ResponsiveImageProps) {
  const [fallback, setFallback] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);

  useEffect(() => {
    setFallback(false);
    setHasFailed(false);
  }, [src]);

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
  const isHighPriority = props.fetchPriority === "high" || (props as any).fetchpriority === "high";

  if (hasFailed) {
    return (
      <div
        role="img"
        aria-label={props.alt || "Image unavailable"}
        className={`flex items-center justify-center bg-muted/50 text-muted-foreground ${props.className || ""}`}
        style={{
          width: props.width ?? intrinsicSize.width,
          height: props.height ?? intrinsicSize.height,
          ...props.style,
        }}
      >
        <svg
          className="h-8 w-8 opacity-35"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"
          />
        </svg>
      </div>
    );
  }

  const image = (
    <img
      {...props}
      width={props.width ?? intrinsicSize.width}
      height={props.height ?? intrinsicSize.height}
      src={fallback ? src : cloudflareImageUrl(src, largest, quality)}
      srcSet={computedSrcSet || undefined}
      sizes={computedSrcSet ? sizes : undefined}
      fetchPriority={isHighPriority ? "high" : props.fetchPriority}
      loading={isHighPriority ? "eager" : (props.loading ?? "lazy")}
      decoding={isHighPriority ? "sync" : (props.decoding ?? "async")}
      onError={(event) => {
        if (!fallback) {
          setFallback(true);
        } else {
          setHasFailed(true);
        }
        onError?.(event);
      }}
    />
  );

  if (!mobileSrc || mobileSrc === src) return image;

  const mobileSrcSet = fallback
    ? mobileSrc
    : cloudflareImageSrcSet(mobileSrc, preset, quality) || mobileSrc;
  return (
    // `display: contents` keeps the <img> laid out exactly as without <picture>.
    <picture style={{ display: "contents" }}>
      <source media={HERO_MOBILE_QUERY} srcSet={mobileSrcSet} sizes="100vw" />
      {image}
    </picture>
  );
}

type OptimizedVideoProps = Omit<VideoHTMLAttributes<HTMLVideoElement>, "src" | "poster"> & {
  src?: string | null;
  poster?: string | null;
  mobilePoster?: string | null;
  streamIframeUrl?: string | null;
  active?: boolean;
  prepare?: boolean;
  wrapperClassName?: string;
};

export function OptimizedVideo({
  src,
  poster,
  mobilePoster,
  streamIframeUrl,
  active = true,
  prepare = false,
  className,
  wrapperClassName,
  preload,
  ...props
}: OptimizedVideoProps) {
  const resolvedPoster = isLikelyImageUrl(poster) ? poster : null;
  const resolvedMobilePoster = isLikelyImageUrl(mobilePoster) ? mobilePoster : null;

  if (streamIframeUrl) {
    const separator = streamIframeUrl.includes("?") ? "&" : "?";
    const iframeSrc = `${streamIframeUrl}${separator}autoplay=${active ? "true" : "false"}&muted=true&loop=true&controls=false&preload=metadata`;
    return (
      <div className={wrapperClassName || "h-full w-full"}>
        {!active && resolvedPoster ? (
          <ResponsiveImage
            src={resolvedPoster}
            mobileSrc={resolvedMobilePoster}
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
      key={src || "opt-video"}
      src={src}
      poster={resolvedPoster}
      mobilePoster={resolvedMobilePoster}
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
