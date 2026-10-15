import { CircleAlert, CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HERO_LOOK_PRESETS, type HeroHeadlineFields } from "@/lib/hero-headline";
import type { ContrastAdvice } from "@/lib/hero-contrast";
import { slideContrast, type ContrastFraming } from "./hero-contrast-check";
import { useImagePixels } from "./use-image-pixels";

type LookPatch = Pick<HeroHeadlineFields, "text_tone" | "shade" | "text_color">;

// Rounded down, so a ratio just under a threshold never reads as reaching it ("3.0:1, hard to read").
export const ratioText = (ratio: number) => `${(Math.floor(ratio * 10) / 10).toFixed(1)}:1`;

/** The patch that follows the advice: a stronger shade, the other kind of text, or both. */
export function adviceLookPatch(advice: ContrastAdvice): LookPatch | null {
  if (advice.kind === "shade") return { shade: advice.shade };
  if (advice.kind === "none") return null;
  const preset = advice.tone === "dark" ? "light_video" : "dark_video";
  return advice.kind === "both"
    ? { ...HERO_LOOK_PRESETS[preset], shade: advice.shade }
    : { ...HERO_LOOK_PRESETS[preset] };
}

function adviceText(advice: ContrastAdvice, isAr: boolean): string | null {
  const darkText = isAr ? "نص داكن" : "dark text";
  const lightText = isAr ? "نص فاتح" : "light text";
  switch (advice.kind) {
    case "shade":
      return isAr ? `ارفع التعتيم إلى ${advice.shade}%.` : `Raise the shade to ${advice.shade}%.`;
    case "tone":
      return isAr
        ? `جرّب ${advice.tone === "dark" ? darkText : lightText}.`
        : `Try ${advice.tone === "dark" ? darkText : lightText}.`;
    case "both":
      return isAr
        ? `جرّب ${advice.tone === "dark" ? darkText : lightText} مع تعتيم ${advice.shade}%.`
        : `Try ${advice.tone === "dark" ? darkText : lightText} with a ${advice.shade}% shade.`;
    default:
      return null;
  }
}

/**
 * How readable the slide's headline is over its own picture, measured where the text sits on a
 * laptop and on a phone, with one tap to fix it when it is hard to read.
 */
export function HeroContrastNote({
  slide,
  store,
  framing,
  imageUrl,
  mobileImageUrl,
  isAr,
  onChange,
}: {
  slide: HeroHeadlineFields & { focal_y?: number };
  store: { hero_overlay_strength?: number | null; hero_title_color_v2?: string | null };
  framing: ContrastFraming;
  imageUrl: string | null;
  mobileImageUrl: string | null;
  isAr: boolean;
  onChange: (patch: LookPatch) => void;
}) {
  const desktop = useImagePixels(imageUrl);
  const mobile = useImagePixels(mobileImageUrl);
  const reading = slideContrast({ slide, store, framing, pixels: { desktop, mobile } });
  if (!reading) return null;

  const where =
    reading.device === "mobile" ? (isAr ? "الجوال" : "a phone") : isAr ? "الكمبيوتر" : "a laptop";
  const words = {
    good: isAr ? "سهلة القراءة" : "Easy to read",
    fair: isAr ? "مقروءة للعناوين الكبيرة" : "Readable as a large headline",
    low: isAr ? "صعبة القراءة" : "Hard to read",
  }[reading.verdict];
  const patch = adviceLookPatch(reading.advice);
  const advice = adviceText(reading.advice, isAr);
  const low = reading.verdict === "low";

  return (
    <div
      role="status"
      className={`flex flex-wrap items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
        low ? "border-warning/40 bg-warning/10" : "border-border bg-muted/40"
      }`}
    >
      {low ? (
        <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
      ) : (
        <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
      )}
      <p className="min-w-0 flex-1">
        <span className="font-semibold">
          {words} ({ratioText(reading.ratio)})
        </span>{" "}
        <span className="text-muted-foreground">
          {isAr
            ? `على ${where}، مقيسة على صورة الشريحة حيث يقع النص.`
            : `on ${where}, measured on the slide's picture where the text sits.`}
        </span>
        {advice && <span className="block pt-1">{advice}</span>}
      </p>
      {patch && (
        <Button type="button" size="sm" variant="outline" onClick={() => onChange(patch)}>
          {isAr ? "طبّق" : "Apply"}
        </Button>
      )}
    </div>
  );
}
