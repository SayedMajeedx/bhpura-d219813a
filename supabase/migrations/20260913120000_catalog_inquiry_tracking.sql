-- Migration: Catalog Inquiries Tracking
-- Adds inquiry_count to product_engagement_daily and extends record_storefront_product_engagement
-- to record WhatsApp customer inquiries in catalog mode.

ALTER TABLE public.product_engagement_daily
  ADD COLUMN IF NOT EXISTS inquiry_count bigint NOT NULL DEFAULT 0;

-- Extend record_storefront_product_engagement to record inquiry events
CREATE OR REPLACE FUNCTION public.record_storefront_product_engagement(
  p_brand_slug text,
  p_product_id uuid,
  p_event text DEFAULT 'view'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand_id uuid;
BEGIN
  IF p_event NOT IN ('view', 'click', 'inquiry') THEN
    RAISE EXCEPTION 'Invalid event: %', p_event;
  END IF;

  SELECT b.id INTO v_brand_id
  FROM brands b
  JOIN products p ON p.brand_id = b.id
  WHERE b.slug = p_brand_slug
    AND b.is_active = true
    AND p.id = p_product_id
    AND p.is_active = true;

  IF v_brand_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO product_engagement_daily(
    brand_id,
    product_id,
    event_date,
    view_count,
    click_count,
    inquiry_count
  )
  VALUES (
    v_brand_id,
    p_product_id,
    CURRENT_DATE,
    CASE WHEN p_event = 'view' THEN 1 ELSE 0 END,
    CASE WHEN p_event = 'click' THEN 1 ELSE 0 END,
    CASE WHEN p_event = 'inquiry' THEN 1 ELSE 0 END
  )
  ON CONFLICT (product_id, event_date) DO UPDATE SET
    view_count = product_engagement_daily.view_count + CASE WHEN p_event = 'view' THEN 1 ELSE 0 END,
    click_count = product_engagement_daily.click_count + CASE WHEN p_event = 'click' THEN 1 ELSE 0 END,
    inquiry_count = product_engagement_daily.inquiry_count + CASE WHEN p_event = 'inquiry' THEN 1 ELSE 0 END;
END $$;

REVOKE ALL ON FUNCTION public.record_storefront_product_engagement(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_storefront_product_engagement(text, uuid, text) TO anon, authenticated;

-- Update trending function to factor in inquiries with high engagement weight
CREATE OR REPLACE FUNCTION public.get_storefront_trending(p_brand_slug text, p_limit integer DEFAULT 8)
RETURNS TABLE(product_id uuid, engagement_score bigint, manually_featured boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    COALESCE(
      SUM(e.view_count + e.click_count * 3 + e.inquiry_count * 5)
      FILTER (WHERE e.event_date >= CURRENT_DATE - 30),
      0
    )::bigint,
    p.featured_trending
  FROM products p
  JOIN brands b ON b.id = p.brand_id
  LEFT JOIN product_engagement_daily e ON e.product_id = p.id
  WHERE b.slug = p_brand_slug
    AND b.is_active = true
    AND p.is_active = true
  GROUP BY p.id, p.featured_trending, p.created_at
  ORDER BY (
    COALESCE(
      SUM(e.view_count + e.click_count * 3 + e.inquiry_count * 5)
      FILTER (WHERE e.event_date >= CURRENT_DATE - 30),
      0
    ) + CASE WHEN p.featured_trending THEN 100 ELSE 0 END
  ) DESC, p.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 8), 1), 24)
$$;

REVOKE ALL ON FUNCTION public.get_storefront_trending(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_storefront_trending(text, integer) TO anon, authenticated;
