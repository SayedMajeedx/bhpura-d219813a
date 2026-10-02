-- Booking policies: the terms a services store shows with a booking.
--
--   balance_due_days     the balance is due this many days before the event (null: no rule)
--   reschedule_months    a booking can be moved within this many months (null: no rule)
--   deposit_refundable   whether the deposit comes back on cancellation
--   terms_en / terms_ar  anything else the store wants to say (cancellation terms, etc.)
--
-- One row per store. Customers read it (it is shown on the booking page and in the
-- confirmation); only people who manage the store's settings write it. Additive:
-- a new table, nothing existing changes.

CREATE TABLE IF NOT EXISTS public.booking_policies (
  brand_id uuid PRIMARY KEY REFERENCES public.brands(id) ON DELETE CASCADE,
  balance_due_days integer CHECK (balance_due_days IS NULL OR balance_due_days BETWEEN 0 AND 365),
  reschedule_months integer CHECK (reschedule_months IS NULL OR reschedule_months BETWEEN 0 AND 60),
  deposit_refundable boolean NOT NULL DEFAULT false,
  terms_en text CHECK (terms_en IS NULL OR char_length(terms_en) <= 2000),
  terms_ar text CHECK (terms_ar IS NULL OR char_length(terms_ar) <= 2000),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.booking_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public reads booking policies" ON public.booking_policies;
CREATE POLICY "public reads booking policies" ON public.booking_policies
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "settings managers write booking policies" ON public.booking_policies;
CREATE POLICY "settings managers write booking policies" ON public.booking_policies
  FOR ALL TO authenticated
  USING (public.can_access_brand(brand_id) AND public.has_permission('manage_settings'))
  WITH CHECK (public.can_access_brand(brand_id) AND public.has_permission('manage_settings'));
