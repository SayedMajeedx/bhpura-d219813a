import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { ReactNode } from "react";
import { Check, Gift, Loader2, MessageCircle, Sparkles, Star } from "lucide-react";
import { publicSupabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { normalizePhoneForWhatsApp } from "@/lib/courier-whatsapp";

export const Route = createFileRoute("/review/$token")({ component: ReviewPage });

type PublicReview = {
  state: "ready" | "completed";
  brand_name: string;
  brand_logo_url: string | null;
  invoice_number: number;
  customer_name: string;
  brand_whatsapp_number: string | null;
  reward_code: string | null;
};

const choices = [
  ["quality", "جودة المنتج"],
  ["packaging", "التغليف"],
  ["speed", "سرعة التجهيز"],
  ["delivery", "التوصيل"],
  ["service", "التعامل والخدمة"],
] as const;

function ReviewPage() {
  const { token } = Route.useParams();
  const [rating, setRating] = useState(0);
  const [highlights, setHighlights] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [rewardCode, setRewardCode] = useState<string | null>(null);

  const reviewQ = useQuery({
    queryKey: ["public-order-review", token],
    retry: false,
    queryFn: async () => {
      const { data, error } = await (publicSupabase.rpc as any)("get_public_order_review", {
        p_token: token,
      });
      if (error) throw error;
      return ((data ?? [])[0] ?? null) as PublicReview | null;
    },
  });
  const review = reviewQ.data;
  const completed = Boolean(rewardCode || review?.state === "completed");
  const code = rewardCode || review?.reward_code || "THANKU10";

  const submit = async () => {
    if (!rating) return;
    setSubmitting(true);
    const { data, error } = await (publicSupabase.rpc as any)("submit_public_order_review", {
      p_token: token,
      p_rating: rating,
      p_highlights: highlights,
      p_comment: comment.trim() || null,
    });
    setSubmitting(false);
    if (!error) setRewardCode(String(data || "THANKU10"));
  };

  if (reviewQ.isLoading)
    return (
      <PageState>
        <Loader2 className="size-8 animate-spin text-primary" />
      </PageState>
    );
  if (!review || reviewQ.isError)
    return (
      <PageState>
        <p className="text-center text-muted-foreground">رابط التقييم غير متاح.</p>
      </PageState>
    );

  if (completed) {
    const rewardMessage = `هلا، أكملت تقييم طلبي السابق وحصلت على كود الخصم ${code}، وأرغب باستخدام خصم 10% على طلبي القادم 🤍`;
    const merchantPhone = normalizePhoneForWhatsApp(review.brand_whatsapp_number);
    return (
      <PageShell review={review}>
        <div className="space-y-6 text-center">
          <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
            <Check className="size-8" />
          </div>
          <div className="space-y-2">
            <h1 className="font-heading text-3xl font-bold">شكرًا لك، أسعدنا رأيك 🤍</h1>
            <p className="text-muted-foreground">كهدية منّا، حصلت على خصم 10% على طلبك القادم.</p>
          </div>
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
            <p className="mb-2 text-sm text-muted-foreground">كود الخصم</p>
            <p className="text-3xl font-black tracking-widest text-primary" dir="ltr">
              {code}
            </p>
          </div>
          <p className="text-sm leading-7 text-muted-foreground">
            قبل تأكيد طلبك القادم، أرسل لنا الكود عبر الواتساب وسنقوم بخصم 10% من قيمة الطلب.
          </p>
          <Button asChild className="min-h-12 w-full gap-2 text-base">
            <a
              href={`https://wa.me/${merchantPhone}?text=${encodeURIComponent(rewardMessage)}`}
              target="_blank"
              rel="noreferrer"
            >
              <MessageCircle className="size-5" />
              استخدام الخصم عبر الواتساب
            </a>
          </Button>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell review={review}>
      <div className="space-y-6">
        <div className="space-y-2 text-center">
          <div className="mx-auto flex w-fit items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
            <Sparkles className="size-3.5" />
            30 ثانية فقط • خصم 10%
          </div>
          <h1 className="font-heading text-3xl font-bold">كيف كانت تجربتك معنا؟</h1>
          <p className="text-sm text-muted-foreground">
            هلا {review.customer_name}، رأيك يساعدنا كثيرًا وينتظرك الخصم بعد الإرسال.
          </p>
        </div>
        <div className="space-y-3 text-center">
          <p className="text-sm font-semibold">تقييمك العام</p>
          <div className="flex justify-center gap-1" dir="ltr">
            {[1, 2, 3, 4, 5].map((value) => (
              <Button
                key={value}
                type="button"
                variant="ghost"
                size="icon"
                className="size-12"
                aria-label={`${value} نجوم`}
                onClick={() => setRating(value)}
              >
                <Star
                  className={cn(
                    "size-8",
                    value <= rating ? "fill-primary text-primary" : "text-muted-foreground/40",
                  )}
                />
              </Button>
            ))}
          </div>
        </div>
        {rating > 0 && (
          <div className="space-y-3">
            <p className="text-sm font-semibold">
              ما أكثر شيء أعجبك؟{" "}
              <span className="font-normal text-muted-foreground">(اختياري)</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {choices.map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  variant={highlights.includes(value) ? "default" : "outline"}
                  size="sm"
                  className="min-h-11"
                  onClick={() =>
                    setHighlights((current) =>
                      current.includes(value)
                        ? current.filter((item) => item !== value)
                        : [...current, value],
                    )
                  }
                >
                  {highlights.includes(value) && <Check className="size-4" />}
                  {label}
                </Button>
              ))}
            </div>
          </div>
        )}
        {rating > 0 && (
          <div className="space-y-2">
            <label htmlFor="review-comment" className="text-sm font-semibold">
              هل تحب تضيف شيئًا؟{" "}
              <span className="font-normal text-muted-foreground">(اختياري)</span>
            </label>
            <Textarea
              id="review-comment"
              maxLength={600}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="كلمة بسيطة تسعدنا وتساعدنا نتطور..."
              className="min-h-20 resize-none"
            />
          </div>
        )}
        <Button
          type="button"
          className="min-h-12 w-full gap-2 text-base"
          disabled={!rating || submitting}
          onClick={submit}
        >
          {submitting ? <Loader2 className="size-5 animate-spin" /> : <Gift className="size-5" />}
          إرسال التقييم واستلام الخصم
        </Button>
      </div>
    </PageShell>
  );
}

function PageShell({ review, children }: { review: PublicReview; children: ReactNode }) {
  return (
    <main dir="rtl" className="min-h-screen bg-muted/40 px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-lg space-y-4">
        {review.brand_logo_url ? (
          <div
            role="img"
            aria-label={review.brand_name}
            className="mx-auto h-14 w-40 bg-[#330a0a]"
            style={{
              WebkitMaskImage: `url("${review.brand_logo_url}")`,
              maskImage: `url("${review.brand_logo_url}")`,
              WebkitMaskPosition: "center",
              maskPosition: "center",
              WebkitMaskRepeat: "no-repeat",
              maskRepeat: "no-repeat",
              WebkitMaskSize: "contain",
              maskSize: "contain",
            }}
          />
        ) : (
          <p className="text-center font-heading text-xl font-bold">{review.brand_name}</p>
        )}
        <Card className="overflow-hidden rounded-xl border-border shadow-xl">
          <div className="h-1.5 bg-primary" />
          <CardContent className="p-6 sm:p-8">{children}</CardContent>
        </Card>
        <p className="text-center text-xs text-muted-foreground">
          طلب #{review.invoice_number} • {review.brand_name}
        </p>
      </div>
    </main>
  );
}

function PageState({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      {children}
    </main>
  );
}
