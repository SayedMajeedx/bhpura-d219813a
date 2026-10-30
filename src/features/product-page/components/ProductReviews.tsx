import { useId, useState } from "react";
import { BadgeCheck, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ProductReviews as Reviews } from "@/lib/data/reviews";
import { countOf } from "@/lib/arabic-count";
import {
  FIRST_REVIEWS,
  averageLabel,
  reviewCountLine,
  reviewDate,
  reviewerName,
  starShares,
  topPraise,
} from "@/features/product-page/lib/product-reviews";

function Stars({ rating, size = "size-4" }: { rating: number; size?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" dir="ltr" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((value) => (
        <Star
          key={value}
          className={cn(
            size,
            value <= Math.round(rating) ? "fill-current text-primary" : "text-border-strong",
          )}
        />
      ))}
    </span>
  );
}

/** Where the reviews start on the product page, for the stars beside the price to point at. */
export const REVIEWS_ANCHOR = "reviews";

/**
 * The stars beside the product's price: the average, the stars and how many reviews, a link to
 * the reviews further down. They once sat only at the foot of the page, where a shopper deciding
 * at the price never saw them. Nothing for a product without reviews.
 */
export function ReviewsSummaryLink({
  reviews,
  lang,
}: {
  reviews: Reviews | null | undefined;
  lang: "ar" | "en";
}) {
  if (!reviews || !(Number(reviews.count) > 0)) return null;
  const average = averageLabel(reviews.average);
  const count = countOf(Number(reviews.count), "review", lang);
  return (
    <a
      href={`#${REVIEWS_ANCHOR}`}
      className="mb-2 inline-flex min-h-11 items-center gap-2 text-sm sm:mb-3"
      aria-label={
        lang === "ar" ? `التقييم ${average} من 5، ${count}` : `Rated ${average} of 5, ${count}`
      }
    >
      <Stars rating={Number(reviews.average)} size="size-3.5" />
      <span className="font-semibold" dir="ltr">
        {average}
      </span>
      <span className="text-muted-foreground underline-offset-4 hover:underline">({count})</span>
    </a>
  );
}

/**
 * The reviews of a product, under its page: the average and how many, the share of each star,
 * what customers praise most, and the reviews the customers let the store show, each with a first
 * name and marked as a confirmed purchase (every review comes from an order).
 */
export function ProductReviews({ reviews, lang }: { reviews: Reviews; lang: "ar" | "en" }) {
  const [all, setAll] = useState(false);
  const headingId = useId();
  const ar = lang === "ar";
  const praise = topPraise(reviews.highlights, lang);
  const cards = all ? reviews.reviews : reviews.reviews.slice(0, FIRST_REVIEWS);
  const average = averageLabel(reviews.average);

  return (
    <section
      id={REVIEWS_ANCHOR}
      aria-labelledby={headingId}
      className="mt-10 scroll-mt-6 border-t pt-8 sm:mt-14 sm:pt-10"
      dir={ar ? "rtl" : "ltr"}
    >
      <h2 id={headingId} className="mb-5 font-display text-xl sm:text-2xl">
        {ar ? "آراء العملاء" : "Customer reviews"}
      </h2>

      <div className="grid gap-8 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="flex items-end gap-3">
            <span
              className="font-display text-5xl leading-none"
              style={{ color: "var(--sf-heading)" }}
              dir="ltr"
            >
              {average}
            </span>
            <div className="space-y-1 pb-1">
              <Stars rating={Number(reviews.average)} />
              <p className="text-xs text-muted-foreground">
                {reviewCountLine(reviews.count, lang)}
              </p>
            </div>
          </div>
          <p className="sr-only">{ar ? `التقييم ${average} من 5` : `Rated ${average} out of 5`}</p>

          <ul className="space-y-1.5">
            {starShares(reviews.stars, reviews.count).map((level) => (
              <li key={level.stars} className="flex items-center gap-2 text-xs">
                <span className="w-3 tabular-nums text-muted-foreground" dir="ltr">
                  {level.stars}
                </span>
                <Star className="size-3 fill-current text-primary" aria-hidden="true" />
                <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-primary"
                    style={{ inlineSize: `${Math.round(level.share * 100)}%` }}
                  />
                </span>
                <span className="w-5 text-end tabular-nums text-muted-foreground">
                  {level.count}
                </span>
              </li>
            ))}
          </ul>

          {praise.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-foreground">
                {ar ? "أكثر ما أعجبهم" : "What they liked most"}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {praise.map((item) => (
                  <span
                    key={item.key}
                    className="rounded-full border border-border px-2.5 py-1 text-xs text-foreground"
                  >
                    {item.label}
                    <span className="ms-1.5 tabular-nums text-muted-foreground">{item.count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {cards.length > 0 ? (
          <div className="min-w-0 space-y-3">
            <ul className="divide-y divide-border">
              {cards.map((review) => (
                <li key={review.id} className="space-y-2 py-4 first:pt-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Stars rating={review.rating} size="size-3.5" />
                    <span className="text-sm font-semibold text-foreground" dir="auto">
                      {reviewerName(review.name, lang)}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <BadgeCheck className="size-3.5 text-primary" aria-hidden="true" />
                      {ar ? "شراء مؤكد" : "Confirmed purchase"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {reviewDate(review.date, lang)}
                    </span>
                  </div>
                  <p className="sr-only">
                    {ar ? `${review.rating} من 5 نجوم` : `${review.rating} out of 5 stars`}
                  </p>
                  {review.comment && (
                    <p className="break-words text-sm leading-7 text-foreground" dir="auto">
                      {review.comment}
                    </p>
                  )}
                </li>
              ))}
            </ul>
            {reviews.reviews.length > FIRST_REVIEWS && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAll((open) => !open)}
                aria-expanded={all}
              >
                {all
                  ? ar
                    ? "عرض أقل"
                    : "Show fewer"
                  : ar
                    ? `عرض كل الآراء (${reviews.reviews.length})`
                    : `Show all reviews (${reviews.reviews.length})`}
              </Button>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {ar ? "لا توجد تعليقات معروضة بعد." : "No written reviews to show yet."}
          </p>
        )}
      </div>
    </section>
  );
}
