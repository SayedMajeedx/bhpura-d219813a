import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Gift,
  ImageDown,
  MessageSquareHeart,
  Search,
  Sparkles,
  Star,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/lib/brand-context";
import { useI18n } from "@/lib/i18n";
import {
  calculateReviewMetrics,
  REVIEW_HIGHLIGHT_LABELS,
  type OrderReviewAdminRow,
} from "@/lib/order-reviews";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { ReviewStoryDialog } from "@/components/reviews/ReviewStoryDialog";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/reviews")({
  component: CustomerReviewsPage,
});

function CustomerReviewsPage() {
  const { slug } = Route.useParams();
  const brand = useBrand();
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const [ratingFilter, setRatingFilter] = useState("all");
  const [period, setPeriod] = useState("all");
  const [storyReview, setStoryReview] = useState<OrderReviewAdminRow | null>(null);

  const brandStyleQ = useQuery({
    queryKey: ["review-story-brand", brand.id],
    queryFn: async () => {
      const { data, error } = await (supabase.from("business_settings") as any)
        .select("business_name")
        .eq("brand_id", brand.id)
        .maybeSingle();
      if (error) throw error;
      return data as { business_name?: string | null } | null;
    },
    staleTime: 5 * 60_000,
  });

  const reviewsQ = useQuery({
    queryKey: ["brand-order-reviews", brand.id],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("list_brand_order_reviews", {
        p_brand_id: brand.id,
      });
      if (error) throw error;
      return (data ?? []) as OrderReviewAdminRow[];
    },
    staleTime: 30_000,
  });

  const reviews = useMemo(() => reviewsQ.data ?? [], [reviewsQ.data]);
  const metrics = useMemo(() => calculateReviewMetrics(reviews), [reviews]);
  const filtered = useMemo(() => {
    const periodDays = period === "30" ? 30 : period === "90" ? 90 : null;
    const cutoff = periodDays ? Date.now() - periodDays * 86_400_000 : null;
    return reviews.filter((review) => {
      if (ratingFilter !== "all" && Number(review.rating) !== Number(ratingFilter)) return false;
      if (cutoff && new Date(review.reviewed_at).getTime() < cutoff) return false;
      if (!deferredSearch) return true;
      return (
        review.customer_name.toLowerCase().includes(deferredSearch) ||
        String(review.invoice_number).includes(deferredSearch) ||
        (review.comment ?? "").toLowerCase().includes(deferredSearch)
      );
    });
  }, [reviews, deferredSearch, ratingFilter, period]);

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-1 sm:p-2">
      <header className="rounded-md border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <MessageSquareHeart className="size-5" />
            </span>
            <div>
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <h1 className="font-heading text-2xl font-bold">
                  {isAr ? "تقييمات العملاء" : "Customer Reviews"}
                </h1>
                <Badge variant="secondary">{metrics.total}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {isAr
                  ? "تابع رضا العملاء، اكتشف نقاط القوة، وتعامل سريعًا مع التجارب التي تحتاج اهتمامًا."
                  : "Track satisfaction, understand strengths, and follow up on experiences needing attention."}
              </p>
            </div>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Star}
          label={isAr ? "متوسط التقييم" : "Average rating"}
          value={metrics.total ? `${metrics.average.toFixed(1)} / 5` : "—"}
          detail={isAr ? `${metrics.total} تقييم مكتمل` : `${metrics.total} completed reviews`}
        />
        <MetricCard
          icon={Sparkles}
          label={isAr ? "نسبة الرضا" : "Positive rate"}
          value={`${metrics.positiveRate.toFixed(0)}%`}
          detail={isAr ? "تقييمات 4 و5 نجوم" : "4 and 5-star reviews"}
        />
        <MetricCard
          icon={AlertTriangle}
          label={isAr ? "تحتاج متابعة" : "Needs follow-up"}
          value={String(metrics.lowCount)}
          detail={isAr ? "3 نجوم أو أقل" : "3 stars or below"}
          attention={metrics.lowCount > 0}
        />
        <MetricCard
          icon={Gift}
          label={isAr ? "مكافأة التقييم" : "Review reward"}
          value="THANKU10"
          detail={isAr ? "خصم 10% للطلب القادم" : "10% off the next order"}
        />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[320px_1fr]">
        <Card className="h-fit rounded-md shadow-sm">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-base">
              {isAr ? "توزيع التقييمات" : "Rating distribution"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-2">
            {metrics.distribution.map((item) => {
              const percentage = metrics.total ? (item.count / metrics.total) * 100 : 0;
              return (
                <div
                  key={item.rating}
                  className="grid grid-cols-[44px_1fr_28px] items-center gap-2 text-sm"
                >
                  <span className="flex items-center gap-1 font-semibold" dir="ltr">
                    {item.rating}
                    <Star className="size-3.5 fill-primary text-primary" />
                  </span>
                  <Progress value={percentage} className="h-2" />
                  <span className="text-end text-muted-foreground">{item.count}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <div className="space-y-3">
          <Card className="rounded-md shadow-sm">
            <CardContent className="grid gap-3 p-3 md:grid-cols-[1fr_180px_180px]">
              <div className="relative">
                <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={
                    isAr
                      ? "بحث بالعميل، الطلب أو التعليق..."
                      : "Search customer, order, or comment..."
                  }
                  className="min-h-11 ps-9"
                />
              </div>
              <Select value={ratingFilter} onValueChange={setRatingFilter}>
                <SelectTrigger className="min-h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{isAr ? "كل التقييمات" : "All ratings"}</SelectItem>
                  {[5, 4, 3, 2, 1].map((rating) => (
                    <SelectItem key={rating} value={String(rating)}>
                      {rating} {isAr ? "نجوم" : "stars"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="min-h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{isAr ? "كل الفترات" : "All time"}</SelectItem>
                  <SelectItem value="30">{isAr ? "آخر 30 يومًا" : "Last 30 days"}</SelectItem>
                  <SelectItem value="90">{isAr ? "آخر 90 يومًا" : "Last 90 days"}</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {reviewsQ.isLoading ? (
            <Card className="rounded-md p-8 text-center text-sm text-muted-foreground">
              {isAr ? "جاري تحميل التقييمات..." : "Loading reviews..."}
            </Card>
          ) : reviewsQ.isError ? (
            <Card className="rounded-md border-destructive/30 p-8 text-center text-sm text-destructive">
              {isAr
                ? "تعذر تحميل التقييمات. حاول تحديث الصفحة."
                : "Could not load reviews. Refresh and try again."}
            </Card>
          ) : filtered.length === 0 ? (
            <Card className="rounded-md p-10 text-center">
              <MessageSquareHeart className="mx-auto mb-3 size-10 text-muted-foreground/40" />
              <h2 className="font-semibold">
                {reviews.length
                  ? isAr
                    ? "لا توجد نتائج مطابقة"
                    : "No matching reviews"
                  : isAr
                    ? "لا توجد تقييمات مكتملة بعد"
                    : "No completed reviews yet"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {isAr
                  ? "ستظهر تقييمات العملاء هنا فور إكمال نموذج التقييم."
                  : "Customer feedback will appear here after a review form is submitted."}
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {filtered.map((review) => (
                <ReviewCard
                  key={review.review_id}
                  review={review}
                  slug={slug}
                  isAr={isAr}
                  onCreateStory={() => setStoryReview(review)}
                />
              ))}
            </div>
          )}
        </div>
      </section>
      <ReviewStoryDialog
        open={Boolean(storyReview)}
        onOpenChange={(open) => !open && setStoryReview(null)}
        review={storyReview}
        brandName={
          brandStyleQ.data?.business_name?.trim() ||
          (isAr ? brand.name_ar || brand.name_en : brand.name_en)
        }
        brandColor={
          brand.slug.toLowerCase() === "pura" ? "#330a0a" : brand.primary_color || "#330a0a"
        }
        logoUrl={brand.logo_url}
        isAr={isAr}
      />
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  attention = false,
}: {
  icon: typeof Star;
  label: string;
  value: string;
  detail: string;
  attention?: boolean;
}) {
  return (
    <Card className={cn("rounded-md shadow-sm", attention && "border-destructive/30")}>
      <CardContent className="flex items-center gap-3 p-4">
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary",
            attention && "bg-destructive/10 text-destructive",
          )}
        >
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="truncate text-xl font-bold">{value}</p>
          <p className="truncate text-xs text-muted-foreground">{detail}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ReviewCard({
  review,
  slug,
  isAr,
  onCreateStory,
}: {
  review: OrderReviewAdminRow;
  slug: string;
  isAr: boolean;
  onCreateStory: () => void;
}) {
  const low = Number(review.rating) <= 3;
  return (
    <Card className={cn("rounded-md shadow-sm", low && "border-destructive/30")}>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">{review.customer_name}</h3>
              <Badge variant="outline">#{review.invoice_number}</Badge>
              {low && (
                <Badge variant="destructive">{isAr ? "تحتاج متابعة" : "Needs follow-up"}</Badge>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {new Date(review.reviewed_at).toLocaleString(isAr ? "ar-BH-u-nu-latn" : "en-US", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
          </div>
          <div className="flex items-center gap-1" dir="ltr">
            {[1, 2, 3, 4, 5].map((value) => (
              <Star
                key={value}
                className={cn(
                  "size-5",
                  value <= Number(review.rating)
                    ? "fill-primary text-primary"
                    : "text-muted-foreground/25",
                )}
              />
            ))}
            <span className="ms-1 text-sm font-bold">{review.rating}.0</span>
          </div>
        </div>
        {review.highlights?.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {review.highlights.map((highlight) => (
              <Badge key={highlight} variant="secondary">
                {REVIEW_HIGHLIGHT_LABELS[highlight]?.[isAr ? "ar" : "en"] ?? highlight}
              </Badge>
            ))}
          </div>
        )}
        {review.comment && (
          <blockquote className="rounded-md border-s-4 border-primary bg-muted/50 p-3 text-sm leading-7">
            “{review.comment}”
          </blockquote>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Gift className="size-3.5" />
            {isAr ? `تم عرض كود ${review.reward_code}` : `${review.reward_code} reward shown`}
          </span>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="min-h-11 gap-2" onClick={onCreateStory}>
              <ImageDown className="size-4" />
              {isAr ? "إنشاء ستوري" : "Create story"}
            </Button>
            <Button asChild size="sm" variant="outline" className="min-h-11 gap-2">
              <Link to="/admin/b/$slug/orders/$id" params={{ slug, id: review.order_id }}>
                {isAr ? "فتح الطلب" : "Open order"}
                <ArrowUpRight className="size-4 rtl:-scale-x-100" />
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
