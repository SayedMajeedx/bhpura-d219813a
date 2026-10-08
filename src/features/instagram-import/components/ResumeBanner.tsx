import { History } from "lucide-react";
import { Button } from "@/components/ui/button";

/** On the importer's form: an import left unfinished can be continued instead of starting over. */
export function ResumeBanner({
  isAr,
  count,
  username,
  savedAt,
  onResume,
  onDiscard,
}: {
  isAr: boolean;
  count: number;
  username: string;
  savedAt: number;
  onResume: () => void;
  onDiscard: () => void;
}) {
  const when = new Date(savedAt).toLocaleString(isAr ? "ar-BH-u-nu-latn" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center">
      <History className="h-5 w-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm font-bold text-foreground">
          {isAr ? "لديك استيراد لم يكتمل" : "You have an unfinished import"}
        </p>
        <p className="text-xs text-muted-foreground">
          {isAr
            ? `${count} مسودة${username ? ` من @${username}` : ""}، حُفظت ${when}. الصور مرفوعة والأسماء مقروءة، فلا تبدأ من جديد. بدء استيراد جديد يستبدلها.`
            : `${count} drafts${username ? ` from @${username}` : ""}, saved ${when}. The pictures are copied and the captions read, so there is no need to start over. Starting a new import replaces it.`}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button type="button" size="sm" className="rounded-lg font-bold" onClick={onResume}>
          {isAr ? "متابعة" : "Continue"}
        </Button>
        <Button type="button" size="sm" variant="ghost" className="rounded-lg" onClick={onDiscard}>
          {isAr ? "تجاهل" : "Discard"}
        </Button>
      </div>
    </div>
  );
}
