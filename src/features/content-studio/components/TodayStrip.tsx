import { ArrowLeft, ArrowRight, CalendarClock } from "lucide-react";
import type { ContentStudio } from "@/features/content-studio/hooks/use-content-studio";

/**
 * What is worth posting today, from the store's own state (`todayPosts`): one tap opens the
 * template on the piece it names. Nothing shows when there is nothing to suggest.
 */
export function TodayStrip({ studio }: { studio: ContentStudio }) {
  const { isAr, today, pickTodayPost, templateId, selected } = studio;
  if (today.length === 0) return null;
  const Arrow = isAr ? ArrowLeft : ArrowRight;
  return (
    <section aria-labelledby="studio-today" className="space-y-2">
      <h2 id="studio-today" className="flex items-center gap-1.5 text-xs font-bold text-foreground">
        <CalendarClock className="size-3.5 text-primary" aria-hidden="true" />
        {isAr ? "منشور اليوم" : "Today's post"}
      </h2>
      <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
        {today.map((post) => {
          const chosen = templateId === post.templateId && selected?.id === post.productId;
          return (
            <button
              key={post.key}
              type="button"
              onClick={() => pickTodayPost(post)}
              aria-pressed={chosen}
              className={`flex min-w-[220px] max-w-[280px] shrink-0 snap-start items-center justify-between gap-3 rounded-xl border p-3 text-start transition-colors cursor-pointer ${
                chosen
                  ? "border-primary bg-primary/[0.06]"
                  : "border-border bg-card hover:border-primary/40"
              }`}
            >
              <span className="min-w-0">
                <span className="block text-xs text-muted-foreground line-clamp-2 break-words">
                  {post.reason}
                </span>
                <span className="mt-0.5 block text-sm font-semibold text-foreground">
                  {post.action}
                </span>
              </span>
              <Arrow className="size-4 shrink-0 text-primary" aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </section>
  );
}
