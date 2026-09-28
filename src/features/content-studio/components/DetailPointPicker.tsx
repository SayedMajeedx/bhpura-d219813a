import type { KeyboardEvent, MouseEvent } from "react";
import { Crosshair } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ContentStudio } from "@/features/content-studio/hooks/use-content-studio";

/** How far one arrow key press moves the point (a fraction of the photo). */
const NUDGE = 0.02;

/**
 * Detail Zoom's subject: tap the photo where the camera should push in (or
 * move the point with the arrow keys), then name the detail and add a note.
 */
export function DetailPointPicker({ studio }: { studio: ContentStudio }) {
  const {
    isAr,
    photo,
    isCurrentVideo,
    detailPoint,
    setDetailPoint,
    detailLabel,
    setDetailLabel,
    detailNote,
    setDetailNote,
  } = studio;

  const place = (event: MouseEvent<HTMLButtonElement>) => {
    // A keyboard "click" has no position; the arrow keys handle that case.
    if (event.detail === 0) return;
    const media = event.currentTarget.querySelector("img, video");
    const rect = (media ?? event.currentTarget).getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    setDetailPoint({
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    });
  };

  const nudge = (event: KeyboardEvent<HTMLButtonElement>) => {
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-NUDGE, 0],
      ArrowRight: [NUDGE, 0],
      ArrowUp: [0, -NUDGE],
      ArrowDown: [0, NUDGE],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    setDetailPoint({ x: detailPoint.x + move[0], y: detailPoint.y + move[1] });
  };

  const percent = (value: number) => `${Math.round(value * 100)}%`;

  return (
    <div className="space-y-3 rounded-2xl border border-border-strong bg-muted/20 p-3.5 sm:p-4 min-w-0">
      <div className="flex items-center gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <Crosshair className="size-3.5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 className="text-xs font-bold text-foreground">
            {isAr ? "التفصيلة المقرّبة" : "The detail"}
          </h3>
          <p className="text-xs text-muted-foreground">
            {isAr
              ? "اضغط على الصورة حيث تريد أن تقترب الكاميرا: التطريز أو القماش أو الأزرار."
              : "Tap the photo where the camera should move in: the embroidery, the fabric, a button."}
          </p>
        </div>
      </div>

      {photo ? (
        <div className="flex justify-center rounded-xl bg-muted/40 p-2">
          <Button
            type="button"
            variant="ghost"
            onClick={place}
            onKeyDown={nudge}
            aria-label={
              isAr
                ? `موضع التفصيلة: ${percent(detailPoint.x)} أفقياً، ${percent(detailPoint.y)} عمودياً. استخدم الأسهم للتحريك.`
                : `Detail point: ${percent(detailPoint.x)} across, ${percent(detailPoint.y)} down. Use the arrow keys to move it.`
            }
            className="relative block h-auto cursor-crosshair overflow-hidden rounded-lg p-0 hover:bg-transparent active:scale-100"
          >
            {isCurrentVideo ? (
              <video
                src={photo}
                muted
                playsInline
                preload="metadata"
                className="block max-h-72 w-auto max-w-full"
              />
            ) : (
              <img src={photo} alt="" className="block max-h-72 w-auto max-w-full" />
            )}
            {/* Image coordinates are physical, so the marker is placed with left/top in both languages. */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center"
              style={{ left: percent(detailPoint.x), top: percent(detailPoint.y) }}
            >
              <span className="absolute inset-0 animate-ping rounded-full border-2 border-white/80" />
              <span className="size-3.5 rounded-full border-2 border-white bg-primary shadow-md" />
            </span>
          </Button>
        </div>
      ) : (
        <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {isAr ? "أضف صورة للمنتج أولاً." : "Add a photo to this product first."}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 min-w-0">
          <Label
            htmlFor="studio-detail-label"
            className="text-xs font-medium text-muted-foreground"
          >
            {isAr ? "اسم التفصيلة" : "Detail label"}
          </Label>
          <Input
            id="studio-detail-label"
            value={detailLabel}
            onChange={(event) => setDetailLabel(event.target.value)}
            placeholder={isAr ? "مثال: كريب ألماس" : "e.g. Hand-beaded cuff"}
            maxLength={40}
            className="h-10 rounded-xl text-xs"
          />
        </div>
        <div className="space-y-1.5 min-w-0">
          <Label htmlFor="studio-detail-note" className="text-xs font-medium text-muted-foreground">
            {isAr ? "ملاحظة" : "Note"}
          </Label>
          <Input
            id="studio-detail-note"
            value={detailNote}
            onChange={(event) => setDetailNote(event.target.value)}
            placeholder={isAr ? "مثال: للمناسبات" : "e.g. For evenings"}
            maxLength={40}
            className="h-10 rounded-xl text-xs"
          />
        </div>
      </div>
    </div>
  );
}
