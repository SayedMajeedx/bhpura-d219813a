-- Loyalty bonuses that were settings with nothing behind them (improvement 2 of the final report,
-- 2026-11-27, first part): `brand_loyalty_programs.welcome_bonus_points` and `review_bonus_points`
-- were saved and read by nothing, so the loyalty page hid them. Now:
--   - **Welcome points**: a shopper whose account is linked to the store's customer record for the
--     first time gets the store's welcome points, once per account and store, at once (there is no
--     order to undo). Customers linked before this migration are not given them.
--   - **Review points**: the store chooses its thank-you for a review on the Reviews page: one of
--     its promo codes (as before), or its loyalty points (`business_settings.review_reward_points`),
--     never both. Points go to the order's customer while the order counts as earned, held like
--     the order's own points, recorded on the review (`order_reviews.reward_points`), and taken
--     back with the order's points when the order is cancelled or refunded.
-- Every grant goes through `loyalty_grant_bonus`, keyed so it is written once, and never stops the
-- write that caused it (a customer saved, a review sent).

-- 1. Where the choice and the grant are kept --------------------------------------------------
ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS review_reward_points boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.business_settings.review_reward_points IS
  'A review earns the store''s loyalty review points instead of its thank-you promo code.';

ALTER TABLE public.order_reviews
  ADD COLUMN IF NOT EXISTS reward_points integer;
COMMENT ON COLUMN public.order_reviews.reward_points IS
  'The loyalty points this review earned (none: it earned a code or nothing).';

-- 2. One way to give a bonus -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.loyalty_grant_bonus(
  p_brand_id uuid,
  p_customer_id uuid,
  p_event text,
  p_points integer,
  p_idempotency_key text,
  p_note_ar text,
  p_note_en text,
  p_hold boolean DEFAULT false,
  p_order_id uuid DEFAULT NULL,
  p_review_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_program public.brand_loyalty_programs%ROWTYPE;
  v_account public.loyalty_accounts%ROWTYPE;
  v_hold_days integer := 0;
  v_effective timestamptz;
  v_expires timestamptz;
  v_balance integer;
BEGIN
  IF p_customer_id IS NULL OR COALESCE(p_points, 0) <= 0 THEN
    RETURN 0;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.loyalty_ledger
     WHERE brand_id = p_brand_id AND idempotency_key = p_idempotency_key
  ) THEN
    RETURN 0;
  END IF;

  SELECT * INTO v_program FROM public.brand_loyalty_programs WHERE brand_id = p_brand_id;
  IF NOT FOUND OR v_program.is_enabled IS NOT TRUE THEN
    RETURN 0;
  END IF;

  INSERT INTO public.loyalty_accounts (brand_id, customer_id, current_tier_key)
  VALUES (p_brand_id, p_customer_id, 'bronze')
  ON CONFLICT (brand_id, customer_id) DO NOTHING;
  SELECT * INTO v_account FROM public.loyalty_accounts
   WHERE brand_id = p_brand_id AND customer_id = p_customer_id
   FOR UPDATE;

  IF p_hold THEN
    v_hold_days := GREATEST(COALESCE(v_program.holding_period_days, 14), 0);
  END IF;
  v_effective := now() + make_interval(days => v_hold_days);
  IF COALESCE(v_program.points_expiry_days, 0) > 0 THEN
    v_expires := v_effective + make_interval(days => v_program.points_expiry_days);
  END IF;

  IF v_hold_days > 0 THEN
    UPDATE public.loyalty_accounts
       SET pending_points = pending_points + p_points,
           lifetime_points = lifetime_points + p_points,
           updated_at = now()
     WHERE id = v_account.id
    RETURNING active_points INTO v_balance;
  ELSE
    UPDATE public.loyalty_accounts
       SET active_points = active_points + p_points,
           lifetime_points = lifetime_points + p_points,
           updated_at = now()
     WHERE id = v_account.id
    RETURNING active_points INTO v_balance;
  END IF;

  INSERT INTO public.loyalty_ledger (
    brand_id, customer_id, account_id, event_type, points, points_status, order_id, review_id,
    effective_at, expires_at, idempotency_key, reference_note_ar, reference_note_en, balance_after
  ) VALUES (
    p_brand_id, p_customer_id, v_account.id, p_event, p_points,
    CASE WHEN v_hold_days > 0 THEN 'pending' ELSE 'active' END,
    p_order_id, p_review_id, v_effective, v_expires, p_idempotency_key, p_note_ar, p_note_en,
    v_balance
  );

  PERFORM public.rpc_evaluate_customer_loyalty_tier(p_brand_id, p_customer_id);
  RETURN p_points;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.loyalty_grant_bonus(uuid, uuid, text, integer, text, text, text, boolean, uuid, uuid)
  FROM PUBLIC, anon, authenticated;

-- 3. Welcome points, when a shopper's account is first linked ---------------------------------
CREATE OR REPLACE FUNCTION public.customers_loyalty_welcome()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_points integer;
BEGIN
  IF NEW.auth_user_id IS NULL OR NEW.brand_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.auth_user_id IS NOT DISTINCT FROM NEW.auth_user_id THEN
    RETURN NEW;
  END IF;

  SELECT lp.welcome_bonus_points INTO v_points
    FROM public.brand_loyalty_programs lp
   WHERE lp.brand_id = NEW.brand_id AND lp.is_enabled IS TRUE;
  IF COALESCE(v_points, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM public.loyalty_grant_bonus(
      NEW.brand_id, NEW.id, 'earn_welcome', v_points,
      'welcome:' || NEW.auth_user_id::text,
      'نقاط ترحيب بانضمامك', 'Welcome points for joining');
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'loyalty welcome points not given to customer %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.customers_loyalty_welcome() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_customers_loyalty_welcome ON public.customers;
CREATE TRIGGER trg_customers_loyalty_welcome
  AFTER INSERT OR UPDATE OF auth_user_id ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.customers_loyalty_welcome();

-- 4. The review's thank-you: a code or points, never both ------------------------------------
CREATE OR REPLACE FUNCTION public.store_review_reward(p_brand_id uuid)
RETURNS TABLE(code text, discount_type text, discount_value numeric)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT pc.code, pc.discount_type, pc.discount_value
    FROM public.business_settings bs
    JOIN public.promo_codes pc
      ON pc.id = bs.review_reward_promo_id AND pc.brand_id = bs.brand_id
   WHERE bs.brand_id = p_brand_id
     AND NOT bs.review_reward_points
     AND pc.is_active
     AND (pc.start_date IS NULL OR pc.start_date <= now())
     AND (pc.end_date IS NULL OR pc.end_date > now())
     AND (pc.max_redemptions IS NULL OR pc.max_redemptions > 1)
   LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.store_review_reward(uuid) FROM PUBLIC, anon, authenticated;

-- The points a review earns now: the programme's review points while the store chose points and
-- its programme is on; none otherwise.
CREATE OR REPLACE FUNCTION public.store_review_points(p_brand_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT lp.review_bonus_points
    FROM public.business_settings bs
    JOIN public.brand_loyalty_programs lp ON lp.brand_id = bs.brand_id
   WHERE bs.brand_id = p_brand_id
     AND bs.review_reward_points
     AND lp.is_enabled IS TRUE
     AND lp.review_bonus_points > 0
   LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.store_review_points(uuid) FROM PUBLIC, anon, authenticated;

-- The live function (migration 20261022110000) with the points given after the review is saved.
CREATE OR REPLACE FUNCTION public.submit_public_order_review(
  p_token uuid,
  p_rating integer,
  p_highlights text[] DEFAULT '{}'::text[],
  p_comment text DEFAULT NULL::text,
  p_show_on_store boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.order_review_requests%ROWTYPE;
  v_allowed text[] := ARRAY['quality','packaging','speed','delivery','service'];
  v_reward text;
  v_review_id uuid;
  v_points integer;
  v_order public.orders%ROWTYPE;
  v_granted integer;
BEGIN
  IF p_rating NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'INVALID_RATING'; END IF;
  IF char_length(COALESCE(p_comment, '')) > 600 THEN RAISE EXCEPTION 'COMMENT_TOO_LONG'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(COALESCE(p_highlights, '{}')) h WHERE NOT h = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'INVALID_HIGHLIGHT';
  END IF;

  SELECT * INTO v_request FROM public.order_review_requests
  WHERE public_token = p_token AND eligible_at <= now() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REVIEW_NOT_FOUND'; END IF;

  SELECT r.code INTO v_reward FROM public.store_review_reward(v_request.brand_id) r;

  INSERT INTO public.order_reviews (request_id, brand_id, order_id, rating, highlights, comment, show_on_store, reward_code)
  VALUES (v_request.id, v_request.brand_id, v_request.order_id, p_rating,
    COALESCE(p_highlights, '{}'), NULLIF(trim(p_comment), ''), COALESCE(p_show_on_store, false), v_reward)
  ON CONFLICT (request_id) DO NOTHING
  RETURNING id INTO v_review_id;

  -- A first review earns the store's points, when it chose points and the order still earns.
  IF v_review_id IS NOT NULL THEN
    v_points := public.store_review_points(v_request.brand_id);
    IF COALESCE(v_points, 0) > 0 THEN
      SELECT * INTO v_order FROM public.orders WHERE id = v_request.order_id;
      IF FOUND AND public.loyalty_order_earns(v_order.status, v_order.payment_status, v_order.customer_id) THEN
        BEGIN
          v_granted := public.loyalty_grant_bonus(
            v_request.brand_id, v_order.customer_id, 'earn_review', v_points,
            'review:' || v_review_id::text,
            'نقاط شكر على تقييمك', 'Thank-you points for your review',
            true, v_order.id, v_review_id);
          IF v_granted > 0 THEN
            UPDATE public.order_reviews SET reward_points = v_granted WHERE id = v_review_id;
          END IF;
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'loyalty review points not given for review %: %', v_review_id, SQLERRM;
        END;
      END IF;
    END IF;
  END IF;

  UPDATE public.order_review_requests SET status = 'completed', completed_at = COALESCE(completed_at, now()), updated_at = now()
  WHERE id = v_request.id;

  -- A second submission of the same link answers with the code the review was given.
  SELECT rv.reward_code INTO v_reward FROM public.order_reviews rv WHERE rv.request_id = v_request.id;
  RETURN v_reward;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_public_order_review(uuid, integer, text[], text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_public_order_review(uuid, integer, text[], text, boolean)
  TO anon, authenticated, service_role;

-- The review page reads the points too: offered before the review, given after it. A column is
-- added to what it returns, so the function is made again with its rights.
DROP FUNCTION IF EXISTS public.get_public_order_review(uuid);
CREATE FUNCTION public.get_public_order_review(p_token uuid)
RETURNS TABLE(
  state text, brand_name text, brand_logo_url text, invoice_number integer, customer_name text,
  brand_whatsapp_number text, reward_code text, reward_discount_type text,
  reward_discount_value numeric, currency text, order_number_prefix text,
  order_number_digits smallint, reward_points integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE WHEN r.status = 'completed' THEN 'completed' ELSE 'ready' END,
    COALESCE(NULLIF(bs.business_name, ''), b.name_ar, b.name_en, b.slug),
    COALESCE(bs.logo_url, b.logo_url),
    o.invoice_number,
    COALESCE(NULLIF(split_part(o.customer_name_snapshot, ' ', 1), ''), 'عميلنا'),
    bs.whatsapp_number,
    CASE WHEN r.status = 'completed' THEN rv.reward_code ELSE NULL END,
    CASE WHEN r.status = 'completed' THEN given.discount_type ELSE offer.discount_type END,
    CASE WHEN r.status = 'completed' THEN given.discount_value ELSE offer.discount_value END,
    COALESCE(NULLIF(bs.currency, ''), 'BHD'),
    bs.order_number_prefix,
    bs.order_number_digits,
    CASE
      WHEN r.status = 'completed' THEN rv.reward_points
      WHEN o.customer_id IS NOT NULL THEN public.store_review_points(r.brand_id)
      ELSE NULL
    END
  FROM public.order_review_requests r
  JOIN public.orders o ON o.id = r.order_id
  JOIN public.brands b ON b.id = r.brand_id AND b.is_active = true
  LEFT JOIN public.business_settings bs ON bs.brand_id = r.brand_id
  LEFT JOIN public.order_reviews rv ON rv.request_id = r.id
  LEFT JOIN LATERAL public.store_review_reward(r.brand_id) offer ON true
  LEFT JOIN LATERAL (
    SELECT pc.discount_type, pc.discount_value
      FROM public.promo_codes pc
     WHERE pc.brand_id = r.brand_id AND upper(pc.code) = upper(rv.reward_code)
     LIMIT 1
  ) given ON true
  WHERE r.public_token = p_token AND r.eligible_at <= now();
$$;

REVOKE EXECUTE ON FUNCTION public.get_public_order_review(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_order_review(uuid) TO anon, authenticated, service_role;

-- 5. A cancelled or refunded order takes back its review's points with its own ----------------
-- The live function (migration 20261014110000) with `earn_review` among the order's earnings.
CREATE OR REPLACE FUNCTION public.loyalty_revoke_order_points(p_order_id uuid, p_idempotency_key text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_account loyalty_accounts%ROWTYPE;
  v_remaining integer;
  v_held integer;
  v_from_pending integer;
  v_from_active integer;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND OR v_order.customer_id IS NULL THEN
    RETURN 0;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.loyalty_ledger
    WHERE brand_id = v_order.brand_id AND idempotency_key = p_idempotency_key
  ) THEN
    RETURN 0;
  END IF;

  SELECT * INTO v_account FROM public.loyalty_accounts
  WHERE brand_id = v_order.brand_id AND customer_id = v_order.customer_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- What the order earned, less what was already taken back (by this engine or a return).
  SELECT GREATEST(0, COALESCE(SUM(points), 0))::integer INTO v_remaining
  FROM public.loyalty_ledger
  WHERE brand_id = v_order.brand_id AND order_id = p_order_id
    AND event_type IN ('earn_order', 'earn_first_order', 'earn_review', 'revoke_cancelled');
  IF v_remaining = 0 THEN
    RETURN 0;
  END IF;

  -- Held first: what this order's earnings still hold in the pending balance.
  SELECT COALESCE(SUM(points), 0)::integer INTO v_held
  FROM public.loyalty_ledger
  WHERE brand_id = v_order.brand_id AND order_id = p_order_id
    AND event_type IN ('earn_order', 'earn_first_order', 'earn_review') AND points_status = 'pending';

  v_from_pending := LEAST(v_remaining, v_held, v_account.pending_points);
  v_from_active := LEAST(v_remaining - v_from_pending, v_account.active_points);

  UPDATE public.loyalty_accounts
  SET pending_points = pending_points - v_from_pending,
      active_points = active_points - v_from_active,
      lifetime_points = GREATEST(0, lifetime_points - (v_from_pending + v_from_active)),
      updated_at = now()
  WHERE id = v_account.id;

  -- The order's earnings are no longer the customer's: never released, never expired.
  UPDATE public.loyalty_ledger
  SET points_status = 'cancelled'
  WHERE brand_id = v_order.brand_id AND order_id = p_order_id
    AND event_type IN ('earn_order', 'earn_first_order', 'earn_review')
    AND points_status IN ('pending', 'active');

  INSERT INTO public.loyalty_ledger (
    brand_id, customer_id, account_id, event_type, points, points_status, order_id,
    effective_at, idempotency_key, reference_note_ar, reference_note_en, balance_after
  ) VALUES (
    v_order.brand_id, v_order.customer_id, v_account.id, 'revoke_cancelled',
    -(v_from_pending + v_from_active), 'cancelled', p_order_id, now(), p_idempotency_key,
    'استرجاع نقاط الطلب #' || COALESCE(v_order.invoice_number::text, '') || ' بعد إلغائه أو استرداده',
    'Points taken back: order #' || COALESCE(v_order.invoice_number::text, '') || ' was cancelled or refunded',
    v_account.active_points - v_from_active
  );

  PERFORM public.rpc_evaluate_customer_loyalty_tier(v_order.brand_id, v_order.customer_id);
  RETURN v_from_pending + v_from_active;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.loyalty_revoke_order_points(uuid, text) FROM PUBLIC, anon, authenticated;

-- The live trigger function (migration 20261014110000), which took points back only from an
-- order that earned points of its own: an order whose review earned points and the order none
-- (a programme earning nothing on its amount) kept the review's points when it was cancelled.
CREATE OR REPLACE FUNCTION public.orders_loyalty_follows_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_awards integer;
  v_revokes integer;
  v_review_held boolean;
BEGIN
  IF NEW.customer_id IS NULL THEN
    RETURN NULL;
  END IF;

  BEGIN
    SELECT
      COUNT(*) FILTER (WHERE event_type IN ('earn_order', 'earn_first_order')),
      -- A takeback of the review's points alone (`…:review`) is not one of the order's own.
      COUNT(*) FILTER (WHERE event_type = 'revoke_cancelled' AND idempotency_key LIKE 'revoke:%'
                         AND idempotency_key NOT LIKE '%:review'),
      COALESCE(bool_or(event_type = 'earn_review' AND points_status IN ('pending', 'active')), false)
    INTO v_awards, v_revokes, v_review_held
    FROM public.loyalty_ledger
    WHERE brand_id = NEW.brand_id AND order_id = NEW.id;

    IF public.loyalty_order_earns(NEW.status, NEW.payment_status, NEW.customer_id)
       AND v_awards <= v_revokes THEN
      -- The first award keeps the checkout's key, so an order it rewarded is not rewarded again.
      PERFORM public.rpc_award_order_loyalty_points(
        NEW.brand_id,
        NEW.id,
        CASE WHEN v_awards = 0 THEN 'award:' || NEW.id ELSE 'award:' || NEW.id || ':' || (v_awards + 1) END
      );
    ELSIF public.loyalty_order_undone(NEW.status, NEW.payment_status)
          AND (v_awards > v_revokes OR v_review_held) THEN
      PERFORM public.loyalty_revoke_order_points(
        NEW.id, 'revoke:' || NEW.id || ':' || v_awards || CASE WHEN v_awards > v_revokes THEN '' ELSE ':review' END);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'loyalty points for order % were not updated: %', NEW.id, SQLERRM;
  END;

  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.orders_loyalty_follows_order() FROM PUBLIC, anon, authenticated;
