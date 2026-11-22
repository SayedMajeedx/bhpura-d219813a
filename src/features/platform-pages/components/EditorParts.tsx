import { useId, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ImagePlus, Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getPlatformLogoUploadUrl } from "@/lib/onboarding.functions";
import type { Words } from "@/lib/platform-pages/page";

export type EditorLang = "ar" | "en";

/** Words in both languages, side by side on a wide screen: Arabic first, English beside it. */
export function WordsField({
  label,
  value,
  onChange,
  multiline = false,
  lang,
}: {
  label: string;
  value: Words | undefined;
  onChange: (value: Words) => void;
  multiline?: boolean;
  lang: EditorLang;
}) {
  const id = useId();
  const words = value ?? {};
  const Field = multiline ? Textarea : Input;
  return (
    <fieldset className="min-w-0 space-y-1.5">
      <legend className="text-xs font-semibold text-foreground">{label}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="min-w-0 space-y-1">
          <Label htmlFor={`${id}-ar`} className="text-[0.7rem] text-muted-foreground">
            {lang === "ar" ? "بالعربي" : "Arabic"}
          </Label>
          <Field
            id={`${id}-ar`}
            dir="rtl"
            rows={multiline ? 3 : undefined}
            value={words.ar ?? ""}
            onChange={(e) => onChange({ ...words, ar: e.target.value })}
          />
        </div>
        <div className="min-w-0 space-y-1">
          <Label htmlFor={`${id}-en`} className="text-[0.7rem] text-muted-foreground">
            {lang === "ar" ? "بالإنجليزي (اختياري)" : "English (optional)"}
          </Label>
          <Field
            id={`${id}-en`}
            dir="ltr"
            rows={multiline ? 3 : undefined}
            value={words.en ?? ""}
            onChange={(e) => onChange({ ...words, en: e.target.value })}
          />
        </div>
      </div>
    </fieldset>
  );
}

/** Up, down and remove for an item in a list, each named for what it acts on. */
export function ItemControls({
  name,
  index,
  count,
  onMove,
  onRemove,
  lang,
}: {
  name: string;
  index: number;
  count: number;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
  lang: EditorLang;
}) {
  const ar = lang === "ar";
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8"
        disabled={index === 0}
        onClick={() => onMove(-1)}
        aria-label={ar ? `تحريك ${name} لأعلى` : `Move ${name} up`}
      >
        <ArrowUp className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8"
        disabled={index === count - 1}
        onClick={() => onMove(1)}
        aria-label={ar ? `تحريك ${name} لأسفل` : `Move ${name} down`}
      >
        <ArrowDown className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8 text-destructive"
        onClick={onRemove}
        aria-label={ar ? `حذف ${name}` : `Remove ${name}`}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

/** A titled box in the editor: a block, a step, a question. */
export function EditorCard({
  title,
  controls,
  children,
}: {
  title: ReactNode;
  controls?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-xl border border-border-subtle bg-card p-3 sm:p-4">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <h3 className="min-w-0 break-words text-sm font-bold text-foreground">{title}</h3>
        {controls}
      </div>
      {children}
    </section>
  );
}

const PICTURE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

/** A picture of the page: uploaded to the platform's own storage, or removed. */
export function PictureField({
  label,
  value,
  onChange,
  lang,
}: {
  label: string;
  value: string | undefined;
  onChange: (url: string | undefined) => void;
  lang: EditorLang;
}) {
  const ar = lang === "ar";
  const id = useId();
  const [busy, setBusy] = useState(false);
  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (!PICTURE_TYPES.includes(file.type) || file.size > 5 * 1024 * 1024) {
      toast.error(
        ar
          ? "صورة PNG أو JPEG أو WEBP أو SVG، حتى 5 ميجابايت"
          : "A PNG, JPEG, WEBP or SVG picture, up to 5 MB",
      );
      return;
    }
    setBusy(true);
    try {
      const { uploadUrl, publicUrl } = await getPlatformLogoUploadUrl({
        data: { contentType: file.type },
      });
      const res = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!res.ok) throw new Error("upload failed");
      onChange(publicUrl);
    } catch {
      toast.error(ar ? "تعذّر رفع الصورة" : "The picture could not be uploaded");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-semibold">
        {label}
      </Label>
      <div className="flex flex-wrap items-center gap-2">
        {value && (
          <img
            src={value}
            alt=""
            className="h-12 w-auto max-w-40 rounded-md border border-border object-contain"
          />
        )}
        <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5" asChild>
          <label htmlFor={id} className="cursor-pointer">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
            {value ? (ar ? "تغيير الصورة" : "Change picture") : ar ? "رفع صورة" : "Upload picture"}
          </label>
        </Button>
        <input
          id={id}
          type="file"
          accept={PICTURE_TYPES.join(",")}
          className="sr-only"
          disabled={busy}
          onChange={(e) => void upload(e.target.files?.[0])}
        />
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 gap-1.5 text-muted-foreground"
            onClick={() => onChange(undefined)}
          >
            <X className="size-4" />
            {ar ? "إزالة" : "Remove"}
          </Button>
        )}
      </div>
    </div>
  );
}
