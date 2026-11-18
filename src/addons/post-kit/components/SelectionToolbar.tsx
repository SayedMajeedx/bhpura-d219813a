import {
  AlignCenterHorizontal,
  BringToFront,
  CopyPlus,
  FlipHorizontal,
  MoveHorizontal,
  Scissors,
  SendToBack,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useI18n } from "@/lib/i18n";
import {
  PHOTO_FRAMES,
  SIZE_MAX,
  SIZE_MIN,
  frameOf,
  fullWidthSize,
  photoTooSmall,
  shadowOf,
} from "../lib/photo-shape";
import { STICKERS } from "../lib/stickers";
import { StickerWordsTools, hasWordsTools } from "./StickerWordsTools";
import type { Crop, PhotoBook, PhotoFrame, Sticker } from "../lib/types";

const FRAME_WORDS: Record<PhotoFrame, { ar: string; en: string }> = {
  none: { ar: "بدون إطار", en: "No frame" },
  cut: { ar: "ستيكر مقصوص", en: "Cut-out sticker" },
  polaroid: { ar: "صورة مطبوعة", en: "Print" },
  tape: { ar: "شريط لاصق", en: "Taped on" },
};

function Toggle({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={on ? "default" : "outline"}
      aria-pressed={on}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function Labelled({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <p className="text-xs font-medium text-foreground">{label}</p>
      <Slider
        dir="ltr"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([next]) => onChange(next)}
      />
    </div>
  );
}

/**
 * What changes the selected sticker or photo, right under the post: its size and turn, a photo's
 * frame, shadow and crop, its layer, and copying or removing it. It sat at the foot of the page,
 * below every other control, where no one found it.
 */
export function SelectionToolbar({
  sticker,
  index,
  count,
  photos,
  width,
  onChange,
  onLayer,
  onDuplicate,
  onRemove,
  onCutout,
}: {
  sticker: Sticker;
  index: number;
  count: number;
  photos: PhotoBook;
  /** The post's width, for "as wide as the post". */
  width: number;
  onChange: (change: Partial<Sticker>) => void;
  onLayer: (step: 1 | -1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  /** Opens the background remover on this photo. */
  onCutout?: () => void;
}) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const say = (ar: string, en: string) => (isAr ? ar : en);
  const isPhoto = sticker.id === "photo";
  const img = isPhoto ? photos[sticker.photo ?? ""]?.img : undefined;
  const crop: Required<Crop> = { z: 1, fx: 0.5, fy: 0.05, ...(sticker.crop ?? {}) };
  const name = isPhoto
    ? say("الصورة", "The photo")
    : sticker.id === "text"
      ? say("الكلام", "The words")
      : say(STICKERS[sticker.id]?.name.ar ?? "", STICKERS[sticker.id]?.name.en ?? "");
  const setCrop = (change: Crop) => onChange({ crop: { ...sticker.crop, ...change } });

  return (
    <section
      aria-label={say(`تعديل ${name}`, `Editing ${name}`)}
      className="space-y-3 rounded-lg border border-border bg-card p-3"
    >
      <p className="text-xs text-muted-foreground">
        {say(
          "اسحب النقطة اللي في الزاوية للتكبير والتصغير، واللي فوق للتدوير. على الجوال: إصبعين.",
          "Drag the corner dot to resize and the top dot to turn. On a phone, use two fingers.",
        )}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Labelled
          label={say("الحجم", "Size")}
          value={sticker.s}
          min={SIZE_MIN}
          max={SIZE_MAX}
          step={5}
          onChange={(s) => onChange({ s })}
        />
        <Labelled
          label={say("الميلان", "Tilt")}
          value={sticker.r ?? 0}
          min={-180}
          max={180}
          step={1}
          onChange={(r) => onChange({ r })}
        />
      </div>

      {hasWordsTools(sticker) ? <StickerWordsTools sticker={sticker} onChange={onChange} /> : null}

      {isPhoto ? (
        <>
          <div className="space-y-2">
            <p className="text-xs font-medium text-foreground">{say("شكل الصورة", "Frame")}</p>
            <div className="flex flex-wrap gap-2">
              {PHOTO_FRAMES.map((frame) => (
                <Toggle
                  key={frame}
                  on={frameOf(sticker) === frame}
                  onClick={() => onChange({ frame })}
                >
                  {say(FRAME_WORDS[frame].ar, FRAME_WORDS[frame].en)}
                </Toggle>
              ))}
              <Toggle
                on={shadowOf(sticker)}
                onClick={() => onChange({ shadow: !shadowOf(sticker) })}
              >
                {say("ظل", "Shadow")}
              </Toggle>
            </div>
          </div>
          {frameOf(sticker) === "cut" ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-foreground">
                {say("حافة الستيكر", "Sticker edge")}
              </p>
              <div className="flex flex-wrap gap-2">
                <Toggle on={sticker.edge === "thin"} onClick={() => onChange({ edge: "thin" })}>
                  {say("رفيعة", "Thin")}
                </Toggle>
                <Toggle on={sticker.edge !== "thin"} onClick={() => onChange({ edge: undefined })}>
                  {say("عريضة", "Wide")}
                </Toggle>
                <Toggle
                  on={sticker.edgeColor !== "cream"}
                  onClick={() => onChange({ edgeColor: undefined })}
                >
                  {say("أبيض", "White")}
                </Toggle>
                <Toggle
                  on={sticker.edgeColor === "cream"}
                  onClick={() => onChange({ edgeColor: "cream" })}
                >
                  {say("كريمي", "Cream")}
                </Toggle>
              </div>
            </div>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-3">
            <Labelled
              label={say("قص: تقريب", "Crop: zoom")}
              value={crop.z}
              min={1}
              max={3}
              step={0.01}
              onChange={(z) => setCrop({ z })}
            />
            <Labelled
              label={say("قص: يمين ويسار", "Crop: left and right")}
              value={crop.fx}
              min={0}
              max={1}
              step={0.01}
              onChange={(fx) => setCrop({ fx })}
            />
            <Labelled
              label={say("قص: فوق وتحت", "Crop: up and down")}
              value={crop.fy}
              min={0}
              max={1}
              step={0.01}
              onChange={(fy) => setCrop({ fy })}
            />
          </div>
          {photoTooSmall(sticker, img) ? (
            <p role="status" className="text-xs text-warning">
              {say(
                "الصورة صغيرة على هالحجم وبتطلع مغبشة. صغّرها، أو احفظها من صفحة البن في بنترست بحجمها الكامل.",
                "The photo is small for this size and will look soft. Make it smaller, or save it full size from the pin's own page.",
              )}
            </p>
          ) : null}
        </>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {sticker.id !== "text" ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onChange({ flip: !sticker.flip })}
          >
            <FlipHorizontal className="size-4" />
            {say("اقلب", "Flip")}
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={index >= count - 1}
          onClick={() => onLayer(1)}
        >
          <BringToFront className="size-4" />
          {say("لقدّام", "Forward")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={index <= 0}
          onClick={() => onLayer(-1)}
        >
          <SendToBack className="size-4" />
          {say("لورا", "Backward")}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => onChange({ x: 0.5 })}>
          <AlignCenterHorizontal className="size-4" />
          {say("في النص", "Centre")}
        </Button>
        {isPhoto ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onChange({ s: fullWidthSize(sticker, img, width), x: 0.5, r: 0 })}
          >
            <MoveHorizontal className="size-4" />
            {say("بعرض البوست", "Full width")}
          </Button>
        ) : null}
        {isPhoto && onCutout && img ? (
          <Button type="button" size="sm" variant="outline" onClick={onCutout}>
            <Scissors className="size-4" />
            {say("شيل الخلفية", "Remove the background")}
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="outline" onClick={onDuplicate}>
          <CopyPlus className="size-4" />
          {say("نسخة", "Duplicate")}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onRemove}>
          <Trash2 className="size-4" />
          {say("احذف", "Remove")}
        </Button>
      </div>
    </section>
  );
}
