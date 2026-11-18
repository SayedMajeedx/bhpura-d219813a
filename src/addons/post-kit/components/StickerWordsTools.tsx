import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/lib/i18n";
import { STICKERS } from "../lib/stickers";
import { TEXT_ALIGNS, TEXT_COLORS, TEXT_LOOKS } from "../lib/text-sticker";
import { isStretched, toggleStretch } from "../lib/stretch";
import type { Sticker, TextAlign, TextColor, TextLook } from "../lib/types";

const LOOK_WORDS: Record<TextLook, [string, string]> = {
  plain: ["عادي", "Plain"],
  meme: ["ميم", "Meme"],
  box: ["بخلفية", "On a band"],
  hand: ["خط اليد", "Handwriting"],
};
const COLOR_WORDS: Record<TextColor, [string, string]> = {
  ink: ["لون الكلام", "Text colour"],
  sub: ["اللون الثاني", "Second colour"],
  tag: ["لون الليبل", "Label colour"],
  bg: ["لون القماش", "Cloth colour"],
  white: ["أبيض", "White"],
  black: ["أسود", "Black"],
};
const ALIGN_WORDS: Record<TextAlign, [string, string]> = {
  right: ["يمين", "Right"],
  center: ["وسط", "Centre"],
  left: ["يسار", "Left"],
};

function Choices<T extends string>({
  label,
  options,
  words,
  value,
  onPick,
}: {
  label: string;
  options: readonly T[];
  words: Record<T, [string, string]>;
  value: T;
  onPick: (value: T) => void;
}) {
  const { lang } = useI18n();
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-foreground">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <Button
            key={option}
            type="button"
            size="sm"
            variant={value === option ? "default" : "outline"}
            aria-pressed={value === option}
            onClick={() => onPick(option)}
          >
            {lang === "ar" ? words[option][0] : words[option][1]}
          </Button>
        ))}
      </div>
    </div>
  );
}

/** Whether a sticker has words or a colour to change here. */
export const hasWordsTools = (st: Sticker) => st.id === "text" || Boolean(STICKERS[st.id]?.bare);

/**
 * The words of a words sticker or a piece that holds them, and how they look: for free words their
 * look, colour and alignment; for a drawn mark its colour.
 */
export function StickerWordsTools({
  sticker,
  onChange,
}: {
  sticker: Sticker;
  onChange: (change: Partial<Sticker>) => void;
}) {
  const { lang } = useI18n();
  const say = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const id = useId();
  const def = STICKERS[sticker.id];
  const isText = sticker.id === "text";
  const holdsWords = isText || Boolean(def?.ownText);
  const look = sticker.look ?? "plain";

  return (
    <div className="space-y-3">
      {holdsWords ? (
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-words`}>{say("الكلام", "Words")}</Label>
          <Textarea
            id={`${id}-words`}
            dir="rtl"
            rows={2}
            maxLength={400}
            value={sticker.text ?? ""}
            onChange={(e) => onChange({ text: e.target.value })}
          />
          <Button
            type="button"
            size="sm"
            variant={isStretched(sticker.text) ? "default" : "outline"}
            aria-pressed={isStretched(sticker.text)}
            onClick={() => onChange({ text: toggleStretch(sticker.text ?? "") })}
          >
            {say("مطّ الحروف", "Stretch the letters")}
          </Button>
        </div>
      ) : null}
      {isText ? (
        <>
          <Choices
            label={say("شكل الكلام", "Look")}
            options={TEXT_LOOKS}
            words={LOOK_WORDS}
            value={look}
            onPick={(next) => onChange({ look: next })}
          />
          {look !== "meme" ? (
            <Choices
              label={look === "box" ? say("لون الخلفية", "Band colour") : say("اللون", "Colour")}
              options={TEXT_COLORS}
              words={COLOR_WORDS}
              value={sticker.color ?? "ink"}
              onPick={(next) => onChange({ color: next })}
            />
          ) : null}
          <Choices
            label={say("المحاذاة", "Alignment")}
            options={TEXT_ALIGNS}
            words={ALIGN_WORDS}
            value={sticker.align ?? "center"}
            onPick={(next) => onChange({ align: next })}
          />
        </>
      ) : !holdsWords ? (
        <Choices
          label={say("اللون", "Colour")}
          options={TEXT_COLORS}
          words={COLOR_WORDS}
          value={sticker.color ?? "ink"}
          onPick={(next) => onChange({ color: next })}
        />
      ) : null}
    </div>
  );
}
