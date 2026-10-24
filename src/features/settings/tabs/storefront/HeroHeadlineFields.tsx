import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_TEXT_LOOPS,
  DEFAULT_TEXT_SECONDS,
  HERO_PACES,
  headlineSettings,
  paceOf,
  storeNameHeadlineNote,
  type HeroPace,
  type HeroHeadlineFields,
  type HeroTextAnimation,
  type HeroTextAlign,
  type HeroTextPosition,
  type HeroTextSize,
} from "@/lib/hero-headline";
import { phraseCountNote } from "@/lib/hero-preview";

/** What the slide's text is made of: its headline, the line under it and its button. */
type SlideText = HeroHeadlineFields & {
  body_ar?: string;
  body_en?: string;
  button_ar?: string;
  button_en?: string;
  button_href?: string;
};

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
const PACES: { value: HeroPace; ar: string; en: string }[] = [
  { value: "calm", ar: "هادئ", en: "Calm" },
  { value: "medium", ar: "متوسط", en: "Medium" },
  { value: "lively", ar: "حيوي", en: "Lively" },
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
  withText = false,
  storeNames = [],
}: {
  /** Unique per slide, so each field's label points at its own field. */
  idPrefix: string;
  slide: SlideText;
  isAr: boolean;
  onChange: (patch: Partial<SlideText>) => void;
  /** The line under the headline and the button, for every kind of slide (the V2 hero). */
  withText?: boolean;
  /** The store's names, to notice a headline that only repeats them. */
  storeNames?: ReadonlyArray<string | null | undefined>;
}) {
  const settings = headlineSettings(slide);
  // A slide written before phrases existed opens with its title as the first phrase.
  const phrasesOf = (lang: "ar" | "en") => {
    const list = lang === "ar" ? slide.phrases_ar : slide.phrases_en;
    if (list && list.length > 0) return list.join("\n");
    return (lang === "ar" ? slide.title_ar : slide.title_en) ?? "";
  };
  const countNote = phraseCountNote(slide, isAr ? "ar" : "en");
  const nameNote = storeNameHeadlineNote(slide, storeNames, isAr ? "ar" : "en");
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
            value={phrasesOf("ar")}
            onChange={(event) =>
              onChange({ phrases_ar: linesOf(event.target.value), title_ar: "" })
            }
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
            value={phrasesOf("en")}
            onChange={(event) =>
              onChange({ phrases_en: linesOf(event.target.value), title_en: "" })
            }
          />
        </div>
      </div>

      {countNote && (
        <p className="rounded-md bg-muted/60 px-2.5 py-1.5 text-xs text-muted-foreground">
          {countNote}
        </p>
      )}
      {nameNote && (
        <p className="rounded-md bg-muted/60 px-2.5 py-1.5 text-xs text-muted-foreground">
          {nameNote}
        </p>
      )}

      {withText && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              id={`${idPrefix}-body-ar`}
              label={isAr ? "السطر تحت العنوان — عربي" : "Line under the headline — Arabic"}
              dir="rtl"
              value={slide.body_ar ?? ""}
              onChange={(value) => onChange({ body_ar: value })}
              multiline
            />
            <TextField
              id={`${idPrefix}-body-en`}
              label={isAr ? "السطر تحت العنوان — إنجليزي" : "Line under the headline — English"}
              dir="ltr"
              value={slide.body_en ?? ""}
              onChange={(value) => onChange({ body_en: value })}
              multiline
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <TextField
              id={`${idPrefix}-button-ar`}
              label={isAr ? "نص الزر — عربي" : "Button — Arabic"}
              dir="rtl"
              value={slide.button_ar ?? ""}
              onChange={(value) => onChange({ button_ar: value })}
            />
            <TextField
              id={`${idPrefix}-button-en`}
              label={isAr ? "نص الزر — إنجليزي" : "Button — English"}
              dir="ltr"
              value={slide.button_en ?? ""}
              onChange={(value) => onChange({ button_en: value })}
            />
            <TextField
              id={`${idPrefix}-button-href`}
              label={isAr ? "رابط الزر" : "Button link"}
              dir="ltr"
              value={slide.button_href ?? ""}
              onChange={(value) => onChange({ button_href: value })}
            />
          </div>
        </>
      )}

      <Choices
        label={isAr ? "أسلوب الظهور" : "Entrance"}
        options={ANIMATIONS.map((o) => ({ value: o.value, label: isAr ? o.ar : o.en }))}
        value={settings.animation}
        onPick={(value) => onChange({ text_animation: value })}
      />

      <Choices
        label={isAr ? "الإيقاع" : "Pace"}
        options={PACES.map((o) => ({
          value: o.value,
          label: `${isAr ? o.ar : o.en} · ${HERO_PACES[o.value]}${isAr ? "ث" : "s"}`,
        }))}
        value={paceOf(slide)}
        onPick={(value) => onChange({ text_seconds: HERO_PACES[value] })}
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

      <div className="min-w-0 space-y-3 border-t border-border pt-3">
        <div>
          <p className="text-sm font-medium">{isAr ? "على الجوال" : "On a phone"}</p>
          <p className="text-xs text-muted-foreground">
            {isAr
              ? "مكان وحجم مختلفان للشاشات الأصغر من 640px، أو كما على الكمبيوتر."
              : "A different place and size below 640px, or as on a laptop."}
          </p>
        </div>
        <Choices
          label={isAr ? "مكان النص على الجوال" : "Position on a phone"}
          options={[
            { value: "same" as const, label: isAr ? "كالكمبيوتر" : "As on a laptop" },
            ...POSITIONS.map((o) => ({ value: o.value, label: isAr ? o.ar : o.en })),
          ]}
          value={slide.text_position_mobile ? settings.positionMobile : "same"}
          onPick={(value) =>
            onChange({ text_position_mobile: value === "same" ? undefined : value })
          }
        />
        <Choices
          label={isAr ? "حجم العنوان على الجوال" : "Headline size on a phone"}
          options={[
            { value: "same" as const, label: isAr ? "كالكمبيوتر" : "As on a laptop" },
            ...SIZES,
          ]}
          value={slide.text_size_mobile ? settings.sizeMobile : "same"}
          onPick={(value) => onChange({ text_size_mobile: value === "same" ? undefined : value })}
        />
      </div>
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
  /** Null when none of the options is the current value (a number the store typed). */
  value: T | null;
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

function TextField({
  id,
  label,
  dir,
  value,
  onChange,
  multiline = false,
}: {
  id: string;
  label: string;
  dir: "rtl" | "ltr";
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}) {
  return (
    <div className="min-w-0">
      <Label htmlFor={id}>{label}</Label>
      {multiline ? (
        <Textarea
          id={id}
          dir={dir}
          rows={2}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <Input id={id} dir={dir} value={value} onChange={(event) => onChange(event.target.value)} />
      )}
    </div>
  );
}
