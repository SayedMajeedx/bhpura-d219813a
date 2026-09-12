import React, { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getStorefrontUrl } from "@/lib/storefront-url";
import {
  Smartphone,
  Monitor,
  RotateCw,
  ExternalLink,
  Sparkles,
  Loader2,
  Lock,
  Wifi,
  Battery,
  ArrowRight,
} from "lucide-react";

interface StorefrontLivePreviewProps {
  slug?: string;
  displaySlug?: string;
  brandName?: string;
  isAr?: boolean;
  className?: string;
  onActionClick?: () => void;
}

export function StorefrontLivePreview({
  slug = "pura",
  displaySlug,
  brandName,
  isAr = true,
  className,
  onActionClick,
}: StorefrontLivePreviewProps) {
  const [device, setDevice] = useState<"mobile" | "desktop">("mobile");
  const [isLoading, setIsLoading] = useState(true);
  const [iframeKey, setIframeKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Storefront iframe source URL (relative path ensures reliable same-origin loading)
  const iframeSrc = `/${slug.trim().toLowerCase()}?preview=1`;
  const externalUrl = getStorefrontUrl(slug);

  // Subdomain for mockup address bars: ensure only clean latin subdomain without flipped Arabic text
  const rawSubdomain = (displaySlug || slug).trim().toLowerCase();
  const cleanSubdomain =
    rawSubdomain && !/[\u0600-\u06FF]/.test(rawSubdomain)
      ? rawSubdomain.replace(/[^a-z0-9-]/g, "")
      : slug.trim().toLowerCase();

  const handleRefresh = () => {
    setIsLoading(true);
    setIframeKey((prev) => prev + 1);
  };

  return (
    <div className={cn("flex flex-col items-center w-full", className)}>
      {/* 1. Header Toolbar */}
      <div className="w-full flex items-center justify-between gap-2 p-2.5 mb-3 rounded-2xl bg-card border border-border shadow-xs">
        {/* Live Status Badge */}
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold px-2.5 py-0.5 gap-1.5"
          >
            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>{isAr ? "تجربة حية تفاعلية" : "Interactive Live Demo"}</span>
          </Badge>
        </div>

        {/* Device Mode Switcher */}
        <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-xl border border-border-subtle">
          <Button
            type="button"
            variant={device === "mobile" ? "default" : "ghost"}
            size="sm"
            onClick={() => setDevice("mobile")}
            className={cn(
              "h-8 px-2.5 text-xs font-semibold gap-1.5 transition-all rounded-lg",
              device === "mobile" ? "shadow-xs" : "text-muted-foreground hover:text-foreground",
            )}
            title={isAr ? "معاينة الجوال" : "Mobile view"}
          >
            <Smartphone className="size-3.5" />
            <span className="hidden sm:inline">{isAr ? "موبايل" : "Mobile"}</span>
          </Button>

          <Button
            type="button"
            variant={device === "desktop" ? "default" : "ghost"}
            size="sm"
            onClick={() => setDevice("desktop")}
            className={cn(
              "h-8 px-2.5 text-xs font-semibold gap-1.5 transition-all rounded-lg",
              device === "desktop" ? "shadow-xs" : "text-muted-foreground hover:text-foreground",
            )}
            title={isAr ? "معاينة الكمبيوتر" : "Desktop view"}
          >
            <Monitor className="size-3.5" />
            <span className="hidden sm:inline">{isAr ? "كمبيوتر" : "Desktop"}</span>
          </Button>
        </div>

        {/* Actions: Refresh & Open Fullscreen */}
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            className="size-8 text-muted-foreground hover:text-foreground"
            title={isAr ? "إعادة تحميل المعاينة" : "Refresh preview"}
            aria-label={isAr ? "إعادة تحميل المعاينة" : "Refresh preview"}
          >
            <RotateCw className={cn("size-3.5", isLoading && "animate-spin")} />
          </Button>

          <Button
            asChild
            variant="outline"
            size="sm"
            className="h-8 px-2.5 text-xs font-semibold gap-1.5 text-muted-foreground hover:text-foreground"
            title={isAr ? "فتح المتجر في نافذة مستقلة" : "Open in new window"}
          >
            <a href={externalUrl} target="_blank" rel="noopener noreferrer">
              <span className="hidden md:inline">{isAr ? "شاشة كاملة" : "Fullscreen"}</span>
              <ExternalLink className="size-3.5" />
            </a>
          </Button>
        </div>
      </div>

      {/* 2. Device Mockup Frame */}
      <div
        className={cn(
          "w-full flex justify-center transition-all duration-300",
          device === "mobile" ? "max-w-[360px] sm:max-w-[380px]" : "max-w-full",
        )}
      >
        {device === "mobile" ? (
          /* Mobile Phone Mockup */
          <div className="w-full relative flex flex-col items-center">
            {/* Phone Bezel */}
            <div
              dir="ltr"
              className="w-full h-[640px] sm:h-[690px] bg-card rounded-[38px] border-[5px] sm:border-[6px] border-border shadow-2xl overflow-hidden flex flex-col relative ring-1 ring-border/50"
            >
              {/* iOS Status Bar + Dynamic Island */}
              <div className="h-8 w-full bg-background/95 backdrop-blur border-b border-border-subtle px-5 flex items-center justify-between shrink-0 relative z-30 select-none">
                <span className="text-xs font-semibold text-foreground tracking-tight font-mono">
                  9:41
                </span>

                {/* Dynamic Island Pill */}
                <div className="absolute top-1.5 left-1/2 -translate-x-1/2 w-24 h-4 bg-foreground/90 rounded-full flex items-center justify-center pointer-events-none shadow-xs">
                  <div className="size-2 rounded-full bg-background/20 me-auto ms-2" />
                  <div className="size-1.5 rounded-full bg-background/30 ms-auto me-2" />
                </div>

                <div className="flex items-center gap-1.5 text-foreground">
                  <Wifi className="size-3" />
                  <Battery className="size-3.5" />
                </div>
              </div>

              {/* iOS Safari Mock Address Pill */}
              <div className="h-7 bg-muted/60 border-b border-border-subtle px-3 flex items-center justify-center shrink-0">
                <div className="w-full max-w-[240px] h-5 bg-background/90 rounded-md border border-border-subtle px-2 flex items-center justify-center gap-1 text-xs text-muted-foreground font-mono truncate">
                  <Lock className="size-2.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span className="truncate">{cleanSubdomain}.boutq.store</span>
                </div>
              </div>

              {/* Loading Skeleton */}
              {isLoading && (
                <div className="absolute inset-0 bg-background/80 backdrop-blur-xs z-20 flex flex-col items-center justify-center p-6 text-center space-y-3">
                  <div className="size-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary animate-pulse">
                    <Loader2 className="size-6 animate-spin" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-foreground">
                      {isAr ? "جاري تحميل المتجر الحي..." : "Loading live boutique..."}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {isAr ? "تصفح المنتجات والسلة بحرية" : "Browse products and cart live"}
                    </p>
                  </div>
                </div>
              )}

              {/* Storefront Iframe */}
              <iframe
                key={iframeKey}
                ref={iframeRef}
                src={iframeSrc}
                title={isAr ? "معاينة المتجر الإلكتروني" : "Storefront Live Preview"}
                className="w-full flex-1 border-0 bg-background overflow-hidden"
                style={{ scrollbarWidth: "none" }}
                onLoad={() => {
                  setIsLoading(false);
                  try {
                    iframeRef.current?.contentWindow?.scrollTo(0, 0);
                  } catch {
                    // cross-origin access guard
                  }
                }}
                sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
              />

              {/* Home Indicator Bar */}
              <div className="w-full py-1.5 bg-background flex justify-center items-center shrink-0 border-t border-border-subtle">
                <div className="w-28 h-1 rounded-full bg-muted-foreground/30" />
              </div>
            </div>
          </div>
        ) : (
          /* Desktop Browser Mockup */
          <div className="w-full h-[640px] sm:h-[680px] bg-card rounded-2xl border border-border shadow-xl overflow-hidden flex flex-col relative">
            {/* Simulated Browser Address Bar */}
            <div className="h-10 bg-muted/60 border-b border-border px-3.5 flex items-center gap-3 shrink-0">
              {/* Traffic Light Dots */}
              <div className="flex items-center gap-1.5">
                <div className="size-2.5 rounded-full bg-destructive/70" />
                <div className="size-2.5 rounded-full bg-amber-500/70" />
                <div className="size-2.5 rounded-full bg-emerald-500/70" />
              </div>

              {/* URL Address Pill */}
              <div
                dir="ltr"
                className="flex-1 max-w-sm mx-auto h-6 bg-background rounded-md border border-border-strong px-2.5 flex items-center gap-1.5 text-xs text-muted-foreground font-mono truncate"
              >
                <Lock className="size-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="truncate">{cleanSubdomain}.boutq.store</span>
              </div>
            </div>

            {/* Loading Skeleton */}
            {isLoading && (
              <div className="absolute inset-0 bg-background/80 backdrop-blur-xs z-20 flex flex-col items-center justify-center p-6 text-center space-y-3">
                <div className="size-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary animate-pulse">
                  <Loader2 className="size-6 animate-spin" />
                </div>
                <p className="text-xs font-bold text-foreground">
                  {isAr ? "جاري تحميل المتجر الحي..." : "Loading live boutique..."}
                </p>
              </div>
            )}

            {/* Storefront Iframe */}
            <iframe
              key={iframeKey}
              ref={iframeRef}
              src={iframeSrc}
              title={isAr ? "معاينة المتجر الإلكتروني" : "Storefront Live Preview"}
              className="w-full flex-1 border-0 bg-background"
              onLoad={() => setIsLoading(false)}
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
            />
          </div>
        )}
      </div>

      {/* 3. Bottom Helpful Banner */}
      <div className="mt-3.5 w-full max-w-lg p-3.5 rounded-xl border border-primary/20 bg-primary/5 flex flex-col gap-2 text-xs text-foreground leading-relaxed">
        <div className="flex items-start gap-2.5">
          <Sparkles className="size-4 text-primary shrink-0 mt-0.5" />
          <p className="text-muted-foreground">
            {isAr ? (
              <>
                <strong className="text-foreground font-semibold">متجر حقيقي تفاعلي:</strong> يمكنك
                تصفح الأقسام، واختيار المقاسات، وإضافة المنتجات للسلة مباشرة لتجربة رحلة عميلك قبل
                إطلاق متجرك.
              </>
            ) : (
              <>
                <strong className="text-foreground font-semibold">Real Interactive Store:</strong>{" "}
                Feel free to browse collections, pick variants, and test the cart before launching
                your boutique.
              </>
            )}
          </p>
        </div>

        {onActionClick && (
          <Button
            type="button"
            size="sm"
            onClick={onActionClick}
            className="w-full mt-1 h-8 text-xs font-bold gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <span>
              {isAr
                ? `ابدأ إطلاق متجرك ${brandName ? `«${brandName}»` : ""} الآن`
                : `Launch ${brandName || "Your Store"} Now`}
            </span>
            <ArrowRight className="size-3.5 rtl:rotate-180" />
          </Button>
        )}
      </div>
    </div>
  );
}
