-- "Purchased N times in the last 7 days": the product page's social proof badge, made to work.
--
-- The page counted a product's recent order lines by reading `orders` and `order_items` from the
-- visitor's browser. Those tables are (rightly) invisible to visitors, so the count was always zero
-- and the badge never showed for any store, while every product page still paid for the request.
--
-- This function gives the page the one number it needs and nothing else. Safe to expose:
--   * it returns a count only at or above a fixed threshold (3), otherwise NULL, so a visitor can
--     never read a small number of sales, a product's exact sales, or anything about who bought;
--   * it honours the store's own switch (`business_settings.social_proof_enabled`);
--   * it counts distinct orders of the last 7 days that are not cancelled or still drafts, for an
--     active product of that store only.
-- It takes the store's slug, so the page can ask for it in the same round trip as the product.

CREATE OR REPLACE FUNCTION public.get_product_recent_purchase_count(
  p_brand_slug text,
  p_product_id uuid
) RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_brand_id uuid;
  v_enabled boolean;
  v_count integer;
BEGIN
  SELECT b.id INTO v_brand_id
  FROM public.brands b
  WHERE b.slug = p_brand_slug AND b.is_active = true;
  IF v_brand_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- A store with no settings row yet has the badge on, as the storefront treats it.
  SELECT COALESCE(s.social_proof_enabled, true) INTO v_enabled
  FROM public.business_settings s
  WHERE s.brand_id = v_brand_id;
  IF COALESCE(v_enabled, true) = false THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = p_product_id AND p.brand_id = v_brand_id AND p.is_active = true
  ) THEN
    RETURN NULL;
  END IF;

  SELECT count(DISTINCT o.id)::integer INTO v_count
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE oi.product_id = p_product_id
    AND oi.brand_id = v_brand_id
    AND o.brand_id = v_brand_id
    AND o.created_at >= now() - interval '7 days'
    AND lower(o.status) NOT IN ('cancelled', 'draft');

  RETURN CASE WHEN v_count >= 3 THEN v_count ELSE NULL END;
END;
$$;

-- A visitor's page calls it: anyone may run it, and it answers only what is described above.
REVOKE EXECUTE ON FUNCTION public.get_product_recent_purchase_count(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_product_recent_purchase_count(text, uuid)
  TO anon, authenticated, service_role;
