import { useMemo } from "react";
import { Download, RotateCcw, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { useI18n } from "@/lib/i18n";
import type { PostKit } from "../hooks/use-post-kit";
import {
  bracketPost,
  cupChampion,
  cupMatches,
  cupSize,
  emptyCup,
  matchPost,
  roundName,
  startCup,
  withWinner,
  type CupMatch,
} from "../lib/cup";
import { savePost } from "./PostKitPage";
import { PostPicture } from "./PostPicture";

/** The knockout between the store's pieces: its bracket, and each day's matches as Story frames. */
export function CupTab({ kit }: { kit: PostKit }) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const { cup, saveCup, photos } = kit;
  const nameOf = (key: string) => photos[key]?.label ?? key;
  const pieces = useMemo(
    () =>
      Object.entries(photos)
        .filter(([, photo]) => !photo.upload)
        .map(([key]) => key),
    [photos],
  );
  const matches = useMemo(() => cupMatches(cup), [cup]);
  const champion = cupChampion(cup);

  if (cup.entrants.length === 0) {
    const size = cupSize(pieces.length);
    return (
      <Card className="max-w-xl space-y-3 p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Trophy className="size-4" aria-hidden />
          {isAr ? "كأس شمّوعة" : "Shammoua's Cup"}
        </h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {isAr
            ? "تصويت في الاستوري بين قطعكم: مباراتين كل يوم، والنهائي في يومه، وقطعة وحدة تفوز."
            : "A Story vote between your pieces: two matches a day, the final on its own, and one winner."}
        </p>
        {size ? (
          <Button type="button" onClick={() => saveCup(startCup(pieces))}>
            {isAr ? `ابدأ الكأس بين ${size} قطعة` : `Start the cup with ${size} pieces`}
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">
            {isAr
              ? "الكأس يحتاج 4 قطع معروضة على الأقل."
              : "The cup needs at least 4 pieces on sale."}
          </p>
        )}
      </Card>
    );
  }

  const row = (match: CupMatch) => {
    const ready = Boolean(match.a && match.b);
    const post = ready ? matchPost(match, nameOf) : null;
    return (
      <Card key={match.id} className="flex min-w-0 flex-col gap-2 p-3">
        <p className="text-xs font-medium text-muted-foreground">
          {isAr ? `اليوم ${match.day}` : `Day ${match.day}`} ·{" "}
          {roundName(match.round, cup.entrants.length)}
        </p>
        {post ? (
          <>
            <PostPicture post={post} kit={kit} label={post.title} />
            <p className="text-xs font-medium text-foreground">{isAr ? "مين فازت؟" : "Who won?"}</p>
            <div className="flex flex-wrap gap-2">
              {[match.a as string, match.b as string].map((key) => (
                <Button
                  key={key}
                  type="button"
                  size="sm"
                  variant={match.winner === key ? "default" : "outline"}
                  aria-pressed={match.winner === key}
                  onClick={() => saveCup(withWinner(cup, match.id, key))}
                >
                  {nameOf(key)}
                </Button>
              ))}
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-auto"
              onClick={() => void savePost(post, kit, isAr)}
            >
              <Download className="size-4" />
              {isAr ? "حمّل الستوري" : "Save the Story"}
            </Button>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            {isAr ? "تنتظر نتيجة المباريات قبلها." : "Waits for the matches before it."}
          </p>
        )}
      </Card>
    );
  };

  const bracket = bracketPost(cup, nameOf);
  return (
    <div className="space-y-4">
      <div className="grid items-start gap-4 md:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
        <Card className="flex min-w-0 flex-col gap-2 p-3">
          <PostPicture post={bracket} kit={kit} label={isAr ? "شجرة الكأس" : "The cup's bracket"} />
          <Button type="button" size="sm" onClick={() => void savePost(bracket, kit, isAr)}>
            <Download className="size-4" />
            {isAr ? "حمّل الشجرة" : "Save the bracket"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={async () => {
              const sure = await confirmDialog({
                title: isAr ? "نبدأ الكأس من جديد؟" : "Start the cup again?",
                destructive: true,
              });
              if (sure) saveCup(emptyCup());
            }}
          >
            <RotateCcw className="size-4" />
            {isAr ? "ابدأ من جديد" : "Start again"}
          </Button>
        </Card>
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">
            {champion
              ? isAr
                ? `فازت: ${nameOf(champion)}`
                : `Winner: ${nameOf(champion)}`
              : isAr
                ? "حمّلوا مباريات اليوم، وحطوا ستيكر التصويت تحت الصورتين، وبعد 24 ساعة اختاروا الفايزة."
                : "Save today's matches, add Instagram's poll sticker under the photos, and pick the winner after 24 hours."}
          </p>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,200px),1fr))] gap-3">
            {matches.map(row)}
          </div>
        </div>
      </div>
    </div>
  );
}
