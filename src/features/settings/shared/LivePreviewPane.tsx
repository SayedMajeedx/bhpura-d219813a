import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getStorefrontUrl } from "@/lib/storefront-url";
import { useI18n } from "@/lib/i18n";
import {
  Smartphone,
  Monitor,
  RotateCw,
  ExternalLink,
  Loader2,
  Lock,
  Wifi,
  Battery,
  Eye,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

interface LivePreviewPaneProps {
  slug: string;
  brandName?: string;
  saveCount?: number;
  isOpen: boolean;
  onToggle: () => void;
  className?: string;
}

export function LivePreviewPane({
  slug,
  brandName,
  saveCount = 0,
  isOpen,
  onToggle,
  className,
}: LivePreviewPaneProps) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const [device, setDevice] = useState<"mobile" | "desktop">("mobile");
  const [isLoading, setIsLoading] = useState(true);
  const [iframeKey, setIframeKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const prevSaveCountRef = useRef(saveCount);

  // Reload iframe whenever save succeeds
  useEffect(() => {
    if (saveCount > prevSaveCountRef.current) {
      prevSaveCountRef.current = saveCount;
      try {
        if (iframeRef.current?.contentWindow) {
          iframeRef.current.contentWindow.location.reload();
        } else {
          setIframeKey((k) => k + 1);
        }
      } catch {
        setIframeKey((k) => k + 1);
      }
    }
  }, [saveCount]);

  const handleManualRefresh = useCallback(() => {
    setIsLoading(true);
    setIframeKey((k) => k + 1);
  }, []);

  const iframeSrc = `/${slug.trim().toLowerCase()}?preview=1`;
  const externalUrl = getStorefrontUrl(slug);

  if (!isOpen) {
    return (
      <div className={cn("hidden xl:flex items-center", className)}>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onToggle}
          className="gap-2 rounded-xl shadow-xs bg-card hover:bg-muted text-xs h-9"
          title={isAr ? "فتح لوحة المعاينة المباشرة" : "Open live preview pane"}
        >
          <Eye className="size-3.5 text-primary" />
          <span>{isAr ? "معاينة المتجر المباشرة" : "Live Store Preview"}</span>
        </Button>
      </div>
    );
  }

  return (
    <aside
      dir="ltr"
      aria-label="Live Storefront Preview"
      className={cn(
        "hidden xl:flex flex-col w-[420px] 2xl:w-[480px] shrink-0 border-s border-border bg-card h-[calc(100vh-6rem)] sticky top-20 rounded-2xl overflow-hidden shadow-lg",
        className,
      )}
    >
      {/* 1. Header Toolbar */}
      <div className="flex items-center justify-between p-3 border-b border-border bg-card/80 gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="border-success/30 bg-success/10 text-success text-xs font-semibold px-2 py-0.5 gap-1.5"
          >
            <span className="size-2 rounded-full bg-success animate-pulse" />
            <span>{isAr ? "معاينة مباشرة" : "Live Preview"}</span>
          </Badge>
          {brandName && (
            <span className="text-xs font-medium text-muted-foreground truncate max-w-[120px]">
              {brandName}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Mobile / Desktop switcher */}
          <div className="flex items-center bg-muted/60 p-0.5 rounded-lg border border-border">
            <Button
              type="button"
              variant={device === "mobile" ? "default" : "ghost"}
              size="icon"
              onClick={() => setDevice("mobile")}
              className="size-7 rounded-md"
              title={isAr ? "عرض الجوال" : "Mobile view"}
            >
              <Smartphone className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant={device === "desktop" ? "default" : "ghost"}
              size="icon"
              onClick={() => setDevice("desktop")}
              className="size-7 rounded-md"
              title={isAr ? "عرض سطح المكتب" : "Desktop view"}
            >
              <Monitor className="size-3.5" />
            </Button>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleManualRefresh}
            className="size-7 rounded-md text-muted-foreground hover:text-foreground"
            title={isAr ? "تحديث المعاينة" : "Refresh preview"}
          >
            <RotateCw className={cn("size-3.5", isLoading && "animate-spin text-primary")} />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            asChild
            className="size-7 rounded-md text-muted-foreground hover:text-foreground"
            title={isAr ? "فتح في نافذة جديدة" : "Open in new window"}
          >
            <a href={externalUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="size-3.5" />
            </a>
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className="size-7 rounded-md text-muted-foreground hover:text-foreground"
            title={isAr ? "إغلاق المعاينة" : "Close preview"}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* 2. Mockup Frame */}
      <div className="relative flex-1 p-3 overflow-hidden flex items-center justify-center bg-muted/30">
        {device === "mobile" ? (
          /* Mobile Frame Mockup */
          <div className="w-[360px] h-full max-h-[720px] rounded-[38px] border-[6px] border-border bg-card shadow-2xl flex flex-col overflow-hidden relative ring-1 ring-border/50">
            {/* Status bar */}
            <div className="h-6 w-full bg-background/90 px-5 flex items-center justify-between text-xs font-semibold text-muted-foreground shrink-0 select-none z-10 border-b border-border">
              <span>9:41</span>
              {/* Dynamic Island */}
              <div className="h-3 w-16 bg-foreground/20 rounded-full" />
              <div className="flex items-center gap-1 text-muted-foreground">
                <Wifi className="size-2.5" />
                <Battery className="size-2.5" />
              </div>
            </div>

            {/* Address Bar */}
            <div className="h-7 w-full bg-muted/40 px-3 flex items-center justify-center border-b border-border shrink-0 select-none">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
                <Lock className="size-2.5 text-success" />
                <span>{slug}.boutq.com</span>
              </div>
            </div>

            {/* Iframe Viewport */}
            <div className="relative flex-1 w-full bg-background overflow-hidden">
              {isLoading && (
                <div className="absolute inset-0 bg-background/80 backdrop-blur-xs flex flex-col items-center justify-center gap-2 z-20">
                  <Loader2 className="size-6 animate-spin text-primary" />
                  <span className="text-xs text-muted-foreground font-medium">
                    {isAr ? "جاري تحميل المتجر..." : "Loading preview..."}
                  </span>
                </div>
              )}
              <iframe
                ref={iframeRef}
                key={iframeKey}
                src={iframeSrc}
                title="Storefront Live Preview"
                className="w-full h-full border-none"
                onLoad={() => setIsLoading(false)}
              />
            </div>

            {/* Home indicator bar */}
            <div className="h-4 w-full bg-background flex items-center justify-center shrink-0">
              <div className="h-1 w-24 bg-foreground/20 rounded-full" />
            </div>
          </div>
        ) : (
          /* Desktop Frame Mockup */
          <div className="w-full h-full rounded-xl border border-border bg-card shadow-xl flex flex-col overflow-hidden">
            {/* Browser top chrome */}
            <div className="h-8 w-full bg-muted/60 px-3 flex items-center gap-2 border-b border-border shrink-0 select-none">
              <div className="flex items-center gap-1.5">
                <div className="size-2.5 rounded-full bg-destructive/60" />
                <div className="size-2.5 rounded-full bg-warning/60" />
                <div className="size-2.5 rounded-full bg-success/60" />
              </div>
              <div className="flex-1 max-w-xs mx-auto h-5 bg-background/80 rounded-md border border-border px-2 flex items-center gap-1 text-xs text-muted-foreground font-mono truncate">
                <Lock className="size-2.5 text-success shrink-0" />
                <span className="truncate">{slug}.boutq.com</span>
              </div>
            </div>

            {/* Iframe Viewport */}
            <div className="relative flex-1 w-full bg-background overflow-hidden">
              {isLoading && (
                <div className="absolute inset-0 bg-background/80 backdrop-blur-xs flex flex-col items-center justify-center gap-2 z-20">
                  <Loader2 className="size-6 animate-spin text-primary" />
                  <span className="text-xs text-muted-foreground font-medium">
                    {isAr ? "جاري تحميل المتجر..." : "Loading preview..."}
                  </span>
                </div>
              )}
              <iframe
                ref={iframeRef}
                key={iframeKey}
                src={iframeSrc}
                title="Storefront Live Preview"
                className="w-full h-full border-none"
                onLoad={() => setIsLoading(false)}
              />
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
