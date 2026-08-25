-- Post-purchase review requests with a short public survey and a manual
-- WhatsApp reward flow. Public access is available only through token-scoped RPCs.

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS completed_at timestamptz;

CREATE TABLE IF NOT EXISTS public.order_review_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  public_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  eligible_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN (
    'scheduled', 'ready', 'whatsapp_opened', 'sent', 'completed', 'dismissed'
  )),
  whatsapp_opened_at timestamptz,
  sent_at timestamptz,
  sent_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  completed_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.order_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE REFERENCES public.order_review_requests(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  highlights text[] NOT NULL DEFAULT '{}',
  comment text CHECK (char_length(comment) <= 600),
  reward_code text NOT NULL DEFAULT 'THANKU10',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_review_requests_ready_idx
  ON public.order_review_requests (brand_id, eligible_at)
  WHERE status IN ('scheduled', 'ready');
CREATE INDEX IF NOT EXISTS order_reviews_brand_created_idx
  ON public.order_reviews (brand_id, created_at DESC);

ALTER TABLE public.order_review_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_reviews ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.order_review_requests FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.order_reviews FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.order_review_requests TO service_role;
GRANT ALL ON public.order_reviews TO service_role;

CREATE POLICY "brand staff read review requests"
ON public.order_review_requests FOR SELECT TO authenticated
USING (public.can_access_brand(brand_id));

CREATE POLICY "brand staff update review requests"
ON public.order_review_requests FOR UPDATE TO authenticated
USING (public.can_access_brand(brand_id))
WITH CHECK (public.can_access_brand(brand_id));

CREATE POLICY "brand staff read reviews"
ON public.order_reviews FOR SELECT TO authenticated
USING (public.can_access_brand(brand_id));

CREATE OR REPLACE FUNCTION public.set_order_completed_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_complete boolean;
  v_was_complete boolean;
BEGIN
  v_is_complete := lower(COALESCE(NEW.status, '')) = 'completed'
    OR lower(COALESCE(NEW.fulfillment_status, '')) IN ('delivered', 'picked_up', 'completed');
  v_was_complete := CASE WHEN TG_OP = 'INSERT' THEN false ELSE
    lower(COALESCE(OLD.status, '')) = 'completed'
    OR lower(COALESCE(OLD.fulfillment_status, '')) IN ('delivered', 'picked_up', 'completed') END;

  IF v_is_complete AND NOT v_was_complete THEN
    NEW.completed_at := COALESCE(NEW.delivered_at, NEW.completed_at, now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_order_completed_at ON public.orders;
CREATE TRIGGER set_order_completed_at
BEFORE INSERT OR UPDATE OF status, fulfillment_status, delivered_at ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.set_order_completed_at();

CREATE OR REPLACE FUNCTION public.enqueue_order_review_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.completed_at IS NOT NULL AND COALESCE(NULLIF(trim(NEW.customer_phone_snapshot), ''), '') <> '' THEN
    INSERT INTO public.order_review_requests (brand_id, order_id, eligible_at)
    VALUES (NEW.brand_id, NEW.id, NEW.completed_at + interval '3 days')
    ON CONFLICT (order_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enqueue_order_review_request ON public.orders;
CREATE TRIGGER enqueue_order_review_request
AFTER INSERT OR UPDATE OF completed_at ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.enqueue_order_review_request();

-- Backfill existing completed orders once, using the best available completion time.
UPDATE public.orders
SET completed_at = COALESCE(delivered_at, updated_at, created_at)
WHERE completed_at IS NULL
  AND (lower(COALESCE(status, '')) = 'completed'
    OR lower(COALESCE(fulfillment_status, '')) IN ('delivered', 'picked_up', 'completed'));

INSERT INTO public.order_review_requests (brand_id, order_id, eligible_at)
SELECT o.brand_id, o.id, o.completed_at + interval '3 days'
FROM public.orders o
WHERE o.completed_at IS NOT NULL
  AND COALESCE(NULLIF(trim(o.customer_phone_snapshot), ''), '') <> ''
ON CONFLICT (order_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.list_ready_order_review_requests(p_brand_id uuid)
RETURNS TABLE (
  request_id uuid,
  order_id uuid,
  invoice_number integer,
  customer_name text,
  customer_phone text,
  eligible_at timestamptz,
  request_status text,
  review_url_token uuid
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.order_id, o.invoice_number,
    COALESCE(NULLIF(trim(o.customer_name_snapshot), ''), 'Customer'),
    o.customer_phone_snapshot, r.eligible_at,
    CASE WHEN r.status = 'scheduled' AND r.eligible_at <= now() THEN 'ready' ELSE r.status END,
    r.public_token
  FROM public.order_review_requests r
  JOIN public.orders o ON o.id = r.order_id
  WHERE r.brand_id = p_brand_id
    AND public.can_access_brand(r.brand_id)
    AND r.eligible_at <= now()
    AND r.status IN ('scheduled', 'ready', 'whatsapp_opened')
  ORDER BY r.eligible_at ASC;
$$;

REVOKE ALL ON FUNCTION public.list_ready_order_review_requests(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_ready_order_review_requests(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_order_review_request_status(
  p_request_id uuid,
  p_status text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_status NOT IN ('whatsapp_opened', 'sent', 'dismissed') THEN
    RAISE EXCEPTION 'INVALID_REVIEW_REQUEST_STATUS';
  END IF;
  UPDATE public.order_review_requests r SET
    status = p_status,
    whatsapp_opened_at = CASE WHEN p_status = 'whatsapp_opened' THEN COALESCE(r.whatsapp_opened_at, now()) ELSE r.whatsapp_opened_at END,
    sent_at = CASE WHEN p_status = 'sent' THEN COALESCE(r.sent_at, now()) ELSE r.sent_at END,
    sent_by = CASE WHEN p_status = 'sent' THEN auth.uid() ELSE r.sent_by END,
    dismissed_at = CASE WHEN p_status = 'dismissed' THEN now() ELSE r.dismissed_at END,
    updated_at = now()
  WHERE r.id = p_request_id AND public.can_access_brand(r.brand_id)
    AND r.status <> 'completed';
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.update_order_review_request_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_order_review_request_status(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_public_order_review(p_token uuid)
RETURNS TABLE (
  state text,
  brand_name text,
  brand_logo_url text,
  invoice_number integer,
  customer_name text,
  brand_whatsapp_number text,
  reward_code text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE WHEN r.status = 'completed' THEN 'completed' ELSE 'ready' END,
    COALESCE(NULLIF(bs.business_name, ''), b.name_ar, b.name_en, b.slug),
    COALESCE(bs.logo_url, b.logo_url),
    o.invoice_number,
    COALESCE(NULLIF(split_part(o.customer_name_snapshot, ' ', 1), ''), 'عميلنا'),
    bs.whatsapp_number,
    CASE WHEN r.status = 'completed' THEN COALESCE(rv.reward_code, 'THANKU10') ELSE NULL END
  FROM public.order_review_requests r
  JOIN public.orders o ON o.id = r.order_id
  JOIN public.brands b ON b.id = r.brand_id AND b.is_active = true
  LEFT JOIN public.business_settings bs ON bs.brand_id = r.brand_id
  LEFT JOIN public.order_reviews rv ON rv.request_id = r.id
  WHERE r.public_token = p_token AND r.eligible_at <= now();
$$;

REVOKE ALL ON FUNCTION public.get_public_order_review(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_order_review(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_public_order_review(
  p_token uuid,
  p_rating integer,
  p_highlights text[] DEFAULT '{}',
  p_comment text DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.order_review_requests%ROWTYPE;
  v_allowed text[] := ARRAY['quality','packaging','speed','delivery','service'];
BEGIN
  IF p_rating NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'INVALID_RATING'; END IF;
  IF char_length(COALESCE(p_comment, '')) > 600 THEN RAISE EXCEPTION 'COMMENT_TOO_LONG'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(COALESCE(p_highlights, '{}')) h WHERE NOT h = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'INVALID_HIGHLIGHT';
  END IF;

  SELECT * INTO v_request FROM public.order_review_requests
  WHERE public_token = p_token AND eligible_at <= now() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REVIEW_NOT_FOUND'; END IF;

  INSERT INTO public.order_reviews (request_id, brand_id, order_id, rating, highlights, comment)
  VALUES (v_request.id, v_request.brand_id, v_request.order_id, p_rating,
    COALESCE(p_highlights, '{}'), NULLIF(trim(p_comment), ''))
  ON CONFLICT (request_id) DO NOTHING;

  UPDATE public.order_review_requests SET status = 'completed', completed_at = COALESCE(completed_at, now()), updated_at = now()
  WHERE id = v_request.id;
  RETURN 'THANKU10';
END;
$$;

REVOKE ALL ON FUNCTION public.submit_public_order_review(uuid, integer, text[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_public_order_review(uuid, integer, text[], text) TO anon, authenticated;
