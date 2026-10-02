import { Download, Loader2, RefreshCw, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GiveawayDetail } from "../hooks/use-giveaway-detail";

/** Pulls the post's comments from Instagram, with a progress bar. */
export function CommentsPullCard({ detail }: { detail: GiveawayDetail }) {
  const { isAr, giveaway, pull, comments } = detail;
  if (!giveaway) return null;

  const stored = pull.running ? pull.fetched : comments.length;
  // Instagram's count includes replies, which this pull leaves out, so the bar
  // only fills fully when the pull is done.
  const total = Math.max(giveaway.comments_total, stored, 1);
  const percent =
    giveaway.fetch_done && !pull.running ? 100 : Math.min(99, Math.round((stored / total) * 100));
  const connected = detail.connection?.is_connected === true;

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-foreground">{isAr ? "التعليقات" : "Comments"}</h2>
          <p className="text-sm text-muted-foreground">
            <span dir="ltr" className="font-medium text-foreground">
              {stored.toLocaleString("en-US")}
            </span>{" "}
            {isAr ? "تعليق تم سحبه" : "comments pulled"}
            {giveaway.comments_total > 0 && (
              <>
                {" · "}
                {isAr ? "العدد عند انستغرام" : "Instagram shows"}{" "}
                <span dir="ltr">{giveaway.comments_total.toLocaleString("en-US")}</span>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {pull.running ? (
            <Button type="button" variant="outline" size="sm" onClick={detail.stopPull}>
              <Square className="size-4" />
              {isAr ? "إيقاف" : "Stop"}
            </Button>
          ) : giveaway.fetch_done ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!connected}
              onClick={() => void detail.startPull(true)}
            >
              <RefreshCw className="size-4" />
              {isAr ? "إعادة السحب من الصفر" : "Pull again from scratch"}
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              disabled={!connected}
              onClick={() => void detail.startPull(false)}
            >
              <Download className="size-4" />
              {stored > 0
                ? isAr
                  ? "متابعة السحب"
                  : "Continue pulling"
                : isAr
                  ? "سحب التعليقات"
                  : "Pull comments"}
            </Button>
          )}
        </div>
      </div>

      {(pull.running || (!giveaway.fetch_done && stored > 0)) && (
        <div
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-2 w-full overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
      {pull.running && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
          <Loader2 className="size-3.5 animate-spin" />
          {isAr ? "جارٍ السحب. أبقِ هذه الصفحة مفتوحة." : "Pulling. Keep this page open."}
        </p>
      )}
      {pull.paused && (
        <p className="text-sm text-foreground">
          {isAr
            ? "طلب انستغرام التمهل وتوقف السحب. ما سُحب محفوظ؛ انتظر دقائق ثم اضغط متابعة السحب."
            : "Instagram asked to slow down and the pull stopped. What was pulled is saved; wait a few minutes, then continue."}
        </p>
      )}
      {pull.error && (
        <p role="alert" className="text-sm text-destructive">
          {pull.error}
        </p>
      )}
      {giveaway.fetch_done && !pull.running && (
        <p className="text-xs text-muted-foreground">
          {isAr
            ? "تم سحب كل التعليقات الرئيسية. الردود على التعليقات لا تُحسب."
            : "All top-level comments are pulled. Replies to comments are not counted."}
        </p>
      )}
    </section>
  );
}
