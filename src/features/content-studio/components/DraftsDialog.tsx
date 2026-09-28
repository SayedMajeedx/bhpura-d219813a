import { useState } from "react";
import { FolderOpen, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { defaultDraftName, readDraftFormat } from "@/features/content-studio/lib/drafts";
import { occasionById } from "@/features/content-studio/lib/occasions";
import { FORMATS } from "@/features/content-studio/lib/studio-content";
import { templateById, type TemplateId } from "@/features/content-studio/templates";
import type { ContentStudio } from "@/features/content-studio/hooks/use-content-studio";

/** The studio's design saved under a name, and the brand's drafts to reopen or delete. */
export function DraftsDialog({ studio }: { studio: ContentStudio }) {
  const { isAr, draftsOpen, setDraftsOpen } = studio;
  return (
    <Dialog open={draftsOpen} onOpenChange={setDraftsOpen}>
      <DialogContent dir={isAr ? "rtl" : "ltr"} className="max-w-lg rounded-2xl">
        <DialogHeader>
          <DialogTitle>{isAr ? "المسودات" : "Drafts"}</DialogTitle>
          <DialogDescription>
            {isAr
              ? "احفظ التصميم الحالي لتعود إليه لاحقاً، أو افتح مسودة لفريقك."
              : "Save this design to come back to it, or open one your team saved."}
          </DialogDescription>
        </DialogHeader>
        {/* Mounted with the dialog, so each opening starts from the current design's name. */}
        <DraftsPanel studio={studio} />
      </DialogContent>
    </Dialog>
  );
}

function DraftsPanel({ studio }: { studio: ContentStudio }) {
  const {
    isAr,
    templateId,
    activeTemplate,
    productName,
    lookbookIds,
    occasionId,
    draftsQ,
    openDraft,
    draftBusy,
    saveDraft,
    reopenDraft,
    removeDraft,
  } = studio;
  const lang = isAr ? "ar" : "en";
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const templateName = (id: string) => {
    if (id === "classic") return isAr ? "كلاسيكي" : "Classic";
    const template = templateById(id as TemplateId);
    return template ? template.name[lang] : id;
  };
  const subject =
    templateId === "occasion-pack"
      ? occasionById(occasionId).name[lang]
      : templateId === "lookbook-carousel"
        ? isAr
          ? `${lookbookIds.length} منتجات`
          : `${lookbookIds.length} products`
        : productName;
  const suggestedName = defaultDraftName(
    activeTemplate ? activeTemplate.name[lang] : templateName("classic"),
    subject,
  );
  const [name, setName] = useState(() => openDraft?.name ?? suggestedName);
  const drafts = draftsQ.data ?? [];
  const when = (iso: string) =>
    new Intl.DateTimeFormat(isAr ? "ar-u-nu-latn" : "en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));

  return (
    <>
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          void saveDraft(name, !openDraft);
        }}
      >
        <Label htmlFor="studio-draft-name" className="text-xs font-bold text-foreground">
          {isAr ? "اسم المسودة" : "Draft name"}
        </Label>
        <Input
          id="studio-draft-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={80}
          className="h-10 rounded-xl text-xs"
        />
        <div className="flex flex-wrap gap-2">
          {openDraft && (
            <Button
              type="submit"
              disabled={draftBusy || !name.trim()}
              className="h-10 gap-2 rounded-xl text-xs font-semibold"
            >
              <Save className="size-4" />
              {isAr ? "حفظ التعديلات" : "Save changes"}
            </Button>
          )}
          <Button
            type={openDraft ? "button" : "submit"}
            variant={openDraft ? "outline" : "default"}
            disabled={draftBusy || !name.trim()}
            onClick={openDraft ? () => void saveDraft(name, true) : undefined}
            className="h-10 gap-2 rounded-xl text-xs font-semibold"
          >
            <Save className="size-4" />
            {openDraft
              ? isAr
                ? "حفظ كمسودة جديدة"
                : "Save as new draft"
              : isAr
                ? "حفظ المسودة"
                : "Save draft"}
          </Button>
        </div>
      </form>

      <div className="space-y-2">
        <p id="studio-drafts-label" className="text-xs font-bold text-foreground">
          {isAr ? "مسودات المتجر" : "The store's drafts"}
        </p>
        {draftsQ.isLoading ? (
          <p className="text-xs text-muted-foreground">{isAr ? "جارٍ التحميل…" : "Loading…"}</p>
        ) : drafts.length === 0 ? (
          <p className="rounded-xl bg-muted/40 px-3 py-3 text-xs text-muted-foreground">
            {isAr ? "لا توجد مسودات بعد." : "No drafts yet."}
          </p>
        ) : (
          <ul
            aria-labelledby="studio-drafts-label"
            className="max-h-72 divide-y divide-border overflow-y-auto rounded-xl border border-border"
          >
            {drafts.map((draft) => (
              <li key={draft.id} className="flex items-center gap-2 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-foreground">
                    {draft.name}
                    {draft.id === openDraft?.id && (
                      <span className="ms-1.5 font-normal text-primary">
                        {isAr ? "· مفتوحة" : "· open"}
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {templateName(draft.template_id)} ·{" "}
                    {FORMATS[readDraftFormat(draft.format)][lang]} · {when(draft.updated_at)}
                  </p>
                </div>
                {confirmingId === draft.id ? (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={draftBusy}
                    onClick={() => {
                      setConfirmingId(null);
                      void removeDraft(draft);
                    }}
                    className="h-8 rounded-lg text-xs"
                  >
                    {isAr ? "تأكيد الحذف" : "Confirm delete"}
                  </Button>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => reopenDraft(draft)}
                      className="h-8 gap-1.5 rounded-lg text-xs"
                    >
                      <FolderOpen className="size-3.5" />
                      {isAr ? "فتح" : "Open"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setConfirmingId(draft.id)}
                      aria-label={isAr ? `حذف «${draft.name}»` : `Delete “${draft.name}”`}
                      className="size-8 rounded-lg text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
