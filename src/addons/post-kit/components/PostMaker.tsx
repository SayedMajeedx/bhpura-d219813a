import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Download,
  Redo2,
  RotateCcw,
  Trash2,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/lib/i18n";
import type { PostKit } from "../hooks/use-post-kit";
import { useStageGestures } from "../hooks/use-stage-gestures";
import { canRedo, canUndo, commit, redo, startHistory, undo } from "../lib/history";
import { imageFiles, isTyping } from "../lib/pasted";
import { geometry } from "../lib/frame";
import { TEMPLATES } from "../lib/layouts";
import { isOwnPost } from "../lib/own-posts";
import {
  cropOf,
  duplicated,
  fieldsOf,
  hasPhotoSlot,
  laidSticker,
  movedLayer,
  newSticker,
  photoNotes,
  withCrop,
  withCutout,
  withPhoto,
  withSticker,
  withoutSticker,
} from "../lib/post-rules";
import { renderPost } from "../lib/render";
import { TONES } from "../lib/tones";
import type { Post } from "../lib/types";
import { copyWords, savePost } from "./PostKitPage";
import { CutoutDialog } from "./CutoutDialog";
import { PhotoLibrary } from "./PhotoLibrary";
import { PostLookField } from "./PostLookField";
import { PostTextFields } from "./PostTextFields";
import { SelectionToolbar } from "./SelectionToolbar";
import { StickerPicker } from "./StickerPicker";

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
  onOpenCopy,
}: {
  postKey: string;
  kit: PostKit;
  onClose: () => void;
  onOpenCopy: (key: string) => void;
}) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const uid = useId();
  const [post, setPost] = useState<Post>(() => kit.currentOf(postKey));
  const [selected, setSelected] = useState(-1);
  const [slot, setSlot] = useState<"photo1" | "photo2">("photo1");
  const [addOnTop, setAddOnTop] = useState(false);
  const stage = useRef<HTMLCanvasElement>(null);
  const opened = useRef(JSON.stringify(post));
  const { saveEdit } = kit;
  const Back = isAr ? ArrowRight : ArrowLeft;
  const fields = fieldsOf(post);
  const sticker = post.stickers[selected];
  const g = geometry(post);

  const { handleRadius, canvasProps } = useStageGestures({
    stage,
    post,
    setPost,
    selected,
    setSelected,
    photos: kit.photos,
  });

  useEffect(() => {
    if (stage.current) renderPost(stage.current, post, kit.photos, 1, selected, handleRadius);
  }, [post, selected, kit.photos, handleRadius]);

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

  // Undo keeps a step each time the merchant pauses, not each pixel of a drag.
  const history = useRef(startHistory(post));
  const [, setHistoryTick] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = commit(history.current, post);
      if (next !== history.current) {
        history.current = next;
        setHistoryTick((n) => n + 1);
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [post]);
  // Reads the post through `latest`, so one function serves the buttons and the keys.
  const step = useCallback((way: "undo" | "redo") => {
    const result = (way === "undo" ? undo : redo)(history.current, latest.current);
    if (!result) return;
    history.current = result.history;
    setPost(result.post);
    setSelected((i) => (result.post.stickers[i] ? i : -1));
    setHistoryTick((n) => n + 1);
  }, []);

  // Leaving straight after a change still keeps it: the timer above is cleared on the way out.
  useEffect(
    () => () => {
      const json = JSON.stringify(latest.current);
      if (json !== opened.current) saveEdit(latest.current);
    },
    [saveEdit],
  );

  const update = (change: Partial<Post>) => setPost((prev) => ({ ...prev, ...change }));
  const setSticker = (change: Partial<Post["stickers"][number]>) =>
    setPost((prev) => withSticker(prev, selected, change));
  const reselect = (result: { post: Post; index: number }) => {
    setPost(result.post);
    setSelected(result.index);
  };

  const placePhoto = (key: string, onTop = false) => {
    const photo = kit.photos[key];
    if (!photo) return;
    const card = sticker?.id === "photo" && !onTop ? selected : undefined;
    const placesOnTop = card === undefined && (onTop || addOnTop || !hasPhotoSlot(post));
    const notes = card === undefined && !placesOnTop ? photoNotes(post, slot, kit.photos) : [];
    const next = withPhoto(post, key, photo, {
      selected: card,
      slot,
      addOnTop: onTop || addOnTop,
    });
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

  // A picture pasted or dropped is in the store's book on a later render: laid on top from there.
  const [pendingPlace, setPendingPlace] = useState<string | null>(null);
  const placeRef = useRef(placePhoto);
  placeRef.current = placePhoto;
  useEffect(() => {
    if (!pendingPlace || !kit.photos[pendingPlace]) return;
    placeRef.current(pendingPlace, true);
    setPendingPlace(null);
  }, [pendingPlace, kit.photos]);

  // The photo whose background is being taken off, and the offer to after an upload.
  const [cutting, setCutting] = useState<string | null>(null);
  const offerCutout = (key: string) =>
    toast(isAr ? "خلفية الصورة لون واحد. نشيلها؟" : "This background is one colour. Remove it?", {
      action: { label: isAr ? "شيل الخلفية" : "Remove it", onClick: () => setCutting(key) },
    });
  const removeFromPost = (key: string, fallback: string) =>
    setPost((prev) => ({
      ...prev,
      photo1: prev.photo1 === key ? fallback : prev.photo1,
      photo2: prev.photo2 === key ? fallback : prev.photo2,
      stickers: prev.stickers.filter((st) => st.photo !== key),
    }));

  /** Pictures pasted or dropped on the maker go to the store's photos and onto the post. */
  const takeFiles = async (files: File[]) => {
    if (!files.length) return;
    const { added, failed, plainEdge } = await kit.addUploads(files);
    setPendingPlace(added[0] ?? null);
    if (plainEdge[0]) offerCutout(plainEdge[0]);
    if (failed) {
      toast.error(
        isAr
          ? "ما قدرنا نرفع الصورة. تأكد من النت، وجرّب JPG أو PNG."
          : "The photo did not upload. Check your connection and try JPG or PNG.",
      );
    }
  };
  const takeFilesRef = useRef(takeFiles);
  takeFilesRef.current = takeFiles;
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = imageFiles(e.clipboardData?.files);
      if (!files.length) return;
      e.preventDefault();
      void takeFilesRef.current(files);
    };
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z" || isTyping(e.target)) return;
      e.preventDefault();
      step(e.shiftKey ? "redo" : "undo");
    };
    window.addEventListener("paste", onPaste);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("keydown", onKey);
    };
  }, [step]);

  const pasteFromClipboard = async () => {
    try {
      const items = await navigator.clipboard.read();
      const files: File[] = [];
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith("image/"));
        if (type) files.push(new File([await item.getType(type)], "pasted", { type }));
      }
      if (files.length) {
        await takeFiles(files);
        return;
      }
    } catch {
      // A browser that refuses to read the clipboard says nothing; the message below helps.
    }
    toast(
      isAr
        ? "ما لقينا صورة منسوخة. انسخ الصورة نفسها، مو رابطها."
        : "No copied picture found. Copy the picture itself, not its link.",
    );
  };

  // The slot's crop: a laid photo's own is in the toolbar under the post.
  const crop = hasPhotoSlot(post) && sticker?.id !== "photo" ? cropOf(post, slot) : null;
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
        onValueChange={([value]) => setPost((prev) => withCrop(prev, slot, { [name]: value }))}
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
                ? "معاينة البوست. اسحب الستيكر أو الصورة، وكبّر وصغّر من النقطة اللي في الزاوية، أو استخدم الأسهم و + و −."
                : "The post. Drag a sticker or photo, resize it from its corner dot, or use the arrow keys and + and −."
            }
            className="block h-auto max-h-[80vh] w-auto max-w-full cursor-grab touch-pan-y rounded-lg bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void takeFiles(imageFiles(e.dataTransfer.files));
            }}
            {...canvasProps}
          />
          {sticker ? (
            <SelectionToolbar
              sticker={sticker}
              index={selected}
              count={post.stickers.length}
              photos={kit.photos}
              width={g.W}
              onChange={setSticker}
              onLayer={(way) => reselect(movedLayer(post, selected, way))}
              onDuplicate={() => reselect(duplicated(post, selected))}
              onCutout={sticker.photo ? () => setCutting(sticker.photo ?? null) : undefined}
              onRemove={() => {
                setPost((prev) => withoutSticker(prev, selected));
                setSelected(-1);
              }}
            />
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!canUndo(history.current, post)}
              onClick={() => step("undo")}
            >
              <Undo2 className="size-4" />
              {isAr ? "تراجع" : "Undo"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!canRedo(history.current, post)}
              onClick={() => step("redo")}
            >
              <Redo2 className="size-4" />
              {isAr ? "إعادة" : "Redo"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void pasteFromClipboard()}
            >
              <ClipboardPaste className="size-4" />
              {isAr ? "الصق صورة" : "Paste a picture"}
            </Button>
          </div>
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
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const key = kit.copyPost(latest.current);
                if (key) onOpenCopy(key);
              }}
            >
              <CopyPlus className="size-4" />
              {isAr ? "انسخ البوست" : "Copy the post"}
            </Button>
            {isOwnPost(postKey) ? (
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  const sure = await confirmDialog({
                    title: isAr ? "نحذف هالبوست؟" : "Delete this post?",
                    destructive: true,
                  });
                  if (!sure) return;
                  opened.current = JSON.stringify(latest.current);
                  kit.resetEdit(postKey);
                  onClose();
                }}
              >
                <Trash2 className="size-4" />
                {isAr ? "احذف البوست" : "Delete the post"}
              </Button>
            ) : kit.edits[postKey] ? (
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
            onRemoved={removeFromPost}
            onCutout={setCutting}
            onOfferCutout={offerCutout}
          />
          {crop ? (
            <div className="space-y-2">
              <div className="grid gap-4 sm:grid-cols-3">
                {cropSlider("z", "تقريب داخل الإطار", "Zoom inside the frame", 1, 3)}
                {cropSlider("fx", "يمين ويسار", "Left and right", 0, 1)}
                {cropSlider("fy", "فوق وتحت", "Up and down", 0, 1)}
              </div>
              <p className="text-xs text-muted-foreground">
                {isAr
                  ? "هذي تقص الصورة داخل مكانها في التمبلت. لتكبير الصورة نفسها وتصغيرها وتحريكها بحرية: «أضف صورة فوق البوست»."
                  : "These crop the photo inside its place in the layout. To size and move a photo freely, lay it on the post."}
              </p>
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
          <PostLookField post={post} onChange={update} />
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

          <PostTextFields post={post} onChange={update} />

          <StickerPicker
            kit={kit}
            onAddDrawn={(id) => {
              const next = [...post.stickers, newSticker(id)];
              update({ stickers: next });
              setSelected(next.length - 1);
            }}
            onAddOwn={(key) => {
              const next = [...post.stickers, laidSticker(key)];
              update({ stickers: next });
              setSelected(next.length - 1);
            }}
            onRemoved={removeFromPost}
          />
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
      <CutoutDialog
        kit={kit}
        photoKey={cutting}
        onClose={() => setCutting(null)}
        onSaved={(stickerKey) => {
          if (cutting) reselect(withCutout(latest.current, cutting, stickerKey));
          setCutting(null);
        }}
      />
    </div>
  );
}
