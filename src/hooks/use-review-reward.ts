import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { businessSettingsQueries } from "@/lib/data/business-settings";
import { promoCodesQueries } from "@/lib/data/promo-codes";
import { rewardChoices, reviewRewardUsable, type RewardPromo } from "@/lib/review-reward";

/**
 * The store's thank-you discount for a review, as the admin screens need it: the code it chose
 * (`chosen`), that code only while anyone can use it (`usable`, what the database gives), the
 * codes it may choose from, and its currency.
 */
export function useReviewReward(brandId: string) {
  const settingsQ = useQuery(businessSettingsQueries.detail(brandId));
  const promosQ = useQuery(promoCodesQueries.list(brandId));
  const chosenId = settingsQ.data?.review_reward_promo_id ?? null;
  const promos = promosQ.data as RewardPromo[] | undefined;
  return useMemo(() => {
    const now = new Date();
    const list = promos ?? [];
    const chosen = list.find((promo) => promo.id === chosenId) ?? null;
    return {
      chosenId,
      chosen,
      usable: reviewRewardUsable(chosen, now) ? chosen : null,
      choices: rewardChoices(list, now),
      currency: settingsQ.data?.currency ?? "BHD",
      loading: settingsQ.isLoading || promosQ.isLoading,
    };
  }, [chosenId, promos, settingsQ.data?.currency, settingsQ.isLoading, promosQ.isLoading]);
}
