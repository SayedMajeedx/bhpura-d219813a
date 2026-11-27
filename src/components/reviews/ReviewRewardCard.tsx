import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Gift } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useReviewReward } from "@/hooks/use-review-reward";
import { invalidateBusinessSettings, saveReviewReward } from "@/lib/data/business-settings";
import { pointsOffer, rewardOffer } from "@/lib/review-reward";

/** "No discount" and "Loyalty points" in the picker (a Select item needs a value). */
const NONE = "none";
const POINTS = "points";

/**
 * The store's thank-you for a review, on the Reviews page: which of its promo codes a customer
 * gets after reviewing, its loyalty points instead, or nothing. Only codes anyone can use are
 * offered (a cart's one-use code is not), and a chosen code that has ended or been switched off is
 * said to give nothing, as the database then gives nothing; so are points while the programme is
 * off or gives none for a review. A member who may not change settings sees it without the picker.
 */
export function ReviewRewardCard({
  brandId,
  isAr,
  canEdit,
}: {
  brandId: string;
  isAr: boolean;
  canEdit: boolean;
}) {
  const reward = useReviewReward(brandId);
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const lang = isAr ? "ar" : "en";
  const offer = rewardOffer(reward.usable, lang, reward.currency);

  const points = reward.points ? pointsOffer(reward.points, lang) : null;
  const detail = reward.pointsChosen
    ? points
      ? isAr
        ? `${points} تُضاف إلى رصيد العميل بعد التقييم`
        : `${points} added to the customer's balance after a review`
      : isAr
        ? "برنامج الولاء متوقف أو لا يعطي نقاطًا للتقييم، فلا تُعطى نقاط"
        : "The loyalty programme is off or gives no points for a review, so none are given"
    : reward.usable
      ? isAr
        ? `${offer} على الطلب القادم`
        : `${offer} the next order`
      : reward.chosen
        ? isAr
          ? `الكود ${reward.chosen.code} لم يعد صالحاً، فلا يُعطى خصم`
          : `${reward.chosen.code} can no longer be used, so no discount is given`
        : isAr
          ? "لا يُعطى خصم بعد التقييم"
          : "No discount is given after a review";

  const choose = async (value: string) => {
    setSaving(true);
    try {
      await saveReviewReward(
        brandId,
        value === NONE || value === POINTS ? null : value,
        value === POINTS,
      );
      await invalidateBusinessSettings(queryClient, brandId);
      toast.success(isAr ? "تم حفظ مكافأة الشكر" : "Thank-you saved");
    } catch {
      toast.error(isAr ? "تعذّر الحفظ، حاول مرة أخرى" : "Could not save, try again");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="rounded-md shadow-sm">
      <CardContent className="flex items-start gap-3 p-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Gift className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className="text-xs text-muted-foreground">
              {isAr ? "مكافأة الشكر على التقييم" : "Thank-you for a review"}
            </p>
            {!canEdit && (
              <p className="truncate text-xl font-bold" dir={points ? undefined : "ltr"}>
                {reward.pointsChosen ? (points ?? "—") : (reward.usable?.code ?? "—")}
              </p>
            )}
            <p className="text-xs text-muted-foreground">{detail}</p>
          </div>
          {canEdit && (
            <Select
              value={reward.pointsChosen ? POINTS : reward.usable ? reward.usable.id : NONE}
              onValueChange={choose}
              disabled={saving || reward.loading}
            >
              <SelectTrigger
                className="h-9 rounded-md text-xs"
                aria-label={isAr ? "مكافأة الشكر على التقييم" : "Thank-you for a review"}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{isAr ? "بدون مكافأة" : "Nothing"}</SelectItem>
                <SelectItem value={POINTS} disabled={!reward.bonusPoints && !reward.pointsChosen}>
                  {reward.bonusPoints
                    ? `${isAr ? "نقاط الولاء" : "Loyalty points"} · ${pointsOffer(reward.bonusPoints, lang)}`
                    : isAr
                      ? "نقاط الولاء (فعّل برنامج الولاء أولًا)"
                      : "Loyalty points (turn the loyalty programme on first)"}
                </SelectItem>
                {reward.choices.map((promo) => (
                  <SelectItem key={promo.id} value={promo.id}>
                    {promo.code} · {rewardOffer(promo, lang, reward.currency)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
