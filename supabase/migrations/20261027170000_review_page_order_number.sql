-- The review page writes the order's number as its store does ("PL-01042", order-number.ts):
-- `get_public_order_review` also returns the store's `order_number_prefix` and
-- `order_number_digits` (columns added by 20261027160000). The live function
-- (pg_get_functiondef, 2026-10-27) with the two columns added at the end of its result, so it is
-- dropped first; its grants are given again as they were (anon, authenticated, service_role).
DROP FUNCTION IF EXISTS public.get_public_order_review(uuid);
CREATE FUNCTION public.get_public_order_review(p_token uuid)
 RETURNS TABLE(state text, brand_name text, brand_logo_url text, invoice_number integer, customer_name text, brand_whatsapp_number text, reward_code text, reward_discount_type text, reward_discount_value numeric, currency text, order_number_prefix text, order_number_digits smallint)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    CASE WHEN r.status = 'completed' THEN 'completed' ELSE 'ready' END,
    COALESCE(NULLIF(bs.business_name, ''), b.name_ar, b.name_en, b.slug),
    COALESCE(bs.logo_url, b.logo_url),
    o.invoice_number,
    COALESCE(NULLIF(split_part(o.customer_name_snapshot, ' ', 1), ''), 'عميلنا'),
    bs.whatsapp_number,
    CASE WHEN r.status = 'completed' THEN rv.reward_code ELSE NULL END,
    CASE WHEN r.status = 'completed' THEN given.discount_type ELSE offer.discount_type END,
    CASE WHEN r.status = 'completed' THEN given.discount_value ELSE offer.discount_value END,
    COALESCE(NULLIF(bs.currency, ''), 'BHD'),
    bs.order_number_prefix,
    bs.order_number_digits
  FROM public.order_review_requests r
  JOIN public.orders o ON o.id = r.order_id
  JOIN public.brands b ON b.id = r.brand_id AND b.is_active = true
  LEFT JOIN public.business_settings bs ON bs.brand_id = r.brand_id
  LEFT JOIN public.order_reviews rv ON rv.request_id = r.id
  LEFT JOIN LATERAL public.store_review_reward(r.brand_id) offer ON true
  LEFT JOIN LATERAL (
    SELECT pc.discount_type, pc.discount_value
      FROM public.promo_codes pc
     WHERE pc.brand_id = r.brand_id AND upper(pc.code) = upper(rv.reward_code)
     LIMIT 1
  ) given ON true
  WHERE r.public_token = p_token AND r.eligible_at <= now();
$function$;
REVOKE ALL ON FUNCTION public.get_public_order_review(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_order_review(uuid) TO anon, authenticated, service_role;
