-- Grant public read access to customization_options so storefront visitors can see add-ons
GRANT SELECT ON public.customization_options TO anon, authenticated;

DROP POLICY IF EXISTS "Public read customization options" ON public.customization_options;

CREATE POLICY "Public read customization options"
ON public.customization_options
FOR SELECT
TO public
USING (true);
