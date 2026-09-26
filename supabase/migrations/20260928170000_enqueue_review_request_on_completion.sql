-- Bug #33: completing an order never scheduled its review request.
--
-- enqueue_order_review_request was an AFTER INSERT OR UPDATE OF completed_at
-- trigger. completed_at is filled by the BEFORE trigger set_order_completed_at
-- when the status or fulfillment status turns complete, and PostgreSQL fires
-- an UPDATE OF <column> trigger only when the column is in the statement's SET
-- list. The app never sets completed_at itself, so the request was never made.
--
-- The trigger now fires on any update and filters with WHEN: when completed_at
-- changes, or when the customer phone arrives on an already completed order.
-- The function is unchanged (it needs a phone and ignores existing requests).

DROP TRIGGER IF EXISTS enqueue_order_review_request ON public.orders;

CREATE TRIGGER enqueue_order_review_request
AFTER INSERT ON public.orders
FOR EACH ROW
WHEN (NEW.completed_at IS NOT NULL)
EXECUTE FUNCTION public.enqueue_order_review_request();

CREATE TRIGGER enqueue_order_review_request_on_update
AFTER UPDATE ON public.orders
FOR EACH ROW
WHEN (
  NEW.completed_at IS NOT NULL
  AND (
    OLD.completed_at IS DISTINCT FROM NEW.completed_at
    OR OLD.customer_phone_snapshot IS DISTINCT FROM NEW.customer_phone_snapshot
  )
)
EXECUTE FUNCTION public.enqueue_order_review_request();

-- Schedule the requests the old trigger missed, three days after completion
-- as usual (already past for older orders, so they are ready at once).
INSERT INTO public.order_review_requests (brand_id, order_id, eligible_at)
SELECT o.brand_id, o.id, o.completed_at + interval '3 days'
FROM public.orders o
WHERE o.completed_at IS NOT NULL
  AND COALESCE(NULLIF(trim(o.customer_phone_snapshot), ''), '') <> ''
ON CONFLICT (order_id) DO NOTHING;
