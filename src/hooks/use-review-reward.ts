import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { businessSettingsQueries } from "@/lib/data/business-settings";
import { loyaltyQueries } from "@/lib/data/loyalty";
import { promoCodesQueries } from "@/lib/data/promo-codes";
import {
  rewardChoices,
  reviewRewardPoints,
  reviewRewardUsable,
  type RewardPromo,
} from "@/lib/review-reward";

/**
 * The store's thank-you for a review, as the admin screens need it: the code it chose
 * (`chosen`), that code only while anyone can use it (`usable`, what the database gives), the
 * codes it may choose from, its currency, and the loyalty points instead of a code: whether the
 * store chose them (`pointsChosen`), what its programme gives for a review (`bonusPoints`, while
 * the programme is on) and what a review earns now (`points`, the database's rule).
 */
export function useReviewReward(brandId: string) {
  const settingsQ = useQuery(businessSettingsQueries.detail(brandId));
  const promosQ = useQuery(promoCodesQueries.list(brandId));
  const programQ = useQuery(loyaltyQueries.program(brandId));
  const settings = settingsQ.data;
  const program = programQ.data;
  const chosenId = settings?.review_reward_promo_id ?? null;
  const pointsChosen = settings?.review_reward_points === true;
  const promos = promosQ.data as RewardPromo[] | undefined;
  return useMemo(() => {
    const now = new Date();
    const list = promos ?? [];
    const chosen = pointsChosen ? null : (list.find((promo) => promo.id === chosenId) ?? null);
    const programOn = program?.is_enabled === true;
    const bonus = Number(program?.review_bonus_points ?? 0);
    return {
      chosenId,
      chosen,
      usable: reviewRewardUsable(chosen, now) ? chosen : null,
      choices: rewardChoices(list, now),
      pointsChosen,
      bonusPoints: programOn && bonus > 0 ? bonus : null,
      points: reviewRewardPoints(settings, program),
      currency: settings?.currency ?? "BHD",
      loading: settingsQ.isLoading || promosQ.isLoading || programQ.isLoading,
    };
  }, [
    chosenId,
    pointsChosen,
    promos,
    program,
    settings,
    settingsQ.isLoading,
    promosQ.isLoading,
    programQ.isLoading,
  ]);
}
