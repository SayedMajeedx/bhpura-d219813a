import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PageSettings } from "@/lib/platform-pages/page";
import { WordsList } from "./BlocksEditor";
import { EditorCard, PictureField, WordsField, type EditorLang } from "./EditorParts";

/** A `datetime-local` value for a stored moment, in the reader's own clock. */
export function localInputValue(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

/** The words after sending and once closed, the closing day, the link's preview and the footer. */
export function SettingsEditor({
  settings,
  onChange,
  lang,
}: {
  settings: PageSettings;
  onChange: (settings: PageSettings) => void;
  lang: EditorLang;
}) {
  const ar = lang === "ar";
  const thanks = settings.thank_you;
  const closed = settings.closed_message;
  const share = settings.share;
  return (
    <div className="space-y-3">
      <EditorCard title={ar ? "بعد الإرسال" : "After sending"}>
        <WordsField
          label={ar ? "الشارة" : "Badge"}
          value={thanks.badge}
          onChange={(badge) => onChange({ ...settings, thank_you: { ...thanks, badge } })}
          lang={lang}
        />
        <WordsField
          label={ar ? "العنوان" : "Title"}
          value={thanks.title}
          onChange={(title) => onChange({ ...settings, thank_you: { ...thanks, title } })}
          lang={lang}
        />
        <WordsField
          label={ar ? "الرسالة" : "Message"}
          value={thanks.body}
          onChange={(body) => onChange({ ...settings, thank_you: { ...thanks, body } })}
          multiline
          lang={lang}
        />
        <WordsField
          label={ar ? "زر المشاركة" : "Share button"}
          value={thanks.share_label}
          onChange={(share_label) =>
            onChange({ ...settings, thank_you: { ...thanks, share_label } })
          }
          lang={lang}
        />
      </EditorCard>

      <EditorCard title={ar ? "الإغلاق" : "Closing"}>
        <div className="space-y-1.5">
          <Label htmlFor="page-closes-at" className="text-xs font-semibold">
            {ar ? "يُغلق تلقائياً في (اختياري)" : "Closes by itself on (optional)"}
          </Label>
          <Input
            id="page-closes-at"
            type="datetime-local"
            dir="ltr"
            className="max-w-60"
            value={localInputValue(settings.closes_at)}
            onChange={(e) =>
              onChange({
                ...settings,
                closes_at: e.target.value ? new Date(e.target.value).toISOString() : null,
              })
            }
          />
        </div>
        <WordsField
          label={ar ? "عنوان رسالة الإغلاق" : "Closed title"}
          value={closed.title}
          onChange={(title) => onChange({ ...settings, closed_message: { ...closed, title } })}
          lang={lang}
        />
        <WordsField
          label={ar ? "نص رسالة الإغلاق" : "Closed message"}
          value={closed.body}
          onChange={(body) => onChange({ ...settings, closed_message: { ...closed, body } })}
          multiline
          lang={lang}
        />
      </EditorCard>

      <EditorCard title={ar ? "معاينة الرابط عند مشاركته" : "How a shared link previews"}>
        <WordsField
          label={ar ? "العنوان" : "Title"}
          value={share.title}
          onChange={(title) => onChange({ ...settings, share: { ...share, title } })}
          lang={lang}
        />
        <WordsField
          label={ar ? "الوصف" : "Description"}
          value={share.description}
          onChange={(description) => onChange({ ...settings, share: { ...share, description } })}
          multiline
          lang={lang}
        />
        <PictureField
          label={ar ? "الصورة" : "Picture"}
          value={share.image_url}
          onChange={(image_url) => onChange({ ...settings, share: { ...share, image_url } })}
          lang={lang}
        />
      </EditorCard>

      <EditorCard title={ar ? "أسفل الصفحة" : "Footer"}>
        <WordsList
          label={ar ? "الأسطر" : "Lines"}
          items={settings.footer}
          onChange={(footer) => onChange({ ...settings, footer })}
          lang={lang}
        />
      </EditorCard>
    </div>
  );
}
