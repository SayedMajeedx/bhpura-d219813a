import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_TEXT_LOOPS,
  DEFAULT_TEXT_SECONDS,
  headlineSettings,
  type HeroHeadlineFields,
  type HeroTextAnimation,
  type HeroTextAlign,
  type HeroTextPosition,
  type HeroTextSize,
} from "@/lib/hero-headline";

const ANIMATIONS: { value: HeroTextAnimation; ar: string; en: string }[] = [
  { value: "blur_in", ar: "ظهور ناعم بضبابية", en: "Blur-in" },
  { value: "rising_words", ar: "كلمة كلمة من تحت", en: "Rising words" },
  { value: "mask_reveal", ar: "كشف بستارة", en: "Mask reveal" },
  { value: "none", ar: "بدون حركة", en: "No motion" },
];
const POSITIONS: { value: HeroTextPosition; ar: string; en: string }[] = [
  { value: "top", ar: "فوق", en: "Top" },
  { value: "middle", ar: "وسط", en: "Middle" },
  { value: "bottom", ar: "تحت", en: "Bottom" },
];
const ALIGNS: { value: HeroTextAlign; ar: string; en: string }[] = [
  { value: "start", ar: "بداية السطر", en: "Start" },
  { value: "center", ar: "وسط", en: "Center" },
  { value: "end", ar: "نهاية السطر", en: "End" },
];
const SIZES: { value: HeroTextSize; label: string }[] = [
  { value: "s", label: "S" },
  { value: "m", label: "M" },
  { value: "l", label: "L" },
  { value: "xl", label: "XL" },
];

/** One phrase per line; empty lines are kept while typing and left out when shown. */
const linesOf = (text: string) => text.split("\n");

/**
 * A slide's animated headline: the phrases shown one after another over the slide, how each
 * appears, for how long, how many rounds before resting on the first, and where the text sits.
 * Live text instead of text written into a video: it fits every frame, language and screen.
 */
export function HeroHeadlineFields({
  idPrefix,
  slide,
  isAr,
  onChange,
}: {
  /** Unique per slide, so each field's label points at its own field. */
  idPrefix: string;
  slide: HeroHeadlineFields;
  isAr: boolean;
  onChange: (patch: Partial<HeroHeadlineFields>) => void;
}) {
  const settings = headlineSettings(slide);
  return (
    <fieldset className="min-w-0 space-y-3 rounded-xl border border-border p-3">
      <legend className="px-1 text-sm font-semibold">
        {isAr ? "العنوان المتحرك" : "Animated headline"}
      </legend>
      <p className="text-xs text-muted-foreground">
        {isAr
          ? "اكتب كل جملة في سطر: تظهر الجمل بالتناوب فوق الشريحة بالأسلوب الذي تختاره، ثم تثبت على الأولى. نص حي يتناسب مع كل حجم وشاشة، بدل النص المكتوب داخل الفيديو."
          : "One phrase per line: they appear one after another over the slide in the style you choose, then rest on the first. Live text that fits every size and screen, instead of text written into the video."}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <Label htmlFor={`${idPrefix}-hero-phrases-ar`}>
            {isAr ? "الجمل — عربي" : "Phrases — Arabic"}
          </Label>
          <Textarea
            id={`${idPrefix}-hero-phrases-ar`}
            dir="rtl"
            rows={3}
            value={(slide.phrases_ar ?? []).join("\n")}
            onChange={(event) => onChange({ phrases_ar: linesOf(event.target.value) })}
          />
        </div>
        <div className="min-w-0">
          <Label htmlFor={`${idPrefix}-hero-phrases-en`}>
            {isAr ? "الجمل — إنجليزي" : "Phrases — English"}
          </Label>
          <Textarea
            id={`${idPrefix}-hero-phrases-en`}
            dir="ltr"
            rows={3}
            value={(slide.phrases_en ?? []).join("\n")}
            onChange={(event) => onChange({ phrases_en: linesOf(event.target.value) })}
          />
        </div>
      </div>

      <Choices
        label={isAr ? "أسلوب الظهور" : "Entrance"}
        options={ANIMATIONS.map((o) => ({ value: o.value, label: isAr ? o.ar : o.en }))}
        value={settings.animation}
        onPick={(value) => onChange({ text_animation: value })}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <Label htmlFor={`${idPrefix}-hero-text-seconds`}>
            {isAr ? "مدة كل جملة (ثوانٍ)" : "Each phrase (seconds)"}
          </Label>
          <Input
            id={`${idPrefix}-hero-text-seconds`}
            type="number"
            min={2}
            max={8}
            step={0.5}
            value={slide.text_seconds ?? DEFAULT_TEXT_SECONDS}
            onChange={(event) => onChange({ text_seconds: Number(event.target.value) })}
          />
        </div>
        <div className="min-w-0">
          <Label htmlFor={`${idPrefix}-hero-text-loops`}>
            {isAr ? "عدد الدورات ثم تثبت على الأولى" : "Rounds, then rest on the first"}
          </Label>
          <Input
            id={`${idPrefix}-hero-text-loops`}
            type="number"
            min={1}
            max={10}
            step={1}
            value={slide.text_loops ?? DEFAULT_TEXT_LOOPS}
            onChange={(event) => onChange({ text_loops: Number(event.target.value) })}
          />
        </div>
      </div>

      <Choices
        label={isAr ? "مكان النص" : "Position"}
        options={POSITIONS.map((o) => ({ value: o.value, label: isAr ? o.ar : o.en }))}
        value={settings.position}
        onPick={(value) => onChange({ text_position: value })}
      />
      <Choices
        label={isAr ? "المحاذاة" : "Alignment"}
        options={ALIGNS.map((o) => ({ value: o.value, label: isAr ? o.ar : o.en }))}
        value={settings.align}
        onPick={(value) => onChange({ align: value })}
      />
      <Choices
        label={isAr ? "حجم العنوان" : "Headline size"}
        options={SIZES}
        value={settings.size}
        onPick={(value) => onChange({ text_size: value })}
      />
    </fieldset>
  );
}

function Choices<T extends string>({
  label,
  options,
  value,
  onPick,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onPick: (value: T) => void;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
        {options.map((option) => (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={option.value === value ? "default" : "outline"}
            aria-pressed={option.value === value}
            onClick={() => onPick(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
