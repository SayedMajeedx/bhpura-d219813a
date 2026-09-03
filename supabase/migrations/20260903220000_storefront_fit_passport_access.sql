-- Let authenticated storefront customers manage only their own Fit Passport.
DROP POLICY IF EXISTS "customers_insert_own_fit_passport" ON public.customer_fit_passports;
CREATE POLICY "customers_insert_own_fit_passport" ON public.customer_fit_passports
  FOR INSERT TO authenticated
  WITH CHECK (
    customer_id IN (
      SELECT id FROM public.customers
      WHERE auth_user_id = auth.uid() AND brand_id = customer_fit_passports.brand_id
    )
  );

DROP POLICY IF EXISTS "customers_update_own_fit_passport" ON public.customer_fit_passports;
CREATE POLICY "customers_update_own_fit_passport" ON public.customer_fit_passports
  FOR UPDATE TO authenticated
  USING (
    customer_id IN (
      SELECT id FROM public.customers
      WHERE auth_user_id = auth.uid() AND brand_id = customer_fit_passports.brand_id
    )
  )
  WITH CHECK (
    customer_id IN (
      SELECT id FROM public.customers
      WHERE auth_user_id = auth.uid() AND brand_id = customer_fit_passports.brand_id
    )
  );
