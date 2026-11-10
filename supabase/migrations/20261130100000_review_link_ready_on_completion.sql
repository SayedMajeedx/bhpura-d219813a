-- The review link is the store's to send when it chooses, from the moment the order is completed.
--
-- `enqueue_order_review_request` (migration 20260928170000) dated each review request three days
-- after the order was completed (`eligible_at`), and everything reads that date: the dashboard's
-- list of reviews to request (`list_ready_order_review_requests`) and the customer's review page
-- (`get_public_order_review`, `submit_public_order_review`). So a store could not ask for a review
-- before the third day, even when the customer had their piece in hand the same evening (the
-- owner's report of 2026-11-10). A request is now ready as soon as the order is completed; the
-- store decides when to send it from the dashboard. The readers are unchanged.

CREATE OR REPLACE FUNCTION public.enqueue_order_review_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.completed_at IS NOT NULL AND COALESCE(NULLIF(trim(NEW.customer_phone_snapshot), ''), '') <> '' THEN
    INSERT INTO public.order_review_requests (brand_id, order_id, eligible_at)
    VALUES (NEW.brand_id, NEW.id, NEW.completed_at)
    ON CONFLICT (order_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enqueue_order_review_request() FROM PUBLIC, anon, authenticated;

-- The requests still waiting out their three days are ready now, dated from their order's
-- completion.
UPDATE public.order_review_requests r
   SET eligible_at = COALESCE(o.completed_at, r.created_at),
       updated_at = now()
  FROM public.orders o
 WHERE o.id = r.order_id
   AND r.status = 'scheduled'
   AND r.eligible_at > now();
