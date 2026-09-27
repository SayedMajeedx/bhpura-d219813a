type PromoAudienceFields = {
  first_time_customers_only: boolean;
  returning_customers_only: boolean;
};

/**
 * Turns a promo code's "first-time customers only" or "returning customers
 * only" restriction on or off. The two exclude each other (the database
 * refuses both), so turning one on turns the other off.
 */
export function setPromoAudience<F extends PromoAudienceFields>(
  form: F,
  audience: "first_time" | "returning",
  enabled: boolean,
): F {
  return audience === "first_time"
    ? {
        ...form,
        first_time_customers_only: enabled,
        returning_customers_only: enabled ? false : form.returning_customers_only,
      }
    : {
        ...form,
        returning_customers_only: enabled,
        first_time_customers_only: enabled ? false : form.first_time_customers_only,
      };
}
