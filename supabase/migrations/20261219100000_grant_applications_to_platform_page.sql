-- The grant survey becomes the platform page `grant` (PR 3 of 3, 2026-11-22).
--
-- * Every application sent before (`merchant_grant_applications`) is copied into the page's
--   responses, under its own id (so the copy runs once), its answers under the page's question
--   keys (the form was seeded with the survey's own fields), its state in the inbox's words
--   (pending → new, selected and offered_3_months → accepted) and the grant offered kept as a
--   line of its notes. The old table stays, read by nothing.
-- * The page is published: /grant now draws it, and the super admin edits it and reads its
--   responses in one place.
-- * `submit_grant_application`, which a page left open from before this release still calls,
--   now sends through the page (`submit_platform_page_response`): its answers are cleaned by the
--   page's form and land in the same inbox. Its rights are unchanged.
-- Run in a real Postgres by tests/platform-pages-migration.test.ts.

INSERT INTO public.platform_page_responses (id, page_id, answers, status, admin_notes, created_at, updated_at)
SELECT a.id,
       p.id,
       jsonb_strip_nulls(jsonb_build_object(
         'business_name', a.business_name,
         'instagram_handle', a.instagram_handle,
         'whatsapp_number', a.whatsapp_number,
         'product_category', a.product_category,
         'readiness_status', a.readiness_status,
         'current_sales_channel', a.current_sales_channel,
         'biggest_challenge', nullif(btrim(a.biggest_challenge), '')
       )),
       CASE a.status
         WHEN 'reviewed' THEN 'reviewed'
         WHEN 'shortlisted' THEN 'shortlisted'
         WHEN 'selected' THEN 'accepted'
         WHEN 'offered_3_months' THEN 'accepted'
         WHEN 'rejected' THEN 'rejected'
         ELSE 'new'
       END,
       nullif(concat_ws(E'\n',
         nullif(btrim(a.admin_notes), ''),
         CASE a.offered_grant
           WHEN '6_months_free' THEN 'العرض: 6 أشهر مجاناً'
           WHEN '3_months_free' THEN 'العرض: 3 أشهر مجاناً'
         END), ''),
       a.created_at,
       a.updated_at
  FROM public.merchant_grant_applications a
 CROSS JOIN public.platform_pages p
 WHERE p.slug = 'grant'
ON CONFLICT (id) DO NOTHING;

UPDATE public.platform_pages SET status = 'published' WHERE slug = 'grant' AND status = 'draft';

CREATE OR REPLACE FUNCTION public.submit_grant_application(
  p_business_name text,
  p_instagram_handle text,
  p_whatsapp_number text,
  p_product_category text,
  p_readiness_status text,
  p_current_sales_channel text,
  p_biggest_challenge text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.submit_platform_page_response(
    'grant',
    jsonb_strip_nulls(jsonb_build_object(
      'business_name', p_business_name,
      'instagram_handle', p_instagram_handle,
      'whatsapp_number', p_whatsapp_number,
      'product_category', p_product_category,
      'readiness_status', p_readiness_status,
      'current_sales_channel', p_current_sales_channel,
      'biggest_challenge', p_biggest_challenge
    ))
  );
END;
$$;
