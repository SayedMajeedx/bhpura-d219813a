import { useId, useRef, useState } from "react";
import { Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import type { PostKit } from "../hooks/use-post-kit";
import { photoOrder } from "../lib/photos";

/** The store's pieces and the merchant's own photos, ready to put on a post. */
export function PhotoLibrary({
  kit,
  current,
  slot,
  showSlots,
  onSlot,
  addOnTop,
  onAddOnTop,
  hasSlot,
  editingCard,
  onPick,
  onRemoved,
}: {
  kit: PostKit;
  current?: string;
  slot: "photo1" | "photo2";
  showSlots: boolean;
  onSlot: (slot: "photo1" | "photo2") => void;
  addOnTop: boolean;
  onAddOnTop: () => void;
  hasSlot: boolean;
  editingCard: boolean;
  onPick: (key: string) => void;
  onRemoved: (key: string, fallback: string) => void;
}) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [armed, setArmed] = useState<string | null>(null);

  const hint = editingCard
    ? isAr
      ? "اضغط صورة عشان تتبدل هالصورة."
      : "Tap a photo to replace this one."
    : addOnTop || !hasSlot
      ? isAr
        ? "اضغط صورة عشان تنحط فوق البوست، وبعدها اسحبها لمكانها."
        : "Tap a photo to lay it on the post, then drag it into place."
      : isAr
        ? "اضغط صورة عشان تدخل البوست، واسم القطعة وسعرها يتغيرون معاها."
        : "Tap a photo to put it on the post. Its name and price follow.";

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-foreground">{isAr ? "معرض الصور" : "Photos"}</p>
      {showSlots ? (
        <div className="flex flex-wrap gap-2">
          {(["photo1", "photo2"] as const).map((name, i) => (
            <Button
              key={name}
              type="button"
              size="sm"
              variant={slot === name ? "default" : "outline"}
              aria-pressed={slot === name}
              onClick={() => onSlot(name)}
            >
              {isAr ? `الصورة ${i + 1}` : `Photo ${i + 1}`}
            </Button>
          ))}
        </div>
      ) : null}
      <div className="flex gap-2 overflow-x-auto p-0.5 lg:grid lg:max-h-80 lg:grid-cols-[repeat(auto-fill,minmax(88px,1fr))] lg:overflow-y-auto lg:overflow-x-hidden">
        {photoOrder(kit.photos).map(([key, photo]) => (
          <div key={key} className="relative w-[88px] shrink-0 lg:w-auto">
            <Button
              type="button"
              variant="outline"
              aria-pressed={current === key}
              aria-label={`${isAr ? "اختر صورة" : "Choose the photo"} ${photo.label}`}
              onClick={() => onPick(key)}
              className="grid h-auto w-full gap-1 whitespace-normal rounded-lg bg-card p-1 text-foreground aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
            >
              <img
                crossOrigin={photo.upload ? undefined : "anonymous"}
                src={photo.img?.src ?? ""}
                alt=""
                className="aspect-[3/4] w-full rounded-md object-cover object-top"
              />
              <span className="line-clamp-2 break-words text-xs leading-snug">{photo.label}</span>
            </Button>
            {photo.upload ? (
              <Button
                type="button"
                size="sm"
                variant={armed === key ? "destructive" : "secondary"}
                className="absolute start-1 top-1 h-8 min-w-8 px-1.5 text-xs"
                aria-label={`${isAr ? "احذف صورة" : "Delete the photo"} ${photo.label}`}
                onClick={() => {
                  if (armed !== key) {
                    setArmed(key);
                    setTimeout(() => setArmed((now) => (now === key ? null : now)), 3000);
                    return;
                  }
                  setArmed(null);
                  onRemoved(key, kit.removeUpload(key));
                }}
              >
                {armed === key ? isAr ? "تحذفها؟" : "Delete?" : <X className="size-4" />}
              </Button>
            ) : null}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          ref={input}
          id={inputId}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          aria-label={isAr ? "ارفع صورك" : "Upload your photos"}
          onChange={async (e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            if (!files.length) return;
            const { added, failed, lasting } = await kit.addUploads(files);
            if (added[0]) onPick(added[0]);
            if (failed) {
              toast.error(
                isAr
                  ? "ما قدرنا نقرا كل الصور. جرّب JPG أو PNG."
                  : "Some photos could not be read. Try JPG or PNG.",
              );
            }
            if (!lasting) {
              toast(
                isAr
                  ? "هالمتصفح ما يسمح نحفظها، فبتروح إذا قفلتي الصفحة."
                  : "This browser will not keep it after you close the page.",
              );
            }
          }}
        />
        <Button type="button" size="sm" variant="outline" onClick={() => input.current?.click()}>
          <Upload className="size-4" />
          {isAr ? "ارفع صورك" : "Upload your photos"}
        </Button>
        {hasSlot ? (
          <Button
            type="button"
            size="sm"
            variant={addOnTop ? "default" : "outline"}
            aria-pressed={addOnTop}
            onClick={onAddOnTop}
          >
            {isAr ? "أضف صورة فوق البوست" : "Lay a photo on the post"}
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
      <p className="text-xs text-muted-foreground">
        {isAr
          ? "صوركم وتعديلاتكم تنحفظ في هالجهاز للحين."
          : "Your photos and edits are kept on this device for now."}
      </p>
    </div>
  );
}
