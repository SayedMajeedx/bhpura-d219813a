import * as React from "react";
import { Crosshair, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cloudflareImageUrl } from "@/lib/media-delivery";
import {
  HERO_COVER_TOLERANCE,
  coverCropFraction,
  heroMediaFit,
  isValidAspect,
  useMeasuredAspects,
  type AspectProbe,
} from "@/lib/media-aspect";
import {
  hasCustomFocal,
  heroFocalPosition,
  heroFrameAspect,
  isSmartFitSetting,
  resolveHeroSlideMedia,
  type HeroBackgroundInput,
  type HeroDevice,
  type HeroLang,
  type HeroMediaVariant,
  type HeroSlideMediaFields,
} from "@/lib/hero-media";

export type HeroFramingSettings = {
  fit?: string | null;
  mobileRatio?: string | null;
  desktopHeight?: string | null;
};

type DeviceVerdict = {
  device: HeroDevice;
  frameAspect: number;
  variant: HeroMediaVariant | null;
  aspect: number | null;
  fit: "cover" | "contain";
  crop: number;
};

/**
 * Simulates the storefront hero for one slide on a phone (390×844) and a
 * laptop (1440×900) using the same frame model as HeroV2, and says plainly
 * whether anything will be cut off.
 */
export function HeroFramePreview({
  slides,
  index,
  background,
  framing,
  isAr,
}: {
  slides: HeroSlideMediaFields[];
  index: number;
  background?: HeroBackgroundInput;
  framing: HeroFramingSettings;
  isAr: boolean;
}) {
  const [lang, setLang] = React.useState<HeroLang>(isAr ? "ar" : "en");
  const resolved = slides.map((slide) => resolveHeroSlideMedia(slide, lang, background));

  const probes: AspectProbe[] = resolved
    .flatMap((r) => [
      r.main && { variant: r.main, isVideo: r.isVideo },
      r.mobile && { variant: r.mobile, isVideo: r.isVideo },
    ])
    .filter((entry): entry is { variant: HeroMediaVariant; isVideo: boolean } =>
      Boolean(entry && !entry.variant.aspect),
    )
    .map(({ variant, isVideo }) => ({
      key: variant.url,
      url: variant.posterUrl || variant.url,
      isVideo: !variant.posterUrl && isVideo,
    }));
  const measured = useMeasuredAspects(probes);
  const aspectOf = (variant: HeroMediaVariant | null) =>
    variant ? (variant.aspect ?? measured[variant.url] ?? null) : null;

  const current = resolved[index];
  if (!current?.main) return null;

  // Same lead rule as HeroV2: the first slide shapes the carousel frame.
  const leadIndex = resolved[0]?.main
    ? 0
    : resolved.findIndex((r) => isValidAspect(aspectOf(r.main)));
  const lead = leadIndex >= 0 ? resolved[leadIndex] : null;
  const leadDesktop = lead ? aspectOf(lead.main) : null;
  const leadMobile = lead ? (aspectOf(lead.mobile) ?? leadDesktop) : null;
  const smart = isSmartFitSetting(framing.fit);

  const verdicts: DeviceVerdict[] = (["mobile", "desktop"] as const).map((device) => {
    const frameAspect = heroFrameAspect({
      device,
      fitSetting: framing.fit,
      leadAspect: device === "mobile" ? leadMobile : leadDesktop,
      mobileRatio: framing.mobileRatio,
      desktopHeight: framing.desktopHeight,
    });
    const variant = device === "mobile" && current.mobile ? current.mobile : current.main;
    const aspect =
      device === "mobile"
        ? (aspectOf(current.mobile) ?? aspectOf(current.main))
        : aspectOf(current.main);
    const fit = smart ? heroMediaFit(aspect, frameAspect) : "cover";
    const crop =
      fit === "cover" && isValidAspect(aspect) ? coverCropFraction(aspect, frameAspect) : 0;
    return { device, frameAspect, variant, aspect, fit, crop };
  });

  const slide = slides[index];
  const focal = heroFocalPosition(slide, framing.fit);

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs font-semibold">
          {isAr ? "كيف ستظهر الشريحة في المتجر" : "How this slide will look"}
        </Label>
        <div
          className="flex gap-1"
          role="group"
          aria-label={isAr ? "لغة المعاينة" : "Preview language"}
        >
          {(["ar", "en"] as const).map((l) => (
            <Button
              key={l}
              type="button"
              size="sm"
              variant={lang === l ? "default" : "outline"}
              className="h-7 min-w-10 px-2 text-xs"
              aria-pressed={lang === l}
              onClick={() => setLang(l)}
            >
              {l === "ar" ? "ع" : "EN"}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex items-start gap-3" dir="ltr">
        {verdicts.map((verdict) => (
          <figure
            key={verdict.device}
            className={verdict.device === "mobile" ? "w-28 shrink-0" : "min-w-0 flex-1"}
          >
            <div
              className="relative w-full overflow-hidden rounded-md bg-neutral-950 ring-1 ring-border"
              style={{ aspectRatio: String(verdict.frameAspect) }}
            >
              <PreviewStill verdict={verdict} focal={focal} isAr={isAr} />
            </div>
            <figcaption className="mt-1.5 space-y-0.5" dir={isAr ? "rtl" : "ltr"}>
              <span className="block text-xs font-medium text-foreground">
                {verdict.device === "mobile"
                  ? isAr
                    ? "الجوال"
                    : "Phone"
                  : isAr
                    ? "الكمبيوتر"
                    : "Desktop"}
              </span>
              <VerdictText verdict={verdict} isAr={isAr} />
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

function PreviewStill({
  verdict,
  focal,
  isAr,
}: {
  verdict: DeviceVerdict;
  focal: string;
  isAr: boolean;
}) {
  const still = verdict.variant?.posterUrl;
  if (!still) {
    return (
      <div className="flex size-full items-center justify-center p-2 text-center text-xs text-white/60">
        {isAr ? "لا توجد صورة غلاف للمعاينة" : "No preview still"}
      </div>
    );
  }
  const src = cloudflareImageUrl(still, 640);
  if (verdict.fit === "contain") {
    return (
      <>
        <img
          src={cloudflareImageUrl(still, 160)}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 size-full scale-125 object-cover opacity-70 blur-xl saturate-150"
        />
        <img src={src} alt="" className="absolute inset-0 size-full object-contain" />
      </>
    );
  }
  return (
    <img
      src={src}
      alt=""
      className="absolute inset-0 size-full object-cover"
      style={{ objectPosition: focal }}
    />
  );
}

function VerdictText({ verdict, isAr }: { verdict: DeviceVerdict; isAr: boolean }) {
  if (!isValidAspect(verdict.aspect)) {
    return (
      <span className="block text-xs text-muted-foreground">
        {isAr ? "جارٍ قياس الأبعاد…" : "Measuring…"}
      </span>
    );
  }
  if (verdict.fit === "contain") {
    return (
      <span className="block text-xs text-emerald-700 dark:text-emerald-400">
        {isAr ? "تظهر كاملة مع خلفية ضبابية" : "Shown whole over a blurred fill"}
      </span>
    );
  }
  if (verdict.crop <= HERO_COVER_TOLERANCE) {
    return (
      <span className="block text-xs text-emerald-700 dark:text-emerald-400">
        {isAr ? "تظهر كاملة" : "Shows in full"}
      </span>
    );
  }
  const percent = Math.round(verdict.crop * 100);
  return (
    <span className="block text-xs text-amber-700 dark:text-amber-400">
      {isAr
        ? `يُقص نحو ${percent}% — حدّد نقطة التركيز${verdict.device === "mobile" ? " أو أضف نسخة للجوال" : ""}`
        : `About ${percent}% cropped — set a focal point${verdict.device === "mobile" ? " or add a phone version" : ""}`}
    </span>
  );
}

/**
 * Click (or use arrow keys) to choose the point that must stay in view when
 * the storefront has to crop this slide.
 */
export function HeroFocalPointPicker({
  imageUrl,
  slide,
  fitSetting,
  isAr,
  onChange,
}: {
  imageUrl: string | null;
  slide: HeroSlideMediaFields;
  fitSetting?: string | null;
  isAr: boolean;
  onChange: (patch: { focal_x?: number; focal_y?: number }) => void;
}) {
  const imgRef = React.useRef<HTMLImageElement>(null);
  if (!imageUrl) return null;

  const [xs, ys] = heroFocalPosition(slide, fitSetting).split(" ");
  const x = parseFloat(xs);
  const y = parseFloat(ys);
  const set = (nx: number, ny: number) =>
    onChange({
      focal_x: Math.round(Math.min(100, Math.max(0, nx))),
      focal_y: Math.round(Math.min(100, Math.max(0, ny))),
    });

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="flex items-center gap-1.5 text-xs font-semibold">
          <Crosshair className="size-3.5 text-primary" />
          {isAr ? "نقطة التركيز" : "Focal point"}
        </Label>
        {hasCustomFocal(slide) && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1 text-xs"
            onClick={() => onChange({ focal_x: undefined, focal_y: undefined })}
          >
            <RotateCcw className="size-3.5" />
            {isAr ? "إعادة للوسط" : "Reset"}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {isAr
          ? "اضغط على الجزء الأهم (الوجه، الشعار أو النص). يبقى ظاهراً كلما احتاجت الواجهة إلى القص."
          : "Tap the part that matters most (face, logo or text). It stays in view whenever the hero has to crop."}
      </p>
      <div className="flex justify-center rounded-md bg-neutral-950 p-1" dir="ltr">
        <Button
          type="button"
          variant="ghost"
          className="relative block h-auto max-w-full cursor-crosshair rounded-none p-0 hover:bg-transparent active:scale-100"
          aria-label={
            isAr
              ? `نقطة التركيز ${Math.round(x)}% أفقياً، ${Math.round(y)}% عمودياً. استخدم الأسهم للتعديل.`
              : `Focal point ${Math.round(x)}% across, ${Math.round(y)}% down. Use arrow keys to adjust.`
          }
          onClick={(event) => {
            const rect = imgRef.current?.getBoundingClientRect();
            if (!rect || rect.width === 0 || rect.height === 0) return;
            set(
              ((event.clientX - rect.left) / rect.width) * 100,
              ((event.clientY - rect.top) / rect.height) * 100,
            );
          }}
          onKeyDown={(event) => {
            const step = event.shiftKey ? 10 : 2;
            const moves: Record<string, [number, number]> = {
              ArrowLeft: [-step, 0],
              ArrowRight: [step, 0],
              ArrowUp: [0, -step],
              ArrowDown: [0, step],
            };
            const move = moves[event.key];
            if (!move) return;
            event.preventDefault();
            set(x + move[0], y + move[1]);
          }}
        >
          <img
            ref={imgRef}
            src={cloudflareImageUrl(imageUrl, 640)}
            alt=""
            draggable={false}
            className="block max-h-56 w-auto max-w-full select-none"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_2px_rgba(0,0,0,0.6)]"
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            <span className="absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
          </span>
        </Button>
      </div>
    </div>
  );
}
