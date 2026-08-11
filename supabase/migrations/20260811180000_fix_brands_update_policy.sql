-- Fix brands update policy to allow users with brand access (role admin / brand_admin / super_admin) to update their brand
DROP POLICY IF EXISTS "brand admin update own brand" ON public.brands;
DROP POLICY IF EXISTS "brands_update_policy" ON public.brands;

CREATE POLICY "brands_update_policy" ON public.brands
  FOR UPDATE TO authenticated
  USING (public.can_access_brand(id))
  WITH CHECK (public.can_access_brand(id));
