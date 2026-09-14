-- Migration: Fix Engagement Views and Inquiries Consistency
-- Ensures that recording an inquiry guarantees that view_count is at least inquiry_count,
-- preventing zero-view or zero-click anomalies when users inquire about products.

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
    CASE WHEN p_event IN ('view', 'inquiry') THEN 1 ELSE 0 END,
    CASE WHEN p_event = 'click' THEN 1 ELSE 0 END,
    CASE WHEN p_event = 'inquiry' THEN 1 ELSE 0 END
  )
  ON CONFLICT (product_id, event_date) DO UPDATE SET
    view_count = GREATEST(
      product_engagement_daily.view_count + CASE WHEN p_event = 'view' THEN 1 ELSE 0 END,
      product_engagement_daily.inquiry_count + CASE WHEN p_event = 'inquiry' THEN 1 ELSE 0 END
    ),
    click_count = product_engagement_daily.click_count + CASE WHEN p_event = 'click' THEN 1 ELSE 0 END,
    inquiry_count = product_engagement_daily.inquiry_count + CASE WHEN p_event = 'inquiry' THEN 1 ELSE 0 END;
END $$;

REVOKE ALL ON FUNCTION public.record_storefront_product_engagement(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_storefront_product_engagement(text, uuid, text) TO anon, authenticated;

-- Backfill / normalize existing records where view_count is less than inquiry_count or click_count is 0
UPDATE public.product_engagement_daily
SET view_count = GREATEST(view_count, inquiry_count, 1),
    click_count = GREATEST(click_count, 1)
WHERE inquiry_count > 0 AND (view_count < inquiry_count OR click_count = 0);
