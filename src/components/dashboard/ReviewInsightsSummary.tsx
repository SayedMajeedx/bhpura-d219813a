import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, MessageSquareHeart, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { calculateReviewMetrics, type OrderReviewAdminRow } from "@/lib/order-reviews";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function ReviewInsightsSummary({
  brandId,
  slug,
  isAr,
}: {
  brandId: string;
  slug: string;
  isAr: boolean;
}) {
  const reviewsQ = useQuery({
    queryKey: ["brand-order-reviews", brandId],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("list_brand_order_reviews", {
        p_brand_id: brandId,
      });
      if (error) throw error;
      return (data ?? []) as OrderReviewAdminRow[];
    },
    staleTime: 30_000,
  });

  const metrics = calculateReviewMetrics(reviewsQ.data ?? []);
  if (!metrics.total) return null;

  return (
    <Card className="rounded-md border-primary/20 shadow-sm">
      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-md bg-primary/10 text-primary">
            <MessageSquareHeart className="size-5" />
          </span>
          <div>
            <p className="text-xs font-semibold text-muted-foreground">
              {isAr ? "رضا العملاء" : "Customer satisfaction"}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1 text-xl font-bold" dir="ltr">
                {metrics.average.toFixed(1)}
                <Star className="size-5 fill-primary text-primary" />
              </span>
              <span className="text-sm text-muted-foreground">
                {isAr
                  ? `${metrics.total} تقييم • ${metrics.positiveRate.toFixed(0)}% رضا`
                  : `${metrics.total} reviews • ${metrics.positiveRate.toFixed(0)}% positive`}
              </span>
              {metrics.total < 5 && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                  {isAr ? "عينة محدودة" : "Small sample"}
                </span>
              )}
            </div>
          </div>
        </div>
        <Button asChild variant="outline" className="min-h-11 gap-2">
          <Link to="/admin/b/$slug/reviews" params={{ slug }}>
            {isAr ? "عرض كل التقييمات" : "View all reviews"}
            <ArrowUpRight className="size-4 rtl:-scale-x-100" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
