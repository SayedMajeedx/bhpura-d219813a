import { ArrowLeft, ArrowRight, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGiveawayDetail } from "../hooks/use-giveaway-detail";
import { CommentsPullCard } from "./CommentsPullCard";
import { EntriesSummary } from "./EntriesSummary";
import { RulesForm } from "./RulesForm";
import { WinnersPanel } from "./WinnersPanel";

/** One giveaway: pull the comments, set the rules, draw, and check the winners. */
export function GiveawayDetailView({
  giveawayId,
  onBack,
}: {
  giveawayId: string;
  onBack: () => void;
}) {
  const detail = useGiveawayDetail(giveawayId);
  const { isAr, giveaway } = detail;
  const BackIcon = isAr ? ArrowRight : ArrowLeft;

  if (detail.loading) {
    return (
      <div className="flex h-48 items-center justify-center" role="status">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (detail.notFound || !giveaway) {
    return (
      <div className="space-y-3">
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          <BackIcon className="size-4" />
          {isAr ? "كل المسابقات" : "All giveaways"}
        </Button>
        <p className="text-sm text-muted-foreground">
          {isAr ? "لم نجد هذه المسابقة." : "We could not find this giveaway."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          <BackIcon className="size-4" />
          {isAr ? "كل المسابقات" : "All giveaways"}
        </Button>
      </div>

      <header className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
        <span className="size-16 shrink-0 overflow-hidden rounded-lg bg-muted">
          {giveaway.media_thumbnail_url && (
            <img src={giveaway.media_thumbnail_url} alt="" className="size-full object-cover" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-lg font-bold text-foreground">
            {giveaway.title}
          </h2>
          {giveaway.media_permalink && (
            <a
              href={giveaway.media_permalink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
            >
              {isAr ? "فتح البوست" : "Open the post"}
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          )}
        </div>
      </header>

      <CommentsPullCard detail={detail} />
      <RulesForm detail={detail} />
      <EntriesSummary detail={detail} />
      <WinnersPanel detail={detail} />
    </div>
  );
}
