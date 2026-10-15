import * as React from "react";
import { Laptop, Play, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  HERO_PREVIEW_HEIGHT,
  HERO_PREVIEW_READY,
  HERO_PREVIEW_WIDTH,
  fromParent,
  heroPreviewDraft,
  heroPreviewScale,
  type HeroPreviewBrand,
  type HeroPreviewDevice,
} from "@/lib/hero-preview";

/**
 * The storefront's own hero for the slide being edited, as a shopper will see it: the store's
 * height, framing, shade, font and colours, the headline animating, on a laptop or a phone, in
 * Arabic or English. Drawn in a frame at the device's real width (src/routes/hero-preview.tsx) and
 * scaled down to fit; every edit reaches it at once, nothing is saved by it.
 */
export function HeroLivePreview({
  brand,
  settings,
  slide,
  background,
  isAr,
}: {
  brand: HeroPreviewBrand;
  settings: Record<string, unknown>;
  slide: Record<string, unknown>;
  background: Record<string, unknown> | null;
  isAr: boolean;
}) {
  const [device, setDevice] = React.useState<HeroPreviewDevice>("desktop");
  const [lang, setLang] = React.useState<"ar" | "en">(isAr ? "ar" : "en");
  const [replay, setReplay] = React.useState(0);
  const [ready, setReady] = React.useState(false);
  const [height, setHeight] = React.useState(0);
  const [available, setAvailable] = React.useState(0);
  const frameRef = React.useRef<HTMLIFrameElement>(null);
  const boxRef = React.useRef<HTMLDivElement>(null);

  // The frame says when it can draw, and how tall the hero is.
  React.useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const frame = frameRef.current?.contentWindow;
      if (!frame || !fromParent(event, { origin: window.location.origin, parent: frame })) return;
      const data = event.data as { type?: string; height?: number };
      if (data?.type === HERO_PREVIEW_READY) setReady(true);
      if (data?.type === HERO_PREVIEW_HEIGHT && Number(data.height) > 0) {
        setHeight(Number(data.height));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  React.useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setAvailable(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Every edit is drawn at once.
  React.useEffect(() => {
    if (!ready) return;
    frameRef.current?.contentWindow?.postMessage(
      heroPreviewDraft({ brand, settings, slides: [slide], background, lang, replay }),
      window.location.origin,
    );
  }, [ready, brand, settings, slide, background, lang, replay, device]);

  const width = HERO_PREVIEW_WIDTH[device];
  const scale = heroPreviewScale(device, available);

  return (
    <div className="min-w-0 space-y-2 rounded-xl border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">
          {isAr ? "معاينة حية كما في المتجر" : "Live preview, as in the store"}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Toggle
            pressed={device === "desktop"}
            onClick={() => setDevice("desktop")}
            label={isAr ? "كمبيوتر" : "Laptop"}
            icon={<Laptop className="h-3.5 w-3.5" />}
          />
          <Toggle
            pressed={device === "mobile"}
            onClick={() => setDevice("mobile")}
            label={isAr ? "جوال" : "Phone"}
            icon={<Smartphone className="h-3.5 w-3.5" />}
          />
          <Toggle pressed={lang === "ar"} onClick={() => setLang("ar")} label="ع" />
          <Toggle pressed={lang === "en"} onClick={() => setLang("en")} label="EN" />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1.5"
            onClick={() => setReplay((n) => n + 1)}
          >
            <Play className="h-3.5 w-3.5" />
            {isAr ? "تشغيل الحركة" : "Replay"}
          </Button>
        </div>
      </div>
      <div ref={boxRef} className="min-w-0">
        {/* Left to right: the frame is wider than the box before it is scaled, and on an Arabic
            page it would hang from the right edge while the scale pulls it to the left. */}
        <div
          dir="ltr"
          className="mx-auto overflow-hidden rounded-lg border border-border bg-muted"
          style={{ width: width * scale, height: Math.max(1, height) * scale || 160 }}
        >
          <iframe
            ref={frameRef}
            title={isAr ? "معاينة الواجهة" : "Hero preview"}
            src="/hero-preview"
            style={{
              width,
              height: height || 160,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              border: 0,
              display: "block",
            }}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {device === "desktop"
          ? isAr
            ? `شاشة كمبيوتر بعرض ${width}px. التعديلات تظهر هنا فوراً، وتُحفظ بزر الحفظ.`
            : `A ${width}px laptop screen. Edits show here at once and are saved with Save.`
          : isAr
            ? `شاشة جوال بعرض ${width}px. التعديلات تظهر هنا فوراً، وتُحفظ بزر الحفظ.`
            : `A ${width}px phone screen. Edits show here at once and are saved with Save.`}
      </p>
    </div>
  );
}

function Toggle({
  pressed,
  onClick,
  label,
  icon,
}: {
  pressed: boolean;
  onClick: () => void;
  label: string;
  icon?: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={pressed ? "default" : "outline"}
      aria-pressed={pressed}
      className="h-8 gap-1.5 px-2.5"
      onClick={onClick}
    >
      {icon}
      {label}
    </Button>
  );
}
