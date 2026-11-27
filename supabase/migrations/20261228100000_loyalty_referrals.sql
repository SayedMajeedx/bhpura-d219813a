-- Referrals (improvement 2 of the final report, 2026-11-27, third part): the programme's
-- `referral_bonus_points` was saved and given by nothing.
--
-- The owner's decisions of 2026-11-27: both sides get points, and the new customer gets no
-- discount. So:
--   - a signed-in member of a store whose programme is on and gives points for a referral has a
--     code of their own (`loyalty_referral_codes`), read and made by `my_referral_code`; their link
--     is the store's address with `?ref=<code>`;
--   - a new customer's first order placed through a link is recorded (`loyalty_referrals`, one per
--     referred customer) by `record_order_referral`, which the checkout's server function calls
--     with the order's confirmation token; never a member's own code, never someone who ordered
--     before;
--   - when that order earns (completed or paid), both get the programme's referral points, held
--     like an order's points; when it is cancelled or refunded, both are taken back.
-- The referral's points are not an order's own: they carry no order on the ledger, so the order's
-- own takeback never counts them.

-- 1. Codes and referrals: the database's alone -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.loyalty_referral_codes (
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  code text NOT NULL CHECK (code ~ '^[A-Z0-9]{6,12}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (brand_id, customer_id),
  UNIQUE (brand_id, code)
);
ALTER TABLE public.loyalty_referral_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.loyalty_referral_codes FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.loyalty_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  referrer_customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  referred_customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'rewarded', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  rewarded_at timestamptz,
  cancelled_at timestamptz,
  UNIQUE (brand_id, referred_customer_id)
);
CREATE INDEX IF NOT EXISTS loyalty_referrals_order_idx ON public.loyalty_referrals (order_id);
CREATE INDEX IF NOT EXISTS loyalty_referrals_referrer_idx
  ON public.loyalty_referrals (brand_id, referrer_customer_id);
ALTER TABLE public.loyalty_referrals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.loyalty_referrals FROM anon, authenticated;

-- 2. A member's own code ---------------------------------------------------------------------
-- The signed-in shopper's code in a store (made the first time), with the points a referral gives
-- and how many friends came; null while the store gives no points for a referral or the caller
-- is not its customer.
CREATE OR REPLACE FUNCTION public.my_referral_code(p_brand_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_customer uuid;
  v_points integer;
  v_code text;
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_try integer := 0;
BEGIN
  IF v_uid IS NULL OR p_brand_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT c.id INTO v_customer
    FROM public.customers c
   WHERE c.brand_id = p_brand_id AND c.auth_user_id = v_uid
   ORDER BY c.id
   LIMIT 1;
  IF v_customer IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT lp.referral_bonus_points INTO v_points
    FROM public.brand_loyalty_programs lp
   WHERE lp.brand_id = p_brand_id AND lp.is_enabled IS TRUE;
  IF COALESCE(v_points, 0) <= 0 THEN
    RETURN NULL;
  END IF;

  SELECT rc.code INTO v_code
    FROM public.loyalty_referral_codes rc
   WHERE rc.brand_id = p_brand_id AND rc.customer_id = v_customer;

  WHILE v_code IS NULL AND v_try < 8 LOOP
    v_try := v_try + 1;
    SELECT string_agg(substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::integer, 1), '')
      INTO v_code
      FROM generate_series(1, 8);
    BEGIN
      INSERT INTO public.loyalty_referral_codes (brand_id, customer_id, code)
      VALUES (p_brand_id, v_customer, v_code);
    EXCEPTION WHEN unique_violation THEN
      -- Another code of the same letters, or the member's own made a moment ago: read it again.
      SELECT rc.code INTO v_code
        FROM public.loyalty_referral_codes rc
       WHERE rc.brand_id = p_brand_id AND rc.customer_id = v_customer;
    END;
  END LOOP;
  IF v_code IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'code', v_code,
    'points', v_points,
    'friends', (SELECT count(*) FROM public.loyalty_referrals r
                 WHERE r.brand_id = p_brand_id AND r.referrer_customer_id = v_customer
                   AND r.status <> 'cancelled'),
    'rewarded', (SELECT count(*) FROM public.loyalty_referrals r
                  WHERE r.brand_id = p_brand_id AND r.referrer_customer_id = v_customer
                    AND r.status = 'rewarded')
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.my_referral_code(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_referral_code(uuid) TO authenticated, service_role;

-- 3. Giving and taking back the points -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.loyalty_award_referral(p_order_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref public.loyalty_referrals%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_points integer;
  v_given integer := 0;
BEGIN
  SELECT * INTO v_ref FROM public.loyalty_referrals
   WHERE order_id = p_order_id AND status = 'pending'
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND OR NOT public.loyalty_order_earns(v_order.status, v_order.payment_status, v_order.customer_id) THEN
    RETURN 0;
  END IF;

  SELECT lp.referral_bonus_points INTO v_points
    FROM public.brand_loyalty_programs lp
   WHERE lp.brand_id = v_ref.brand_id AND lp.is_enabled IS TRUE;
  IF COALESCE(v_points, 0) <= 0 THEN
    RETURN 0;
  END IF;

  v_given := public.loyalty_grant_bonus(
      v_ref.brand_id, v_ref.referrer_customer_id, 'earn_referral', v_points,
      'referral:' || v_ref.id || ':referrer',
      'نقاط دعوة صديق', 'Points for inviting a friend', true)
    + public.loyalty_grant_bonus(
      v_ref.brand_id, v_ref.referred_customer_id, 'earn_referral', v_points,
      'referral:' || v_ref.id || ':friend',
      'نقاط انضمامك بدعوة صديق', 'Points for joining through a friend''s invite', true);

  UPDATE public.loyalty_referrals
     SET status = 'rewarded', rewarded_at = now()
   WHERE id = v_ref.id;
  RETURN v_given;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.loyalty_award_referral(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.loyalty_revoke_referral(p_order_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref public.loyalty_referrals%ROWTYPE;
  v_row record;
  v_from_pending integer;
  v_from_active integer;
  v_taken integer := 0;
  v_balance integer;
BEGIN
  SELECT * INTO v_ref FROM public.loyalty_referrals
   WHERE order_id = p_order_id AND status <> 'cancelled'
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  FOR v_row IN
    SELECT l.id, l.account_id, l.customer_id, l.points, l.points_status, l.idempotency_key
      FROM public.loyalty_ledger l
     WHERE l.brand_id = v_ref.brand_id
       AND l.idempotency_key IN ('referral:' || v_ref.id || ':referrer', 'referral:' || v_ref.id || ':friend')
       AND l.points_status IN ('pending', 'active')
     FOR UPDATE
  LOOP
    SELECT CASE WHEN v_row.points_status = 'pending' THEN LEAST(v_row.points, la.pending_points) ELSE 0 END,
           CASE WHEN v_row.points_status = 'active' THEN LEAST(v_row.points, la.active_points) ELSE 0 END
      INTO v_from_pending, v_from_active
      FROM public.loyalty_accounts la WHERE la.id = v_row.account_id
      FOR UPDATE;

    UPDATE public.loyalty_accounts
       SET pending_points = pending_points - v_from_pending,
           active_points = active_points - v_from_active,
           lifetime_points = GREATEST(0, lifetime_points - (v_from_pending + v_from_active)),
           updated_at = now()
     WHERE id = v_row.account_id
    RETURNING active_points INTO v_balance;

    UPDATE public.loyalty_ledger SET points_status = 'cancelled' WHERE id = v_row.id;

    INSERT INTO public.loyalty_ledger (
      brand_id, customer_id, account_id, event_type, points, points_status,
      effective_at, idempotency_key, reference_note_ar, reference_note_en, balance_after
    ) VALUES (
      v_ref.brand_id, v_row.customer_id, v_row.account_id, 'revoke_cancelled',
      -(v_from_pending + v_from_active), 'cancelled', now(),
      replace(v_row.idempotency_key, 'referral:', 'referral-revoke:'),
      'استرجاع نقاط الدعوة بعد إلغاء الطلب أو استرداده',
      'Referral points taken back: the order was cancelled or refunded',
      v_balance
    )
    ON CONFLICT (brand_id, idempotency_key) DO NOTHING;

    PERFORM public.rpc_evaluate_customer_loyalty_tier(v_ref.brand_id, v_row.customer_id);
    v_taken := v_taken + v_from_pending + v_from_active;
  END LOOP;

  UPDATE public.loyalty_referrals
     SET status = 'cancelled', cancelled_at = now()
   WHERE id = v_ref.id;
  RETURN v_taken;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.loyalty_revoke_referral(uuid) FROM PUBLIC, anon, authenticated;

-- 4. Recording a referral on a new customer's first order ------------------------------------
-- Called by the checkout's server function once it proved the order is the caller's (its
-- confirmation token). Answers what happened: RECORDED, or why not.
CREATE OR REPLACE FUNCTION public.record_order_referral(p_order_id uuid, p_code text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_code public.loyalty_referral_codes%ROWTYPE;
  v_points integer;
  v_friend public.customers%ROWTYPE;
  v_referrer public.customers%ROWTYPE;
  v_digits text;
  v_ref_digits text;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND OR v_order.customer_id IS NULL THEN
    RETURN 'ORDER_NOT_FOUND';
  END IF;
  IF lower(COALESCE(v_order.status, '')) IN ('draft', 'cancelled', 'failed', 'voided', 'refunded') THEN
    RETURN 'ORDER_NOT_OPEN';
  END IF;

  SELECT * INTO v_code FROM public.loyalty_referral_codes
   WHERE brand_id = v_order.brand_id AND code = upper(btrim(COALESCE(p_code, '')));
  IF NOT FOUND THEN
    RETURN 'UNKNOWN_CODE';
  END IF;

  SELECT lp.referral_bonus_points INTO v_points
    FROM public.brand_loyalty_programs lp
   WHERE lp.brand_id = v_order.brand_id AND lp.is_enabled IS TRUE;
  IF COALESCE(v_points, 0) <= 0 THEN
    RETURN 'NOT_OFFERED';
  END IF;

  -- Never a member's own code: the same customer, account, phone or email.
  SELECT * INTO v_friend FROM public.customers WHERE id = v_order.customer_id;
  SELECT * INTO v_referrer FROM public.customers WHERE id = v_code.customer_id;
  v_digits := right(regexp_replace(COALESCE(v_friend.phone, ''), '\D', '', 'g'), 8);
  v_ref_digits := right(regexp_replace(COALESCE(v_referrer.phone, ''), '\D', '', 'g'), 8);
  IF v_code.customer_id = v_order.customer_id
     OR (v_friend.auth_user_id IS NOT NULL AND v_friend.auth_user_id = v_referrer.auth_user_id)
     OR (length(v_digits) = 8 AND v_digits = v_ref_digits)
     OR (NULLIF(lower(btrim(COALESCE(v_friend.email, ''))), '') = lower(btrim(COALESCE(v_referrer.email, '')))) THEN
    RETURN 'OWN_CODE';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.loyalty_referrals
     WHERE brand_id = v_order.brand_id AND referred_customer_id = v_order.customer_id
  ) THEN
    RETURN 'ALREADY_REFERRED';
  END IF;

  -- A new customer: no other order with the store before this one.
  IF EXISTS (
    SELECT 1 FROM public.orders o
     WHERE o.brand_id = v_order.brand_id AND o.customer_id = v_order.customer_id
       AND o.id <> v_order.id
       AND (o.created_at, o.id) < (v_order.created_at, v_order.id)
       AND lower(COALESCE(o.status, '')) <> 'draft'
  ) THEN
    RETURN 'NOT_FIRST_ORDER';
  END IF;

  INSERT INTO public.loyalty_referrals (brand_id, referrer_customer_id, referred_customer_id, order_id)
  VALUES (v_order.brand_id, v_code.customer_id, v_order.customer_id, v_order.id)
  ON CONFLICT (brand_id, referred_customer_id) DO NOTHING;

  -- An order already paid when it is recorded earns at once.
  PERFORM public.loyalty_award_referral(v_order.id);
  RETURN 'RECORDED';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_order_referral(uuid, text) FROM PUBLIC, anon, authenticated;

-- 5. The order's trigger gives and takes back the referral with the order's own points --------
-- The function as migration 20261226100000 left it, with the referral's step added.
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

    -- ADDED (20261228100000): a referral made by this order earns with it and goes with it.
    IF public.loyalty_order_earns(NEW.status, NEW.payment_status, NEW.customer_id) THEN
      PERFORM public.loyalty_award_referral(NEW.id);
    ELSIF public.loyalty_order_undone(NEW.status, NEW.payment_status) THEN
      PERFORM public.loyalty_revoke_referral(NEW.id);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'loyalty points for order % were not updated: %', NEW.id, SQLERRM;
  END;

  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.orders_loyalty_follows_order() FROM PUBLIC, anon, authenticated;
