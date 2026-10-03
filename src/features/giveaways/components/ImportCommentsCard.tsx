import { useMemo, useRef, useState } from "react";
import { FileUp, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { GiveawayDetail } from "../hooks/use-giveaway-detail";
import { parseImportedComments } from "../lib/import-comments";

/**
 * A way in that does not need Instagram's comments API: paste or upload the
 * comments (a CSV from an export tool, or a plain list) and use the same rules,
 * draw and winner checks.
 */
export function ImportCommentsCard({ detail }: { detail: GiveawayDetail }) {
  const { isAr, importState, rules } = detail;
  const [text, setText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const parsed = useMemo(() => parseImportedComments(text), [text]);
  const undated = parsed.comments.filter((c) => c.commented_at === null).length;
  const windowSet = rules.startsAt !== null || rules.endsAt !== null;

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setText(await file.text());
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <details className="group rounded-xl border border-border bg-card p-4">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold text-foreground">
        <Upload className="size-4 text-primary" aria-hidden="true" />
        {isAr ? "استيراد التعليقات بدلاً من سحبها" : "Import comments instead of pulling them"}
      </summary>

      <div className="mt-3 space-y-3">
        <p className="text-sm text-muted-foreground">
          {isAr
            ? "استخدم هذا الخيار إذا لم يُرجع انستغرام التعليقات. الصق أو ارفع ملفاً فيه تعليق في كل صف: ملف CSV بعمودين username و text (وعمود date اختياري)، أو قائمة بسيطة مثل «@account نص التعليق». الاستيراد يستبدل التعليقات الموجودة."
            : "Use this if Instagram does not return the comments. Paste or upload a file with one comment per row: a CSV with the columns username and text (and optionally date), or a plain list like “@account comment text”. Importing replaces the comments already here."}
        </p>

        <Textarea
          dir="ltr"
          rows={6}
          aria-label={isAr ? "التعليقات" : "Comments"}
          placeholder={"username,text,date\nsara.k,@a @b done,2026-10-01T10:00:00Z"}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/plain"
            className="hidden"
            data-testid="import-file"
            onChange={(event) => void onFile(event.target.files?.[0])}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
          >
            <FileUp className="size-4" />
            {isAr ? "رفع ملف" : "Upload a file"}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={importState.running || parsed.comments.length === 0}
            onClick={() => void detail.importFromText(text)}
          >
            {importState.running && <Loader2 className="size-4 animate-spin" />}
            {isAr ? "استيراد" : "Import"}
          </Button>
          {text.trim() && (
            <span className="text-sm text-muted-foreground" role="status">
              {isAr
                ? `${parsed.comments.length.toLocaleString("en-US")} تعليق مقروء، وتم تخطي ${parsed.skipped.toLocaleString("en-US")} سطر`
                : `${parsed.comments.length.toLocaleString("en-US")} readable, ${parsed.skipped.toLocaleString("en-US")} lines skipped`}
            </span>
          )}
        </div>

        {windowSet && undated > 0 && (
          <p className="text-sm text-foreground">
            {isAr
              ? "لديك فترة زمنية في الشروط، والتعليقات بدون تاريخ تُستبعد منها. أضف عمود date أو أزل الفترة."
              : "Your rules set a time window, and comments without a date fall outside it. Add a date column or clear the window."}
          </p>
        )}
        {importState.error && (
          <p role="alert" className="text-sm text-destructive">
            {importState.error}
          </p>
        )}
        {importState.imported !== null && !importState.running && (
          <p className="text-sm text-foreground" role="status">
            {isAr
              ? `تم استيراد ${importState.imported.toLocaleString("en-US")} تعليق.`
              : `Imported ${importState.imported.toLocaleString("en-US")} comments.`}
          </p>
        )}
      </div>
    </details>
  );
}
