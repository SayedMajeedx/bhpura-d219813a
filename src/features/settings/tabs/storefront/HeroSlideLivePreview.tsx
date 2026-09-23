import * as React from "react";
import { Button } from "@/components/ui/button";

export type HeroSlide = {
  id: string;
  type: "text" | "image" | "video";
  title_en: string;
  title_ar: string;
  body_en: string;
  body_ar: string;
  media_url: string;
  media_url_en?: string;
  media_url_ar?: string;
  media_stream_uid_en?: string;
  media_stream_uid_ar?: string;
  media_iframe_url_en?: string;
  media_iframe_url_ar?: string;
  media_poster_url_en?: string;
  media_poster_url_ar?: string;
  media_aspect?: number;
  media_aspect_en?: number;
  media_aspect_ar?: number;
  /** Optional phone-specific cut, shown below 640px instead of the main media. */
  media_url_mobile_en?: string;
  media_url_mobile_ar?: string;
  media_poster_url_mobile_en?: string;
  media_poster_url_mobile_ar?: string;
  media_aspect_mobile_en?: number;
  media_aspect_mobile_ar?: number;
  /** Focal point (0–100 %) kept in view whenever the media has to be cropped. */
  focal_x?: number;
  focal_y?: number;
  button_en: string;
  button_ar: string;
  button_href: string;
  title_size?: number;
  align?: "start" | "center" | "end";
};

export function HeroSlideLivePreview({
  slide,
  isAr,
  color,
  radius = "1rem",
  badgeAccent = "maroon",
}: {
  slide: HeroSlide;
  isAr: boolean;
  color: string;
  radius?: string;
  badgeAccent?: string;
}) {
  const title = isAr ? slide.title_ar || slide.title_en : slide.title_en || slide.title_ar;
  const body = isAr ? slide.body_ar || slide.body_en : slide.body_en || slide.body_ar;
  const button = isAr ? slide.button_ar || slide.button_en : slide.button_en || slide.button_ar;
  const mediaUrl =
    (isAr ? slide.media_url_ar : slide.media_url_en) ||
    slide.media_url ||
    (isAr ? slide.media_url_en : slide.media_url_ar) ||
    "";

  const previewTitleSize = Math.max(16, Math.min(48, slide.title_size ?? 26));
  const previewAlign = slide.align ?? "start";
  const previewTextAlign =
    previewAlign === "center"
      ? "center"
      : isAr
        ? previewAlign === "end"
          ? "left"
          : "right"
        : previewAlign === "end"
          ? "right"
          : "left";

  const badgeBg =
    badgeAccent === "crimson"
      ? "var(--color-destructive, #dc2626)"
      : badgeAccent === "slate"
        ? "#334155"
        : badgeAccent === "emerald"
          ? "#059669"
          : "#8C6D58";

  return (
    <details className="group border-t border-border pt-3">
      <summary className="flex cursor-pointer list-none items-center justify-between rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
        <span>{isAr ? "معاينة المتجر المباشرة" : "Live storefront preview"}</span>
        <span
          aria-hidden="true"
          className="text-muted-foreground transition-transform group-open:rotate-180"
        >
          ⌄
        </span>
      </summary>
      <div
        dir={isAr ? "rtl" : "ltr"}
        style={
          {
            ["--primary" as any]: color || "var(--primary)",
            ["--radius-sf" as any]: radius,
            borderRadius: radius,
          } as React.CSSProperties
        }
        className="relative mx-auto mt-3 aspect-video w-full max-w-md overflow-hidden border border-border bg-card shadow-md transition-all"
      >
        {/* Sample Sale Badge preview */}
        <div
          className="absolute top-2.5 start-2.5 z-20 px-2.5 py-1 text-xs font-semibold text-white shadow-sm"
          style={{ backgroundColor: badgeBg, borderRadius: `calc(${radius} * 0.5)` }}
        >
          {isAr ? "خصم 20%" : "20% OFF"}
        </div>

        {mediaUrl ? (
          <div className="relative h-full w-full">
            {slide.type === "video" ? (
              <video
                key={mediaUrl}
                src={mediaUrl}
                muted
                autoPlay
                loop
                playsInline
                disablePictureInPicture
                className="h-full w-full object-cover"
              />
            ) : (
              <img src={mediaUrl} alt="" className="h-full w-full object-cover" />
            )}
            <div
              className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent flex flex-col justify-end p-4 text-white"
              style={{ textAlign: previewTextAlign }}
            >
              {title && (
                <h4
                  className="font-heading font-semibold text-white drop-shadow-sm leading-tight"
                  style={{ fontSize: `${previewTitleSize}px`, textAlign: previewTextAlign }}
                >
                  {title}
                </h4>
              )}
              {body && (
                <p
                  className="mt-1 line-clamp-2 text-xs text-white/90 drop-shadow-sm"
                  style={{ textAlign: previewTextAlign }}
                >
                  {body}
                </p>
              )}
              {button && (
                <div style={{ textAlign: previewTextAlign }}>
                  <Button
                    size="sm"
                    className="mt-2.5 w-fit min-h-[36px] px-4 text-xs font-semibold shadow-sm text-primary-foreground"
                    style={{
                      backgroundColor: "var(--primary)",
                      borderRadius: radius,
                    }}
                  >
                    {button}
                  </Button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div
            className="flex h-full flex-col justify-center p-5 text-card-foreground bg-card"
            style={{ textAlign: previewTextAlign }}
          >
            {title && (
              <h4
                className="font-heading font-semibold text-foreground leading-tight"
                style={{ fontSize: `${previewTitleSize}px`, textAlign: previewTextAlign }}
              >
                {title}
              </h4>
            )}
            {body && (
              <p
                className="mt-1 line-clamp-2 text-xs text-muted-foreground"
                style={{ textAlign: previewTextAlign }}
              >
                {body}
              </p>
            )}
            {button && (
              <div style={{ textAlign: previewTextAlign }}>
                <Button
                  size="sm"
                  className="mt-3 w-fit min-h-[36px] px-4 text-xs font-semibold shadow-sm text-primary-foreground"
                  style={{
                    backgroundColor: "var(--primary)",
                    borderRadius: radius,
                  }}
                >
                  {button}
                </Button>
              </div>
            )}
          </div>
        )}
        <div
          dir="ltr"
          className="pointer-events-none absolute inset-x-2 bottom-1.5 z-20 flex items-center justify-between text-white mix-blend-difference"
        >
          <span className="grid h-6 w-6 place-items-center bg-transparent text-sm font-light">
            ‹
          </span>
          <div className="flex items-center justify-center gap-1">
            <span className="block h-px w-5 bg-current" />
            <span className="block h-px w-2 bg-current opacity-50" />
          </div>
          <span className="grid h-6 w-6 place-items-center bg-transparent text-sm font-light">
            ›
          </span>
        </div>
      </div>
    </details>
  );
}
