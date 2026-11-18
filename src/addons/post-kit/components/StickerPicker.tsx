import { useEffect, useRef, useState } from "react";
import { Type, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import type { PostKit } from "../hooks/use-post-kit";
import { STICKERS, stickerCanvas } from "../lib/stickers";
import type { StickerGroup } from "../lib/types";

/** The kit's drawn stickers in their lists, in the order a meme reaches for them. */
const GROUPS: { group: StickerGroup | "shammoua"; ar: string; en: string }[] = [
  { group: "words", ar: "فقاعات وكلام", en: "Bubbles and words" },
  { group: "marks", ar: "أسهم وعلامات", en: "Arrows and marks" },
  { group: "paper", ar: "ورق وشريط", en: "Paper and tape" },
  { group: "tools", ar: "أدوات الخياطة", en: "Sewing tools" },
  { group: "shammoua", ar: "شمّوعة ورسماتها", en: "Shammoua and drawings" },
];

/** A drawn sticker's list: none written is Shammoua's. */
export const groupOf = (id: string) => STICKERS[id]?.group ?? "shammoua";

function StickerThumb({ id }: { id: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    canvas.width = canvas.height = 140;
    canvas.getContext("2d")?.drawImage(stickerCanvas(id), 0, 0, 140, 140);
  }, [id]);
  return <canvas ref={ref} aria-hidden="true" className="block h-auto w-full" />;
}

/** The store's own stickers, cut from its photos, keyed as photos are. */
export const ownStickers = (kit: PostKit) =>
  Object.entries(kit.photos).filter(([, photo]) => photo.sticker);

/**
 * What can be stuck on a post: the store's own stickers first, cut from its photos and kept for
 * the team, then the kit's drawn ones.
 */
export function StickerPicker({
  kit,
  onAddDrawn,
  onAddOwn,
  onRemoved,
}: {
  kit: PostKit;
  onAddDrawn: (id: string) => void;
  onAddOwn: (key: string) => void;
  onRemoved: (key: string, fallback: string) => void;
}) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const say = (ar: string, en: string) => (isAr ? ar : en);
  const [armed, setArmed] = useState<string | null>(null);
  const own = ownStickers(kit);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs font-medium text-foreground">{say("ستيكراتي", "My stickers")}</p>
        {own.length ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-2">
            {own.map(([key, photo]) => (
              <div key={key} className="relative">
                <Button
                  type="button"
                  variant="outline"
                  aria-label={`${say("أضف ستيكر", "Add sticker")} ${photo.label}`}
                  title={photo.label}
                  className="block h-auto min-h-11 w-full whitespace-normal rounded-lg bg-muted p-1"
                  onClick={() => onAddOwn(key)}
                >
                  <img
                    crossOrigin="anonymous"
                    src={photo.img?.src ?? photo.url ?? ""}
                    alt=""
                    className="aspect-square w-full object-contain"
                  />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={armed === key ? "destructive" : "secondary"}
                  className="absolute start-0.5 top-0.5 h-7 min-w-7 px-1 text-xs"
                  aria-label={`${say("احذف ستيكر", "Delete the sticker")} ${photo.label}`}
                  onClick={() => {
                    if (armed !== key) {
                      setArmed(key);
                      setTimeout(() => setArmed((now) => (now === key ? null : now)), 3000);
                      return;
                    }
                    setArmed(null);
                    void kit.removeUpload(key).then((result) => {
                      if (result) onRemoved(key, result.fallback);
                      else {
                        toast.error(
                          say(
                            "ما قدرنا نحذف الستيكر. جرّب مرة ثانية.",
                            "Could not delete the sticker. Try again.",
                          ),
                        );
                      }
                    });
                  }}
                >
                  {armed === key ? say("تحذفه؟", "Delete?") : <X className="size-3.5" />}
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {say(
              "ما عندكم ستيكرات للحين. اختار صورة من المعرض واضغط «شيل الخلفية»، وتنحفظ هني لكل الفريق.",
              "No stickers yet. Choose a photo above and press Remove the background: it is kept here for the whole team.",
            )}
          </p>
        )}
      </div>

      {GROUPS.map(({ group, ar, en }) => (
        <div key={group} className="space-y-2">
          <p className="text-xs font-medium text-foreground">{say(ar, en)}</p>
          {group === "words" ? (
            <Button type="button" size="sm" variant="outline" onClick={() => onAddDrawn("text")}>
              <Type className="size-4" />
              {say("أضف كلام", "Add words")}
            </Button>
          ) : null}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-2">
            {Object.entries(STICKERS)
              .filter(([id, def]) => !def.photoCard && id !== "text" && groupOf(id) === group)
              .map(([id, def]) => (
                <Button
                  key={id}
                  type="button"
                  variant="outline"
                  aria-label={`${say("أضف ستيكر", "Add sticker")} ${say(def.name.ar, def.name.en)}`}
                  title={say(def.name.ar, def.name.en)}
                  className="block h-auto min-h-11 w-full whitespace-normal rounded-lg bg-muted p-1"
                  onClick={() => onAddDrawn(id)}
                >
                  <StickerThumb id={id} />
                </Button>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
