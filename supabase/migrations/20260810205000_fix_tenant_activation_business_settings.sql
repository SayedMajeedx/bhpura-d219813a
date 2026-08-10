-- Make tenant provisioning compatible with the current per-brand settings
-- schema and prevent ordinary authenticated users from invoking the
-- SECURITY DEFINER routine directly.
CREATE OR REPLACE FUNCTION public.create_tenant_with_defaults(
  p_slug text,
  p_name_en text,
  p_name_ar text,
  p_primary_color text,
  p_owner_id uuid,
  p_business_type text DEFAULT 'Fashion'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand_id uuid;
BEGIN
  IF NOT public.is_super_admin()
     AND COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'SUPER_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF p_owner_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_owner_id) THEN
    RAISE EXCEPTION 'VALID_OWNER_REQUIRED' USING ERRCODE = '23502';
  END IF;

  p_slug := lower(trim(p_slug));

  INSERT INTO public.brands (
    slug, name_en, name_ar, primary_color, created_by, business_type, is_active
  ) VALUES (
    p_slug, p_name_en, p_name_ar, p_primary_color, p_owner_id, p_business_type, true
  ) RETURNING id INTO v_brand_id;

  -- The brands_after_insert_default_settings trigger may have already created
  -- this row. Upsert it instead of attempting a second owner-less insert.
  INSERT INTO public.business_settings (
    user_id, brand_id, business_name, primary_color, background_color, text_color,
    currency, delivery_fee, cod_enabled, card_enabled, benefit_enabled,
    delivery_enabled, pickup_enabled, vat_inclusive, default_tax_rate
  ) VALUES (
    p_owner_id, v_brand_id, p_name_en, p_primary_color, '#ffffff', '#1c1917',
    'BHD', 1.500, true, false, false,
    p_business_type <> 'Digital store', true, false, 10.0
  )
  ON CONFLICT (brand_id) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    business_name = EXCLUDED.business_name,
    primary_color = EXCLUDED.primary_color,
    background_color = EXCLUDED.background_color,
    text_color = EXCLUDED.text_color,
    currency = EXCLUDED.currency,
    delivery_fee = EXCLUDED.delivery_fee,
    cod_enabled = EXCLUDED.cod_enabled,
    card_enabled = EXCLUDED.card_enabled,
    benefit_enabled = EXCLUDED.benefit_enabled,
    delivery_enabled = EXCLUDED.delivery_enabled,
    pickup_enabled = EXCLUDED.pickup_enabled,
    vat_inclusive = EXCLUDED.vat_inclusive,
    default_tax_rate = EXCLUDED.default_tax_rate,
    updated_at = now();

  INSERT INTO public.categories (brand_id, name_en, name_ar, slug)
  VALUES (
    v_brand_id,
    CASE WHEN p_business_type = 'Cafe / Restaurant' THEN 'Beverages'
         WHEN p_business_type = 'Digital store' THEN 'Digital Assets'
         ELSE 'New Arrivals' END,
    CASE WHEN p_business_type = 'Cafe / Restaurant' THEN 'المشروبات'
         WHEN p_business_type = 'Digital store' THEN 'المنتجات الرقمية'
         ELSE 'وصلنا حديثاً' END,
    CASE WHEN p_business_type = 'Cafe / Restaurant' THEN 'beverages'
         WHEN p_business_type = 'Digital store' THEN 'digital-assets'
         ELSE 'new-arrivals' END
  );

  RETURN v_brand_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_tenant_with_defaults(text,text,text,text,uuid,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_tenant_with_defaults(text,text,text,text,uuid,text)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
