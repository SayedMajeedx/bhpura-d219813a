import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Copy,
  Download,
  FlipHorizontal,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/lib/i18n";
import type { PostKit } from "../hooks/use-post-kit";
import { geometry } from "../lib/frame";
import { TEMPLATES } from "../lib/layouts";
import {
  cropOf,
  fieldsOf,
  hasPhotoSlot,
  hasSceneText,
  newSticker,
  photoNotes,
  stickerAt,
  withCrop,
  withPhoto,
} from "../lib/post-rules";
import { renderPost } from "../lib/render";
import { STICKERS, stickerCanvas } from "../lib/stickers";
import { TONES } from "../lib/tones";
import type { Post } from "../lib/types";
import { copyWords, savePost } from "./PostKitPage";
import { PhotoLibrary } from "./PhotoLibrary";

type TextField =
  "lead" | "head" | "foot" | "label" | "labelA" | "labelB" | "chat" | "items" | "bag";

function Choice({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "default" : "outline"}
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

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

/** Whether what the merchant just did is in the store: never "saved" until it really is. */
function SaveStatus({ kit }: { kit: PostKit }) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  if (kit.saveState === "failed") {
    return (
      <span role="alert" className="flex flex-wrap items-center gap-2 text-xs text-destructive">
        {isAr
          ? "ما انحفظ في المتجر، بس محفوظ في هالجهاز."
          : "Not saved to the store yet, but kept on this device."}
        <Button type="button" size="sm" variant="outline" onClick={() => void kit.retrySave()}>
          {isAr ? "حاول مرة ثانية" : "Try again"}
        </Button>
      </span>
    );
  }
  if (kit.saveState === "idle") return null;
  return (
    <span role="status" className="text-xs text-muted-foreground">
      {kit.saveState === "saving"
        ? isAr
          ? "جاري الحفظ…"
          : "Saving…"
        : isAr
          ? "انحفظ في المتجر"
          : "Saved to the store"}
    </span>
  );
}

/** Editing one post: the post itself beside everything that changes it. */
export function PostMaker({
  postKey,
  kit,
  onClose,
}: {
  postKey: string;
  kit: PostKit;
  onClose: () => void;
}) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const uid = useId();
  const [post, setPost] = useState<Post>(() => kit.currentOf(postKey));
  const [selected, setSelected] = useState(-1);
  const [slot, setSlot] = useState<"photo1" | "photo2">("photo1");
  const [addOnTop, setAddOnTop] = useState(false);
  const stage = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const opened = useRef(JSON.stringify(post));
  const { saveEdit } = kit;
  const Back = isAr ? ArrowRight : ArrowLeft;
  const fields = fieldsOf(post);
  const sticker = post.stickers[selected];
  const g = geometry(post);

  useEffect(() => {
    if (stage.current) renderPost(stage.current, post, kit.photos, 1, selected);
  }, [post, selected, kit.photos]);

  // A tap that only selects a sticker changes nothing, so nothing is saved for it.
  useEffect(() => {
    const json = JSON.stringify(post);
    if (json === opened.current) return;
    const timer = setTimeout(() => {
      opened.current = json;
      saveEdit(post);
    }, 250);
    return () => clearTimeout(timer);
  }, [post, saveEdit]);

  const latest = useRef(post);
  latest.current = post;

  // Leaving straight after a change still keeps it: the timer above is cleared on the way out.
  useEffect(
    () => () => {
      const json = JSON.stringify(latest.current);
      if (json !== opened.current) saveEdit(latest.current);
    },
    [saveEdit],
  );

  // A finger on a sticker moves the sticker; anywhere else it scrolls the page.
  useEffect(() => {
    const canvas = stage.current;
    if (!canvas) return;
    const onTouch = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      const box = canvas.getBoundingClientRect();
      const x = (touch.clientX - box.left) / box.width;
      const y = (touch.clientY - box.top) / box.height;
      const size = geometry(latest.current);
      if (stickerAt(latest.current, x, y, size.W, size.H) >= 0) e.preventDefault();
    };
    canvas.addEventListener("touchstart", onTouch, { passive: false });
    return () => canvas.removeEventListener("touchstart", onTouch);
  }, []);

  const update = (change: Partial<Post>) => setPost((prev) => ({ ...prev, ...change }));
  const setSticker = (change: Partial<Post["stickers"][number]>) =>
    setPost((prev) => ({
      ...prev,
      stickers: prev.stickers.map((st, i) => (i === selected ? { ...st, ...change } : st)),
    }));

  const placePhoto = (key: string) => {
    const photo = kit.photos[key];
    if (!photo) return;
    const card = sticker?.id === "photo" ? selected : undefined;
    const placesOnTop = card === undefined && (addOnTop || !hasPhotoSlot(post));
    const notes = card === undefined && !placesOnTop ? photoNotes(post, slot, kit.photos) : [];
    const next = withPhoto(post, key, photo, { selected: card, slot, addOnTop });
    setPost(next);
    if (placesOnTop) setSelected(next.stickers.length - 1);
    setAddOnTop(false);
    if (notes.includes("caption")) {
      toast(
        isAr
          ? "الكابشن للحين يذكر القطعة القديمة، عدّله."
          : "The caption still names the old piece.",
      );
    }
    if (notes.includes("eyes")) {
      toast(isAr ? "حرّك العيون لمكانها في الصورة." : "Move the eyes to fit the new photo.");
    }
  };

  const pointOf = (e: { clientX: number; clientY: number }) => {
    const box = stage.current?.getBoundingClientRect();
    if (!box) return { x: 0, y: 0 };
    return { x: (e.clientX - box.left) / box.width, y: (e.clientY - box.top) / box.height };
  };

  const textInput = (name: TextField, ar: string, en: string, multi = false) => {
    const id = `${uid}-${name}`;
    const value = post[name] ?? "";
    const set = (text: string) => update({ [name]: text });
    return (
      <div className="space-y-1.5" key={name}>
        <Label htmlFor={id}>{isAr ? ar : en}</Label>
        {multi ? (
          <Textarea
            id={id}
            dir="rtl"
            value={value}
            onChange={(e) => set(e.target.value)}
            rows={3}
          />
        ) : (
          <Input id={id} dir="rtl" value={value} onChange={(e) => set(e.target.value)} />
        )}
      </div>
    );
  };

  const crop = hasPhotoSlot(post) || sticker?.id === "photo" ? cropOf(post, slot, sticker) : null;
  const cropCard = sticker?.id === "photo" ? selected : undefined;
  const cropSlider = (
    name: "z" | "fx" | "fy",
    ar: string,
    en: string,
    min: number,
    max: number,
  ) => (
    <div className="space-y-1.5" key={name}>
      <p className="text-xs font-medium text-foreground">{isAr ? ar : en}</p>
      <Slider
        dir="ltr"
        aria-label={isAr ? ar : en}
        min={min}
        max={max}
        step={0.01}
        value={[crop?.[name] ?? min]}
        onValueChange={([value]) =>
          setPost((prev) => withCrop(prev, slot, { [name]: value }, cropCard))
        }
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          <Back className="size-4" />
          {isAr ? "رجوع للبوستات" : "Back to posts"}
        </Button>
        <h2 className="min-w-0 flex-1 text-base font-semibold text-foreground">{post.title}</h2>
        <SaveStatus kit={kit} />
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-3 lg:sticky lg:top-4">
          <canvas
            ref={stage}
            tabIndex={0}
            aria-label={
              isAr
                ? "معاينة البوست. اسحب الستيكر، أو اختره واستخدمي الأسهم."
                : "The post. Drag a sticker, or select one and use the arrow keys."
            }
            className="block h-auto max-h-[80vh] w-auto max-w-full cursor-grab touch-pan-y rounded-lg bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            onPointerDown={(e) => {
              const pt = pointOf(e);
              const i = stickerAt(post, pt.x, pt.y, g.W, g.H);
              setSelected(i);
              if (i >= 0) {
                drag.current = { dx: post.stickers[i].x - pt.x, dy: post.stickers[i].y - pt.y };
                e.currentTarget.setPointerCapture(e.pointerId);
              }
            }}
            onPointerMove={(e) => {
              if (!drag.current || selected < 0) return;
              const pt = pointOf(e);
              setSticker({
                x: Math.min(1, Math.max(0, pt.x + drag.current.dx)),
                y: Math.min(1, Math.max(0, pt.y + drag.current.dy)),
              });
            }}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
            onKeyDown={(e) => {
              if (!sticker) return;
              const step = 0.012;
              const moves: Record<string, [number, number]> = {
                ArrowLeft: [-step, 0],
                ArrowRight: [step, 0],
                ArrowUp: [0, -step],
                ArrowDown: [0, step],
              };
              const move = moves[e.key];
              if (!move) return;
              e.preventDefault();
              setSticker({ x: sticker.x + move[0], y: sticker.y + move[1] });
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void savePost(post, kit, isAr)}>
              <Download className="size-4" />
              {isAr ? "حمّل الصورة" : "Save the image"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void copyWords(post.caption, isAr)}
            >
              <Copy className="size-4" />
              {isAr ? "انسخ الكابشن" : "Copy the caption"}
            </Button>
            {kit.edits[postKey] ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  opened.current = JSON.stringify(latest.current);
                  kit.resetEdit(postKey);
                  onClose();
                }}
              >
                <RotateCcw className="size-4" />
                {isAr ? "رجّعه لأصله" : "Back to the original"}
              </Button>
            ) : null}
          </div>
        </div>

        <div className="min-w-0 space-y-5">
          <PhotoLibrary
            kit={kit}
            current={
              sticker?.id === "photo"
                ? sticker.photo
                : addOnTop || !hasPhotoSlot(post)
                  ? undefined
                  : post[slot]
            }
            slot={slot}
            showSlots={fields.includes("photo2")}
            onSlot={setSlot}
            addOnTop={addOnTop}
            onAddOnTop={() => {
              setAddOnTop((on) => !on);
              setSelected(-1);
            }}
            hasSlot={hasPhotoSlot(post)}
            editingCard={sticker?.id === "photo"}
            onPick={placePhoto}
            onRemoved={(key, fallback) =>
              setPost((prev) => ({
                ...prev,
                photo1: prev.photo1 === key ? fallback : prev.photo1,
                photo2: prev.photo2 === key ? fallback : prev.photo2,
                stickers: prev.stickers.filter((st) => st.photo !== key),
              }))
            }
          />
          {crop ? (
            <div className="grid gap-4 sm:grid-cols-3">
              {cropSlider("z", "تقريب الصورة", "Zoom", 1, 3)}
              {cropSlider("fx", "يمين ويسار", "Left and right", 0, 1)}
              {cropSlider("fy", "فوق وتحت", "Up and down", 0, 1)}
            </div>
          ) : null}

          <div className="space-y-2">
            <p className="text-xs font-medium text-foreground">{isAr ? "التمبلت" : "Layout"}</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(TEMPLATES).map(([key, tpl]) => (
                <Choice key={key} active={post.tpl === key} onClick={() => update({ tpl: key })}>
                  {isAr ? tpl.name.ar : tpl.name.en}
                </Choice>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs font-medium text-foreground">{isAr ? "اللون" : "Colour"}</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(TONES).map(([key, tone]) => (
                  <Choice
                    key={key}
                    active={post.tone === key}
                    onClick={() => update({ tone: key })}
                  >
                    {isAr ? tone.name.ar : tone.name.en}
                  </Choice>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-foreground">{isAr ? "المقاس" : "Size"}</p>
              <div className="flex flex-wrap gap-2">
                <Choice active={post.size === "post"} onClick={() => update({ size: "post" })}>
                  {isAr ? "بوست" : "Post"}
                </Choice>
                <Choice active={post.size === "story"} onClick={() => update({ size: "story" })}>
                  {isAr ? "استوري وريل" : "Story and reel"}
                </Choice>
              </div>
            </div>
          </div>

          {fields.includes("lead")
            ? textInput("lead", "السطر الصغير فوق", "Small line above")
            : null}
          {fields.includes("head") ? (
            <div className="space-y-1">
              {textInput("head", "العنوان", "Headline", true)}
              <p className="text-xs text-muted-foreground">
                {isAr
                  ? "حط الكلمة المهمة بين نجمتين عشان تطلع على الليبل: *جذي*"
                  : "Put the key words between two asterisks to set them on the label: *like this*"}
              </p>
            </div>
          ) : null}
          {fields.includes("chat")
            ? textInput(
                "chat",
                "المحادثة: كل رسالة في سطر، الاسم ونقطتين والكلام",
                "Chat: one message a line, a name, a colon and the words",
                true,
              )
            : null}
          {fields.includes("items")
            ? textInput("items", "القائمة: كل نقطة في سطر", "List: one point a line", true)
            : null}
          {fields.includes("foot")
            ? textInput("foot", "التعليق بخط اليد", "Handwritten note")
            : null}
          {fields.includes("label") ? textInput("label", "ليبل المنتج", "Product label") : null}
          {fields.includes("labelA") ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {textInput("labelA", "اسم الخيار 1", "Option 1")}
              {textInput("labelB", "اسم الخيار 2", "Option 2")}
            </div>
          ) : null}
          {hasSceneText(post)
            ? textInput("bag", "الكلام على الرسمة", "Words on the drawing", true)
            : null}

          <div className="space-y-2">
            <p className="text-xs font-medium text-foreground">
              {isAr ? "الستيكرات: اضغط عشان تضيفين" : "Stickers: tap to add"}
            </p>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-2">
              {Object.entries(STICKERS)
                .filter(([, def]) => !def.photoCard)
                .map(([id, def]) => (
                  <Button
                    key={id}
                    type="button"
                    variant="outline"
                    aria-label={`${isAr ? "أضف ستيكر" : "Add sticker"} ${isAr ? def.name.ar : def.name.en}`}
                    title={isAr ? def.name.ar : def.name.en}
                    className="block h-auto min-h-11 w-full whitespace-normal rounded-lg bg-muted p-1"
                    onClick={() => {
                      const next = [...post.stickers, newSticker(id)];
                      update({ stickers: next });
                      setSelected(next.length - 1);
                    }}
                  >
                    <StickerThumb id={id} />
                  </Button>
                ))}
            </div>
          </div>
          {sticker ? (
            <div className="space-y-3 rounded-lg border border-dashed border-border p-3">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-foreground">{isAr ? "الحجم" : "Size"}</p>
                  <Slider
                    dir="ltr"
                    aria-label={isAr ? "حجم الستيكر" : "Sticker size"}
                    min={90}
                    max={1100}
                    step={5}
                    value={[sticker.s]}
                    onValueChange={([value]) => setSticker({ s: value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-foreground">{isAr ? "الميلان" : "Tilt"}</p>
                  <Slider
                    dir="ltr"
                    aria-label={isAr ? "ميلان الستيكر" : "Sticker tilt"}
                    min={-45}
                    max={45}
                    step={1}
                    value={[sticker.r ?? 0]}
                    onValueChange={([value]) => setSticker({ r: value })}
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {sticker.id !== "photo" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setSticker({ flip: !sticker.flip })}
                  >
                    <FlipHorizontal className="size-4" />
                    {isAr ? "اقلبه" : "Flip"}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    update({ stickers: post.stickers.filter((_, i) => i !== selected) });
                    setSelected(-1);
                  }}
                >
                  <Trash2 className="size-4" />
                  {isAr ? "احذفه" : "Remove"}
                </Button>
              </div>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-caption`}>{isAr ? "الكابشن" : "Caption"}</Label>
            <Textarea
              id={`${uid}-caption`}
              dir="rtl"
              rows={4}
              value={post.caption}
              onChange={(e) => update({ caption: e.target.value })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
