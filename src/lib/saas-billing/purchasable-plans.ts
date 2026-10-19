/**
 * The plans a store can buy today: switched on and public in the super admin's plans, with a
 * price. The free trial and private plans (the lifetime founder's) are never offered. The
 * subscription screen and the expired-trial screen both read this; the expired screen once
 * showed three plans written by hand, two of them withdrawn, at old prices.
 */
type PlanVersion = {
  is_current?: boolean | null;
  price_monthly?: number | string | null;
  price_annual?: number | string | null;
};
type Plan = {
  is_active?: boolean | null;
  is_public?: boolean | null;
  versions?: PlanVersion[] | null;
};

const currentVersion = (plan: Plan) =>
  plan.versions?.find((version) => version.is_current) ?? plan.versions?.[0] ?? null;

export function purchasablePlans<T extends Plan>(plans: readonly T[]): T[] {
  return plans.filter((plan) => {
    const version = currentVersion(plan);
    const priced =
      Number(version?.price_monthly ?? 0) > 0 || Number(version?.price_annual ?? 0) > 0;
    return plan.is_active === true && plan.is_public !== false && priced;
  });
}
