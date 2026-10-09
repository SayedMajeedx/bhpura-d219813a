-- Visitors could not read three public tables since the browser clean-up of 7 October.
--
-- 20261007110000 took EXECUTE on can_access_brand away from `anon` (a visitor). Three read
-- policies written for visitors still called it in the same expression as their public rule:
--
--   advance_payment_rules   USING (is_active OR can_access_brand(brand_id))
--   store_faq_items         USING (is_active OR can_access_brand(brand_id))
--   store_gallery_items     USING (is_active OR can_access_brand(brand_id))
--
-- For a visitor the call is refused ("permission denied for function can_access_brand"), so the
-- whole read failed: the storefront never learnt a store's own advance-payment rules (checkout
-- showed no advance and kept cash on delivery, which the database then refused when the order
-- was placed) and the booking page lost its FAQ and gallery.
--
-- Each is split in two: a policy for visitors and shoppers that only looks at is_active, and a
-- policy for signed-in staff that keeps the brand check (so staff still see switched-off rows).
-- Policies are combined with OR, so what each role can read is unchanged; only a visitor no
-- longer runs the staff check. Policy changes only; no table, column or grant changes.

DROP POLICY IF EXISTS "public reads advance payment rules" ON public.advance_payment_rules;
CREATE POLICY "public reads advance payment rules" ON public.advance_payment_rules
  FOR SELECT TO anon, authenticated USING (is_active);
DROP POLICY IF EXISTS "staff read advance payment rules" ON public.advance_payment_rules;
CREATE POLICY "staff read advance payment rules" ON public.advance_payment_rules
  FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));

DROP POLICY IF EXISTS "public reads active faq" ON public.store_faq_items;
CREATE POLICY "public reads active faq" ON public.store_faq_items
  FOR SELECT TO anon, authenticated USING (is_active);
DROP POLICY IF EXISTS "staff read faq" ON public.store_faq_items;
CREATE POLICY "staff read faq" ON public.store_faq_items
  FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));

DROP POLICY IF EXISTS "public reads active gallery" ON public.store_gallery_items;
CREATE POLICY "public reads active gallery" ON public.store_gallery_items
  FOR SELECT TO anon, authenticated USING (is_active);
DROP POLICY IF EXISTS "staff read gallery" ON public.store_gallery_items;
CREATE POLICY "staff read gallery" ON public.store_gallery_items
  FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));
