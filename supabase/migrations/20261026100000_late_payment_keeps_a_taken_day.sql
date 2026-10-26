-- A payment that arrives after a booking's hold ran out never confirms it over a day another
-- customer has taken since.
--
-- A BenefitPay booking holds its day for 24 hours while the store checks the receipt (a card
-- payment for 30 minutes). Once the hold runs out the day is free, and another customer can book
-- it. Approving the first transfer afterwards confirmed that booking anyway
-- (sync_bookings_with_order took 'hold' and 'expired' alike) and only added an English line to
-- its notes: two confirmed customers for one booth, one of whom had paid.
--
--   1. bookings.late_payment_slot_taken_at: the payment arrived after the hold ran out and the
--      day (or a booked service) had no room left. The booking stays 'expired' until staff move
--      it to a free time or cancel it and return the money. Cleared once its status moves on.
--   2. sync_bookings_with_order (the live definition): a payment confirms a booking whose hold is
--      still running, as before; a booking whose hold ran out is confirmed only while its day and
--      services still have room by the engine's own checks (booking_day_state_for for staff,
--      assert_booking_services_free), else it is marked as above. The payment itself is recorded
--      either way: the money arrived. The English note is gone.
--   3. approve_benefit_payment (the live definition, migration 20261023100000) answers
--      slot_taken when its approval found the day taken, so the screen can ask what to do.
--   4. reschedule_booking (the live definition, migration 20261001180000) moves such a booking
--      too, and moving it confirms it, under the same checks as a confirmed booking's move.
--
-- Tested in a real Postgres through the booking engine by
-- tests/late-payment-slot-taken-migration.test.ts.

-- 1. What the screens read.
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS late_payment_slot_taken_at timestamptz;

COMMENT ON COLUMN public.bookings.late_payment_slot_taken_at IS
  'Paid after the hold ran out, when the day or a service had no room left: the booking waits for staff to move it or cancel it.';

CREATE OR REPLACE FUNCTION public.clear_late_payment_slot_taken()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'expired' THEN
    NEW.late_payment_slot_taken_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_late_payment_slot_taken() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_bookings_clear_late_payment ON public.bookings;
CREATE TRIGGER trg_bookings_clear_late_payment
  BEFORE UPDATE OF status ON public.bookings
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.clear_late_payment_slot_taken();

-- 2. A late payment confirms only a day that is still free.
CREATE OR REPLACE FUNCTION public.sync_bookings_with_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_booking public.bookings;
  v_settings public.booking_settings;
  v_state record;
  v_free boolean;
BEGIN
  -- Paid in full, or the booking's deposit paid: the day is the customer's, if it is still free.
  IF NEW.payment_status IN ('paid', 'partially_paid')
     AND OLD.payment_status IS DISTINCT FROM NEW.payment_status
     AND COALESCE(OLD.payment_status, '') NOT IN ('paid', 'partially_paid') THEN
    FOR v_booking IN
      SELECT * FROM public.bookings
       WHERE order_id = NEW.id AND status IN ('hold', 'expired')
       FOR UPDATE
    LOOP
      v_free := true;
      -- The hold ran out: the day was free for others meanwhile.
      IF v_booking.status = 'expired' OR v_booking.hold_expires_at IS NULL
         OR v_booking.hold_expires_at <= now() THEN
        SELECT * INTO v_settings FROM public.booking_settings WHERE brand_id = v_booking.brand_id;
        SELECT * INTO v_state FROM public.booking_day_state_for(
          v_settings, v_booking.event_date, v_booking.id, true, NULL,
          public.booking_is_governed(v_booking.id));
        v_free := v_state.state = 'available';
        IF v_free THEN
          BEGIN
            PERFORM public.assert_booking_services_free(v_booking.id);
          EXCEPTION WHEN SQLSTATE '23P01' THEN
            v_free := false;
          END;
        END IF;
      END IF;

      IF v_free THEN
        UPDATE public.bookings SET
          status = 'confirmed',
          confirmed_at = COALESCE(confirmed_at, now()),
          hold_expires_at = NULL,
          updated_at = now()
        WHERE id = v_booking.id;
      ELSE
        UPDATE public.bookings SET
          status = 'expired',
          late_payment_slot_taken_at = now(),
          updated_at = now()
        WHERE id = v_booking.id;
      END IF;
    END LOOP;
  END IF;

  IF NEW.status IN ('cancelled', 'canceled', 'returned') AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.bookings SET
      status = 'cancelled',
      cancelled_at = now(),
      cancel_reason = COALESCE(cancel_reason, 'Order cancelled'),
      hold_expires_at = NULL,
      updated_at = now()
    WHERE order_id = NEW.id AND status IN ('hold', 'expired', 'requested', 'confirmed');
  ELSIF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    UPDATE public.bookings SET status = 'completed', updated_at = now()
    WHERE order_id = NEW.id AND status = 'confirmed';
  END IF;

  RETURN NEW;
END;
$function$;

-- 3. The approval says when the day was taken.
CREATE OR REPLACE FUNCTION public.approve_benefit_payment(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_advance numeric;
  v_part boolean;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF NOT public.is_admin() OR NOT public.can_access_brand(v_order.brand_id) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF lower(COALESCE(v_order.payment_method, '')) NOT IN (
       'benefit', 'benefitpay', 'benefit_pay', 'bank_transfer'
     ) THEN
    RAISE EXCEPTION 'NOT_A_TRANSFER_ORDER';
  END IF;
  IF v_order.payment_status IN ('paid', 'partially_paid') THEN
    RETURN jsonb_build_object('approved', true, 'already_paid', true);
  END IF;

  -- An order placed under an advance rule is paid in part: the advance is recorded and
  -- the balance stays due. Nothing is owed in advance when the rule does not reach it.
  -- Without an advance, a booking's own deposit is what its transfer paid (the card charge
  -- reads the two in the same order: orderChargePlan).
  v_advance := public.order_advance_due(p_order_id);
  IF v_advance IS NULL THEN
    SELECT b.deposit_amount INTO v_advance
      FROM public.bookings b
     WHERE b.order_id = p_order_id AND b.deposit_amount > 0
     LIMIT 1;
  END IF;
  v_part := v_advance IS NOT NULL AND v_advance < v_order.total;

  UPDATE public.orders
  SET status = 'confirmed',
      payment_status = CASE WHEN v_part THEN 'partially_paid' ELSE 'paid' END,
      advance_paid = CASE WHEN v_part THEN v_advance ELSE total END,
      benefit_verified_at = now(),
      benefit_verified_by = auth.uid(),
      benefit_receipt_delete_after = CASE
        WHEN benefit_receipt_key IS NOT NULL THEN now() + interval '30 days'
        ELSE benefit_receipt_delete_after
      END,
      updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'approved', true,
    'advance_only', v_part,
    -- The payment is recorded, and the booking was not confirmed: its day was taken
    -- after its hold ran out (sync_bookings_with_order).
    'slot_taken', EXISTS (
      SELECT 1 FROM public.bookings b
       WHERE b.order_id = p_order_id AND b.late_payment_slot_taken_at IS NOT NULL
    ),
    'receipt_delete_after', CASE
      WHEN v_order.benefit_receipt_key IS NOT NULL THEN now() + interval '30 days'
    END
  );
END;
$function$;

-- 4. A paid booking whose day was taken is moved to a free time, and is confirmed there.
CREATE OR REPLACE FUNCTION public.reschedule_booking(p_booking_id uuid, p_day date, p_start time without time zone, p_duration_minutes integer, p_allow_overbook boolean DEFAULT false)
 RETURNS bookings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_booking public.bookings;
  v_settings public.booking_settings;
  v_state record;
  v_window record;
  v_taken boolean;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND OR NOT public.can_access_brand(v_booking.brand_id) THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  v_settings := public.lock_booking_settings_for_staff(v_booking.brand_id);
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  v_taken := v_booking.status = 'expired' AND v_booking.late_payment_slot_taken_at IS NOT NULL;
  IF v_booking.status NOT IN ('requested', 'confirmed') AND NOT v_taken THEN
    RAISE EXCEPTION 'BOOKING_TRANSITION_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_window FROM public.booking_window(v_settings, p_day, p_start, p_duration_minutes);
  IF (v_booking.status = 'confirmed' OR v_taken) AND NOT p_allow_overbook THEN
    SELECT * INTO v_state FROM public.booking_day_state_for(
      v_settings, p_day, v_booking.id, true, NULL, public.booking_is_governed(v_booking.id));
    IF v_state.state <> 'available' THEN
      RAISE EXCEPTION 'BOOKING_DAY_%', upper(v_state.state) USING ERRCODE = '23P01';
    END IF;
  END IF;

  UPDATE public.bookings SET
    event_date = p_day, starts_at = v_window.starts_at, ends_at = v_window.ends_at,
    -- Paid already: at its new time the booking is the customer's.
    status = CASE WHEN v_taken THEN 'confirmed' ELSE status END,
    confirmed_at = CASE WHEN v_taken THEN COALESCE(confirmed_at, now()) ELSE confirmed_at END,
    confirmed_by = CASE WHEN v_taken THEN COALESCE(confirmed_by, auth.uid()) ELSE confirmed_by END,
    hold_expires_at = CASE WHEN v_taken THEN NULL ELSE hold_expires_at END,
    updated_at = now()
  WHERE id = p_booking_id
  RETURNING * INTO v_booking;

  -- Each service's capacity at the new time.
  IF v_booking.status = 'confirmed' AND NOT p_allow_overbook THEN
    PERFORM public.assert_booking_services_free(p_booking_id);
  END IF;
  RETURN v_booking;
END;
$function$;
