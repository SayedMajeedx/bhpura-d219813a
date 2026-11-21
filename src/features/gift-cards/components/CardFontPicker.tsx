import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Type, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AppDialog, AppDialogBody, AppDialogHeader } from "@/components/ui/app-dialog";
import { useBrand } from "@/lib/brand-context";
import { uploadPublicMedia } from "@/lib/r2-upload";
import { cn } from "@/lib/utils";
import type { CardFontChoice, CardFontUpload } from "@/lib/data/gift-cards/designs";
import { fontHasLetters, registerCardFont } from "@/features/gift-card-design/lib/canvas";
import {
  LIBRARY_MAX,
  addUpload,
  choiceKey,
  choiceName,
  choiceStyle,
  fontName,
  fontOptions,
  removeUpload,
  scriptLetters,
  type FontBase,
  type FontOption,
  type FontOptionGroup,
} from "../lib/card-font-choices";

const GROUPS: Record<FontOptionGroup, { ar: string; en: string }> = {
  default: { ar: "بدون اختيار", en: "Nothing chosen" },
  own: { ar: "خط البطاقات", en: "The cards' own" },
  platform: { ar: "خطوط Boutq", en: "Boutq's fonts" },
  mine: { ar: "خطوطي", en: "My fonts" },
};

type FieldProps = {
  lang: "ar" | "en";
  /** The language of the words this font sets. */
  script: "ar" | "en";
  title: string;
  /** What the font is used for, under the picker's title. */
  description: string;
  value: CardFontChoice | null;
  onChange: (choice: CardFontChoice | null) => void;
  base: FontBase;
  /** The font choosing nothing gives (a message card's gift card font, the settings'). */
  inherited?: CardFontChoice | null;
  library: readonly CardFontUpload[];
  /** Given where uploads are managed (the settings): a new upload joins the list. */
  onLibrary?: (library: CardFontUpload[]) => void;
  /** Uploads chosen somewhere, which cannot be removed from the list. */
  inUse?: ReadonlySet<string>;
  /** The words each font is shown with. */
  sample: string;
};

/**
 * One language's card font: the chosen font's name written in itself, and a picker that shows
 * every font the store may choose, each written in itself, with its own uploads kept to choose
 * again (an upload joins the list once and is chosen at the same time).
 */
export function CardFontField(props: FieldProps) {
  const { lang, script, title, value, base, inherited = null, sample } = props;
  const isAr = lang === "ar";
  const [open, setOpen] = useState(false);
  const shown = value ?? (base === "own" ? null : inherited);
  const url = shown && "url" in shown ? shown.url : null;
  useEffect(() => {
    if (url) registerCardFont(script, url);
  }, [script, url]);
  return (
    <div className="flex items-center gap-3">
      <Type className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm">{title}</p>
        <p
          className="break-words text-lg leading-snug"
          style={choiceStyle(shown, script)}
          dir={script === "ar" ? "rtl" : "ltr"}
        >
          {sample}
        </p>
        <p className="text-xs text-muted-foreground">{choiceName(value, script, lang, base)}</p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label={`${isAr ? "تغيير" : "Change"} ${title}`}
        onClick={() => setOpen(true)}
      >
        {isAr ? "تغيير" : "Change"}
      </Button>
      {open && <CardFontPickerDialog {...props} onClose={() => setOpen(false)} />}
    </div>
  );
}

function CardFontPickerDialog({
  lang,
  script,
  title,
  description,
  value,
  onChange,
  base,
  inherited = null,
  library,
  onLibrary,
  inUse,
  sample,
  onClose,
}: FieldProps & { onClose: () => void }) {
  const isAr = lang === "ar";
  const brand = useBrand();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  // Whether each upload has this language's letters (an English font cannot set Arabic words).
  const [letters, setLetters] = useState<Record<string, boolean | null>>({});
  const options = fontOptions(script, library, lang, base, inherited);
  const chosen = choiceKey(value, base);
  const libraryKey = library.map((font) => font.url).join("|");

  useEffect(() => {
    let live = true;
    for (const url of libraryKey ? libraryKey.split("|") : []) {
      const family = registerCardFont(script, url);
      void fontHasLetters(family, scriptLetters(script)).then(
        (has) => live && setLetters((known) => ({ ...known, [url]: has })),
      );
    }
    return () => {
      live = false;
    };
  }, [libraryKey, script]);

  const choose = (option: FontOption) => {
    onChange(option.choice);
    onClose();
  };

  const upload = async (file: File) => {
    if (!onLibrary) return;
    setUploading(true);
    try {
      const url = await uploadPublicMedia(brand.id, file, "font");
      const font = { url, name: fontName(file.name) || null };
      const next = addUpload(library, font);
      if (!next) return;
      onLibrary(next);
      onChange(font);
      toast.success(
        isAr ? "رُفع الخط واختير، لا تنسَ الحفظ" : "Font uploaded and chosen, remember to save",
      );
      onClose();
    } catch {
      toast.error(isAr ? "تعذّر رفع الخط" : "The font could not be uploaded");
    } finally {
      setUploading(false);
    }
  };

  const full = library.length >= LIBRARY_MAX;
  const groups = (["default", "own", "platform", "mine"] as const).filter(
    (group) => group === "mine" || options.some((o) => o.group === group),
  );

  return (
    <AppDialog
      open
      onOpenChange={(next) => !next && onClose()}
      kind="form"
      size="md"
      busy={uploading}
      dir={isAr ? "rtl" : "ltr"}
    >
      <AppDialogHeader title={title} description={description} />
      <AppDialogBody>
        <div role="radiogroup" aria-label={title} className="space-y-4">
          {groups.map((group) => (
            <section key={group} className="space-y-2">
              <div
                className={cn(
                  "flex items-center justify-between gap-2",
                  // Choosing nothing names itself ("As in the settings"): no heading over it.
                  group === "default" && "sr-only",
                )}
              >
                <h3 className="text-xs font-medium text-muted-foreground">{GROUPS[group][lang]}</h3>
                {group === "mine" && (
                  <span className="font-mono text-xs text-muted-foreground">
                    {library.length}/{LIBRARY_MAX}
                  </span>
                )}
              </div>
              <ul className="grid gap-2">
                {options
                  .filter((option) => option.group === group)
                  .map((option) => {
                    const lacking = option.url ? letters[option.url] === false : false;
                    const on = option.key === chosen;
                    const removable =
                      option.url && onLibrary && !on && !inUse?.has(option.url) ? option.url : null;
                    return (
                      <li key={option.key} className="flex items-center gap-1">
                        <button
                          type="button"
                          role="radio"
                          aria-checked={on}
                          disabled={lacking}
                          onClick={() => choose(option)}
                          className={cn(
                            "flex min-w-0 flex-1 items-center gap-3 rounded-lg border p-3 text-start transition-colors duration-(--motion-quick)",
                            on ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50",
                            lacking && "cursor-not-allowed opacity-60",
                          )}
                        >
                          <span className="min-w-0 flex-1">
                            <span
                              className="block break-words text-2xl leading-snug"
                              style={option.style}
                              dir={script === "ar" ? "rtl" : "ltr"}
                            >
                              {sample}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {option.name}
                              {lacking &&
                                (script === "ar"
                                  ? isAr
                                    ? " · ما فيه حروف عربية"
                                    : " · has no Arabic letters"
                                  : isAr
                                    ? " · ما فيه حروف إنجليزية"
                                    : " · has no English letters")}
                            </span>
                          </span>
                          {on && <Check className="size-4 shrink-0 text-primary" aria-hidden />}
                        </button>
                        {removable && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-9 shrink-0"
                            aria-label={isAr ? `إزالة ${option.name}` : `Remove ${option.name}`}
                            onClick={() => onLibrary?.(removeUpload(library, removable))}
                          >
                            <X className="size-4" aria-hidden="true" />
                          </Button>
                        )}
                      </li>
                    );
                  })}
              </ul>
              {group === "mine" && library.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  {onLibrary
                    ? isAr
                      ? "ارفع خطك مرة وحدة، ويبقى هنا تختاره متى ما بغيت."
                      : "Upload a font once and it stays here to choose whenever you like."
                    : isAr
                      ? "ترفع خطوطك من إعدادات بطاقات الهدايا."
                      : "Your fonts are uploaded in the gift card settings."}
                </p>
              )}
              {group === "mine" && onLibrary && (
                <>
                  <input
                    ref={input}
                    type="file"
                    accept=".woff,.woff2,.ttf,.otf"
                    className="hidden"
                    aria-label={isAr ? "رفع خط" : "Upload a font"}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void upload(file);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={uploading || full}
                    onClick={() => input.current?.click()}
                  >
                    {uploading ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Upload className="size-4" aria-hidden="true" />
                    )}
                    {isAr ? "رفع خط (woff/ttf/otf)" : "Upload a font (woff/ttf/otf)"}
                  </Button>
                  {full && (
                    <p className="text-xs text-muted-foreground">
                      {isAr
                        ? `القائمة فيها ${LIBRARY_MAX} خطًا، احذف واحدًا لترفع غيره.`
                        : `The list holds ${LIBRARY_MAX} fonts: remove one to upload another.`}
                    </p>
                  )}
                </>
              )}
            </section>
          ))}
        </div>
      </AppDialogBody>
    </AppDialog>
  );
}
