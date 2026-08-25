-- Tenant-scoped review management feed for the admin dashboard.
CREATE OR REPLACE FUNCTION public.list_brand_order_reviews(p_brand_id uuid)
RETURNS TABLE (
  review_id uuid,
  request_id uuid,
  order_id uuid,
  invoice_number integer,
  customer_name text,
  customer_phone text,
  rating smallint,
  highlights text[],
  comment text,
  reward_code text,
  reviewed_at timestamptz,
  request_sent_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    rv.id,
    rv.request_id,
    rv.order_id,
    o.invoice_number,
    COALESCE(NULLIF(trim(o.customer_name_snapshot), ''), 'Customer'),
    o.customer_phone_snapshot,
    rv.rating,
    rv.highlights,
    rv.comment,
    rv.reward_code,
    rv.created_at,
    rr.sent_at
  FROM public.order_reviews rv
  JOIN public.order_review_requests rr ON rr.id = rv.request_id
  JOIN public.orders o ON o.id = rv.order_id
  WHERE rv.brand_id = p_brand_id
    AND public.can_access_brand(rv.brand_id)
  ORDER BY rv.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.list_brand_order_reviews(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_brand_order_reviews(uuid) TO authenticated;

