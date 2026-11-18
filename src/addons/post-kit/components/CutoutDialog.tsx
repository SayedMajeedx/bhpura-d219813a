import { useState } from "react";
import { Eraser, Paintbrush, RotateCcw, Scissors } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { useI18n } from "@/lib/i18n";
import type { PostKit } from "../hooks/use-post-kit";
import { useCutout } from "../hooks/use-cutout";
import { cutoutPng } from "../lib/cutout-canvas";

/** Below this share of the picture kept, the fill has taken the subject too. */
const TOO_LITTLE = 0.01;

function Range({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
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
        step={1}
        value={[value]}
        onValueChange={([next]) => onChange(next)}
      />
    </div>
  );
}

/**
 * Taking a photo's background off, on this device: the flat colour round its edge goes at once,
 * a brush erases or brings back the rest, and it is kept as one of the store's stickers. The photo
 * it came from stays as it was.
 */
export function CutoutDialog({
  kit,
  photoKey,
  onClose,
  onSaved,
}: {
  kit: PostKit;
  /** The photo being cut; the dialog is open while there is one. */
  photoKey: string | null;
  onClose: () => void;
  onSaved: (stickerKey: string) => void;
}) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const say = (ar: string, en: string) => (isAr ? ar : en);
  const photo = photoKey ? kit.photos[photoKey] : undefined;
  const cut = useCutout(photo?.img);
  const [saving, setSaving] = useState(false);
  const kind = cut.backdrop?.kind;
  const tooLittle = cut.share < TOO_LITTLE;

  const save = async () => {
    const mask = cut.maskNow();
    if (!cut.px || !mask || !photo) return;
    setSaving(true);
    try {
      const png = await cutoutPng(cut.px, mask);
      if (!png) throw new Error("NOTHING_KEPT");
      const key = await kit.addSticker(png, { name: photo.label, key: photoKey ?? undefined });
      toast.success(say("انحفظ في ستيكراتي", "Saved to my stickers"));
      onSaved(key);
    } catch {
      toast.error(
        say(
          "ما قدرنا نحفظ الستيكر. تأكد من النت وجرّب مرة ثانية.",
          "Could not save the sticker. Check your connection and try again.",
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  const note =
    kind === "busy"
      ? say(
          "خلفية هالصورة مو لون واحد، فما نقدر نشيلها بروحها. امسحها بالفرشاة.",
          "This background is not one flat colour, so it cannot go by itself. Erase it with the brush.",
        )
      : kind === "clear"
        ? say(
            "هالصورة أصلاً شفافة. تقدر تنظف أطرافها بالفرشاة وتحفظها.",
            "This picture is already see-through. Tidy its edges with the brush and save it.",
          )
        : kind === "checker"
          ? say(
              "لقينا مربعات شفافية مطبوعة على الصورة، وشلناها.",
              "We found see-through squares printed on the picture, and took them off.",
            )
          : say(
              "شلنا اللون اللي حول الصورة. إذا راح شي من الصورة، خفّف الحساسية أو رجّعه بالفرشاة.",
              "We took the colour round the picture off. If part of it went, lower the sensitivity or bring it back with the brush.",
            );

  return (
    <Dialog open={Boolean(photoKey)} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{say("شيل الخلفية", "Remove the background")}</DialogTitle>
          <DialogDescription>
            {say(
              "تصير على جهازك، والصورة الأصل تظل مثل ما هي. الستيكر ينحفظ في «ستيكراتي».",
              "It happens on this device, and the original stays as it is. The sticker goes in My stickers.",
            )}
          </DialogDescription>
        </DialogHeader>

        {photo && !cut.px ? (
          <p role="alert" className="text-sm text-destructive">
            {say(
              "ما قدرنا نقرا هالصورة. نزّلها على جهازك وارفعها من «ارفع صورك».",
              "Could not read this picture. Save it to your device and upload it.",
            )}
          </p>
        ) : null}

        {cut.px ? (
          <div className="space-y-4">
            <canvas
              {...cut.canvasProps}
              aria-label={say(
                "الستيكر: اسحب عليه بالفرشاة",
                "The sticker: draw on it with the brush",
              )}
              className="mx-auto block h-auto max-h-[48dvh] w-auto max-w-full cursor-crosshair touch-none rounded-md border border-border"
            />
            <p role="status" className="text-xs text-muted-foreground">
              {note}
            </p>
            {kind === "plain" || kind === "checker" ? (
              <Range
                label={say("الحساسية", "Sensitivity")}
                value={cut.sensitivity}
                min={0}
                max={100}
                onChange={cut.setSensitivity}
              />
            ) : null}
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={cut.tool === "erase" ? "default" : "outline"}
                  aria-pressed={cut.tool === "erase"}
                  onClick={() => cut.setTool("erase")}
                >
                  <Eraser className="size-4" />
                  {say("امسح", "Erase")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={cut.tool === "restore" ? "default" : "outline"}
                  aria-pressed={cut.tool === "restore"}
                  onClick={() => cut.setTool("restore")}
                >
                  <Paintbrush className="size-4" />
                  {say("رجّع", "Bring back")}
                </Button>
              </div>
              <div className="min-w-40 flex-1">
                <Range
                  label={say("حجم الفرشاة", "Brush size")}
                  value={cut.brush}
                  min={2}
                  max={120}
                  onChange={cut.setBrush}
                />
              </div>
              <Button type="button" size="sm" variant="outline" onClick={cut.reset}>
                <RotateCcw className="size-4" />
                {say("من جديد", "Start again")}
              </Button>
            </div>
            {tooLittle ? (
              <p role="status" className="text-xs text-warning">
                {say(
                  "ما بقى شي من الصورة. خفّف الحساسية أو رجّعها بالفرشاة.",
                  "Almost nothing is left. Lower the sensitivity or bring it back with the brush.",
                )}
              </p>
            ) : null}
          </div>
        ) : null}

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {say("إلغاء", "Cancel")}
          </Button>
          <Button type="button" disabled={!cut.px || tooLittle || saving} onClick={save}>
            <Scissors className="size-4" />
            {saving ? say("نحفظ…", "Saving…") : say("احفظه ستيكر", "Save as a sticker")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
